import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireCashEligible, latestGeo } from "../services/gates.js";
import { joinMatch, getMatch, matchRoster, submitScore, leaveBeforeStart, playerRow } from "../services/matches.js";
import { badRequest, forbidden } from "../lib/errors.js";
import { getJurisdiction } from "@gnarcadia/protocol";

export const matchRoutes: FastifyPluginAsync = async (app) => {
  app.post("/matches/join", { preHandler: (r) => app.authenticate(r), config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    const b = z.object({ gameId: z.string(), format: z.string(), entryCents: z.number().int().min(0), practice: z.boolean().optional(), team: z.number().int().min(0).max(7).optional() }).parse(req.body);
    const u = req.user!;
    const practice = !!b.practice || b.entryCents === 0;
    let region: string | null = null;
    if (!practice) {
      await requireCashEligible(req.db, u, { requireKycTier: 1 });
      const geo = await latestGeo(req.db, u.id); region = geo!.region!;
      const j = getJurisdiction(region)!;
      if (b.entryCents > j.maxEntryCents) throw forbidden("entry_above_cap", `Max entry in ${j.name} is ${(j.maxEntryCents / 100).toFixed(0)}.`);
    } else if (u.termsVersion == null) throw forbidden("terms_required");
    return joinMatch(req.db, u, { ...b, practice, region });
  });

  app.get("/matches/:id", { preHandler: (r) => app.authenticate(r) }, async (req) => {
    const m = await getMatch(req.db, (req.params as any).id);
    const roster = await matchRoster(req.db, m.id);
    if (!roster.some((r) => r.userId === req.user!.id) && !req.user!.roles.includes("admin")) throw forbidden("not_in_match");
    return { id: m.id, gameId: m.gameId, format: m.format, status: m.status, entryCents: m.entryCents, currency: m.currency, rakeBps: m.rakeBps, maxPlayers: m.maxPlayers, practice: m.practice, seed: m.seed, createdAt: m.createdAt, startedAt: m.startedAt, settledAt: m.settledAt, settlement: m.settlement, roster: roster.map((r) => ({ playerId: r.playerId, username: r.username, team: r.team, status: r.status, rank: r.rank, score: r.score, payoutCents: r.payoutCents, isMe: r.userId === req.user!.id })) };
  });

  app.post("/matches/:id/submit", { preHandler: (r) => app.authenticate(r) }, async (req) => {
    const b = z.object({ score: z.number().finite(), durationMs: z.number().int().min(0), inputLogHash: z.string().max(32).optional(), inputLog: z.array(z.any()).max(5000).optional() }).parse(req.body);
    return submitScore(req.db, req.user!, (req.params as any).id, b);
  });

  /** Leave an open (not started) realtime lobby for a refund. */
  app.post("/matches/:id/leave", { preHandler: (r) => app.authenticate(r) }, async (req) => {
    const id = (req.params as any).id;
    const mp = await playerRow(req.db, id, req.user!.id);
    if (!mp) throw badRequest("not_in_match");
    await leaveBeforeStart(req.db, id, mp.playerId);
    return { ok: true };
  });
};
