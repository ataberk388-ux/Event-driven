import "server-only";
import { appRouter, type AppRouter } from "@/server/router";

/**
 * In-process tRPC caller bound to a user id (resolved from the NextAuth session
 * by the calling server action). No network hop, no trust header — the API runs
 * inside the Next.js server.
 */
export function apiClient(userId: string) {
  return appRouter.createCaller({ userId });
}

export type { AppRouter };
