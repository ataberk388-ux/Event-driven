import type { EventEnvelope } from "@synapse/events";

type Payload = Record<string, unknown>;

/** Turn a domain event into a human-readable activity line. */
export function summarize(event: EventEnvelope, actorName?: string | null): string {
  const p = (event.payload ?? {}) as Payload;
  const who = actorName ?? "Someone";

  switch (event.type) {
    case "WorkspaceCreated":
      return `Workspace "${p.name}" was created`;
    case "ProjectCreated":
      return `Project "${p.name}" was created`;
    case "MemberInvited":
      return `${p.email} was invited as ${p.role}`;
    case "MemberJoined":
      return `${who} joined as ${p.role}`;
    case "MemberRoleChanged":
      return `${who}'s role changed to ${p.role}`;
    case "MemberRemoved":
      return `${who} was removed from the workspace`;
    case "TaskCreated":
      return `Card "${p.title}" was created`;
    case "TaskMoved":
      return `Card "${p.title}" was moved`;
    default:
      return event.type;
  }
}
