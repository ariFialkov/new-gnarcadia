import { describe, it, expect } from "vitest";
import { defineGame, rankByScore } from "./define.js";
import { RoomRuntime } from "./runtime.js";

const clicker = defineGame<{ scores: Record<string, number> }, { click: true }>({
  tickRate: 10,
  create: () => ({ scores: {} }),
  onJoin: (s, p) => { s.scores[p.playerId] = 0; },
  onInput: (s, p, input) => { if (!input || input.click !== true) throw new Error("bad"); s.scores[p.playerId]++; },
  rank: (s) => rankByScore(Object.entries(s.scores).map(([playerId, score]) => ({ playerId, score }))),
});

const cfg = { format: "ffa" as const, minPlayers: 2, maxPlayers: 4, entryTiersCents: [100], rakeBps: 1000, maxDurationSec: 10, fillWaitSec: 1 };

describe("RoomRuntime", () => {
  it("runs an ffa to completion with deterministic results", () => {
    let t = 1_000_000;
    const rt = new RoomRuntime(clicker, { roomId: "r", matchId: "m", config: cfg, seed: "s", entryCents: 100, now: () => t, countdownMs: 1000 });
    rt.join({ playerId: "a", displayName: "A", cosmetics: {} });
    rt.join({ playerId: "b", displayName: "B", cosmetics: {} });
    expect(rt.phase).toBe("waiting");
    t += 1100; rt.step();                    // fill wait elapsed -> countdown
    expect(rt.phase).toBe("countdown");
    t += 1000; rt.step();                    // -> playing
    expect(rt.phase).toBe("playing");
    rt.input("a", 1, { click: true }); rt.input("a", 2, { click: true }); rt.input("b", 1, { click: true });
    rt.input("b", 1, { click: true });       // replayed seq ignored
    t += 11_000; rt.step();                  // max duration -> end
    const end = rt.drain().find((e) => e.kind === "end") as any;
    expect(end.results.map((r: any) => [r.playerId, r.rank, r.score])).toEqual([["a", 1, 2], ["b", 2, 1]]);
  });

  it("perpetual: eliminations move bounty to killer and cash-out on leave", () => {
    let t = 0;
    const perp = { ...cfg, format: "perpetual" as const, minPlayers: 1, bountyBps: 10_000 };
    const rt = new RoomRuntime(clicker, { roomId: "r", matchId: "m", config: perp, seed: "s", entryCents: 500, now: () => t, countdownMs: 0 });
    rt.join({ playerId: "a", displayName: "A", cosmetics: {} });
    t += 1; rt.step(); t += 1; rt.step();
    expect(rt.phase).toBe("playing");
    rt.join({ playerId: "b", displayName: "B", cosmetics: {} }); // late join allowed
    rt.ctx.eliminate("b", "a");
    expect(rt.players.get("a")!.bankCents).toBe(500);
    rt.leave("a");
    const cash = rt.drain().filter((e) => e.kind === "event" && (e as any).name === "gn:cashout") as any[];
    expect(cash[0].data).toEqual({ playerId: "a", cents: 1000 }); // own stake back + bounty
  });
});
