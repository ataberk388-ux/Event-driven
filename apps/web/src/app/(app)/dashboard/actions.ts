"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { apiClient } from "@/lib/api";
import { fail, ok, type ActionResult } from "@/lib/action-result";

const createWorkspaceSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60),
});

export async function createWorkspace(formData: FormData): Promise<ActionResult<{ slug: string }>> {
  const session = await auth();
  if (!session?.user?.id) return fail("You must be signed in.");

  const parsed = createWorkspaceSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid name");

  try {
    // The Core API owns the transactional Outbox write (workspace + membership + event).
    const { slug } = await apiClient(session.user.id).workspace.create({
      name: parsed.data.name,
    });
    revalidatePath("/dashboard");
    return ok({ slug });
  } catch (e) {
    return fail((e as Error).message || "Could not create workspace.");
  }
}
