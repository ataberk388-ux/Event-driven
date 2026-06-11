import { Redis } from "ioredis";

let client: Redis | null = null;

function redis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
  }
  return client;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  limit: number;
  resetSeconds: number;
}

/**
 * Fixed-window rate limiter backed by Redis. A single INCR + EXPIRE keeps it
 * atomic enough for auth endpoints. Fails open (allows) if Redis is unreachable,
 * so an outage never locks every user out.
 */
export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowSec: number;
}): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${opts.key}`;
  try {
    const r = redis();
    const count = await r.incr(redisKey);
    if (count === 1) {
      await r.expire(redisKey, opts.windowSec);
    }
    const ttl = await r.ttl(redisKey);
    return {
      success: count <= opts.limit,
      remaining: Math.max(0, opts.limit - count),
      limit: opts.limit,
      resetSeconds: ttl >= 0 ? ttl : opts.windowSec,
    };
  } catch {
    // Fail open — never block legitimate traffic because Redis hiccupped.
    return { success: true, remaining: opts.limit, limit: opts.limit, resetSeconds: 0 };
  }
}
