"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { searchEntities, type SearchHit } from "./search-actions";

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Debounced query against the Core API search procedure.
  useEffect(() => {
    if (q.trim().length === 0) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setHits(await searchEntities(q));
      setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim() && setOpen(true)}
        placeholder="Search workspaces, boards, cards…"
        className="w-44 sm:w-64"
      />
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 overflow-hidden rounded-md border bg-popover shadow-md">
          {hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matches</p>
          ) : (
            hits.map((h) => (
              <Link
                key={`${h.type}-${h.id}`}
                href={h.url}
                onClick={() => {
                  setOpen(false);
                  setQ("");
                }}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted"
              >
                <span className="truncate">{h.title}</span>
                <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                  {h.type}
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
