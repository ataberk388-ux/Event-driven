/** Role-based access control helpers shared across web + api. */

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

/** Higher number = more privilege. */
const RANK: Record<Role, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

/** True if `role` is at least as privileged as `required`. */
export function hasAtLeast(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}

export const can = {
  manageWorkspace: (role: Role) => hasAtLeast(role, "ADMIN"),
  deleteWorkspace: (role: Role) => role === "OWNER",
  createProject: (role: Role) => hasAtLeast(role, "MEMBER"),
  editContent: (role: Role) => hasAtLeast(role, "MEMBER"),
  viewContent: (role: Role) => hasAtLeast(role, "VIEWER"),
};
