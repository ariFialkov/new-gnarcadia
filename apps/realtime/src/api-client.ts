import { createHmac } from "node:crypto";
import { env } from "./env.js";
import type { FormatConfig, MatchResult } from "@gnarcadia/protocol";

export interface MatchDescription {
  id: string; gameId: string; gameVersion: string; format: string; status: string; entryCents: number; rakeBps: number; currency: string; seed: string; practice: boolean; maxPlayers: number; config: FormatConfig; serverEntry: string | null;
  roster: { playerId: string; userId: string; team: number | null; status: string; username: string }[];
}

async function call<T>(path: string, body: unknown = {}): Promise<T> {
  const raw = JSON.stringify(body);
  const ts = String(Date.now());
  const sig = createHmac("sha256", env.INTERNAL_SECRET).update(`${ts}.${raw}`).digest("hex");
  const r = await fetch(`${env.API_INTERNAL_URL}/internal${path}`, { method: "POST", headers: { "content-type": "application/json", "x-gn-ts": ts, "x-gn-sig": sig }, body: raw, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`api ${path} -> ${r.status} ${await r.text()}`);
  const ct = r.headers.get("content-type") ?? "";
  return (ct.includes("json") ? r.json() : r.text()) as Promise<T>;
}

export const api = {
  describeMatch: (id: string) => call<MatchDescription>(`/matches/${id}/describe`),
  serverModuleSource: (gameId: string, version: string) => call<string>(`/games/${gameId}/${version}/server`),
  started: (id: string) => call(`/matches/${id}/started`),
  playerLeft: (id: string, playerId: string) => call(`/matches/${id}/player-left`, { playerId }),
  cashOut: (id: string, playerId: string, cents: number) => call(`/matches/${id}/cashout`, { playerId, cents }),
  settle: (id: string, results: MatchResult[]) => call<{ settlement: any }>(`/matches/${id}/settle`, { results }),
  cancel: (id: string, reason: string) => call(`/matches/${id}/cancel`, { reason }),
};
