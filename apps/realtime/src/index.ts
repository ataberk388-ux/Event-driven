import "./env.js";
import { WebSocketServer, WebSocket } from "ws";
import { Redis } from "ioredis";
import { handleYjs } from "./yjs.js";

const PORT = Number(process.env.REALTIME_PORT ?? 4100);

/**
 * Realtime hub for Kanban boards. Two responsibilities:
 *  1. Presence — track who is viewing each board, broadcast the live roster.
 *  2. Live sync — relay "board changed" events published by the Core API over
 *     Redis pub/sub (`board:<projectId>`) to every client watching that board.
 *
 * Presence is kept in-memory (one instance in dev). Cross-process board changes
 * travel over Redis, which is what lets an API mutation reach WS clients here.
 */

type Client = { ws: WebSocket; boardId: string; userId: string; name: string };
const boards = new Map<string, Set<Client>>();

function roster(boardId: string): { userId: string; name: string }[] {
  const set = boards.get(boardId);
  if (!set) return [];
  const byUser = new Map<string, string>();
  for (const c of set) if (!byUser.has(c.userId)) byUser.set(c.userId, c.name);
  return [...byUser].map(([userId, name]) => ({ userId, name }));
}

function broadcast(boardId: string, msg: unknown): void {
  const set = boards.get(boardId);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const c of set) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
}

function sendPresence(boardId: string): void {
  broadcast(boardId, { type: "presence", users: roster(boardId) });
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "", "http://localhost");

  // Yjs collaborative documents speak a separate binary protocol.
  if (url.pathname.startsWith("/yjs")) {
    void handleYjs(ws, url);
    return;
  }

  const boardId = url.searchParams.get("boardId");
  const userId = url.searchParams.get("userId") ?? "anon";
  const name = url.searchParams.get("name") ?? "Someone";
  if (!boardId) {
    ws.close();
    return;
  }

  const client: Client = { ws, boardId, userId, name };
  let set = boards.get(boardId);
  if (!set) {
    set = new Set();
    boards.set(boardId, set);
  }
  set.add(client);
  sendPresence(boardId);

  ws.on("close", () => {
    const s = boards.get(boardId);
    if (!s) return;
    s.delete(client);
    if (s.size === 0) boards.delete(boardId);
    sendPresence(boardId);
  });
  ws.on("error", () => {});
});

// Relay board-change notifications published by the API.
const sub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
sub.psubscribe("board:*");
sub.on("pmessage", (_pattern, channel, message) => {
  const boardId = channel.slice("board:".length);
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(message);
  } catch {
    // ignore malformed payloads
  }
  broadcast(boardId, { type: "changed", ...payload });
});

console.log(`[realtime] WS server listening on ws://localhost:${PORT}`);

const shutdown = () => {
  wss.close();
  sub.disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
