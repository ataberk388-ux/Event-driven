"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@synapse/db";
import { auth } from "@/auth";
import { apiClient } from "@/lib/api";
import { fail, ok, type ActionResult } from "@/lib/action-result";

/**
 * Resolve the signed-in user + the workspace id behind a slug. Permission checks
 * (manage rights, owner guards) live in the Core API, which owns the Outbox writes.
 */
async function resolve(slug: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const workspace = await prisma.workspace.findUnique({ where: { slug } });
  if (!workspace) return null;
  return { userId: session.user.id, workspaceId: workspace.id };
}

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

export async function inviteMember(
  formData: FormData,
): Promise<ActionResult<{ inviteUrl?: string }>> {
  const slug = String(formData.get("slug"));
  const ctx = await resolve(slug);
  if (!ctx) return fail("Workspace not found.");

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  try {
    const res = await apiClient(ctx.userId).member.invite({
      workspaceId: ctx.workspaceId,
      email: parsed.data.email,
      role: parsed.data.role,
    });
    revalidatePath(`/workspace/${slug}`);
    if (res.token) {
      const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      return ok({ inviteUrl: `${base}/invite/${res.token}` });
    }
    return ok({});
  } catch (e) {
    return fail((e as Error).message || "Could not invite member.");
  }
}

export async function changeRole(formData: FormData): Promise<ActionResult> {
  const slug = String(formData.get("slug"));
  const ctx = await resolve(slug);
  if (!ctx) return fail("Workspace not found.");

  const role = z.enum(["ADMIN", "MEMBER", "VIEWER"]).parse(formData.get("role"));

  try {
    await apiClient(ctx.userId).member.changeRole({
      workspaceId: ctx.workspaceId,
      membershipId: String(formData.get("membershipId")),
      role,
    });
    revalidatePath(`/workspace/${slug}`);
    return ok();
  } catch (e) {
    return fail((e as Error).message || "Could not change role.");
  }
}

export async function removeMember(formData: FormData): Promise<ActionResult> {
  const slug = String(formData.get("slug"));
  const ctx = await resolve(slug);
  if (!ctx) return fail("Workspace not found.");

  try {
    await apiClient(ctx.userId).member.remove({
      workspaceId: ctx.workspaceId,
      membershipId: String(formData.get("membershipId")),
    });
    revalidatePath(`/workspace/${slug}`);
    return ok();
  } catch (e) {
    return fail((e as Error).message || "Could not remove member.");
  }
}

export async function revokeInvitation(formData: FormData): Promise<ActionResult> {
  const slug = String(formData.get("slug"));
  const ctx = await resolve(slug);
  if (!ctx) return fail("Workspace not found.");

  try {
    await apiClient(ctx.userId).member.revokeInvite({
      workspaceId: ctx.workspaceId,
      invitationId: String(formData.get("invitationId")),
    });
    revalidatePath(`/workspace/${slug}`);
    return ok();
  } catch (e) {
    return fail((e as Error).message || "Could not revoke invitation.");
  }
}
