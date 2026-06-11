import { TRPCError } from "@trpc/server";
import { prisma, type Role } from "@synapse/db";
import { can } from "@synapse/auth";

/** Load the caller's membership in a workspace or throw 403. */
export async function membershipOrThrow(userId: string, workspaceId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this workspace" });
  }
  return membership;
}

/** Like membershipOrThrow but also requires ADMIN+ (workspace management) rights. */
export async function managerOrThrow(userId: string, workspaceId: string) {
  const membership = await membershipOrThrow(userId, workspaceId);
  if (!can.manageWorkspace(membership.role as Role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient role" });
  }
  return membership;
}

/** Resolve a project and assert the caller is a member of its workspace. */
export async function projectCtxOrThrow(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
  const membership = await membershipOrThrow(userId, project.workspaceId);
  return { project, membership };
}

/** Assert the membership role may edit content (MEMBER+). */
export function requireEdit(role: string) {
  if (!can.editContent(role as Role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient role" });
  }
}
