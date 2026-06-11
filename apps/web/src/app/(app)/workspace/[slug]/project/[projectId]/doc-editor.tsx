"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

const CURSOR_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]!;
}

export function DocEditor({
  projectId,
  canEdit,
  user,
}: {
  projectId: string;
  canEdit: boolean;
  user: { id: string; name: string };
}) {
  const [ydoc] = useState(() => new Y.Doc());
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://localhost:4100";
    // WebsocketProvider connects to `${base}/yjs/<projectId>` — the realtime
    // server routes any /yjs path to the collaboration handler.
    const p = new WebsocketProvider(`${base}/yjs`, projectId, ydoc);
    p.on("status", (e: { status: "connecting" | "connected" | "disconnected" }) =>
      setStatus(e.status),
    );
    setProvider(p);
    return () => p.destroy();
  }, [projectId, ydoc]);

  const editor = useEditor(
    {
      editable: canEdit,
      immediatelyRender: false,
      extensions: [
        // Collaboration brings its own (Yjs-backed) undo history.
        StarterKit.configure({ history: false }),
        Collaboration.configure({ document: ydoc }),
        ...(provider
          ? [
              CollaborationCursor.configure({
                provider,
                user: { name: user.name, color: colorFor(user.id) },
              }),
            ]
          : []),
      ],
      editorProps: {
        attributes: {
          class:
            "min-h-80 rounded-md border bg-card p-4 text-sm focus:outline-none [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1",
        },
      },
    },
    [provider, canEdit],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`h-2 w-2 rounded-full ${
            status === "connected"
              ? "bg-green-500"
              : status === "connecting"
                ? "bg-amber-500"
                : "bg-red-500"
          }`}
        />
        {status === "connected" ? "Live — changes sync in real time" : status}
        {!canEdit && " · read-only"}
      </div>
      <EditorToolbar editor={editor} canEdit={canEdit} />
      <EditorContent editor={editor} />
    </div>
  );
}

function EditorToolbar({ editor, canEdit }: { editor: Editor | null; canEdit: boolean }) {
  if (!editor || !canEdit) return null;
  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-xs font-medium ${active ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`;
  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        className={btn(editor.isActive("bold"))}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        Bold
      </button>
      <button
        type="button"
        className={btn(editor.isActive("italic"))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        Italic
      </button>
      <button
        type="button"
        className={btn(editor.isActive("heading", { level: 1 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </button>
      <button
        type="button"
        className={btn(editor.isActive("heading", { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </button>
      <button
        type="button"
        className={btn(editor.isActive("bulletList"))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </button>
      <button
        type="button"
        className={btn(editor.isActive("blockquote"))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        Quote
      </button>
    </div>
  );
}
