import { Redis } from "ioredis";

/**
 * Low-latency board change notifications. After a board mutation commits, the
 * API publishes to `board:<projectId>` over Redis; the realtime WS server relays
 * it to connected clients so other viewers update instantly. This is separate
 * from the durable Kafka/Outbox path (which feeds activity/audit).
 */
let pub: Redis | null = null;

function redis(): Redis {
  if (!pub) {
    pub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    pub.on("error", () => {});
  }
  return pub;
}

export function publishBoardChange(
  projectId: string,
  payload: { kind: string; actorId: string },
): void {
  // Fire-and-forget: realtime sync must never block or fail a mutation.
  redis()
    .publish(`board:${projectId}`, JSON.stringify(payload))
    .catch(() => {});
}
