import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { getDb, closeDb, type Db } from "./db/client.js";
import { users, games, gameVersions, marketItems, matches, matchPlayers, paymentIntents, geoChecks, analyticsEvents } from "./db/schema.js";
import { hashPassword } from "./lib/auth.js";
import { uuid, seed as makeSeed } from "./lib/ids.js";
import { env } from "./env.js";
import * as L from "./services/ledger.js";
import { settleMatch } from "./services/matches.js";
import { bundleDir } from "./services/storage.js";
import { GameManifestSchema, JURISDICTIONS, type Currency, type MatchResult } from "@gnarcadia/protocol";

/**
 * Dev seed: admin + demo players across the launch regions, marketplace items, the example games
 * (copied from examples/games/* into storage and promoted live) and ~30 days of demo activity so
 * the analytics hub has something to show. Idempotent-ish: skips if users already exist.
 */
export async function seedIfEmpty(db: Db) {
  const [{ c }] = ((await db.execute(sql`SELECT count(*) c FROM users`)) as any).rows;
  await seedExampleGames(db); // always re-sync examples so new versions show up
  if (Number(c) > 0) return;
  console.log("[seed] empty database — seeding demo data");
  await seedAll(db);
}

async function seedExampleGames(db: Db) {
  const roots = [path.resolve(process.cwd(), "examples/games"), path.resolve(process.cwd(), "../../examples/games")];
  const root = roots.find((r) => fs.existsSync(r)); if (!root) return;
  for (const dir of fs.readdirSync(root)) {
    const mPath = path.join(root, dir, "gnarcadia.json"); if (!fs.existsSync(mPath)) continue;
    const parsed = GameManifestSchema.safeParse(JSON.parse(fs.readFileSync(mPath, "utf8")));
    if (!parsed.success) { console.warn(`[seed] skipping ${dir}: invalid manifest`); continue; }
    const m = parsed.data;
    const dest = bundleDir(m.id, m.version);
    if (!fs.existsSync(dest)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.cpSync(path.join(root, dir), dest, { recursive: true, filter: (s) => !s.includes("node_modules") }); }
    const g = (await db.select().from(games).where(eq(games.id, m.id)))[0];
    if (!g) await db.insert(games).values({ id: m.id, name: m.name, developerName: m.developer, category: m.category, tags: m.tags, description: m.description, tagline: m.tagline ?? null, status: "live", featured: true, liveVersion: m.version });
    const v = (await db.select().from(gameVersions).where(sql`${gameVersions.gameId} = ${m.id} and ${gameVersions.version} = ${m.version}`))[0];
    if (!v) { await db.insert(gameVersions).values({ id: uuid(), gameId: m.id, version: m.version, manifest: m as any, storagePath: `games/${m.id}/${m.version}`, status: "approved" }); await db.update(games).set({ liveVersion: m.version, status: "live", updatedAt: new Date() }).where(eq(games.id, m.id)); }
  }
}

async function seedAll(db: Db) {
  const pw = await hashPassword("password123");
  const mk = async (u: Partial<typeof users.$inferInsert> & { username: string; region: string }) => {
    const id = uuid(); const country = u.region.split("-")[0] as "CA" | "US";
    const { username, region, ...rest } = u;
    await db.insert(users).values({ id, email: `${username}@example.com`, passwordHash: pw, dob: "1995-06-15", country, currency: country === "CA" ? "CAD" : "USD", termsVersion: env.TERMS_VERSION, kycTier: 1, kycStatus: "approved", roles: [], ...rest, username, region });
    return id;
  };
  const admin = await mk({ username: "admin", region: "CA-ON", roles: ["admin", "developer"], email: "admin@gnarcadia.local" });
  const dev = await mk({ username: "dev", region: "CA-ON", roles: ["developer"], email: "dev@gnarcadia.local" });
  console.log(`[seed] admin login: admin@gnarcadia.local / password123   dev login: dev@gnarcadia.local / password123`);

  const regionWeights: [string, number][] = [["CA-ON", 30], ["US-CA", 20], ["US-NY", 14], ["CA-BC", 10], ["CA-AB", 8], ["US-OH", 6], ["US-CO", 5], ["US-MO", 3], ["CA-NS", 3], ["US-PA", 1]];
  const pickRegion = () => { let r = Math.random() * 100; for (const [c, w] of regionWeights) { r -= w; if (r <= 0) return c; } return "CA-ON"; };
  const names = ["nova", "pixel", "turbo", "zed", "mango", "kira", "blitz", "echo", "jinx", "orbit", "sable", "quill", "rook", "vex", "lumen", "dash", "frost", "ember", "halo", "ivy"];
  const demo: { id: string; region: string; currency: Currency; createdAt: Date }[] = [];
  for (let i = 0; i < 140; i++) {
    const region = pickRegion(); const country = region.split("-")[0];
    const createdAt = new Date(Date.now() - Math.random() * 30 * 86400_000);
    const id = uuid(); const username = `${names[i % names.length]}${i}`;
    await db.insert(users).values({ id, email: `${username}@example.com`, passwordHash: pw, username, dob: `${1980 + Math.floor(Math.random() * 25)}-03-0${1 + (i % 9)}`, country, region, currency: country === "CA" ? "CAD" : "USD", termsVersion: env.TERMS_VERSION, kycTier: Math.random() < 0.7 ? 1 : 0, kycStatus: Math.random() < 0.7 ? "approved" : "none", createdAt, lastSeenAt: new Date(createdAt.getTime() + Math.random() * (Date.now() - createdAt.getTime())) });
    await db.insert(geoChecks).values({ id: uuid(), userId: id, ip: "203.0.113.1", ipRegion: region, region, ok: true, provider: "seed", createdAt });
    demo.push({ id, region, currency: country === "CA" ? "CAD" : "USD", createdAt });
  }
  // Some blocked attempts (VPN / non-launch regions) for the map
  for (const r of ["US-TX", "US-FL", "CA-QC", "US-WA", "US-IL"]) for (let i = 0; i < 3; i++) await db.insert(geoChecks).values({ id: uuid(), userId: demo[i].id, ip: "198.51.100.1", ipRegion: r, region: r, ok: false, reason: "Cash play isn't available in your location yet.", provider: "seed", vpn: i === 0 });

  // Marketplace
  const items: Array<Omit<typeof marketItems.$inferInsert, "id" | "currency" | "sku"> & { sku: string }> = [
    { sku: "skin-neon-paddle", name: "Neon Paddle", description: "Glowing cyan paddle skin.", kind: "cosmetic", slot: "skin", gameId: "pong-duel", priceCents: 299, rarity: "rare", grants: [], imageUrl: null },
    { sku: "skin-lava-paddle", name: "Lava Paddle", description: "Molten orange paddle with ember trail.", kind: "cosmetic", slot: "skin", gameId: "pong-duel", priceCents: 499, rarity: "epic", grants: [], imageUrl: null },
    { sku: "trail-rainbow", name: "Rainbow Trail", description: "Leave a rainbow behind you in any game that supports trails.", kind: "cosmetic", slot: "trail", gameId: null, priceCents: 399, rarity: "rare", grants: [], imageUrl: null },
    { sku: "avatar-frame-gold", name: "Gold Avatar Frame", description: "Show off on the leaderboards.", kind: "cosmetic", slot: "frame", gameId: null, priceCents: 199, rarity: "common", grants: [], imageUrl: null },
    { sku: "pass-weekly-cup", name: "Weekly Cup Pass", description: "Entry to this week's featured tournament bracket.", kind: "pass", slot: null, gameId: null, priceCents: 999, rarity: "legendary", grants: ["tournament:weekly-cup"], imageUrl: null },
    { sku: "skin-tap-crown", name: "Crown Tapper", description: "A tiny crown for Tap Rush's tapper.", kind: "cosmetic", slot: "skin", gameId: "tap-rush", priceCents: 249, rarity: "common", grants: [], imageUrl: null },
  ];
  for (const it of items) for (const currency of ["CAD", "USD"] as const) await db.insert(marketItems).values({ ...it, id: uuid(), sku: `${it.sku}-${currency.toLowerCase()}`, currency });

  // Deposits + matches over the last 30 days
  const liveGames = await db.select().from(games).where(eq(games.status, "live"));
  if (liveGames.length === 0) { console.warn("[seed] no example games found; skipping demo matches"); return; }
  const depositors = demo.filter(() => Math.random() < 0.55);
  for (const u of depositors) {
    const amount = [1000, 2000, 5000, 10000][Math.floor(Math.random() * 4)];
    const at = new Date(u.createdAt.getTime() + Math.random() * 3 * 86400_000);
    const pid = uuid();
    await db.insert(paymentIntents).values({ id: pid, userId: u.id, provider: "seed", providerRef: pid, direction: "deposit", method: u.currency === "CAD" ? "interac" : "bank", amountCents: amount, currency: u.currency, status: "succeeded", createdAt: at, updatedAt: at });
    await L.post(db, { idempotencyKey: `deposit:${pid}`, kind: "deposit", currency: u.currency, userId: u.id, ref: pid, postings: L.transfer(L.platform("clearing"), L.userCash(u.id), amount) });
  }
  const byCur = { CAD: depositors.filter((d) => d.currency === "CAD"), USD: depositors.filter((d) => d.currency === "USD") };
  let created = 0;
  for (let i = 0; i < 260; i++) {
    const cur = Math.random() < 0.55 ? "CAD" : "USD"; const pool = byCur[cur]; if (pool.length < 2) continue;
    const g = liveGames[Math.floor(Math.random() * liveGames.length)];
    const fmt: any = ((await db.select().from(gameVersions).where(eq(gameVersions.gameId, g.id)))[0]?.manifest as any)?.formats?.[0]; if (!fmt) continue;
    const players = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(fmt.maxPlayers, 2 + Math.floor(Math.random() * 3)));
    if (players.length < fmt.minPlayers) continue;
    const entry = fmt.entryTiersCents[Math.floor(Math.random() * fmt.entryTiersCents.length)] || 100;
    const at = new Date(Date.now() - Math.random() * 29 * 86400_000);
    const mid = uuid();
    await db.insert(matches).values({ id: mid, gameId: g.id, gameVersion: g.liveVersion!, format: fmt.format, country: cur === "CAD" ? "CA" : "US", currency: cur, entryCents: entry, rakeBps: fmt.rakeBps ?? 1000, seed: makeSeed(), status: "running", roomId: mid, maxPlayers: fmt.maxPlayers, config: fmt, createdAt: at, startedAt: at });
    const results: MatchResult[] = [];
    let ok = true;
    for (const [idx, p] of players.entries()) {
      try { await L.post(db, { idempotencyKey: `entry:${mid}:${p.id}`, kind: "match_entry", currency: cur, userId: p.id, ref: mid, postings: L.transfer(L.userCash(p.id), L.matchEscrow(mid), entry) }); }
      catch { ok = false; break; }
      const playerId = "p_" + uuid().slice(0, 8);
      await db.insert(matchPlayers).values({ id: uuid(), matchId: mid, userId: p.id, playerId, team: fmt.format === "teams" ? idx % 2 : null, status: "joined", region: p.region, joinedAt: at });
      results.push({ playerId, rank: idx + 1, score: 1000 - idx * 100, team: fmt.format === "teams" ? idx % 2 : undefined });
    }
    if (!ok) { await db.execute(sql`DELETE FROM match_players WHERE match_id = ${mid}`); await db.execute(sql`DELETE FROM matches WHERE id = ${mid}`); continue; }
    await settleMatch(db, mid, results);
    await db.execute(sql`UPDATE transactions SET created_at = ${at} WHERE ref = ${mid}`);
    await db.execute(sql`UPDATE ledger_entries SET created_at = ${at} WHERE txn_id IN (SELECT id FROM transactions WHERE ref = ${mid})`);
    created++;
  }
  for (let i = 0; i < 600; i++) { const u = demo[Math.floor(Math.random() * demo.length)]; await db.insert(analyticsEvents).values({ id: uuid(), userId: u.id, event: ["app_open", "game_view", "lobby_open", "match_start", "wallet_open"][Math.floor(Math.random() * 5)], region: u.region, createdAt: new Date(Date.now() - Math.random() * 30 * 86400_000) }); }
  console.log(`[seed] ${demo.length} players, ${depositors.length} depositors, ${created} settled matches, ${items.length * 2} market items`);
  void admin; void dev;
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  const db = await getDb(); await seedIfEmpty(db); await closeDb();
}
