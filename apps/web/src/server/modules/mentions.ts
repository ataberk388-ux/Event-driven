export type MentionMember = { id: string; name: string | null; email: string };

/**
 * Given comment text and the workspace members, return the ids of members
 * mentioned via `@firstname` or `@email-local-part` (case-insensitive),
 * excluding `excludeId` (typically the comment author).
 */
export function matchMentions(
  text: string,
  members: MentionMember[],
  excludeId?: string,
): string[] {
  const tokens = [...text.matchAll(/@([a-zA-Z0-9._-]+)/g)].map((m) => (m[1] ?? "").toLowerCase());
  if (tokens.length === 0) return [];

  const matched = new Set<string>();
  for (const m of members) {
    if (m.id === excludeId) continue;
    const first = (m.name ?? "").split(/\s+/)[0]?.toLowerCase();
    const local = m.email.split("@")[0]?.toLowerCase();
    if ((local && tokens.includes(local)) || (first && tokens.includes(first))) {
      matched.add(m.id);
    }
  }
  return [...matched];
}
