"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchEntities, type SearchHit } from "./search-actions";

const STATIC_COMMANDS = [{ id: "dashboard", title: "Go to dashboard", url: "/dashboard" }];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  // Global ⌘K / Ctrl+K toggle.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQ("");
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length === 0) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => setHits(await searchEntities(q)), 200);
    return () => clearTimeout(t);
  }, [q]);

  const staticMatches = STATIC_COMMANDS.filter((c) =>
    c.title.toLowerCase().includes(q.toLowerCase()),
  );

  function go(url: string) {
    setOpen(false);
    router.push(url);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const first = hits[0] ?? staticMatches[0];
    if (first) go(first.url);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0">
        <form onSubmit={onSubmit}>
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search or jump to…  (⌘K)"
            className="border-0 pr-10 text-sm focus-visible:ring-0"
          />
        </form>
        <div className="max-h-80 overflow-y-auto border-t">
          {staticMatches.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => go(c.url)}
              className="flex w-full items-center px-4 py-2 text-left text-sm hover:bg-muted"
            >
              {c.title}
            </button>
          ))}
          {hits.map((h) => (
            <button
              key={`${h.type}-${h.id}`}
              type="button"
              onClick={() => go(h.url)}
              className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="truncate">{h.title}</span>
              <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                {h.type}
              </span>
            </button>
          ))}
          {q.trim() && hits.length === 0 && staticMatches.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">No matches</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
