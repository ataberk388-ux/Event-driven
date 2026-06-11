"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createProject } from "./project-actions";

type ProjectType = "BOARD" | "DOC" | "CANVAS";
export type ProjectView = { id: string; name: string; type: string };

export function ProjectsPanel({
  slug,
  canCreate,
  projects,
}: {
  slug: string;
  canCreate: boolean;
  projects: ProjectView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState<ProjectType>("BOARD");

  function create() {
    if (!name) return;
    const fd = new FormData();
    fd.append("slug", slug);
    fd.append("name", name);
    fd.append("type", type);
    startTransition(async () => {
      const res = await createProject(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Project created");
      setName("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex flex-wrap items-end gap-3">
          <Input
            placeholder="New project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-48 flex-1"
          />
          <Select value={type} onValueChange={(v) => setType(v as ProjectType)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BOARD">Board</SelectItem>
              <SelectItem value="DOC">Doc</SelectItem>
              <SelectItem value="CANVAS">Canvas</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={create} disabled={pending || !name}>
            Create
          </Button>
        </div>
      )}

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/workspace/${slug}/project/${p.id}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                <span className="font-medium">{p.name}</span>
                <Badge variant="secondary">{p.type}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
