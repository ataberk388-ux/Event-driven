"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBoardSocket } from "@/lib/use-board-socket";
import {
  createCardAction,
  moveCardAction,
  deleteCardAction,
  updateCardAction,
  createColumnAction,
} from "./board-actions";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PresenceBar({ users }: { users: { userId: string; name: string }[] }) {
  if (users.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {users.slice(0, 6).map((u) => (
          <span
            key={u.userId}
            title={u.name}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary/15 text-[10px] font-semibold text-primary"
          >
            {initials(u.name)}
          </span>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {users.length} {users.length === 1 ? "person" : "people"} viewing · live
      </span>
    </div>
  );
}

export type Priority = "NONE" | "LOW" | "MEDIUM" | "HIGH";
export type LabelView = { id: string; name: string; color: string };
export type CardView = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: Priority;
  labels: LabelView[];
  assignee: { id: string; name: string | null; email: string } | null;
};
export type ColumnView = { id: string; name: string; cards: CardView[] };
export type Member = { id: string; name: string; email: string };

const PRIORITY_META: Record<Priority, { label: string; color: string } | null> = {
  NONE: null,
  LOW: { label: "Low", color: "#9ca3af" },
  MEDIUM: { label: "Medium", color: "#f59e0b" },
  HIGH: { label: "High", color: "#ef4444" },
};

function isOverdue(due: string | null): boolean {
  return due != null && new Date(due).getTime() < Date.now();
}

function formatDue(due: string): string {
  return new Date(due).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** ISO datetime → yyyy-mm-dd for <input type="date">. */
function toDateInput(due: string | null): string {
  return due ? new Date(due).toISOString().slice(0, 10) : "";
}

function columnIdOf(columns: ColumnView[], id: string): string | null {
  if (columns.some((c) => c.id === id)) return id;
  return columns.find((c) => c.cards.some((card) => card.id === id))?.id ?? null;
}

// ---- Sortable card -----------------------------------------------------------

function Avatar({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary"
    >
      {initials(name)}
    </span>
  );
}

function SortableCard({
  card,
  canEdit,
  onDelete,
  onOpen,
}: {
  card: CardView;
  canEdit: boolean;
  onDelete: (id: string) => void;
  onOpen: (card: CardView) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card)}
      className="group relative cursor-grab rounded-md border bg-card p-3 text-sm shadow-sm active:cursor-grabbing"
    >
      {card.labels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {card.labels.map((l) => (
            <span
              key={l.id}
              title={l.name}
              className="h-1.5 w-8 rounded-full"
              style={{ backgroundColor: l.color }}
            />
          ))}
        </div>
      )}
      <p className="pr-5">{card.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {card.assignee && <Avatar name={card.assignee.name ?? card.assignee.email} />}
        {PRIORITY_META[card.priority] && (
          <span
            className="flex items-center gap-1 text-[10px] font-medium"
            style={{ color: PRIORITY_META[card.priority]!.color }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: PRIORITY_META[card.priority]!.color }}
            />
            {PRIORITY_META[card.priority]!.label}
          </span>
        )}
        {card.dueDate && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              isOverdue(card.dueDate) ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"
            }`}
          >
            {formatDue(card.dueDate)}
          </span>
        )}
        {card.description && <span className="text-xs text-muted-foreground">📝</span>}
      </div>
      {canEdit && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(card.id);
          }}
          className="absolute right-1.5 top-1.5 hidden h-5 w-5 rounded text-muted-foreground hover:bg-muted hover:text-foreground group-hover:block"
          aria-label="Delete card"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ---- Column ------------------------------------------------------------------

function Column({
  column,
  canEdit,
  onAddCard,
  onDeleteCard,
  onOpenCard,
}: {
  column: ColumnView;
  canEdit: boolean;
  onAddCard: (columnId: string, title: string) => void;
  onDeleteCard: (id: string) => void;
  onOpenCard: (card: CardView) => void;
}) {
  const { setNodeRef } = useDroppable({ id: column.id });
  const [title, setTitle] = useState("");

  function submit() {
    const t = title.trim();
    if (!t) return;
    onAddCard(column.id, t);
    setTitle("");
  }

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-sm font-semibold">{column.name}</h3>
        <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">
          {column.cards.length}
        </span>
      </div>

      <div ref={setNodeRef} className="flex min-h-2 flex-1 flex-col gap-2 px-3 pb-2">
        <SortableContext
          items={column.cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              canEdit={canEdit}
              onDelete={onDeleteCard}
              onOpen={onOpenCard}
            />
          ))}
        </SortableContext>
      </div>

      {canEdit && (
        <div className="flex gap-1 p-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Add a card…"
            className="h-8 text-sm"
          />
          <Button size="sm" variant="secondary" className="h-8" onClick={submit}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- Card detail dialog ------------------------------------------------------

function CardDetailDialog({
  card,
  members,
  boardLabels,
  canEdit,
  onClose,
  onSave,
  onDelete,
}: {
  card: CardView | null;
  members: Member[];
  boardLabels: LabelView[];
  canEdit: boolean;
  onClose: () => void;
  onSave: (patch: {
    title?: string;
    description?: string | null;
    assigneeId?: string | null;
    dueDate?: string | null;
    priority?: Priority;
    labelIds?: string[];
  }) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("none");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority>("NONE");
  const [labelIds, setLabelIds] = useState<string[]>([]);

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description ?? "");
      setAssigneeId(card.assignee?.id ?? "none");
      setDue(toDateInput(card.dueDate));
      setPriority(card.priority);
      setLabelIds(card.labels.map((l) => l.id));
    }
  }, [card]);

  function toggleLabel(id: string) {
    setLabelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function save() {
    if (!card) return;
    onSave({
      title: title.trim() || card.title,
      description: description.trim() === "" ? null : description.trim(),
      assigneeId: assigneeId === "none" ? null : assigneeId,
      dueDate: due ? new Date(due).toISOString() : null,
      priority,
      labelIds,
    });
    onClose();
  }

  return (
    <Dialog open={!!card} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Card details</DialogTitle>
        </DialogHeader>
        {card && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
                placeholder="Add more detail…"
              />
            </div>
            {boardLabels.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Labels</label>
                <div className="flex flex-wrap gap-1.5">
                  {boardLabels.map((l) => {
                    const active = labelIds.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggleLabel(l.id)}
                        className="rounded-full px-2 py-0.5 text-xs font-medium transition"
                        style={
                          active
                            ? { backgroundColor: l.color, color: "white" }
                            : { border: `1px solid ${l.color}`, color: l.color }
                        }
                      >
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Due date</label>
                <Input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Priority</label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as Priority)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Assignee</label>
              <Select value={assigneeId} onValueChange={setAssigneeId} disabled={!canEdit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        {canEdit && card && (
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                onDelete(card.id);
                onClose();
              }}
            >
              Delete
            </Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- Board -------------------------------------------------------------------

export function KanbanBoard({
  slug,
  projectId,
  canEdit,
  initialColumns,
  members,
  boardLabels,
  currentUser,
}: {
  slug: string;
  projectId: string;
  canEdit: boolean;
  initialColumns: ColumnView[];
  members: Member[];
  boardLabels: LabelView[];
  currentUser: { id: string; name: string };
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [columns, setColumns] = useState<ColumnView[]>(initialColumns);
  const [activeCard, setActiveCard] = useState<CardView | null>(null);
  const [detailCard, setDetailCard] = useState<CardView | null>(null);
  const [newColumn, setNewColumn] = useState("");

  // ---- Filters (view-only; drag still operates on the full column state) ----
  const [filterLabel, setFilterLabel] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const filtersActive = filterLabel !== "all" || filterAssignee !== "all" || overdueOnly;

  const displayColumns = columns.map((col) => ({
    ...col,
    cards: col.cards.filter((c) => {
      if (filterLabel !== "all" && !c.labels.some((l) => l.id === filterLabel)) return false;
      if (filterAssignee !== "all" && c.assignee?.id !== filterAssignee) return false;
      if (overdueOnly && !isOverdue(c.dueDate)) return false;
      return true;
    }),
  }));

  // Live presence + remote-change refresh over the realtime WS hub.
  const present = useBoardSocket(projectId, currentUser);

  // Re-sync when the server sends a fresh snapshot (after router.refresh()).
  useEffect(() => setColumns(initialColumns), [initialColumns]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function findCard(id: string): CardView | null {
    for (const col of columns) {
      const c = col.cards.find((x) => x.id === id);
      if (c) return c;
    }
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveCard(findCard(String(e.active.id)));
  }

  // Live-move a card between columns while dragging.
  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const fromCol = columnIdOf(columns, activeId);
    const toCol = columnIdOf(columns, overId);
    if (!fromCol || !toCol || fromCol === toCol) return;

    setColumns((prev) => {
      const from = prev.find((c) => c.id === fromCol)!;
      const to = prev.find((c) => c.id === toCol)!;
      const card = from.cards.find((c) => c.id === activeId);
      if (!card) return prev;
      let overIndex = to.cards.findIndex((c) => c.id === overId);
      if (overIndex === -1) overIndex = to.cards.length;
      return prev.map((col) => {
        if (col.id === fromCol)
          return { ...col, cards: col.cards.filter((c) => c.id !== activeId) };
        if (col.id === toCol)
          return {
            ...col,
            cards: [...col.cards.slice(0, overIndex), card, ...col.cards.slice(overIndex)],
          };
        return col;
      });
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveCard(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const targetCol = columnIdOf(columns, overId);
    if (!targetCol) return;

    let next = columns;
    const col = columns.find((c) => c.id === targetCol)!;
    const oldIndex = col.cards.findIndex((c) => c.id === activeId);
    if (oldIndex !== -1) {
      let newIndex = col.cards.findIndex((c) => c.id === overId);
      if (newIndex === -1) newIndex = col.cards.length - 1;
      if (oldIndex !== newIndex) {
        next = columns.map((c) =>
          c.id === targetCol ? { ...c, cards: arrayMove(c.cards, oldIndex, newIndex) } : c,
        );
        setColumns(next);
      }
    }

    const finalCol = next.find((c) => c.id === targetCol)!;
    const toIndex = finalCol.cards.findIndex((c) => c.id === activeId);
    startTransition(async () => {
      const res = await moveCardAction(slug, projectId, activeId, targetCol, toIndex);
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
      }
    });
  }

  function addCard(columnId: string, title: string) {
    startTransition(async () => {
      const res = await createCardAction(slug, projectId, columnId, title);
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  function saveCard(patch: {
    title?: string;
    description?: string | null;
    assigneeId?: string | null;
    dueDate?: string | null;
    priority?: Priority;
    labelIds?: string[];
  }) {
    if (!detailCard) return;
    const id = detailCard.id;
    startTransition(async () => {
      const res = await updateCardAction(slug, projectId, id, patch);
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  function deleteCard(id: string) {
    setColumns((prev) => prev.map((c) => ({ ...c, cards: c.cards.filter((x) => x.id !== id) })));
    startTransition(async () => {
      const res = await deleteCardAction(slug, projectId, id);
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
      }
    });
  }

  function addColumn() {
    const name = newColumn.trim();
    if (!name) return;
    setNewColumn("");
    startTransition(async () => {
      const res = await createColumnAction(slug, projectId, name);
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <PresenceBar users={present} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={filterLabel} onValueChange={setFilterLabel}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue placeholder="Label" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All labels</SelectItem>
                {boardLabels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterAssignee} onValueChange={setFilterAssignee}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant={overdueOnly ? "default" : "secondary"}
              className="h-8 text-xs"
              onClick={() => setOverdueOnly((v) => !v)}
            >
              Overdue
            </Button>
            {filtersActive && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => {
                  setFilterLabel("all");
                  setFilterAssignee("all");
                  setOverdueOnly(false);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {displayColumns.map((column) => (
            <Column
              key={column.id}
              column={column}
              canEdit={canEdit}
              onAddCard={addCard}
              onDeleteCard={deleteCard}
              onOpenCard={setDetailCard}
            />
          ))}

          {canEdit && (
            <div className="w-72 shrink-0">
              <div className="flex gap-1">
                <Input
                  value={newColumn}
                  onChange={(e) => setNewColumn(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addColumn()}
                  placeholder="Add a column…"
                  className="h-9"
                />
                <Button variant="secondary" onClick={addColumn}>
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>

        <DragOverlay>
          {activeCard ? (
            <div className="rounded-md border bg-card p-3 text-sm shadow-lg">
              {activeCard.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <CardDetailDialog
        card={detailCard}
        members={members}
        boardLabels={boardLabels}
        canEdit={canEdit}
        onClose={() => setDetailCard(null)}
        onSave={saveCard}
        onDelete={deleteCard}
      />
    </>
  );
}
