import { PrismaClient } from "@prisma/client";

// Re-export generated types/enums so consumers import everything from @synapse/db.
export * from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Shared Prisma client singleton. In dev we cache it on globalThis to avoid
 * exhausting connections across hot-reloads.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
