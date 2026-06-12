import Link from "next/link";
import { prisma } from "@synapse/db";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWorkspaceForm } from "./create-workspace-form";

const PRIORITY_COLOR: Record<string, string | undefined> = {
  LOW: "#9ca3af",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
};

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [memberships, myTasks] = await Promise.all([
    prisma.membership.findMany({
      where: { userId },
      include: {
        workspace: { include: { _count: { select: { projects: true, memberships: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.card.findMany({
      where: { assigneeId: userId },
      include: {
        project: { select: { id: true, name: true, workspace: { select: { slug: true } } } },
        column: { select: { name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 25,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Your workspaces</h1>
        <p className="text-sm text-muted-foreground">
          {memberships.length} workspace{memberships.length === 1 ? "" : "s"}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <CreateWorkspaceForm />
        </CardContent>
      </Card>

      {myTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>My tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {myTasks.map((t) => {
                const overdue = t.dueDate != null && t.dueDate.getTime() < Date.now();
                return (
                  <li key={t.id}>
                    <Link
                      href={`/workspace/${t.project.workspace.slug}/project/${t.project.id}`}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:border-primary/50 hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.project.name} · {t.column.name}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {PRIORITY_COLOR[t.priority] && (
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: PRIORITY_COLOR[t.priority] }}
                          />
                        )}
                        {t.dueDate && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              overdue ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {t.dueDate.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {memberships.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No workspaces yet — create your first one above.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {memberships.map((m) => (
            <li key={m.id}>
              <Link href={`/workspace/${m.workspace.slug}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{m.workspace.name}</CardTitle>
                      <Badge>{m.role}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">/{m.workspace.slug}</p>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {m.workspace._count.projects} projects · {m.workspace._count.memberships}{" "}
                    members
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
