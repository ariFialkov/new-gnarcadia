import type { JoinMatchResponse } from "@gnarcadia/protocol";
import { ssDel, ssGet, ssSet } from "../lib/storage.ts";

/** What the runner needs beyond the join response (the join response has no game id/name). */
export interface JoinContext {
  join: JoinMatchResponse;
  gameId: string;
  gameName: string;
  gameVersion: string;
  aspect?: string;
  orientation?: "any" | "landscape" | "portrait";
  savedAt: number;
}

const key = (matchId: string) => `gn.join.${matchId}`;

/** Kept in sessionStorage (per tab) so a refresh re-renders the same match; realtime formats reconnect with the same ticket. */
export function saveJoinContext(join: JoinMatchResponse, meta: Omit<JoinContext, "join" | "savedAt">) {
  ssSet(key(join.matchId), { join, ...meta, savedAt: Date.now() } satisfies JoinContext);
}
export function loadJoinContext(matchId: string): JoinContext | null {
  return ssGet<JoinContext | null>(key(matchId), null);
}
export function clearJoinContext(matchId: string) { ssDel(key(matchId)); }
