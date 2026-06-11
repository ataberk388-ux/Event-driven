import { z } from "zod";
import { prisma, Role } from "@synapse/db";
import { router, protectedProcedure } from "../trpc.js";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "workspace"}-${Math.random().toString(36).slice(2, 6)}`;
}

export const workspaceRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(2).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const slug = slugify(input.name);

      // Workspace + owner membership + domain event written atomically (Outbox).
      return prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: {
            name: input.name,
            slug,
            ownerId: ctx.userId,
            memberships: { create: { userId: ctx.userId, role: Role.OWNER } },
          },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: "workspace",
            aggregateId: workspace.id,
            eventType: "WorkspaceCreated",
            payload: {
              workspaceId: workspace.id,
              name: workspace.name,
              slug: workspace.slug,
              ownerId: ctx.userId,
            },
          },
        });
        return { id: workspace.id, slug: workspace.slug };
      });
    }),
});
