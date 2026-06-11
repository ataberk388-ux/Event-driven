"use server";

import { auth } from "@/auth";
import { apiClient } from "@/lib/api";

export type Notif = {
  id: string;
  type: string;
  title: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export async function getNotifications(): Promise<{ items: Notif[]; unread: number }> {
  const session = await auth();
  if (!session?.user?.id) return { items: [], unread: 0 };
  try {
    const api = apiClient(session.user.id);
    const [items, unread] = await Promise.all([
      api.notification.list(),
      api.notification.unreadCount(),
    ]);
    return {
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        link: n.link,
        read: n.read,
        createdAt: new Date(n.createdAt).toISOString(),
      })),
      unread,
    };
  } catch {
    return { items: [], unread: 0 };
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  try {
    await apiClient(session.user.id).notification.markAllRead();
  } catch {
    // best-effort
  }
}
