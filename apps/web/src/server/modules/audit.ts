import { z } from "zod";
import { prisma } from "@synapse/db";
import { router, protectedProcedure } from "../trpc.js";
import { managerOrThrow } from "../shared/access.js";

export const auditRouter = router({
  // Immutable audit trail — restricted to workspace managers (ADMIN+).
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string(), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      await managerOrThrow(ctx.userId, input.workspaceId);
      return prisma.auditLog.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),
});
