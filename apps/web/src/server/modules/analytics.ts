import { z } from "zod";
import { prisma } from "@synapse/db";
import { router, protectedProcedure } from "../trpc.js";
import { membershipOrThrow } from "../shared/access.js";

export const analyticsRouter = router({
  // Per-workspace event rollups for any member of the workspace.
  summary: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await membershipOrThrow(ctx.userId, input.workspaceId);
      const rows = await prisma.dailyMetric.findMany({
        where: { workspaceId: input.workspaceId },
      });
      const total = rows.reduce((s, r) => s + r.count, 0);

      const byTypeMap = new Map<string, number>();
      const byDayMap = new Map<string, number>();
      for (const r of rows) {
        byTypeMap.set(r.eventType, (byTypeMap.get(r.eventType) ?? 0) + r.count);
        byDayMap.set(r.day, (byDayMap.get(r.day) ?? 0) + r.count);
      }
      const byType = [...byTypeMap]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);
      const days = [...byDayMap]
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(-7);
      return { total, byType, days };
    }),
});
