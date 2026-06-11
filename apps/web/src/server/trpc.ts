import { initTRPC, TRPCError } from "@trpc/server";
import { rateLimit } from "@synapse/ratelimit";

/**
 * In-process tRPC context. The web app calls the router directly via
 * `appRouter.createCaller(ctx)` (see lib/api.ts), passing the authenticated
 * user id resolved from the NextAuth session — no network hop, no trust header.
 */
export type Context = { userId: string | null };

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Generous per-user write budget — guards against runaway/abuse, not normal use.
const MUTATION_LIMIT = 240;
const MUTATION_WINDOW_SEC = 60;

/**
 * Authenticated procedure. Mutations are additionally rate-limited per user
 * (fails open if Redis is unavailable, so an outage never blocks writes).
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, type, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  if (type === "mutation") {
    const { success } = await rateLimit({
      key: `trpc:${ctx.userId}`,
      limit: MUTATION_LIMIT,
      windowSec: MUTATION_WINDOW_SEC,
    });
    if (!success) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests — please slow down.",
      });
    }
  }
  return next({ ctx: { userId: ctx.userId } });
});
