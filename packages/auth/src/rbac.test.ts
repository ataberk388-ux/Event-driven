import { describe, expect, it } from "vitest";
import { can, hasAtLeast } from "./rbac.js";

describe("rbac", () => {
  it("ranks roles correctly", () => {
    expect(hasAtLeast("OWNER", "ADMIN")).toBe(true);
    expect(hasAtLeast("MEMBER", "ADMIN")).toBe(false);
    expect(hasAtLeast("ADMIN", "ADMIN")).toBe(true);
  });

  it("gates workspace deletion to owners", () => {
    expect(can.deleteWorkspace("OWNER")).toBe(true);
    expect(can.deleteWorkspace("ADMIN")).toBe(false);
  });

  it("lets members create projects but not viewers", () => {
    expect(can.createProject("MEMBER")).toBe(true);
    expect(can.createProject("VIEWER")).toBe(false);
  });

  it("lets admins manage the workspace", () => {
    expect(can.manageWorkspace("ADMIN")).toBe(true);
    expect(can.manageWorkspace("MEMBER")).toBe(false);
  });
});
