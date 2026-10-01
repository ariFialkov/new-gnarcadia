import { describe, it, expect, beforeAll, afterAll } from "vitest";
process.env.PGLITE_DIR = ":memory:";
const { getDb, closeDb } = await import("../db/client.js");
const L = await import("../services/ledger.js");

describe("ledger", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  beforeAll(async () => { db = await getDb(); });
  afterAll(async () => { await closeDb(); });

  it("posts balanced transactions idempotently and blocks overdrafts", async () => {
    const r1 = await L.post(db, { idempotencyKey: "dep1", kind: "deposit", currency: "CAD", userId: "u1", postings: L.transfer(L.platform("clearing"), L.userCash("u1"), 1000) });
    expect(r1.replayed).toBe(false);
    const r2 = await L.post(db, { idempotencyKey: "dep1", kind: "deposit", currency: "CAD", userId: "u1", postings: L.transfer(L.platform("clearing"), L.userCash("u1"), 1000) });
    expect(r2.replayed).toBe(true);
    expect(await L.getBalance(db, L.userCash("u1"), "CAD")).toBe(1000);
    await expect(L.post(db, { idempotencyKey: "big", kind: "match_entry", currency: "CAD", userId: "u1", postings: L.transfer(L.userCash("u1"), L.matchEscrow("m1"), 5000) })).rejects.toMatchObject({ code: "insufficient_funds" });
    expect(await L.getBalance(db, L.userCash("u1"), "CAD")).toBe(1000);
    await expect(L.post(db, { idempotencyKey: "x", kind: "adjustment", currency: "CAD", postings: [{ account: L.userCash("u1"), deltaCents: 5 }] })).rejects.toThrow(/unbalanced/);
  });

  it("escrow -> payout + rake reconciles", async () => {
    await L.post(db, { idempotencyKey: "dep2", kind: "deposit", currency: "CAD", userId: "u2", postings: L.transfer(L.platform("clearing"), L.userCash("u2"), 1000) });
    await L.post(db, { idempotencyKey: "e1", kind: "match_entry", currency: "CAD", userId: "u1", postings: L.transfer(L.userCash("u1"), L.matchEscrow("m1"), 500) });
    await L.post(db, { idempotencyKey: "e2", kind: "match_entry", currency: "CAD", userId: "u2", postings: L.transfer(L.userCash("u2"), L.matchEscrow("m1"), 500) });
    expect(await L.getBalance(db, L.matchEscrow("m1"), "CAD")).toBe(1000);
    await L.post(db, { idempotencyKey: "settle-m1", kind: "match_payout", currency: "CAD", postings: [
      { account: L.matchEscrow("m1"), deltaCents: -1000 }, { account: L.userCash("u1"), deltaCents: 900 }, { account: L.platform("revenue"), deltaCents: 100 },
    ] });
    const rec = await L.reconcile(db, "CAD");
    expect(rec.balanced).toBe(true);
    expect(rec.escrow).toBe(0); expect(rec.revenue).toBe(100); expect(rec.userCashTotal).toBe(1900); // u1 1400, u2 500
    expect(rec.clearing).toBe(-2000);
  });
});
