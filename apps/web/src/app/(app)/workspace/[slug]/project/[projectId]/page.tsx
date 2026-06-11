import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@synapse/db";
import { can } from "@synapse/auth";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/auth";
import { KanbanBoard, type ColumnView, type Member, type LabelView } from "./kanban-board";
import { DocEditor } from "./doc-editor";
import { CanvasBoard } from "./canvas-board";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    include: { memberships: { where: { userId } } },
  });
  const membership = workspace?.memberships[0];
  if (!workspace || !membership) notFound();

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: workspace.id },
    include: {
      labels: { orderBy: { name: "asc" } },
      columns: {
        orderBy: { position: "asc" },
        include: {
          cards: {
            orderBy: { position: "asc" },
            include: {
              assignee: { select: { id: true, name: true, email: true } },
              labels: { select: { id: true, name: true, color: true } },
            },
          },
        },
      },
    },
  });
  if (!project) notFound();

  const canEdit = can.editContent(membership.role);

  const memberRows = await prisma.membership.findMany({
    where: { workspaceId: workspace.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const members = memberRows.map((m) => ({
    id: m.user.id,
    name: m.user.name ?? m.user.email,
    email: m.user.email,
  }));

  const boardLabels: LabelView[] = project.labels.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
  }));

  const columns: ColumnView[] = project.columns.map((col) => ({
    id: col.id,
    name: col.name,
    cards: col.cards.map((card) => ({
      id: card.id,
      title: card.title,
      description: card.description,
      dueDate: card.dueDate ? card.dueDate.toISOString() : null,
      priority: card.priority,
      labels: card.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
      assignee: card.assignee
        ? { id: card.assignee.id, name: card.assignee.name, email: card.assignee.email }
        : null,
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/workspace/${slug}`}
          className="text-sm text-muted-foreground hover:text-primary"
        >
          ← {workspace.name}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <Badge variant="secondary">{project.type}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {project.type === "DOC"
            ? "Collaborative document — edits sync live via Yjs (CRDT) over the realtime server."
            : project.type === "CANVAS"
              ? "Collaborative whiteboard — strokes & shapes sync live via Yjs (CRDT)."
              : "Drag cards across columns — moves persist via the Core API and flow through the event-driven backbone."}
        </p>
      </div>

      {project.type === "DOC" ? (
        <DocEditor
          projectId={projectId}
          canEdit={canEdit}
          user={{ id: userId, name: session!.user.name ?? session!.user.email ?? "Someone" }}
        />
      ) : project.type === "CANVAS" ? (
        <CanvasBoard projectId={projectId} canEdit={canEdit} />
      ) : (
        <KanbanBoard
          slug={slug}
          projectId={projectId}
          canEdit={canEdit}
          initialColumns={columns}
          members={members as Member[]}
          boardLabels={boardLabels}
          currentUser={{
            id: userId,
            name: session!.user.name ?? session!.user.email ?? "Someone",
          }}
        />
      )}
    </div>
  );
}
