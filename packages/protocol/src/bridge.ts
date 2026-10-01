/**
 * Host <-> Game iframe bridge (postMessage). The arcade is the host; the game bundle runs in a
 * sandboxed iframe and talks ONLY through this channel (it never gets a user token).
 */
export const BRIDGE_VERSION = 1;
export const BRIDGE_NS = "gnarcadia";

export interface BridgePlayerInfo {
  playerId: string;       // opaque per-match player id (NOT the user id)
  displayName: string;
  avatarUrl?: string;
  team?: number;
  /** Equipped cosmetics by slot (from marketplace inventory). */
  cosmetics: Record<string, string>;
}

export interface BridgeMatchInfo {
  matchId: string;
  gameId: string;
  gameVersion: string;
  format: string;
  /** Deterministic seed shared by all entrants of the match (async_score / seeded games). */
  seed: string;
  entryCents: number;
  currency: string;
  rakeBps: number;
  maxPlayers: number;
  /** Set for realtime formats. The SDK connects with the ticket; game code never sees the token directly. */
  realtime?: { url: string; roomId: string };
  /** Practice/free mode: no money at stake. */
  practice: boolean;
  /** Time limit in seconds for the round (async) or match. */
  timeLimitSec: number;
  startedAt: number;
}

/** Messages Host -> Game */
export type HostToGame =
  | { ns: typeof BRIDGE_NS; v: 1; type: "init"; player: BridgePlayerInfo; match: BridgeMatchInfo; locale: string; reducedMotion: boolean }
  | { ns: typeof BRIDGE_NS; v: 1; type: "pause" }
  | { ns: typeof BRIDGE_NS; v: 1; type: "resume" }
  | { ns: typeof BRIDGE_NS; v: 1; type: "terminate"; reason: string }
  | { ns: typeof BRIDGE_NS; v: 1; type: "realtime_ticket"; ticket: string }
  | { ns: typeof BRIDGE_NS; v: 1; type: "pong"; t: number };

/** Messages Game -> Host */
export type GameToHost =
  | { ns: typeof BRIDGE_NS; v: 1; type: "hello"; sdkVersion: string }
  | { ns: typeof BRIDGE_NS; v: 1; type: "ready" }
  | { ns: typeof BRIDGE_NS; v: 1; type: "loading"; progress: number }
  | { ns: typeof BRIDGE_NS; v: 1; type: "request_realtime_ticket" }
  /** async_score: submit the final score + an input log hash for anti-cheat replay. */
  | { ns: typeof BRIDGE_NS; v: 1; type: "submit_score"; score: number; durationMs: number; inputLogHash?: string; inputLog?: unknown[] }
  | { ns: typeof BRIDGE_NS; v: 1; type: "game_over"; summary?: Record<string, unknown> }
  | { ns: typeof BRIDGE_NS; v: 1; type: "request_exit" }
  | { ns: typeof BRIDGE_NS; v: 1; type: "analytics"; event: string; props?: Record<string, unknown> }
  | { ns: typeof BRIDGE_NS; v: 1; type: "error"; message: string }
  | { ns: typeof BRIDGE_NS; v: 1; type: "ping"; t: number };

export function isBridgeMessage(x: unknown): x is { ns: typeof BRIDGE_NS; v: number; type: string } {
  return !!x && typeof x === "object" && (x as any).ns === BRIDGE_NS && typeof (x as any).type === "string";
}
