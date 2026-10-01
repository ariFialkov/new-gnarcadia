import type { WebSocket } from "ws";
import type { MatchTicket, RtServerMessage, RtPlayerPublic, RoomPhase, MatchResult } from "@gnarcadia/protocol";
import type { RuntimeEffect } from "@gnarcadia/sdk-server";
import { GameHost } from "./game-host.js";
import { api, type MatchDescription } from "./api-client.js";
import { env } from "./env.js";

interface Conn { ws: WebSocket; ticket: MatchTicket; inputCount: number; windowStart: number }

/**
 * Socket-side room: owns connections, relays inputs to the worker, fans out effects, and drives the
 * money lifecycle through the API (started / cash-out / settle / cancel). Never trusts the client.
 */
export class Room {
  readonly conns = new Map<string, Conn>();
  readonly players = new Map<string, RtPlayerPublic>();
  phase: RoomPhase = "waiting";
  countdownEndsAt?: number;
  tickRate = 20;
  private settled = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;
  private lastSnapshot: { shared?: unknown; perPlayer?: Record<string, unknown> } | null = null;

  constructor(readonly id: string, readonly desc: MatchDescription, readonly host: GameHost, private onClose: (room: Room) => void) {}

  async open() {
    await this.host.ensure();
    this.unsubscribe = this.host.onMessage((m) => this.onWorker(m));
    await new Promise<void>((resolve, reject) => {
      const off = this.host.onMessage((m) => { if (m.t === "created" && m.roomId === this.id) { off(); m.ok ? (this.tickRate = m.tickRate, resolve()) : reject(new Error(m.error)); } });
      this.host.send({ t: "create", roomId: this.id, matchId: this.desc.id, config: this.desc.config, seed: this.desc.seed, entryCents: this.desc.entryCents });
    });
    this.armIdle();
  }

  /** A ticket-holder connects (or reconnects). */
  async join(ws: WebSocket, ticket: MatchTicket) {
    const existing = this.conns.get(ticket.pid);
    if (existing && existing.ws !== ws) { try { existing.ws.close(4001, "replaced by new connection"); } catch {} }
    this.conns.set(ticket.pid, { ws, ticket, inputCount: 0, windowStart: Date.now() });
    const player: RtPlayerPublic = { playerId: ticket.pid, displayName: ticket.name, team: ticket.team, cosmetics: ticket.cos, connected: true };
    const result = await new Promise<{ ok: boolean; error?: string; phase: RoomPhase; countdownEndsAt?: number }>((resolve) => {
      const off = this.host.onMessage((m) => { if (m.t === "joined" && m.roomId === this.id && m.playerId === ticket.pid) { off(); resolve(m); } });
      this.host.send({ t: "join", roomId: this.id, player: { playerId: ticket.pid, displayName: ticket.name, team: ticket.team, cosmetics: ticket.cos } });
    });
    if (!result.ok) { this.conns.delete(ticket.pid); this.send(ws, { t: "error", code: "join_rejected", message: result.error ?? "join rejected" }); ws.close(4002, "join rejected"); return; }
    const isNew = !this.players.has(ticket.pid);
    this.players.set(ticket.pid, player);
    this.phase = result.phase; this.countdownEndsAt = result.countdownEndsAt;
    this.send(ws, { t: "welcome", playerId: ticket.pid, roomId: this.id, matchId: this.desc.id, tickRate: this.tickRate, players: [...this.players.values()], phase: this.phase, countdownEndsAt: this.countdownEndsAt });
    if (isNew) this.broadcast({ t: "player_joined", player }, ticket.pid);
    if (this.lastSnapshot) this.send(ws, { t: "state", tick: 0, state: this.lastSnapshot.perPlayer ? this.lastSnapshot.perPlayer[ticket.pid] : this.lastSnapshot.shared });
    this.armIdle();
  }

  input(pid: string, seq: number, data: unknown) {
    const c = this.conns.get(pid); if (!c) return;
    // Per-connection flood control: 120 inputs/sec max.
    const now = Date.now(); if (now - c.windowStart > 1000) { c.windowStart = now; c.inputCount = 0; }
    if (++c.inputCount > 120) return;
    this.host.send({ t: "input", roomId: this.id, playerId: pid, seq, data });
  }

  leave(pid: string) {
    this.host.send({ t: "leave", roomId: this.id, playerId: pid });
    if (this.phase === "waiting") api.playerLeft(this.desc.id, pid).catch((e) => console.error("playerLeft", e));
  }

  disconnect(pid: string, ws: WebSocket) {
    const c = this.conns.get(pid); if (!c || c.ws !== ws) return;
    this.conns.delete(pid);
    const p = this.players.get(pid); if (p) p.connected = false;
    this.host.send({ t: "disconnect", roomId: this.id, playerId: pid });
    if (this.phase === "waiting") { this.players.delete(pid); this.broadcast({ t: "player_left", playerId: pid, reason: "disconnected" }); api.playerLeft(this.desc.id, pid).catch(() => {}); }
    this.armIdle();
  }

  private onWorker(m: import("./game-worker.js").WorkerOut) {
    if (m.t === "fatal" && (m.roomId === this.id || m.roomId === "*")) { console.error(`[room ${this.id}] fatal:`, m.error); this.abort("server_error"); return; }
    if (m.t !== "effects" || m.roomId !== this.id) return;
    for (const e of m.effects) this.applyEffect(e);
  }

  private applyEffect(e: RuntimeEffect) {
    switch (e.kind) {
      case "snapshot":
        this.lastSnapshot = { shared: e.shared, perPlayer: e.perPlayer };
        if (e.perPlayer) for (const [pid, state] of Object.entries(e.perPlayer)) { const c = this.conns.get(pid); if (c) this.send(c.ws, { t: "state", tick: e.tick, state }); }
        else this.broadcast({ t: "state", tick: e.tick, state: e.shared });
        break;
      case "event": this.broadcast({ t: "event", name: e.name, data: e.data }); break;
      case "private": { const c = this.conns.get(e.playerId); if (c) this.send(c.ws, { t: "private", name: e.name, data: e.data }); break; }
      case "phase":
        this.phase = e.phase; this.countdownEndsAt = e.countdownEndsAt;
        this.broadcast({ t: "phase", phase: e.phase, at: Date.now(), countdownEndsAt: e.countdownEndsAt });
        if (e.phase === "playing") api.started(this.desc.id).catch((err) => console.error("started", err));
        break;
      case "bounty": this.broadcast({ t: "bounty", playerId: e.playerId, bountyCents: e.bountyCents, bankCents: e.bankCents }); break;
      case "kick": {
        const c = this.conns.get(e.playerId);
        if (e.reason !== "eliminated" && c) this.send(c.ws, { t: "error", code: "kicked", message: e.reason });
        if (c && this.desc.format === "perpetual") setTimeout(() => c.ws.close(4003, e.reason), 500);
        this.players.delete(e.playerId); this.broadcast({ t: "player_left", playerId: e.playerId, reason: e.reason });
        break;
      }
      case "end": void this.settle(e.results); break;
      case "log": console.log(`[game ${this.host.key()} room ${this.id}]`, ...e.args); break;
    }
    // Perpetual: the runtime reports money movements as events; pay them out of escrow immediately.
    if (e.kind === "event" && this.desc.format === "perpetual") {
      const d = e.data as any;
      if (e.name === "gn:cashout") this.payOut(d.playerId, d.cents);
      if (e.name === "gn:eliminated") this.payOut(d.playerId, d.cashOutCents ?? 0);
    }
  }
  private payouts: Promise<unknown>[] = [];

  private payOut(pid: string, cents: number) {
    if (this.desc.practice) return;
    const p = api.cashOut(this.desc.id, pid, cents).then(() => { const c = this.conns.get(pid); if (c) this.send(c.ws, { t: "private", name: "gn:cashout_settled", data: { cents } }); }).catch((e) => console.error(`[room ${this.id}] cashout failed for ${pid}`, e));
    this.payouts.push(p);
  }

  private async settle(results: MatchResult[]) {
    if (this.settled) return; this.settled = true;
    this.phase = "ended";
    let settlement: any = undefined;
    try {
      if (this.desc.format === "perpetual") {
        // Players still connected at close cash out individually; the API then settles any remainder to revenue.
        for (const r of results) if (r.cashOutCents && r.cashOutCents > 0 && this.players.has(r.playerId)) this.payOut(r.playerId, r.cashOutCents);
        await Promise.allSettled(this.payouts);
        settlement = (await api.settle(this.desc.id, results)).settlement;
      } else settlement = (await api.settle(this.desc.id, results)).settlement;
    } catch (e) { console.error(`[room ${this.id}] settle failed`, e); }
    this.broadcast({ t: "results", results, settlement: settlement ? { grossPoolCents: settlement.grossPoolCents, rakeCents: settlement.rakeCents, payouts: settlement.payouts } : undefined });
    setTimeout(() => this.close(), 3000);
  }

  private abort(reason: string) {
    if (this.settled) return; this.settled = true;
    this.broadcast({ t: "error", code: "match_aborted", message: reason });
    api.cancel(this.desc.id, reason).catch((e) => console.error("cancel", e));
    this.close();
  }

  private armIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const ms = this.desc.format === "perpetual" ? env.PERPETUAL_IDLE_MIN * 60_000 : 10 * 60_000;
    this.idleTimer = setTimeout(() => {
      if (this.conns.size > 0 && this.phase !== "waiting") return this.armIdle();
      if (this.conns.size > 0) return this.armIdle();
      if (this.phase === "waiting") this.abort("no_players");
      else this.host.send({ t: "forceEnd", roomId: this.id });
    }, ms);
  }

  close() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.unsubscribe?.(); this.host.send({ t: "destroy", roomId: this.id });
    for (const c of this.conns.values()) { try { c.ws.close(1000, "room closed"); } catch {} }
    this.conns.clear(); this.onClose(this);
  }

  private send(ws: WebSocket, m: RtServerMessage) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); }
  private broadcast(m: RtServerMessage, except?: string) { const s = JSON.stringify(m); for (const [pid, c] of this.conns) if (pid !== except && c.ws.readyState === c.ws.OPEN) c.ws.send(s); }
}
