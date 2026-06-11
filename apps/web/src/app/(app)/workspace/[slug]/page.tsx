import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, InviteStatus } from "@synapse/db";
import { can } from "@synapse/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/auth";
import { MembersPanel, type InviteView, type MemberView } from "./members-panel";
import { ProjectsPanel, type ProjectView } from "./projects-panel";
import { ActivityFeed } from "./activity-feed";

export default async function WorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    include: {
      memberships: { include: { user: true }, orderBy: { createdAt: "asc" } },
      invitations: {
        where: { status: InviteStatus.PENDING },
        orderBy: { createdAt: "desc" },
      },
      projects: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 20 },
      _count: { select: { projects: true } },
    },
  });

  if (!workspace) notFound();

  const myMembership = workspace.memberships.find((m) => m.userId === userId);
  if (!myMembership) notFound();

  const canManage = can.manageWorkspace(myMembership.role);

  const members: MemberView[] = workspace.memberships.map((m) => ({
    membershipId: m.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    isOwner: m.userId === workspace.ownerId,
    isYou: m.userId === userId,
  }));

  const invites: InviteView[] = workspace.invitations.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
  }));

  const projects: ProjectView[] = workspace.projects.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
  }));

  const activities = workspace.activities.map((a) => ({
    id: a.id,
    type: a.type,
    summary: a.summary,
    createdAt: a.createdAt.toISOString(),
  }));

  // Analytics rollups (written by the worker from the event stream).
  const metrics = await prisma.dailyMetric.findMany({ where: { workspaceId: workspace.id } });
  const totalEvents = metrics.reduce((s, m) => s + m.count, 0);
  const byTypeMap = new Map<string, number>();
  for (const m of metrics) byTypeMap.set(m.eventType, (byTypeMap.get(m.eventType) ?? 0) + m.count);
  const topTypes = [...byTypeMap]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const maxCount = topTypes[0]?.count ?? 1;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-primary">
          ← Workspaces
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold">{workspace.name}</h1>
          <Badge>{myMembership.role}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          /{workspace.slug} · {workspace.memberships.length} members · {workspace._count.projects}{" "}
          projects
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectsPanel
            slug={workspace.slug}
            canCreate={can.createProject(myMembership.role)}
            projects={projects}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            <MembersPanel
              slug={workspace.slug}
              canManage={canManage}
              members={members}
              invites={invites}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed activities={activities} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          {totalEvents === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events yet. Activity here is aggregated by the worker from the event stream.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {totalEvents} event{totalEvents === 1 ? "" : "s"} processed
              </p>
              <ul className="space-y-2">
                {topTypes.map((t) => (
                  <li key={t.type} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0 truncate text-muted-foreground">{t.type}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.round((t.count / maxCount) * 100)}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right tabular-nums">{t.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
