import "./env.js";
import pg from "pg";
import { prisma, OutboxStatus } from "@synapse/db";
import { toEnvelope, type EventEnvelope } from "@synapse/events";
import { summarize } from "./summaries.js";

/**
 * Single background worker that replaces Kafka + the per-feature consumer
 * services. It LISTENs on the Postgres `outbox_event` channel (a trigger fires
 * on every outbox insert) and drains pending rows. Each row is projected into
 * activity + audit + notification + analytics **and marked PUBLISHED in one
 * transaction** — atomic, exactly-once, no separate idempotency ledger needed.
 */

const MAX_ATTEMPTS = 5;
const SAFETY_POLL_MS = 5000;

type Payload = Record<string, unknown>;
type Notif = { userId: string; type: string; title: string; link: string };

/** Membership event → a notification for the affected user (or null). */
function buildNotification(event: EventEnvelope, workspaceName: string, slug: string): Notif | null {
  const p = (event.payload ?? {}) as Payload;
  const userId = typeof p.userId === "string" ? p.userId : null;
  if (!userId) return null;
  const link = `/workspace/${slug}`;
  switch (event.type) {
    case "MemberJoined":
      return { userId, type: event.type, title: `You were added to "${workspaceName}"`, link };
    case "MemberRoleChanged":
      return {
        userId,
        type: event.type,
        title: `Your role in "${workspaceName}" is now ${String(p.role)}`,
        link,
      };
    case "MemberRemoved":
      return { userId, type: event.type, title: `You were removed from "${workspaceName}"`, link };
    default:
      return null;
  }
}

async function processRow(row: {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}): Promise<void> {
  const event = toEnvelope(row);
  const p = (event.payload ?? {}) as Payload;

  // Enrichment reads (outside the write transaction).
  let actorName: string | null = null;
  if (typeof p.userId === "string") {
    const u = await prisma.user.findUnique({ where: { id: p.userId } });
    actorName = u?.name ?? u?.email ?? null;
  }
  let ws: { name: string; slug: string } | null = null;
  if (event.workspaceId) {
    ws = await prisma.workspace.findUnique({
      where: { id: event.workspaceId },
      select: { name: true, slug: true },
    });
  }
  const notif = ws ? buildNotification(event, ws.name, ws.slug) : null;
  const day = event.occurredAt.slice(0, 10);
  const metricWorkspace = event.workspaceId ?? "_global";

  await prisma.$transaction(async (tx) => {
    if (event.workspaceId) {
      await tx.activity.create({
        data: {
          workspaceId: event.workspaceId,
          type: event.type,
          actorId: event.actorId,
          summary: summarize(event, actorName),
          metadata: p as object,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        workspaceId: event.workspaceId,
        eventType: event.type,
        eventId: event.id,
        actorId: event.actorId,
        payload: p as object,
      },
    });
    if (notif) {
      await tx.notification.create({
        data: { userId: notif.userId, type: notif.type, title: notif.title, link: notif.link },
      });
    }
    await tx.dailyMetric.upsert({
      where: { workspaceId_day_eventType: { workspaceId: metricWorkspace, day, eventType: event.type } },
      create: { workspaceId: metricWorkspace, day, eventType: event.type, count: 1 },
      update: { count: { increment: 1 } },
    });
    await tx.outboxEvent.update({
      where: { id: row.id },
      data: { status: OutboxStatus.PUBLISHED, publishedAt: new Date() },
    });
  });
}

let draining = false;
let rerun = false;

async function drain(): Promise<void> {
  if (draining) {
    rerun = true;
    return;
  }
  draining = true;
  try {
    for (;;) {
      const rows = await prisma.outboxEvent.findMany({
        where: { status: OutboxStatus.PENDING },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      if (rows.length === 0) break;

      let processed = 0;
      for (const row of rows) {
        try {
          await processRow(row);
          processed++;
        } catch (err) {
          const attempts = row.attempts + 1;
          await prisma.outboxEvent.update({
            where: { id: row.id },
            data: {
              attempts,
              status: attempts >= MAX_ATTEMPTS ? OutboxStatus.FAILED : OutboxStatus.PENDING,
            },
          });
          console.error(`[worker] failed ${row.id} (attempt ${attempts})`, err);
        }
      }
      if (processed > 0) console.log(`[worker] processed ${processed} event(s)`);
      if (processed === 0) break; // no progress (all failed) — avoid a tight loop
    }
  } finally {
    draining = false;
    if (rerun) {
      rerun = false;
      void drain();
    }
  }
}

async function main() {
  await drain(); // catch up on anything pending at startup

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("LISTEN outbox_event");
  client.on("notification", () => void drain());

  // Safety net in case a NOTIFY is missed (e.g. during a reconnect).
  setInterval(() => void drain(), SAFETY_POLL_MS);

  console.log("[worker] started — LISTEN outbox_event + safety poll");

  const shutdown = async () => {
    await client.end();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
