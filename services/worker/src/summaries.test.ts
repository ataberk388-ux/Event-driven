import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@synapse/events";
import { summarize } from "./summaries.js";

function event(type: string, payload: Record<string, unknown>): EventEnvelope {
  return {
    id: "e1",
    type,
    aggregateType: "workspace",
    aggregateId: "ws-1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    actorId: "u1",
    workspaceId: "ws-1",
    payload,
  };
}

describe("summarize", () => {
  it("describes workspace and project creation by name", () => {
    expect(summarize(event("WorkspaceCreated", { name: "Acme" }))).toBe(
      'Workspace "Acme" was created',
    );
    expect(summarize(event("ProjectCreated", { name: "Roadmap" }))).toBe(
      'Project "Roadmap" was created',
    );
  });

  it("describes invitations with email and role", () => {
    expect(summarize(event("MemberInvited", { email: "a@b.co", role: "MEMBER" }))).toBe(
      "a@b.co was invited as MEMBER",
    );
  });

  it("uses the actor name for member events, falling back to 'Someone'", () => {
    expect(summarize(event("MemberJoined", { role: "ADMIN" }), "Jane")).toBe(
      "Jane joined as ADMIN",
    );
    expect(summarize(event("MemberRemoved", {}))).toBe("Someone was removed from the workspace");
  });

  it("describes card lifecycle events by title", () => {
    expect(summarize(event("TaskCreated", { title: "Ship it" }))).toBe('Card "Ship it" was created');
    expect(summarize(event("TaskMoved", { title: "Ship it" }))).toBe('Card "Ship it" was moved');
  });

  it("falls back to the raw event type for unknown events", () => {
    expect(summarize(event("SomethingElse", {}))).toBe("SomethingElse");
  });
});
