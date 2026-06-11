"use server";

import { auth } from "@/auth";
import { apiClient } from "@/lib/api";

export type SearchHit = { id: string; type: string; title: string; url: string };

export async function searchEntities(q: string): Promise<SearchHit[]> {
  const session = await auth();
  if (!session?.user?.id || q.trim().length === 0) return [];
  try {
    return await apiClient(session.user.id).search.find({ q: q.trim() });
  } catch {
    return [];
  }
}
