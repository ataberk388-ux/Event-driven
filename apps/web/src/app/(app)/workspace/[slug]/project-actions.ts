"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@synapse/db";
import { auth } from "@/auth";
import { apiClient } from "@/lib/api";
import { fail, ok, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  slug: z.string(),
  name: z.string().min(1, "Project name is required").max(80),
  type: z.enum(["BOARD", "DOC", "CANVAS"]),
});

/** Creates a project by calling the in-process tRPC Core API. */
export async function createProject(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return fail("You must be signed in.");

  const parsed = schema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    type: formData.get("type"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const workspace = await prisma.workspace.findUnique({ where: { slug: parsed.data.slug } });
  if (!workspace) return fail("Workspace not found.");

  try {
    await apiClient(session.user.id).project.create({
      workspaceId: workspace.id,
      name: parsed.data.name,
      type: parsed.data.type,
    });
  } catch (e) {
    return fail((e as Error).message || "Could not create project.");
  }

  revalidatePath(`/workspace/${parsed.data.slug}`);
  return ok();
}
