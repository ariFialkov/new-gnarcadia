/**
 * Realtime (WebSocket) wire protocol between the SDK client and the room server, and the
 * contract between the room server and a game's server module.
 */

/** Client -> Server */
export type RtClientMessage =
  | { t: "join"; ticket: string }
  | { t: "input"; seq: number; data: unknown }
  | { t: "leave" }             // perpetual: cash out and leave
  | { t: "ping"; c: number };

export interface RtPlayerPublic {
  playerId: string;
  displayName: string;
  team?: number;
  cosmetics: Record<string, string>;
  connected: boolean;
}

/** Server -> Client */
export type RtServerMessage =
  | { t: "welcome"; playerId: string; roomId: string; matchId: string; tickRate: number; players: RtPlayerPublic[]; phase: RoomPhase; countdownEndsAt?: number }
  | { t: "player_joined"; player: RtPlayerPublic }
  | { t: "player_left"; playerId: string; reason: string }
  | { t: "phase"; phase: RoomPhase; at: number; countdownEndsAt?: number }
  | { t: "state"; tick: number; state: unknown }          // full snapshot
  | { t: "event"; name: string; data: unknown }            // game-defined broadcast event
  | { t: "private"; name: string; data: unknown }          // game-defined message to one player
  | { t: "results"; results: MatchResult[]; settlement?: SettlementSummary }
  | { t: "bounty"; playerId: string; bountyCents: number; bankCents: number } // perpetual updates
  | { t: "error"; code: string; message: string }
  | { t: "pong"; c: number; s: number };

export type RoomPhase = "waiting" | "countdown" | "playing" | "ended";

export interface MatchResult {
  playerId: string;
  userId?: string;       // filled by server when settling
  rank: number;          // 1 = best
  score: number;
  team?: number;
  /** perpetual: amount this player cashed out (in cents) */
  cashOutCents?: number;
  disconnected?: boolean;
}

export interface SettlementSummary {
  grossPoolCents: number;
  rakeCents: number;
  payouts: { playerId: string; cents: number }[];
}

/** Ticket JWT payload (issued by API, verified by realtime). */
export interface MatchTicket {
  sub: string;           // user id
  mid: string;           // match id
  pid: string;           // per-match player id
  gid: string;           // game id
  gv: string;            // game version
  rid: string;           // room id
  fmt: string;           // format
  name: string;          // display name
  team?: number;
  cos: Record<string, string>;
  cur: string;
  entry: number;         // cents
  practice: boolean;
  iat: number;
  exp: number;
}
