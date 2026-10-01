import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { games, gameVersions, users, matches, matchPlayers } from "../db/schema.js";
import { extractBundle, removeBundle } from "../services/storage.js";
import { uuid, seed as makeSeed } from "../lib/ids.js";
import { badRequest, notFound } from "../lib/errors.js";
import { signMatchTicket, hashPassword } from "../lib/auth.js";
import { env } from "../env.js";
import { GameManifestSchema, validateManifestInvariants } from "@gnarcadia/protocol";

/**
 * Developer pipeline. Auth: X-Dev-Key (company devs) or a signed-in user with the 'developer' role.
 *   gnarcadia publish  ->  POST /dev/games/:id/versions (multipart zip)  ->  POST /dev/games/:id/promote
 */
export const devRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req) => { if (!req.url.startsWith("/dev/tickets") && !req.url.startsWith("/dev/payments")) await app.requireDevKey(req); });

  app.get("/games", async (req) => {
    const rows = await req.db.select().from(games).orderBy(desc(games.updatedAt));
    const out = [];
    for (const g of rows) out.push({ ...g, versions: await req.db.select({ version: gameVersions.version, status: gameVersions.status, uploadedAt: gameVersions.uploadedAt, sizeBytes: gameVersions.sizeBytes }).from(gameVersions).where(eq(gameVersions.gameId, g.id)).orderBy(desc(gameVersions.uploadedAt)) });
    return out;
  });

  /** Register (or update metadata of) a game. Idempotent on id. */
  app.post("/games", async (req) => {
    const b = z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,40}$/), name: z.string().min(2).max(60), developerName: z.string().max(80).default("Gnarcadia"), category: z.string().default("arcade"), tags: z.array(z.string()).default([]), description: z.string().max(400).default(""), tagline: z.string().max(80).optional() }).parse(req.body);
    const existing = (await req.db.select().from(games).where(eq(games.id, b.id)))[0];
    if (existing) { await req.db.update(games).set({ name: b.name, developerName: b.developerName, category: b.category, tags: b.tags, description: b.description, tagline: b.tagline ?? null, updatedAt: new Date() }).where(eq(games.id, b.id)); return { ...existing, ...b, created: false }; }
    await req.db.insert(games).values({ id: b.id, name: b.name, developerName: b.developerName, developerUserId: req.user?.id ?? null, category: b.category, tags: b.tags, description: b.description, tagline: b.tagline ?? null, status: "draft" });
    return { id: b.id, created: true };
  });

  /** Upload a build (zip with gnarcadia.json at root). */
  app.post("/games/:id/versions", async (req) => {
    const { id } = req.params as { id: string };
    const g = (await req.db.select().from(games).where(eq(games.id, id)))[0];
    if (!g) throw notFound("game_not_found", "Register the game first (gnarcadia publish does this automatically)");
    const file = await req.file();
    if (!file) throw badRequest("file_required", "multipart field 'bundle' (zip) required");
    const buf = await file.toBuffer();
    // Peek at the manifest before extracting to learn the version.
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(buf);
    const mEntry = zip.getEntries().find((e) => e.entryName === "gnarcadia.json" || /^[^/]+\/gnarcadia\.json$/.test(e.entryName));
    if (!mEntry) throw badRequest("manifest_missing", "gnarcadia.json must be at the bundle root");
    const parsed = GameManifestSchema.safeParse(JSON.parse(mEntry.getData().toString("utf8")));
    if (!parsed.success) throw badRequest("manifest_invalid", "gnarcadia.json failed validation", parsed.error.flatten());
    const manifest = parsed.data;
    if (manifest.id !== id) throw badRequest("manifest_id_mismatch", `manifest id '${manifest.id}' != '${id}'`);
    const problems = validateManifestInvariants(manifest);
    if (problems.length) throw badRequest("manifest_invalid", "manifest invariants failed", { problems });
    const { files, bytes } = extractBundle(buf, id, manifest.version);
    const { bundleFileExists } = await import("../services/storage.js");
    if (!bundleFileExists(id, manifest.version, manifest.entry)) { removeBundle(id, manifest.version); throw badRequest("entry_missing", `entry '${manifest.entry}' not found in bundle`); }
    if (manifest.server && !bundleFileExists(id, manifest.version, manifest.server)) { removeBundle(id, manifest.version); throw badRequest("server_missing", `server module '${manifest.server}' not found in bundle`); }
    await req.db.insert(gameVersions).values({ id: uuid(), gameId: id, version: manifest.version, manifest: manifest as any, storagePath: `games/${id}/${manifest.version}`, sizeBytes: bytes, status: "uploaded" });
    await req.db.update(games).set({ name: manifest.name, description: manifest.description, tagline: manifest.tagline ?? null, category: manifest.category, tags: manifest.tags, developerName: manifest.developer, updatedAt: new Date() }).where(eq(games.id, id));
    return { gameId: id, version: manifest.version, files, bytes, previewUrl: `${env.PUBLIC_GAMES_URL}/g/${id}/${manifest.version}/${manifest.entry}`, next: `POST /dev/games/${id}/promote {"version":"${manifest.version}"}` };
  });

  /** Make a version live (company devs can self-promote; indie devs go through admin review). */
  app.post("/games/:id/promote", async (req) => {
    const { id } = req.params as { id: string };
    const b = z.object({ version: z.string(), featured: z.boolean().optional() }).parse(req.body);
    const v = (await req.db.select().from(gameVersions).where(and(eq(gameVersions.gameId, id), eq(gameVersions.version, b.version))))[0];
    if (!v) throw notFound("version_not_found");
    const isCompany = req.headers["x-dev-key"] === env.DEV_API_KEY || req.user?.roles.includes("admin");
    if (!isCompany) { await req.db.update(games).set({ status: "review", updatedAt: new Date() }).where(eq(games.id, id)); return { status: "review", message: "Submitted for review. An admin will approve it." }; }
    await req.db.update(gameVersions).set({ status: "approved" }).where(eq(gameVersions.id, v.id));
    await req.db.update(games).set({ liveVersion: b.version, status: "live", featured: b.featured ?? undefined, updatedAt: new Date() }).where(eq(games.id, id));
    return { status: "live", gameId: id, version: b.version, url: `${env.PUBLIC_ARCADE_URL}/games/${id}` };
  });

  app.post("/games/:id/status", async (req) => {
    const b = z.object({ status: z.enum(["draft", "paused", "live"]) }).parse(req.body);
    await req.db.update(games).set({ status: b.status, updatedAt: new Date() }).where(eq(games.id, (req.params as any).id));
    return { ok: true };
  });

  /** Dev-only realtime tickets for `gnarcadia dev` (standalone SDK mode). Disabled in production. */
  app.post("/tickets", async (req) => {
    if (env.isProd) throw notFound();
    const b = z.object({ gameId: z.string(), format: z.string(), displayName: z.string().max(30).default("Dev"), matchId: z.string().optional() }).parse(req.body);
    const username = "dev_" + b.displayName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
    let u = (await req.db.select().from(users).where(eq(users.username, username)))[0];
    if (!u) { const id = uuid(); await req.db.insert(users).values({ id, email: `${username}@dev.local`, passwordHash: await hashPassword("devdevdev"), username, dob: "1990-01-01", country: "CA", currency: "CAD", roles: ["developer"], termsVersion: env.TERMS_VERSION, kycTier: 1, kycStatus: "approved" }); u = (await req.db.select().from(users).where(eq(users.id, id)))[0]; }
    // Dev matches are practice matches on a synthetic "dev" version; the realtime server loads the game from the dev server URL passed in the ticket.
    const matchId = b.matchId ?? `dev-${b.gameId}-${b.format}`;
    let m = (await req.db.select().from(matches).where(eq(matches.id, matchId)))[0];
    const cfg = { format: b.format, minPlayers: 1, maxPlayers: 8, entryTiersCents: [0], rakeBps: 0, maxDurationSec: 600, fillWaitSec: 3, teams: 2, bountyBps: 10000, payoutBps: [10000] };
    if (!m || m.status === "settled" || m.status === "cancelled") {
      const g = (await req.db.select().from(games).where(eq(games.id, b.gameId)))[0];
      if (!g) await req.db.insert(games).values({ id: b.gameId, name: b.gameId, developerName: "dev", status: "draft" });
      const id = m ? `${matchId}-${Date.now()}` : matchId;
      await req.db.insert(matches).values({ id, gameId: b.gameId, gameVersion: "dev", format: b.format, country: "CA", currency: "CAD", entryCents: 0, rakeBps: 0, seed: makeSeed(), status: "open", practice: true, roomId: id, maxPlayers: 8, config: cfg });
      m = (await req.db.select().from(matches).where(eq(matches.id, id)))[0];
    }
    const playerId = "p_" + uuid().slice(0, 8);
    await req.db.insert(matchPlayers).values({ id: uuid(), matchId: m.id, userId: u.id, playerId, status: "joined" }).onConflictDoNothing();
    const ticket = await signMatchTicket({ sub: u.id, mid: m.id, pid: playerId, gid: b.gameId, gv: "dev", rid: m.roomId, fmt: b.format, name: b.displayName, cos: {}, cur: "CAD", entry: 0, practice: true });
    return { ticket, matchId: m.id, playerId, realtimeUrl: env.PUBLIC_REALTIME_URL };
  });
};
