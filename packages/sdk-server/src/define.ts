import type { FormatConfig, MatchResult, SeededRandom } from "@gnarcadia/protocol";

/** A connected player as seen by server game logic. */
export interface ServerPlayer {
  playerId: string;
  displayName: string;
  team?: number;
  cosmetics: Record<string, string>;
  connected: boolean;
  joinedAt: number;
  /** perpetual: current bounty on this player's head (cents) and their banked winnings (cents). Managed by the runtime. */
  bountyCents: number;
  bankCents: number;
  /** Last input sequence number seen (for anti-replay). */
  lastSeq: number;
}

export interface RoomContext<S = unknown> {
  roomId: string;
  matchId: string;
  format: FormatConfig["format"];
  config: FormatConfig;
  seed: string;
  /** Shared deterministic RNG. Use it for any randomness so replays are reproducible. */
  random: SeededRandom;
  players: ReadonlyMap<string, ServerPlayer>;
  phase: "waiting" | "countdown" | "playing" | "ended";
  now(): number;
  /** Broadcast a named event to all connected players. */
  broadcast(name: string, data: unknown): void;
  /** Send a named message to one player. */
  sendTo(playerId: string, name: string, data: unknown): void;
  /** Mark a player eliminated. In perpetual lobbies the runtime moves the victim's bounty to the killer's bank. */
  eliminate(playerId: string, byPlayerId?: string): void;
  /** End the match now with explicit results (rank 1 = winner). Idempotent. */
  end(results: Array<Pick<MatchResult, "playerId" | "rank" | "score"> & Partial<MatchResult>>): void;
  /** Structured log line (surfaced in the dev console / server logs). */
  log(...args: unknown[]): void;
}

export interface GameDefinition<S = any, I = any> {
  /** Simulation ticks per second (default 20). */
  tickRate?: number;
  /** Snapshot broadcasts per second (default 10). */
  snapshotRate?: number;
  /** Create initial state when the room opens. */
  create(ctx: RoomContext<S>): S;
  /** Called when all slots filled / fill timer fired and countdown finished. */
  onStart?(state: S, ctx: RoomContext<S>): void;
  onJoin?(state: S, player: ServerPlayer, ctx: RoomContext<S>): void;
  onLeave?(state: S, player: ServerPlayer, reason: "left" | "disconnected" | "kicked", ctx: RoomContext<S>): void;
  /** Validate + apply an input from a player. Throw to reject it (counts toward kick threshold). */
  onInput(state: S, player: ServerPlayer, input: I, ctx: RoomContext<S>): void;
  onTick?(state: S, dtMs: number, ctx: RoomContext<S>): void;
  /**
   * Produce a final ranking from state. Called when the max duration is hit, when only one player
   * remains (ffa/duel), or when you call ctx.end() without results. rank 1 = best.
   */
  rank(state: S, ctx: RoomContext<S>): Array<Pick<MatchResult, "playerId" | "rank" | "score"> & Partial<MatchResult>>;
  /** What each client receives as a snapshot. Omit secrets. Defaults to the whole state. */
  serialize?(state: S, forPlayerId: string, ctx: RoomContext<S>): unknown;
  /** Max rejected inputs before a player is kicked (default 50). */
  maxBadInputs?: number;
}

/** Identity helper that gives you typed hooks and marks the module as a Gnarcadia game. */
export function defineGame<S, I = any>(def: GameDefinition<S, I>): GameDefinition<S, I> {
  if (typeof def.create !== "function" || typeof def.onInput !== "function" || typeof def.rank !== "function") {
    throw new Error("defineGame: create, onInput and rank are required");
  }
  return def;
}

/** Simple ranking helper: sort by a numeric score descending, assign ranks (ties share rank). */
export function rankByScore(entries: { playerId: string; score: number; team?: number }[]): Array<{ playerId: string; rank: number; score: number; team?: number }> {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  let rank = 0, prev = Number.NaN;
  return sorted.map((e, i) => { if (e.score !== prev) { rank = i + 1; prev = e.score; } return { ...e, rank }; });
}
