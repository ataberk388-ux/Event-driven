import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma, Role, InviteStatus } from "@synapse/db";
import { router, protectedProcedure } from "../trpc.js";
import { managerOrThrow } from "../shared/access.js";

const INVITE_TTL_DAYS = 7;
const manageableRole = z.enum(["ADMIN", "MEMBER", "VIEWER"]);

export const memberRouter = router({
  // Invite by email. If the invitee already has an account they join immediately
  // (MemberJoined); otherwise a pending, token-based Invitation is created
  // (MemberInvited) and the token is returned so the caller can build a link.
  invite: protectedProcedure
    .input(z.object({ workspaceId: z.string(), email: z.string().email(), role: manageableRole }))
    .mutation(async ({ ctx, input }) => {
      await managerOrThrow(ctx.userId, input.workspaceId);
      const email = input.email.toLowerCase();
      const role = input.role as Role;

      const existingUser = await prisma.user.findUnique({ where: { email } });

      if (existingUser) {
        const already = await prisma.membership.findUnique({
          where: {
            userId_workspaceId: { userId: existingUser.id, workspaceId: input.workspaceId },
          },
        });
        if (already) {
          throw new TRPCError({ code: "CONFLICT", message: "That person is already a member." });
        }
        await prisma.$transaction(async (tx) => {
          await tx.membership.create({
            data: { userId: existingUser.id, workspaceId: input.workspaceId, role },
          });
          await tx.outboxEvent.create({
            data: {
              aggregateType: "member",
              aggregateId: input.workspaceId,
              eventType: "MemberJoined",
              payload: { workspaceId: input.workspaceId, userId: existingUser.id, role },
            },
          });
        });
        return { joined: true as const, token: null };
      }

      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      const invite = await prisma.$transaction(async (tx) => {
        const inv = await tx.invitation.upsert({
          where: { workspaceId_email: { workspaceId: input.workspaceId, email } },
          update: { role, status: InviteStatus.PENDING, expiresAt, invitedById: ctx.userId },
          create: { workspaceId: input.workspaceId, email, role, invitedById: ctx.userId, expiresAt },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: "member",
            aggregateId: input.workspaceId,
            eventType: "MemberInvited",
            payload: { workspaceId: input.workspaceId, email, role, invitedBy: ctx.userId },
          },
        });
        return inv;
      });
      return { joined: false as const, token: invite.token };
    }),

  // Accept a pending invitation. The caller must be signed in as the invited email.
  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
      if (!user?.email) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in first." });
      }

      const invite = await prisma.invitation.findUnique({
        where: { token: input.token },
        include: { workspace: true },
      });
      if (!invite || invite.status !== InviteStatus.PENDING) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation is no longer valid." });
      }
      if (invite.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has expired." });
      }
      if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `This invitation was sent to ${invite.email}.`,
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.membership.upsert({
          where: { userId_workspaceId: { userId: ctx.userId, workspaceId: invite.workspaceId } },
          update: { role: invite.role },
          create: { userId: ctx.userId, workspaceId: invite.workspaceId, role: invite.role },
        });
        await tx.invitation.update({
          where: { id: invite.id },
          data: { status: InviteStatus.ACCEPTED },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: "member",
            aggregateId: invite.workspaceId,
            eventType: "MemberJoined",
            payload: { workspaceId: invite.workspaceId, userId: ctx.userId, role: invite.role },
          },
        });
      });
      return { slug: invite.workspace.slug };
    }),

  changeRole: protectedProcedure
    .input(z.object({ workspaceId: z.string(), membershipId: z.string(), role: manageableRole }))
    .mutation(async ({ ctx, input }) => {
      await managerOrThrow(ctx.userId, input.workspaceId);
      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: input.workspaceId },
      });
      const target = await prisma.membership.findUnique({ where: { id: input.membershipId } });
      if (!target || target.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      }
      if (target.userId === workspace.ownerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change the owner's role." });
      }

      await prisma.$transaction(async (tx) => {
        await tx.membership.update({
          where: { id: input.membershipId },
          data: { role: input.role as Role },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: "member",
            aggregateId: input.workspaceId,
            eventType: "MemberRoleChanged",
            payload: { workspaceId: input.workspaceId, userId: target.userId, role: input.role },
          },
        });
      });
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ workspaceId: z.string(), membershipId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await managerOrThrow(ctx.userId, input.workspaceId);
      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: input.workspaceId },
      });
      const target = await prisma.membership.findUnique({ where: { id: input.membershipId } });
      if (!target || target.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      }
      if (target.userId === workspace.ownerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove the workspace owner." });
      }

      await prisma.$transaction(async (tx) => {
        await tx.membership.delete({ where: { id: input.membershipId } });
        await tx.outboxEvent.create({
          data: {
            aggregateType: "member",
            aggregateId: input.workspaceId,
            eventType: "MemberRemoved",
            payload: { workspaceId: input.workspaceId, userId: target.userId },
          },
        });
      });
      return { ok: true };
    }),

  revokeInvite: protectedProcedure
    .input(z.object({ workspaceId: z.string(), invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await managerOrThrow(ctx.userId, input.workspaceId);
      const invite = await prisma.invitation.findUnique({ where: { id: input.invitationId } });
      if (!invite || invite.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
      }
      await prisma.invitation.update({
        where: { id: input.invitationId },
        data: { status: InviteStatus.REVOKED },
      });
      return { ok: true };
    }),
});
