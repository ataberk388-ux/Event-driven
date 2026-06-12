"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { apiClient } from "@/lib/api";
import { fail, ok, type ActionResult } from "@/lib/action-result";

/** All board mutations flow through the in-process tRPC router (Outbox-backed). */
async function client() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return apiClient(session.user.id);
}

function boardPath(slug: string, projectId: string) {
  return `/workspace/${slug}/project/${projectId}`;
}

export async function createCardAction(
  slug: string,
  projectId: string,
  columnId: string,
  title: string,
): Promise<ActionResult> {
  const api = await client();
  if (!api) return fail("You must be signed in.");
  try {
    await api.board.createCard({ projectId, columnId, title });
    revalidatePath(boardPath(slug, projectId));
    return ok();
  } catch (e) {
    return fail((e as Error).message || "Could not create card.");
  }
}

export async function moveCardAction(
  slug: string,
  projectId: string,
  cardId: string,
  toColumnId: string,
  toIndex: number,
): Promise<ActionResult> {
  const api = await client();
  if (!api) return fail("You must be signed in.");
  try {
    await api.board.moveCard({ projectId, cardId, toColumnId, toIndex });
    revalidatePath(boardPath(slug, projectId));
    return ok();
  } catch (e) {
    return fail((e as Error).message || "Could not move card.");
  }
}

export async function deleteCardAction(
  slug: string,
  projectId: string,
  cardId: string,
): Promise<ActionResult> {
  const api = await client();
  if (!api) return fail("You must be signed in.");
  try {
    await api.board.deleteCard({ projectId, cardId });
    revalidatePath(boardPath(slug, projectId));
    return ok();
  } catch (e) {
    return fail((e as Error).message || "Could not delete card.");
  }
}

export async function updateCardAction(
  slug: string,
  projectId: string,
  cardId: string,
  patch: {
    title?: string;
    description?: string | null;
    assigneeId?: string | null;
    dueDate?: string | null;
    priority?: "NONE" | "LOW" | "MEDIUM" | "HIGH";
    labelIds?: string[];
  },
): Promise<ActionResult> {
  const api = await client();
  if (!api) return fail("You must be signed in.");
  try {
    await api.board.updateCard({ projectId, cardId, ...patch });
    revalidatePath(boardPath(slug, projectId));
    return ok();
  } catch (e) {
    return fail((e as Error).message || "Could not update card.");
  }
}

export async function createColumnAction(
  slug: string,
  projectId: string,
  name: string,
): Promise<ActionResult> {
  const api = await client();
  if (!api) return fail("You must be signed in.");
  try {
    await api.board.createColumn({ projectId, name });
    revalidatePath(boardPath(slug, projectId));
    return ok();
  } catch (e) {
    return fail((e as Error).message || "Could not create column.");
  }
}

export type CommentView = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  mine: boolean;
};

export async function loadCommentsAction(
  projectId: string,
  cardId: string,
): Promise<CommentView[]> {
  const api = await client();
  if (!api) return [];
  try {
    return await api.board.listComments({ projectId, cardId });
  } catch {
    return [];
  }
}

export async function addCommentAction(
  slug: string,
  projectId: string,
  cardId: string,
  body: string,
): Promise<ActionResult> {
  const api = await client();
  if (!api) return fail("You must be signed in.");
  try {
    await api.board.addComment({ projectId, cardId, body });
    revalidatePath(boardPath(slug, projectId));
    return ok();
  } catch (e) {
    return fail((e as Error).message || "Could not add comment.");
  }
}

export async function deleteCommentAction(
  slug: string,
  projectId: string,
  commentId: string,
): Promise<ActionResult> {
  const api = await client();
  if (!api) return fail("You must be signed in.");
  try {
    await api.board.deleteComment({ projectId, commentId });
    revalidatePath(boardPath(slug, projectId));
    return ok();
  } catch (e) {
    return fail((e as Error).message || "Could not delete comment.");
  }
}
