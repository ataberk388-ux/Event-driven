"use client";

import "tldraw/tldraw.css";
import { useEffect, useState } from "react";
import {
  Tldraw,
  createTLStore,
  defaultShapeUtils,
  type Editor,
  type TLRecord,
  type TLStoreWithStatus,
} from "tldraw";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

// Marks Yjs transactions that originate locally, so we don't echo them back.
const ORIGIN = "tldraw-local";

export function CanvasInner({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [storeWithStatus, setStoreWithStatus] = useState<TLStoreWithStatus>({ status: "loading" });

  useEffect(() => {
    const store = createTLStore({ shapeUtils: defaultShapeUtils });
    const ydoc = new Y.Doc();
    const base = process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://localhost:4100";
    const provider = new WebsocketProvider(`${base}/yjs`, projectId, ydoc);
    const yRecords = ydoc.getMap<TLRecord>("tldraw");
    const disposers: Array<() => void> = [];

    function onSynced(connected: boolean) {
      if (!connected) return;
      provider.off("sync", onSynced);

      // Hydrate: adopt shared state if present, otherwise seed it from our store.
      const seedFromStore = () => {
        ydoc.transact(() => {
          yRecords.clear();
          for (const r of store.allRecords()) yRecords.set(r.id, r);
        }, ORIGIN);
      };

      if (yRecords.size === 0) {
        seedFromStore();
      } else {
        try {
          store.mergeRemoteChanges(() => store.put([...yRecords.values()]));
        } catch (err) {
          // Corrupted / schema-incompatible shared snapshot — reset it from a
          // clean store instead of bricking the canvas.
          console.warn("[canvas] resetting incompatible shared state", err);
          seedFromStore();
        }
      }

      // Local edits → Yjs.
      disposers.push(
        store.listen(
          ({ changes }) => {
            ydoc.transact(() => {
              for (const r of Object.values(changes.added)) yRecords.set(r.id, r);
              for (const [, to] of Object.values(changes.updated)) yRecords.set(to.id, to);
              for (const r of Object.values(changes.removed)) yRecords.delete(r.id);
            }, ORIGIN);
          },
          { source: "user", scope: "document" },
        ),
      );

      // Remote edits → store.
      const observer = (events: Array<Y.YEvent<Y.Map<TLRecord>>>, txn: Y.Transaction) => {
        if (txn.origin === ORIGIN) return;
        store.mergeRemoteChanges(() => {
          for (const event of events) {
            event.changes.keys.forEach((change, id) => {
              if (change.action === "delete") {
                store.remove([id as TLRecord["id"]]);
              } else {
                const rec = yRecords.get(id);
                if (rec) store.put([rec]);
              }
            });
          }
        });
      };
      yRecords.observeDeep(observer);
      disposers.push(() => yRecords.unobserveDeep(observer));

      setStoreWithStatus({ status: "synced-remote", connectionStatus: "online", store });
    }

    provider.on("sync", onSynced);

    return () => {
      disposers.forEach((d) => d());
      provider.destroy();
      ydoc.destroy();
    };
  }, [projectId]);

  function onMount(editor: Editor) {
    if (!canEdit) editor.updateInstanceState({ isReadonly: true });
  }

  return (
    <div className="h-[72vh] overflow-hidden rounded-lg border">
      <Tldraw store={storeWithStatus} onMount={onMount} />
    </div>
  );
}
