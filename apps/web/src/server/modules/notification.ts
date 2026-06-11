import { prisma } from "@synapse/db";
import { router, protectedProcedure } from "../trpc.js";

export const notificationRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    prisma.notification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ),

  unreadCount: protectedProcedure.query(({ ctx }) =>
    prisma.notification.count({ where: { userId: ctx.userId, read: false } }),
  ),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await prisma.notification.updateMany({
      where: { userId: ctx.userId, read: false },
      data: { read: true },
    });
    return { ok: true };
  }),
});
