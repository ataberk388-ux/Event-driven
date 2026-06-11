import Link from "next/link";
import { prisma } from "@synapse/db";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      workspace: {
        include: { _count: { select: { projects: true, memberships: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

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
