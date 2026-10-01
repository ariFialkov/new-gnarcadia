/**
 * Worker thread: hosts every room of ONE game bundle. Game code runs here, isolated from the socket
 * layer — a crashing or CPU-hogging game only takes down its own rooms. Communicates with the main
 * thread via structured messages (see WorkerIn / WorkerOut).
 */
import { parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import { RoomRuntime, type GameDefinition, type RuntimeEffect } from "@gnarcadia/sdk-server";
import type { FormatConfig, RoomPhase } from "@gnarcadia/protocol";

export type WorkerIn =
  | { t: "create"; roomId: string; matchId: string; config: FormatConfig; seed: string; entryCents: number }
  | { t: "join"; roomId: string; player: { playerId: string; displayName: string; team?: number; cosmetics: Record<string, string> } }
  | { t: "disconnect"; roomId: string; playerId: string }
  | { t: "leave"; roomId: string; playerId: string }
  | { t: "input"; roomId: string; playerId: string; seq: number; data: unknown }
  | { t: "forceEnd"; roomId: string }
  | { t: "destroy"; roomId: string };

export type WorkerOut =
  | { t: "created"; roomId: string; ok: boolean; error?: string; tickRate: number }
  | { t: "joined"; roomId: string; playerId: string; ok: boolean; error?: string; phase: RoomPhase; countdownEndsAt?: number }
  | { t: "effects"; roomId: string; effects: RuntimeEffect[]; phase: RoomPhase }
  | { t: "fatal"; roomId: string; error: string };

const port = parentPort!;
const rooms = new Map<string, { rt: RoomRuntime; timer: NodeJS.Timeout; countdownEndsAt?: number }>();
let def: GameDefinition;

async function main() {
  const mod = await import(pathToFileURL(workerData.modulePath).href + `?v=${Date.now()}`);
  def = mod.default ?? mod.game ?? mod;
  if (typeof def.create !== "function" || typeof def.onInput !== "function" || typeof def.rank !== "function") throw new Error("server module must default-export defineGame({ create, onInput, rank, ... })");
  port.on("message", onMessage);
  port.postMessage({ t: "ready" });
}

function flush(roomId: string) {
  const r = rooms.get(roomId); if (!r) return;
  const effects = r.rt.drain();
  for (const e of effects) if (e.kind === "phase" && e.phase === "countdown") r.countdownEndsAt = e.countdownEndsAt;
  if (effects.length) port.postMessage({ t: "effects", roomId, effects, phase: r.rt.phase } satisfies WorkerOut);
  if (r.rt.phase === "ended") { clearInterval(r.timer); rooms.delete(roomId); }
}

function onMessage(m: WorkerIn) {
  try {
    switch (m.t) {
      case "create": {
        if (rooms.has(m.roomId)) { port.postMessage({ t: "created", roomId: m.roomId, ok: true, tickRate: def.tickRate ?? 20 }); return; }
        const rt = new RoomRuntime(def, { roomId: m.roomId, matchId: m.matchId, config: m.config, seed: m.seed, entryCents: m.entryCents });
        const timer = setInterval(() => { try { rt.step(); flush(m.roomId); } catch (e: any) { port.postMessage({ t: "fatal", roomId: m.roomId, error: String(e?.stack ?? e) }); clearInterval(timer); rooms.delete(m.roomId); } }, rt.tickMs);
        rooms.set(m.roomId, { rt, timer });
        port.postMessage({ t: "created", roomId: m.roomId, ok: true, tickRate: def.tickRate ?? 20 } satisfies WorkerOut);
        return;
      }
      case "join": {
        const r = rooms.get(m.roomId); if (!r) return port.postMessage({ t: "joined", roomId: m.roomId, playerId: m.player.playerId, ok: false, error: "room_missing", phase: "ended" });
        try { r.rt.join(m.player); port.postMessage({ t: "joined", roomId: m.roomId, playerId: m.player.playerId, ok: true, phase: r.rt.phase, countdownEndsAt: r.countdownEndsAt } satisfies WorkerOut); }
        catch (e: any) { port.postMessage({ t: "joined", roomId: m.roomId, playerId: m.player.playerId, ok: false, error: e.message, phase: r.rt.phase } satisfies WorkerOut); }
        flush(m.roomId); return;
      }
      case "disconnect": rooms.get(m.roomId)?.rt.disconnect(m.playerId); flush(m.roomId); return;
      case "leave": rooms.get(m.roomId)?.rt.leave(m.playerId); flush(m.roomId); return;
      case "input": rooms.get(m.roomId)?.rt.input(m.playerId, m.seq, m.data); return;
      case "forceEnd": rooms.get(m.roomId)?.rt.forceEnd(); flush(m.roomId); return;
      case "destroy": { const r = rooms.get(m.roomId); if (r) { clearInterval(r.timer); rooms.delete(m.roomId); } return; }
    }
  } catch (e: any) {
    port.postMessage({ t: "fatal", roomId: (m as any).roomId, error: String(e?.stack ?? e) } satisfies WorkerOut);
  }
}

main().catch((e) => { port.postMessage({ t: "fatal", roomId: "*", error: String(e?.stack ?? e) }); process.exit(1); });
