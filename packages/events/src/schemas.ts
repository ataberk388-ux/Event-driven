import { z } from "zod";

/**
 * Every domain event shares this envelope. `id` is the idempotency key consumers
 * use to dedupe; `payload` carries the event-specific data.
 */
export const eventEnvelope = z.object({
  id: z.string(),
  type: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  occurredAt: z.string().datetime(),
  actorId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  payload: z.unknown(),
});

export type EventEnvelope = z.infer<typeof eventEnvelope>;
