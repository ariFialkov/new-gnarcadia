import { describe, it, expect } from "vitest";
import { computePayouts } from "../services/matches.js";

const cfg: any = { format: "ffa", minPlayers: 2, maxPlayers: 4, entryTiersCents: [100], rakeBps: 1000, maxDurationSec: 60, fillWaitSec: 1, payoutBps: [7000, 3000] };
const ent = (n: number) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, team: null }));

describe("computePayouts", () => {
  it("ffa with rake and table", () => {
    const r = computePayouts("ffa", cfg, 500, 1000, ent(4), [{ playerId: "p2", rank: 1, score: 9 }, { playerId: "p0", rank: 2, score: 5 }, { playerId: "p1", rank: 3, score: 2 }, { playerId: "p3", rank: 4, score: 0 }]);
    expect(r.gross).toBe(2000); expect(r.rake).toBe(200);
    expect(r.payouts.get("p2")).toBe(1260); expect(r.payouts.get("p0")).toBe(540);
    expect([...r.payouts.values()].reduce((a, b) => a + b, 0) + r.rake).toBe(2000);
  });
  it("splits ties", () => {
    const r = computePayouts("ffa", cfg, 500, 1000, ent(4), [{ playerId: "p0", rank: 1, score: 9 }, { playerId: "p1", rank: 1, score: 9 }, { playerId: "p2", rank: 3, score: 1 }, { playerId: "p3", rank: 4, score: 0 }]);
    expect(r.payouts.get("p0")).toBe(900); expect(r.payouts.get("p1")).toBe(900);
  });
  it("teams split equally", () => {
    const r = computePayouts("teams", { ...cfg, format: "teams", teams: 2 }, 100, 1000, [{ playerId: "a", team: 0 }, { playerId: "b", team: 0 }, { playerId: "c", team: 1 }, { playerId: "d", team: 1 }], [{ playerId: "c", rank: 1, score: 1, team: 1 }, { playerId: "d", rank: 1, score: 1, team: 1 }, { playerId: "a", rank: 2, score: 0, team: 0 }, { playerId: "b", rank: 2, score: 0, team: 0 }]);
    expect(r.payouts.get("c")).toBe(180); expect(r.payouts.get("d")).toBe(180); expect(r.rake).toBe(40);
  });
  it("perpetual never exceeds escrow", () => {
    const r = computePayouts("perpetual", { ...cfg, format: "perpetual" }, 500, 0, ent(2), [{ playerId: "p0", rank: 1, score: 0, cashOutCents: 900 }, { playerId: "p1", rank: 2, score: 0, cashOutCents: 0 }]);
    expect(r.rake).toBe(100); expect(r.payouts.get("p0")).toBe(900);
    const bad = computePayouts("perpetual", { ...cfg, format: "perpetual" }, 500, 0, ent(2), [{ playerId: "p0", rank: 1, score: 0, cashOutCents: 2000 }]);
    expect(bad.payouts.get("p0")).toBe(1000); expect((bad as any).flagged).toBe("cashout_exceeded_escrow");
  });
  it("practice has no money", () => {
    const r = computePayouts("duel", { ...cfg, format: "duel", payoutBps: [10000] }, 0, 1000, ent(2), [{ playerId: "p0", rank: 1, score: 1 }, { playerId: "p1", rank: 2, score: 0 }]);
    expect(r.gross).toBe(0); expect(r.payouts.size).toBe(0);
  });
});
