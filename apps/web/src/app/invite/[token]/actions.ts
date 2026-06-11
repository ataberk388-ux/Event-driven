"use server";

import { auth } from "@/auth";
import { apiClient } from "@/lib/api";
import { fail, ok, type ActionResult } from "@/lib/action-result";

export async function acceptInvitation(token: string): Promise<ActionResult<{ slug: string }>> {
  const session = await auth();
  if (!session?.user?.id) return fail("Please sign in first.");

  try {
    // The Core API validates the token/email and writes the Outbox event.
    const { slug } = await apiClient(session.user.id).member.acceptInvite({ token });
    return ok({ slug });
  } catch (e) {
    return fail((e as Error).message || "This invitation is no longer valid.");
  }
}
