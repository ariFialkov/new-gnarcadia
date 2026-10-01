import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { games, gameVersions } from "../db/schema.js";
import { getMatch, matchRoster, settleMatch, cancelMatch, markStarted, leaveBeforeStart, cashOut } from "../services/matches.js";
import { readBundleFile, bundleFileExists } from "../services/storage.js";
import { notFound } from "../lib/errors.js";

/** Service-to-service API used by the realtime server. All requests are HMAC-signed (X-GN-TS / X-GN-SIG). */
export const internalRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req) => app.requireInternal(req));

  app.post("/matches/:id/describe", async (req) => {
    const m = await getMatch(req.db, (req.params as any).id);
    const roster = await matchRoster(req.db, m.id);
    let serverEntry: string | null = null;
    if (m.gameVersion !== "dev") {
      const v = (await req.db.select().from(gameVersions).where(and(eq(gameVersions.gameId, m.gameId), eq(gameVersions.version, m.gameVersion))))[0];
      serverEntry = (v?.manifest as any)?.server ?? null;
    }
    return { id: m.id, gameId: m.gameId, gameVersion: m.gameVersion, format: m.format, status: m.status, entryCents: m.entryCents, rakeBps: m.rakeBps, currency: m.currency, seed: m.seed, practice: m.practice, maxPlayers: m.maxPlayers, config: m.config, serverEntry, roster };
  });

  /** Server module source for a game version (realtime server caches it on disk). */
  app.post("/games/:id/:version/server", async (req, reply) => {
    const { id, version } = req.params as { id: string; version: string };
    const v = (await req.db.select().from(gameVersions).where(and(eq(gameVersions.gameId, id), eq(gameVersions.version, version))))[0];
    const entry = (v?.manifest as any)?.server as string | undefined;
    if (!v || !entry || !bundleFileExists(id, version, entry)) throw notFound("server_module_missing");
    reply.type("text/javascript"); return readBundleFile(id, version, entry);
  });

  app.post("/matches/:id/started", async (req) => { await markStarted(req.db, (req.params as any).id); return { ok: true }; });
  app.post("/matches/:id/player-left", async (req) => { const b = z.object({ playerId: z.string() }).parse(req.body); await leaveBeforeStart(req.db, (req.params as any).id, b.playerId); return { ok: true }; });
  app.post("/matches/:id/settle", async (req) => {
    const b = z.object({ results: z.array(z.object({ playerId: z.string(), rank: z.number().int().min(0), score: z.number(), team: z.number().optional(), cashOutCents: z.number().int().min(0).optional(), disconnected: z.boolean().optional() })) }).parse(req.body);
    return { settlement: await settleMatch(req.db, (req.params as any).id, b.results as any) };
  });
  app.post("/matches/:id/cashout", async (req) => { const b = z.object({ playerId: z.string(), cents: z.number().int().min(0) }).parse(req.body); return cashOut(req.db, (req.params as any).id, b.playerId, b.cents); });
  app.post("/matches/:id/cancel", async (req) => { const b = z.object({ reason: z.string().max(80) }).parse(req.body); await cancelMatch(req.db, (req.params as any).id, b.reason); return { ok: true }; });
  app.post("/games/:id/exists", async (req) => ({ exists: !!(await req.db.select({ id: games.id }).from(games).where(eq(games.id, (req.params as any).id)))[0] }));
};
