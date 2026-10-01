import { describe, it, expect, beforeAll, afterAll } from "vitest";
process.env.PGLITE_DIR = ":memory:";
const { getDb, closeDb } = await import("../db/client.js");
const { users, games, gameVersions } = await import("../db/schema.js");
const L = await import("../services/ledger.js");
const M = await import("../services/matches.js");
const { eq } = await import("drizzle-orm");

describe("async_score bracket lifecycle", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  const u = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];
  beforeAll(async () => {
    db = await getDb();
    const manifest = { id: "quiz", name: "Quiz", version: "1.0.0", sdkVersion: "0.1", description: "", developer: "t", category: "trivia", tags: [], entry: "index.html", orientation: "any", randomness: "none", cosmeticSlots: [], permissions: { fullscreen: true, pointerLock: false, gamepad: false }, skillStatement: "Knowledge and speed decide every outcome here.", formats: [{ format: "async_score", minPlayers: 2, maxPlayers: 2, entryTiersCents: [100], rakeBps: 1000, payoutBps: [10000], maxDurationSec: 600, fillWaitSec: 0, roundTimeLimitSec: 60 }] };
    await db.insert(games).values({ id: "quiz", name: "Quiz", status: "live", liveVersion: "1.0.0", developerName: "t" });
    await db.insert(gameVersions).values({ id: "v1", gameId: "quiz", version: "1.0.0", manifest, storagePath: "x", status: "approved" });
    for (const id of ["a", "b"]) {
      await db.insert(users).values({ id, email: `${id}@t`, passwordHash: "x", username: id, dob: "1990-01-01", country: "CA", region: "CA-ON", currency: "CAD", kycTier: 1, kycStatus: "approved", termsVersion: "2026-10-01" });
      await L.post(db, { idempotencyKey: `dep:${id}`, kind: "deposit", currency: "CAD", userId: id, postings: L.transfer(L.platform("clearing"), L.userCash(id), 1000) });
    }
  });
  afterAll(async () => { await closeDb(); });

  it("pools two entrants into one seeded bracket and settles when both submit", async () => {
    const ja = await M.joinMatch(db, await u("a"), { gameId: "quiz", format: "async_score", entryCents: 100, region: "CA-ON" });
    const jb = await M.joinMatch(db, await u("b"), { gameId: "quiz", format: "async_score", entryCents: 100, region: "CA-ON" });
    expect(jb.matchId).toBe(ja.matchId); expect(jb.seed).toBe(ja.seed);
    expect(await L.getBalance(db, L.matchEscrow(ja.matchId), "CAD")).toBe(200);
    await M.submitScore(db, await u("a"), ja.matchId, { score: 10, durationMs: 1000 });
    expect((await M.getMatch(db, ja.matchId)).status).toBe("running");
    await M.submitScore(db, await u("b"), ja.matchId, { score: 25, durationMs: 1000 });
    const m = await M.getMatch(db, ja.matchId);
    expect(m.status).toBe("settled");
    expect((m.settlement as any).rakeCents).toBe(20);
    expect(await L.getBalance(db, L.userCash("b"), "CAD")).toBe(900 + 180);
    expect(await L.getBalance(db, L.userCash("a"), "CAD")).toBe(900);
    expect((await L.reconcile(db, "CAD")).balanced).toBe(true);
    // A third join opens a fresh bracket rather than the settled one.
    const jc = await M.joinMatch(db, await u("a"), { gameId: "quiz", format: "async_score", entryCents: 100, region: "CA-ON" });
    expect(jc.matchId).not.toBe(ja.matchId);
  });

  it("refuses an entry tier the manifest doesn't offer", async () => {
    await expect(M.joinMatch(db, await u("b"), { gameId: "quiz", format: "async_score", entryCents: 250, region: "CA-ON" })).rejects.toMatchObject({ code: "invalid_entry_tier" });
  });
});
