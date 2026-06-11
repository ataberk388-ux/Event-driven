import { NextResponse } from "next/server";
import Redis from "ioredis";
import { prisma } from "@synapse/db";

export const dynamic = "force-dynamic";

type Check = { ok: boolean; latencyMs: number; error?: string };

async function timed(fn: () => Promise<unknown>): Promise<Check> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: (e as Error).message };
  }
}

async function checkPostgres(): Promise<Check> {
  return timed(() => prisma.$queryRaw`SELECT 1`);
}

async function checkRedis(): Promise<Check> {
  return timed(async () => {
    const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2000,
    });
    try {
      await redis.connect();
      await redis.ping();
    } finally {
      redis.disconnect();
    }
  });
}

export async function GET() {
  const [postgres, redis] = await Promise.all([checkPostgres(), checkRedis()]);

  const checks = { postgres, redis };
  const healthy = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
}
