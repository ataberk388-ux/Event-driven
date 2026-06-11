import Link from "next/link";
import { prisma, InviteStatus } from "@synapse/db";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AcceptInviteButton } from "./accept-button";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();

  const invite = await prisma.invitation.findUnique({
    where: { token },
    include: { workspace: true },
  });

  const invalid =
    !invite || invite.status !== InviteStatus.PENDING || invite.expiresAt < new Date();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace invitation</CardTitle>
          <CardDescription>
            {invalid
              ? "This invitation link is invalid or has expired."
              : `You've been invited to join "${invite!.workspace.name}" as ${invite!.role}.`}
          </CardDescription>
        </CardHeader>

        {!invalid && (
          <>
            <CardContent>
              {!session?.user ? (
                <p className="text-sm text-muted-foreground">
                  Sign in (or create an account) with{" "}
                  <span className="font-medium text-foreground">{invite!.email}</span> to accept.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Signed in as {session.user.email}.</p>
              )}
            </CardContent>
            <CardFooter className="gap-3">
              {!session?.user ? (
                <Button asChild>
                  <Link href={`/login?callbackUrl=/invite/${token}`}>Sign in to accept</Link>
                </Button>
              ) : (
                <AcceptInviteButton token={token} />
              )}
            </CardFooter>
          </>
        )}
      </Card>
    </main>
  );
}
