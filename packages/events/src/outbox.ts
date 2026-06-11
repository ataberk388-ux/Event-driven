import type { EventEnvelope } from "./schemas.js";

export type OutboxRow = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
};

/** Build a transport-agnostic envelope from a stored outbox row. */
export function toEnvelope(row: OutboxRow): EventEnvelope {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    type: row.eventType,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    occurredAt: row.createdAt.toISOString(),
    actorId: (payload.actorId as string) ?? null,
    workspaceId: (payload.workspaceId as string) ?? null,
    payload,
  };
}
