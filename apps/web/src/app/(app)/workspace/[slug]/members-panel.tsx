"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { changeRole, inviteMember, removeMember, revokeInvitation } from "./actions";

type AssignableRole = "ADMIN" | "MEMBER" | "VIEWER";

export type MemberView = {
  membershipId: string;
  name: string | null;
  email: string;
  role: string;
  isOwner: boolean;
  isYou: boolean;
};

export type InviteView = { id: string; email: string; role: string };

function initials(value: string): string {
  return value
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

export function MembersPanel({
  slug,
  canManage,
  members,
  invites,
}: {
  slug: string;
  canManage: boolean;
  members: MemberView[];
  invites: InviteView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("MEMBER");

  function invite() {
    if (!email) return;
    startTransition(async () => {
      const res = await inviteMember(fd({ slug, email, role }));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data?.inviteUrl) {
        await navigator.clipboard.writeText(res.data.inviteUrl).catch(() => {});
        toast.success("Invite link copied to clipboard", { description: res.data.inviteUrl });
      } else {
        toast.success("Member added");
      }
      setEmail("");
      router.refresh();
    });
  }

  function onRoleChange(membershipId: string, next: string) {
    startTransition(async () => {
      const res = await changeRole(fd({ slug, membershipId, role: next }));
      toast[res.ok ? "success" : "error"](res.ok ? "Role updated" : res.error);
      router.refresh();
    });
  }

  function remove(membershipId: string) {
    startTransition(async () => {
      const res = await removeMember(fd({ slug, membershipId }));
      toast[res.ok ? "success" : "error"](res.ok ? "Member removed" : res.error);
      router.refresh();
    });
  }

  function revoke(invitationId: string) {
    startTransition(async () => {
      const res = await revokeInvitation(fd({ slug, invitationId }));
      toast[res.ok ? "success" : "error"](res.ok ? "Invitation revoked" : res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-3 font-semibold">Invite a member</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AssignableRole)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={invite} disabled={pending || !email}>
              Invite
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Existing users are added instantly; new emails get a shareable invite link.
          </p>
        </div>
      )}

      <div>
        <h3 className="mb-3 font-semibold">Members ({members.length})</h3>
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar>
                <AvatarFallback>{initials(m.name ?? m.email)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {m.name ?? m.email}
                  {m.isYou && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                </p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>

              {m.isOwner ? (
                <Badge variant="success">OWNER</Badge>
              ) : canManage ? (
                <div className="flex items-center gap-2">
                  <Select
                    defaultValue={m.role}
                    onValueChange={(v) => onRoleChange(m.membershipId, v)}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="MEMBER">Member</SelectItem>
                      <SelectItem value="VIEWER">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => remove(m.membershipId)}
                    disabled={pending}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Badge variant="secondary">{m.role}</Badge>
              )}
            </li>
          ))}
        </ul>
      </div>

      {invites.length > 0 && (
        <div>
          <h3 className="mb-3 font-semibold">Pending invitations ({invites.length})</h3>
          <ul className="divide-y">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">invited as {inv.role}</p>
                </div>
                <Badge variant="outline">PENDING</Badge>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke(inv.id)}
                    disabled={pending}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
