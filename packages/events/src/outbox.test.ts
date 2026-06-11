import { describe, expect, it } from "vitest";
import { eventEnvelope } from "./schemas.js";
import { toEnvelope, type OutboxRow } from "./outbox.js";

const row: OutboxRow = {
  id: "evt-1",
  aggregateType: "workspace",
  aggregateId: "ws-1",
  eventType: "WorkspaceCreated",
  payload: { workspaceId: "ws-1", actorId: "user-1", name: "Acme" },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("toEnvelope", () => {
  it("produces a schema-valid envelope", () => {
    expect(eventEnvelope.safeParse(toEnvelope(row)).success).toBe(true);
  });

  it("lifts actorId and workspaceId out of the payload", () => {
    const env = toEnvelope(row);
    expect(env.type).toBe("WorkspaceCreated");
    expect(env.actorId).toBe("user-1");
    expect(env.workspaceId).toBe("ws-1");
    expect(env.occurredAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("defaults actorId/workspaceId to null and payload to {} when absent", () => {
    const env = toEnvelope({ ...row, payload: null });
    expect(env.actorId).toBeNull();
    expect(env.workspaceId).toBeNull();
    expect(env.payload).toEqual({});
  });
});
