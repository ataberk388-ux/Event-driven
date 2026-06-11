"use client";

import dynamic from "next/dynamic";

// tldraw touches `window`, so it must never render on the server.
const CanvasInner = dynamic(() => import("./canvas-inner").then((m) => m.CanvasInner), {
  ssr: false,
  loading: () => (
    <div className="flex h-[72vh] items-center justify-center rounded-lg border text-sm text-muted-foreground">
      Loading canvas…
    </div>
  ),
});

export function CanvasBoard({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  return <CanvasInner projectId={projectId} canEdit={canEdit} />;
}
