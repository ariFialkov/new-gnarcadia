import { SeededRandom, type FormatConfig, type MatchResult, type RoomPhase } from "@gnarcadia/protocol";
import type { GameDefinition, RoomContext, ServerPlayer } from "./define.js";

/** Outbound effects the runtime asks its host (worker/main thread) to deliver. */
export type RuntimeEffect =
  | { kind: "snapshot"; tick: number; shared?: unknown; perPlayer?: Record<string, unknown> }
  | { kind: "event"; name: string; data: unknown }
  | { kind: "private"; playerId: string; name: string; data: unknown }
  | { kind: "phase"; phase: RoomPhase; countdownEndsAt?: number }
  | { kind: "bounty"; playerId: string; bountyCents: number; bankCents: number }
  | { kind: "kick"; playerId: string; reason: string }
  | { kind: "end"; results: MatchResult[] }
  | { kind: "log"; args: unknown[] };

export interface RuntimeOptions {
  roomId: string;
  matchId: string;
  config: FormatConfig;
  seed: string;
  entryCents: number;
  now?: () => number;
  /** Countdown length once the room decides to start. */
  countdownMs?: number;
}

/**
 * Runs one match. Deterministic given inputs + seed. Owns phases, timers, bounty bookkeeping and
 * calls the game's hooks. Transport-agnostic: emits RuntimeEffects for the host to deliver.
 */
export class RoomRuntime<S = any, I = any> {
  readonly players = new Map<string, ServerPlayer>();
  phase: RoomPhase = "waiting";
  tick = 0;
  private state!: S;
  private ended = false;
  private results: MatchResult[] | null = null;
  private badInputs = new Map<string, number>();
  private firstReadyAt: number | null = null;
  private countdownEndsAt: number | null = null;
  private startedAt: number | null = null;
  private lastTickAt = 0;
  private sinceSnapshot = 0;
  private effects: RuntimeEffect[] = [];
  readonly ctx: RoomContext<S>;
  readonly tickMs: number;
  readonly snapshotEvery: number;
  private now: () => number;
  private countdownMs: number;

  constructor(readonly def: GameDefinition<S, I>, readonly opts: RuntimeOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.countdownMs = opts.countdownMs ?? 3000;
    const tickRate = def.tickRate ?? 20;
    this.tickMs = 1000 / tickRate;
    this.snapshotEvery = Math.max(1, Math.round(tickRate / (def.snapshotRate ?? 10)));
    const self = this;
    this.ctx = {
      roomId: opts.roomId, matchId: opts.matchId, format: opts.config.format, config: opts.config, seed: opts.seed,
      random: new SeededRandom(opts.seed), players: this.players,
      get phase() { return self.phase; },
      now: () => this.now(),
      broadcast: (name, data) => this.push({ kind: "event", name, data }),
      sendTo: (playerId, name, data) => this.push({ kind: "private", playerId, name, data }),
      eliminate: (playerId, by) => this.eliminate(playerId, by),
      end: (results) => this.finish(results),
      log: (...args) => this.push({ kind: "log", args }),
    };
    this.state = def.create(this.ctx);
    this.lastTickAt = this.now();
  }

  /** Drain effects produced since the last call. */
  drain(): RuntimeEffect[] { const e = this.effects; this.effects = []; return e; }
  private push(e: RuntimeEffect) { this.effects.push(e); }

  get isFull() { return this.players.size >= this.opts.config.maxPlayers; }
  get canAcceptJoins() {
    if (this.ended) return false;
    if (this.opts.config.format === "perpetual") return !this.isFull; // join any time
    return this.phase === "waiting" && !this.isFull;
  }

  join(p: { playerId: string; displayName: string; team?: number; cosmetics: Record<string, string> }): ServerPlayer {
    const existing = this.players.get(p.playerId);
    if (existing) { existing.connected = true; return existing; } // reconnect
    if (!this.canAcceptJoins) throw new Error("room not accepting joins");
    const player: ServerPlayer = {
      ...p, connected: true, joinedAt: this.now(), lastSeq: 0,
      bountyCents: this.opts.config.format === "perpetual" ? this.opts.entryCents : 0, bankCents: 0,
    };
    if (this.opts.config.format === "teams" && player.team === undefined) player.team = this.assignTeam();
    this.players.set(player.playerId, player);
    this.def.onJoin?.(this.state, player, this.ctx);
    if (this.opts.config.format === "perpetual") {
      this.push({ kind: "bounty", playerId: player.playerId, bountyCents: player.bountyCents, bankCents: 0 });
      if (this.phase === "waiting" && this.players.size >= this.opts.config.minPlayers) this.start();
    } else this.maybeScheduleStart();
    return player;
  }

  private assignTeam(): number {
    const teams = this.opts.config.teams ?? 2;
    const counts = new Array(teams).fill(0);
    for (const p of this.players.values()) if (p.team !== undefined) counts[p.team]++;
    return counts.indexOf(Math.min(...counts));
  }

  disconnect(playerId: string) {
    const p = this.players.get(playerId); if (!p) return;
    p.connected = false;
    if (this.phase === "waiting") { this.players.delete(playerId); this.def.onLeave?.(this.state, p, "disconnected", this.ctx); return; }
    this.def.onLeave?.(this.state, p, "disconnected", this.ctx);
    this.checkLastStanding();
  }

  /** Voluntary leave: forfeit (ranked last) or, in perpetual lobbies, cash out the bank. */
  leave(playerId: string) {
    const p = this.players.get(playerId); if (!p) return;
    if (this.phase === "waiting") { this.players.delete(playerId); this.def.onLeave?.(this.state, p, "left", this.ctx); return; }
    p.connected = false;
    this.def.onLeave?.(this.state, p, "left", this.ctx);
    if (this.opts.config.format === "perpetual") {
      // Cash out: bank + remaining bounty (your own stake comes back if nobody got you).
      const cashOut = p.bankCents + p.bountyCents;
      this.results ??= [];
      this.results.push({ playerId, rank: 0, score: p.bankCents, cashOutCents: cashOut });
      p.bankCents = 0; p.bountyCents = 0;
      this.players.delete(playerId);
      this.push({ kind: "event", name: "gn:cashout", data: { playerId, cents: cashOut } });
    }
    this.checkLastStanding();
  }

  input(playerId: string, seq: number, data: I) {
    const p = this.players.get(playerId); if (!p || this.phase !== "playing") return;
    if (seq <= p.lastSeq) return; // replayed/out-of-order
    p.lastSeq = seq;
    try { this.def.onInput(this.state, p, data, this.ctx); }
    catch (err) {
      const n = (this.badInputs.get(playerId) ?? 0) + 1; this.badInputs.set(playerId, n);
      if (n >= (this.def.maxBadInputs ?? 50)) this.push({ kind: "kick", playerId, reason: "too many invalid inputs" });
    }
  }

  private maybeScheduleStart() {
    const { minPlayers, fillWaitSec } = this.opts.config;
    if (this.phase !== "waiting") return;
    if (this.isFull) return this.start();
    if (this.players.size >= minPlayers && this.firstReadyAt === null) this.firstReadyAt = this.now() + fillWaitSec * 1000;
  }

  private start() {
    if (this.phase !== "waiting") return;
    this.phase = "countdown";
    this.countdownEndsAt = this.now() + this.countdownMs;
    this.push({ kind: "phase", phase: "countdown", countdownEndsAt: this.countdownEndsAt });
  }

  /** Advance the simulation. Call at ~tickRate Hz. */
  step(nowOverride?: number) {
    if (nowOverride !== undefined) this.now = () => nowOverride;
    const now = this.now();
    if (this.ended) return;
    if (this.phase === "waiting") {
      if (this.firstReadyAt !== null && now >= this.firstReadyAt && this.players.size >= this.opts.config.minPlayers) this.start();
      else if (this.firstReadyAt !== null && this.players.size < this.opts.config.minPlayers) this.firstReadyAt = null;
      this.lastTickAt = now; return;
    }
    if (this.phase === "countdown") {
      if (now >= (this.countdownEndsAt ?? 0)) {
        this.phase = "playing"; this.startedAt = now; this.lastTickAt = now;
        this.push({ kind: "phase", phase: "playing" });
        this.def.onStart?.(this.state, this.ctx);
      }
      return;
    }
    if (this.phase === "playing") {
      const dt = now - this.lastTickAt; this.lastTickAt = now; this.tick++;
      this.def.onTick?.(this.state, dt, this.ctx);
      if (this.ended) return;
      if (now - (this.startedAt ?? now) >= this.opts.config.maxDurationSec * 1000) return this.finish();
      if (++this.sinceSnapshot >= this.snapshotEvery) { this.sinceSnapshot = 0; this.snapshot(); }
    }
  }

  private snapshot() {
    if (this.def.serialize) {
      const perPlayer: Record<string, unknown> = {};
      for (const p of this.players.values()) if (p.connected) perPlayer[p.playerId] = this.def.serialize(this.state, p.playerId, this.ctx);
      this.push({ kind: "snapshot", tick: this.tick, perPlayer });
    } else this.push({ kind: "snapshot", tick: this.tick, shared: this.state });
  }

  private eliminate(victimId: string, byId?: string) {
    const v = this.players.get(victimId); if (!v || this.phase !== "playing") return;
    if (this.opts.config.format === "perpetual") {
      const killer = byId ? this.players.get(byId) : undefined;
      const bps = this.opts.config.bountyBps ?? 10_000;
      const toKiller = killer ? Math.floor((v.bountyCents * bps) / 10_000) : 0;
      if (killer) { killer.bankCents += toKiller; this.push({ kind: "bounty", playerId: killer.playerId, bountyCents: killer.bountyCents, bankCents: killer.bankCents }); }
      // Anything not paid to the killer is forfeited by the victim to the pool (becomes rake/returned per settlement rules).
      const victimCashOut = v.bankCents; // an eliminated player keeps what they banked, loses their bounty
      this.results ??= [];
      this.results.push({ playerId: victimId, rank: 0, score: v.bankCents, cashOutCents: victimCashOut });
      v.bountyCents = 0; v.bankCents = 0;
      this.push({ kind: "event", name: "gn:eliminated", data: { playerId: victimId, by: byId ?? null, bountyCents: toKiller, cashOutCents: victimCashOut } });
      this.players.delete(victimId);
      this.push({ kind: "kick", playerId: victimId, reason: "eliminated" });
      return;
    }
    v.connected = false; // out of the match; rank() decides placement
    this.push({ kind: "event", name: "gn:eliminated", data: { playerId: victimId, by: byId ?? null } });
    this.checkLastStanding();
  }

  private checkLastStanding() {
    if (this.phase !== "playing") return;
    const alive = [...this.players.values()].filter((p) => p.connected);
    if (this.opts.config.format === "perpetual") return; // never ends on its own
    if (alive.length <= 1 && this.players.size >= 2) this.finish();
    if (alive.length === 0) this.finish();
  }

  /** Force-close (e.g. server shutdown). */
  forceEnd() { this.finish(); }

  private finish(explicit?: Array<Pick<MatchResult, "playerId" | "rank" | "score"> & Partial<MatchResult>>) {
    if (this.ended) return;
    this.ended = true; this.phase = "ended";
    let results: MatchResult[];
    if (this.opts.config.format === "perpetual") {
      // Everyone still in the lobby cashes out.
      for (const p of this.players.values()) { this.results ??= []; this.results.push({ playerId: p.playerId, rank: 0, score: p.bankCents, cashOutCents: p.bankCents + p.bountyCents }); }
      results = (this.results ?? []).sort((a, b) => (b.cashOutCents ?? 0) - (a.cashOutCents ?? 0)).map((r, i) => ({ ...r, rank: i + 1 }));
    } else {
      const base = explicit ?? this.def.rank(this.state, this.ctx);
      const known = new Set(base.map((r) => r.playerId));
      // Players the game forgot (e.g. disconnected early) go last.
      const missing: Array<Pick<MatchResult, "playerId" | "rank" | "score"> & Partial<MatchResult>> = [...this.players.values()].filter((p) => !known.has(p.playerId)).map((p) => ({ playerId: p.playerId, rank: base.length + 1, score: Number.NEGATIVE_INFINITY, disconnected: true }));
      results = [...base, ...missing].map((r) => ({ ...r, team: r.team ?? this.players.get(r.playerId)?.team, disconnected: r.disconnected ?? !(this.players.get(r.playerId)?.connected ?? false) }));
      results.sort((a, b) => a.rank - b.rank);
    }
    this.results = results;
    this.push({ kind: "phase", phase: "ended" });
    this.push({ kind: "end", results });
  }
}
