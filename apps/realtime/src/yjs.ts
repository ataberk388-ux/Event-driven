import type { WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { prisma } from "@synapse/db";

/**
 * Minimal Yjs collaboration server speaking the standard y-websocket wire
 * protocol (sync + awareness), so the browser's WebsocketProvider connects with
 * no custom client. One shared Y.Doc per document room (keyed by projectId);
 * state is loaded from and debounced-saved to Postgres (`documents.state`).
 */

const messageSync = 0;
const messageAwareness = 1;
const SAVE_DEBOUNCE_MS = 1500;

type Room = {
  doc: Y.Doc;
  awareness: Awareness;
  conns: Set<WebSocket>;
  loaded: Promise<void>;
  saveTimer?: ReturnType<typeof setTimeout>;
};

const rooms = new Map<string, Room>();

function send(ws: WebSocket, payload: Uint8Array): void {
  try {
    ws.send(payload);
  } catch {
    ws.close();
  }
}

function broadcast(room: Room, payload: Uint8Array, except?: WebSocket): void {
  for (const ws of room.conns) if (ws !== except) send(ws, payload);
}

async function persist(name: string, room: Room): Promise<void> {
  const state = Buffer.from(Y.encodeStateAsUpdate(room.doc));
  await prisma.document.upsert({
    where: { projectId: name },
    create: { projectId: name, state },
    update: { state },
  });
}

function scheduleSave(name: string, room: Room): void {
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => {
    persist(name, room).catch((e) => console.error("[yjs] persist failed", e));
  }, SAVE_DEBOUNCE_MS);
}

function getRoom(name: string): Room {
  let room = rooms.get(name);
  if (room) return room;

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  room = { doc, awareness, conns: new Set(), loaded: Promise.resolve() };

  room.loaded = prisma.document
    .findUnique({ where: { projectId: name } })
    .then((row) => {
      if (row?.state) Y.applyUpdate(doc, new Uint8Array(row.state));
    })
    .catch((e) => console.error("[yjs] load failed", e));

  // Persist + fan out every document mutation.
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    const r = rooms.get(name);
    if (!r) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    broadcast(r, encoding.toUint8Array(encoder), origin instanceof Object ? (origin as WebSocket) : undefined);
    scheduleSave(name, r);
  });

  // Relay awareness (cursors / who's editing) to everyone else.
  awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    const r = rooms.get(name);
    if (!r) return;
    const changed = [...added, ...updated, ...removed];
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(awareness, changed));
    broadcast(r, encoding.toUint8Array(encoder), origin instanceof Object ? (origin as WebSocket) : undefined);
  });

  rooms.set(name, room);
  return room;
}

export async function handleYjs(ws: WebSocket, url: URL): Promise<void> {
  const name = url.searchParams.get("doc") ?? url.pathname.split("/").pop() ?? "default";
  const room = getRoom(name);
  await room.loaded;
  room.conns.add(ws);

  // Initial sync: send our state vector (sync step 1).
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, room.doc);
  send(ws, encoding.toUint8Array(encoder));

  // Send current awareness snapshot, if any.
  const states = room.awareness.getStates();
  if (states.size > 0) {
    const aEncoder = encoding.createEncoder();
    encoding.writeVarUint(aEncoder, messageAwareness);
    encoding.writeVarUint8Array(aEncoder, encodeAwarenessUpdate(room.awareness, [...states.keys()]));
    send(ws, encoding.toUint8Array(aEncoder));
  }

  ws.on("message", (data: ArrayBuffer | Buffer) => {
    const msg = new Uint8Array(data as Buffer);
    const decoder = decoding.createDecoder(msg);
    const type = decoding.readVarUint(decoder);
    if (type === messageSync) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
      if (encoding.length(encoder) > 1) send(ws, encoding.toUint8Array(encoder));
    } else if (type === messageAwareness) {
      applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), ws);
    }
  });

  ws.on("close", () => {
    room.conns.delete(ws);
    removeAwarenessStates(room.awareness, [room.awareness.clientID], ws);
    if (room.conns.size === 0) {
      // Last editor left — flush state and drop the room from memory.
      if (room.saveTimer) clearTimeout(room.saveTimer);
      persist(name, room)
        .catch((e) => console.error("[yjs] final persist failed", e))
        .finally(() => rooms.delete(name));
    }
  });
  ws.on("error", () => ws.close());
}
