import { router, publicProcedure } from "./trpc.js";
import { workspaceRouter } from "./modules/workspace.js";
import { projectRouter } from "./modules/project.js";
import { memberRouter } from "./modules/member.js";
import { boardRouter } from "./modules/board.js";
import { searchRouter } from "./modules/search.js";
import { notificationRouter } from "./modules/notification.js";
import { analyticsRouter } from "./modules/analytics.js";
import { auditRouter } from "./modules/audit.js";

/**
 * The Core API, composed from feature modules under `./modules`. Each module
 * owns its router + business logic; this file only wires them together.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: "api" })),
  workspace: workspaceRouter,
  project: projectRouter,
  member: memberRouter,
  board: boardRouter,
  search: searchRouter,
  notification: notificationRouter,
  analytics: analyticsRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
