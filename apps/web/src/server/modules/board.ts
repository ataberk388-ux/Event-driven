import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@synapse/db";
import { router, protectedProcedure } from "../trpc.js";
import { projectCtxOrThrow, requireEdit } from "../shared/access.js";
import { publishBoardChange } from "../realtime.js";
import { matchMentions } from "./mentions.js";

export const boardRouter = router({
  // Full board snapshot: ordered columns, each with its ordered cards.
  get: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { project } = await projectCtxOrThrow(ctx.userId, input.projectId);
      const [columns, labels] = await Promise.all([
        prisma.boardColumn.findMany({
          where: { projectId: project.id },
          orderBy: { position: "asc" },
          include: {
            cards: {
              orderBy: { position: "asc" },
              include: {
                assignee: { select: { id: true, name: true, email: true, image: true } },
                labels: { select: { id: true, name: true, color: true } },
                _count: { select: { comments: true } },
              },
            },
          },
        }),
        prisma.label.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } }),
      ]);
      return {
        project: { id: project.id, name: project.name, type: project.type },
        columns,
        labels,
      };
    }),

  createColumn: protectedProcedure
    .input(z.object({ projectId: z.string(), name: z.string().min(1).max(40) }))
    .mutation(async ({ ctx, input }) => {
      const { membership } = await projectCtxOrThrow(ctx.userId, input.projectId);
      requireEdit(membership.role);
      const position = await prisma.boardColumn.count({ where: { projectId: input.projectId } });
      const created = await prisma.boardColumn.create({
        data: { projectId: input.projectId, name: input.name, position },
      });
      publishBoardChange(input.projectId, { kind: "column.created", actorId: ctx.userId });
      return created;
    }),

  renameColumn: protectedProcedure
    .input(
      z.object({ projectId: z.string(), columnId: z.string(), name: z.string().min(1).max(40) }),
    )
    .mutation(async ({ ctx, input }) => {
      const { membership } = await projectCtxOrThrow(ctx.userId, input.projectId);
      requireEdit(membership.role);
      const column = await prisma.boardColumn.findUnique({ where: { id: input.columnId } });
      if (!column || column.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Column not found" });
      }
      const updated = await prisma.boardColumn.update({
        where: { id: input.columnId },
        data: { name: input.name },
      });
      publishBoardChange(input.projectId, { kind: "column.renamed", actorId: ctx.userId });
      return updated;
    }),

  deleteColumn: protectedProcedure
    .input(z.object({ projectId: z.string(), columnId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { membership } = await projectCtxOrThrow(ctx.userId, input.projectId);
      requireEdit(membership.role);
      const column = await prisma.boardColumn.findUnique({ where: { id: input.columnId } });
      if (!column || column.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Column not found" });
      }
      await prisma.boardColumn.delete({ where: { id: input.columnId } });
      publishBoardChange(input.projectId, { kind: "column.deleted", actorId: ctx.userId });
      return { ok: true };
    }),

  reorderColumns: protectedProcedure
    .input(z.object({ projectId: z.string(), columnIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { membership } = await projectCtxOrThrow(ctx.userId, input.projectId);
      requireEdit(membership.role);
      await prisma.$transaction(
        input.columnIds.map((id, position) =>
          prisma.boardColumn.updateMany({
            where: { id, projectId: input.projectId },
            data: { position },
          }),
        ),
      );
      publishBoardChange(input.projectId, { kind: "columns.reordered", actorId: ctx.userId });
      return { ok: true };
    }),

  createCard: protectedProcedure
    .input(
      z.object({ projectId: z.string(), columnId: z.string(), title: z.string().min(1).max(200) }),
    )
    .mutation(async ({ ctx, input }) => {
      const { project, membership } = await projectCtxOrThrow(ctx.userId, input.projectId);
      requireEdit(membership.role);
      const column = await prisma.boardColumn.findUnique({ where: { id: input.columnId } });
      if (!column || column.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Column not found" });
      }

      const position = await prisma.card.count({ where: { columnId: input.columnId } });
      const card = await prisma.$transaction(async (tx) => {
        const created = await tx.card.create({
          data: {
            projectId: input.projectId,
            columnId: input.columnId,
            title: input.title,
            position,
            createdById: ctx.userId,
          },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: "task",
            aggregateId: created.id,
            eventType: "TaskCreated",
            payload: {
              taskId: created.id,
              projectId: input.projectId,
              workspaceId: project.workspaceId,
              title: created.title,
              createdBy: ctx.userId,
              actorId: ctx.userId,
            },
          },
        });
        return created;
      });
      publishBoardChange(input.projectId, { kind: "card.created", actorId: ctx.userId });
      return card;
    }),

  // Move a card to a column at a target index, renumbering affected columns.
  moveCard: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cardId: z.string(),
        toColumnId: z.string(),
        toIndex: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { project, membership } = await projectCtxOrThrow(ctx.userId, input.projectId);
      requireEdit(membership.role);

      const result = await prisma.$transaction(async (tx) => {
        const card = await tx.card.findUnique({ where: { id: input.cardId } });
        if (!card || card.projectId !== input.projectId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
        }
        const target = await tx.boardColumn.findUnique({ where: { id: input.toColumnId } });
        if (!target || target.projectId !== input.projectId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Column not found" });
        }
        const fromColumnId = card.columnId;

        // Reinsert the card into the target column's order at the clamped index.
        const targets = await tx.card.findMany({
          where: { columnId: input.toColumnId, id: { not: input.cardId } },
          orderBy: { position: "asc" },
        });
        const index = Math.min(input.toIndex, targets.length);
        const ordered = [
          ...targets.slice(0, index).map((c) => c.id),
          input.cardId,
          ...targets.slice(index).map((c) => c.id),
        ];
        for (let i = 0; i < ordered.length; i++) {
          await tx.card.update({
            where: { id: ordered[i] },
            data:
              ordered[i] === input.cardId
                ? { position: i, columnId: input.toColumnId }
                : { position: i },
          });
        }
        // Close the gap left in the source column.
        if (fromColumnId !== input.toColumnId) {
          const src = await tx.card.findMany({
            where: { columnId: fromColumnId },
            orderBy: { position: "asc" },
          });
          let i = 0;
          for (const c of src) {
            await tx.card.update({ where: { id: c.id }, data: { position: i++ } });
          }
        }

        await tx.outboxEvent.create({
          data: {
            aggregateType: "task",
            aggregateId: input.cardId,
            eventType: "TaskMoved",
            payload: {
              taskId: input.cardId,
              projectId: input.projectId,
              workspaceId: project.workspaceId,
              title: card.title,
              fromColumn: fromColumnId,
              toColumn: input.toColumnId,
              actorId: ctx.userId,
            },
          },
        });
        return { ok: true };
      });
      publishBoardChange(input.projectId, { kind: "card.moved", actorId: ctx.userId });
      return result;
    }),

  updateCard: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cardId: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).nullable().optional(),
        assigneeId: z.string().nullable().optional(),
        dueDate: z.string().datetime().nullable().optional(),
        priority: z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]).optional(),
        labelIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { project, membership } = await projectCtxOrThrow(ctx.userId, input.projectId);
      requireEdit(membership.role);
      const card = await prisma.card.findUnique({ where: { id: input.cardId } });
      if (!card || card.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      }
      // An assignee must be a member of the board's workspace.
      if (input.assigneeId) {
        const isMember = await prisma.membership.findUnique({
          where: {
            userId_workspaceId: { userId: input.assigneeId, workspaceId: project.workspaceId },
          },
        });
        if (!isMember) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Assignee is not a member." });
        }
      }
      const updated = await prisma.card.update({
        where: { id: input.cardId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
          ...(input.dueDate !== undefined
            ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
            : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.labelIds !== undefined
            ? { labels: { set: input.labelIds.map((id) => ({ id })) } }
            : {}),
        },
      });
      publishBoardChange(input.projectId, { kind: "card.updated", actorId: ctx.userId });
      return updated;
    }),

  createLabel: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(30),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { membership } = await projectCtxOrThrow(ctx.userId, input.projectId);
      requireEdit(membership.role);
      const label = await prisma.label.create({
        data: { projectId: input.projectId, name: input.name, color: input.color },
      });
      publishBoardChange(input.projectId, { kind: "label.created", actorId: ctx.userId });
      return label;
    }),

  deleteCard: protectedProcedure
    .input(z.object({ projectId: z.string(), cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { membership } = await projectCtxOrThrow(ctx.userId, input.projectId);
      requireEdit(membership.role);
      const card = await prisma.card.findUnique({ where: { id: input.cardId } });
      if (!card || card.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      }
      await prisma.card.delete({ where: { id: input.cardId } });
      publishBoardChange(input.projectId, { kind: "card.deleted", actorId: ctx.userId });
      return { ok: true };
    }),

  listComments: protectedProcedure
    .input(z.object({ projectId: z.string(), cardId: z.string() }))
    .query(async ({ ctx, input }) => {
      await projectCtxOrThrow(ctx.userId, input.projectId);
      const comments = await prisma.comment.findMany({
        where: { cardId: input.cardId, card: { projectId: input.projectId } },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      });
      return comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        authorName: c.author.name ?? c.author.email,
        mine: c.authorId === ctx.userId,
      }));
    }),

  addComment: protectedProcedure
    .input(
      z.object({ projectId: z.string(), cardId: z.string(), body: z.string().min(1).max(2000) }),
    )
    .mutation(async ({ ctx, input }) => {
      const { project, membership } = await projectCtxOrThrow(ctx.userId, input.projectId);
      requireEdit(membership.role);
      const card = await prisma.card.findUnique({ where: { id: input.cardId } });
      if (!card || card.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      }
      const comment = await prisma.comment.create({
        data: { cardId: input.cardId, authorId: ctx.userId, body: input.body },
      });

      // @mention → notify matched workspace members (other than the author).
      if (input.body.includes("@")) {
        const [author, workspace, members] = await Promise.all([
          prisma.user.findUnique({
            where: { id: ctx.userId },
            select: { name: true, email: true },
          }),
          prisma.workspace.findUnique({
            where: { id: project.workspaceId },
            select: { slug: true },
          }),
          prisma.membership.findMany({
            where: { workspaceId: project.workspaceId },
            include: { user: { select: { id: true, name: true, email: true } } },
          }),
        ]);
        const mentioned = matchMentions(
          input.body,
          members.map((m) => m.user),
          ctx.userId,
        );
        if (mentioned.length > 0 && workspace) {
          const authorName = author?.name ?? author?.email ?? "Someone";
          await prisma.notification.createMany({
            data: mentioned.map((userId) => ({
              userId,
              type: "Mention",
              title: `${authorName} mentioned you on "${card.title}"`,
              link: `/workspace/${workspace.slug}/project/${input.projectId}`,
            })),
          });
        }
      }

      publishBoardChange(input.projectId, { kind: "comment.created", actorId: ctx.userId });
      return comment;
    }),

  deleteComment: protectedProcedure
    .input(z.object({ projectId: z.string(), commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await projectCtxOrThrow(ctx.userId, input.projectId);
      const comment = await prisma.comment.findUnique({
        where: { id: input.commentId },
        include: { card: { select: { projectId: true } } },
      });
      if (!comment || comment.card.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }
      if (comment.authorId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own comments.",
        });
      }
      await prisma.comment.delete({ where: { id: input.commentId } });
      publishBoardChange(input.projectId, { kind: "comment.deleted", actorId: ctx.userId });
      return { ok: true };
    }),
});
