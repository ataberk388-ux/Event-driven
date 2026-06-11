"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type PresenceUser = { userId: string; name: string };

/**
 * Connects to the realtime WS hub for a board. Returns the live presence roster
 * and triggers a server refresh whenever another user changes the board.
 */
export function useBoardSocket(
  boardId: string,
  user: { id: string; name: string },
): PresenceUser[] {
  const router = useRouter();
  const [present, setPresent] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://localhost:4100";
    const url = `${base}?boardId=${encodeURIComponent(boardId)}&userId=${encodeURIComponent(
      user.id,
    )}&name=${encodeURIComponent(user.name)}`;

    let ws: WebSocket | null = null;
    let closedByUs = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      ws = new WebSocket(url);
      ws.onmessage = (e) => {
        let msg: { type?: string; users?: PresenceUser[]; actorId?: string };
        try {
          msg = JSON.parse(e.data as string);
        } catch {
          return;
        }
        if (msg.type === "presence") {
          setPresent(msg.users ?? []);
        } else if (msg.type === "changed" && msg.actorId !== user.id) {
          // Someone else changed the board — pull the fresh snapshot.
          router.refresh();
        }
      };
      ws.onclose = () => {
        if (!closedByUs) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    }
    connect();

    return () => {
      closedByUs = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [boardId, user.id, user.name, router]);

  return present;
}
