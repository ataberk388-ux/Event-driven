import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma, ProjectType, type Role } from "@synapse/db";
import { can } from "@synapse/auth";
import { router, protectedProcedure } from "../trpc.js";
import { membershipOrThrow } from "../shared/access.js";

const DEFAULT_COLUMNS = ["To Do", "In Progress", "Done"];
const DEFAULT_LABELS = [
  { name: "Bug", color: "#ef4444" },
  { name: "Feature", color: "#10b981" },
  { name: "Urgent", color: "#f59e0b" },
  { name: "Docs", color: "#3b82f6" },
];

export const projectRouter = router({
  listByWorkspace: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await membershipOrThrow(ctx.userId, input.workspaceId);
      return prisma.project.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "desc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(80),
        type: z.enum(["BOARD", "DOC", "CANVAS"]).default("BOARD"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await membershipOrThrow(ctx.userId, input.workspaceId);
      if (!can.createProject(membership.role as Role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient role" });
      }

      // Create project + domain event atomically (Outbox).
      return prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            name: input.name,
            type: input.type as ProjectType,
            workspaceId: input.workspaceId,
          },
        });
        // A new Kanban board starts with the conventional columns + a label palette.
        if (project.type === ProjectType.BOARD) {
          await tx.boardColumn.createMany({
            data: DEFAULT_COLUMNS.map((name, position) => ({
              projectId: project.id,
              name,
              position,
            })),
          });
          await tx.label.createMany({
            data: DEFAULT_LABELS.map((l) => ({ projectId: project.id, ...l })),
          });
        }
        await tx.outboxEvent.create({
          data: {
            aggregateType: "project",
            aggregateId: project.id,
            eventType: "ProjectCreated",
            payload: {
              projectId: project.id,
              name: project.name,
              type: project.type,
              workspaceId: input.workspaceId,
            },
          },
        });
        return project;
      });
    }),
});
