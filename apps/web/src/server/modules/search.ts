import { z } from "zod";
import { prisma } from "@synapse/db";
import { router, protectedProcedure } from "../trpc.js";

export const searchRouter = router({
  // Global search over Postgres, scoped to the caller's workspaces.
  find: protectedProcedure
    .input(z.object({ q: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const memberships = await prisma.membership.findMany({
        where: { userId: ctx.userId },
        select: { workspaceId: true },
      });
      const ids = memberships.map((m) => m.workspaceId);
      if (ids.length === 0) return [];

      const like = { contains: input.q, mode: "insensitive" as const };
      const [workspaces, projects, cards] = await Promise.all([
        prisma.workspace.findMany({ where: { id: { in: ids }, name: like }, take: 5 }),
        prisma.project.findMany({
          where: { workspaceId: { in: ids }, name: like },
          include: { workspace: { select: { slug: true } } },
          take: 5,
        }),
        prisma.card.findMany({
          where: { project: { workspaceId: { in: ids } }, title: like },
          include: { project: { include: { workspace: { select: { slug: true } } } } },
          take: 10,
        }),
      ]);

      return [
        ...workspaces.map((w) => ({
          id: w.id,
          type: "workspace" as const,
          title: w.name,
          url: `/workspace/${w.slug}`,
        })),
        ...projects.map((p) => ({
          id: p.id,
          type: "project" as const,
          title: p.name,
          url: `/workspace/${p.workspace.slug}/project/${p.id}`,
        })),
        ...cards.map((c) => ({
          id: c.id,
          type: "card" as const,
          title: c.title,
          url: `/workspace/${c.project.workspace.slug}/project/${c.projectId}`,
        })),
      ].slice(0, 10);
    }),
});
