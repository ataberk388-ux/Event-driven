"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "./actions";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      const res = await acceptInvitation(token);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Invitation accepted!");
      router.push(`/workspace/${res.data!.slug}`);
      router.refresh();
    });
  }

  return (
    <Button onClick={accept} disabled={pending}>
      {pending ? "Accepting…" : "Accept invitation"}
    </Button>
  );
}
