import { WebSocketServer, type WebSocket } from "ws";
import { createServer } from "node:http";
import { jwtVerify } from "jose";
import { env } from "./env.js";
import { api } from "./api-client.js";
import { GameHost } from "./game-host.js";
import { Room } from "./room.js";
import type { MatchTicket, RtClientMessage } from "@gnarcadia/protocol";

const key = new TextEncoder().encode(env.JWT_SECRET);
const rooms = new Map<string, Room>();
const pendingRooms = new Map<string, Promise<Room>>();
const hosts = new Map<string, GameHost>();

function hostFor(gameId: string, version: string) {
  const k = `${gameId}@${version}`;
  let h = hosts.get(k); if (!h) { h = new GameHost(gameId, version); hosts.set(k, h); }
  return h;
}

async function roomFor(ticket: MatchTicket): Promise<Room> {
  const existing = rooms.get(ticket.rid); if (existing) return existing;
  const pending = pendingRooms.get(ticket.rid); if (pending) return pending;
  const p = (async () => {
    if (rooms.size >= env.MAX_ROOMS) throw new Error("server_full");
    const desc = await api.describeMatch(ticket.mid);
    if (desc.status === "settled" || desc.status === "cancelled") throw new Error("match_over");
    const room = new Room(ticket.rid, desc, hostFor(desc.gameId, desc.gameVersion), (r) => rooms.delete(r.id));
    await room.open();
    rooms.set(ticket.rid, room);
    return room;
  })();
  pendingRooms.set(ticket.rid, p);
  try { return await p; } finally { pendingRooms.delete(ticket.rid); }
}

const http = createServer((req, res) => {
  if (req.url === "/health") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok: true, rooms: rooms.size, hosts: [...hosts.keys()], connections: [...rooms.values()].reduce((a, r) => a + r.conns.size, 0) })); return; }
  res.statusCode = 404; res.end();
});
const wss = new WebSocketServer({ server: http, maxPayload: 64 * 1024 });

wss.on("connection", (ws: WebSocket) => {
  let ticket: MatchTicket | null = null; let room: Room | null = null; let alive = true;
  ws.on("pong", () => (alive = true));
  ws.on("message", async (raw) => {
    let m: RtClientMessage; try { m = JSON.parse(raw.toString()); } catch { return; }
    try {
      if (m.t === "join") {
        if (ticket) return;
        const { payload } = await jwtVerify(m.ticket, key).catch(() => { throw new Error("bad_ticket"); });
        ticket = payload as unknown as MatchTicket;
        room = await roomFor(ticket);
        await room.join(ws, ticket);
      } else if (!ticket || !room) { ws.send(JSON.stringify({ t: "error", code: "not_joined", message: "send join first" })); }
      else if (m.t === "input") room.input(ticket.pid, m.seq, m.data);
      else if (m.t === "leave") room.leave(ticket.pid);
      else if (m.t === "ping") ws.send(JSON.stringify({ t: "pong", c: m.c, s: Date.now() }));
    } catch (e: any) {
      ws.send(JSON.stringify({ t: "error", code: e?.message ?? "error", message: String(e?.message ?? e) }));
      if (!room) ws.close(4000, String(e?.message ?? "error").slice(0, 100));
    }
  });
  ws.on("close", () => { if (ticket && room) room.disconnect(ticket.pid, ws); });
});

const heartbeat = setInterval(() => { for (const ws of wss.clients) { if (!(ws as any)._alive && (ws as any)._pinged) return ws.terminate(); (ws as any)._pinged = true; ws.ping(); } }, 30_000);
heartbeat.unref();

http.listen(env.PORT, () => console.log(`\n  Gnarcadia realtime  →  ws://localhost:${env.PORT}   (api: ${env.API_INTERNAL_URL}, dev game: ${env.DEV_GAME_URL})\n`));

async function shutdown() {
  console.log("shutting down: ending live matches…");
  for (const r of rooms.values()) r.host.send({ t: "forceEnd", roomId: r.id });
  await new Promise((r) => setTimeout(r, 1500));
  for (const h of hosts.values()) await h.terminate();
  process.exit(0);
}
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
