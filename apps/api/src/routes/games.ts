import type { FastifyPluginAsync } from "fastify";
import { and, desc, eq, gte, sql, ilike, or } from "drizzle-orm";
import { games, gameVersions, matches, matchPlayers } from "../db/schema.js";
import { leaderboard } from "../services/matches.js";
import { notFound } from "../lib/errors.js";
import { env } from "../env.js";
import type { GameSummary } from "@gnarcadia/protocol";

export const gameRoutes: FastifyPluginAsync = async (app) => {
  app.get("/games", async (req) => {
    const q = req.query as { q?: string; category?: string; sort?: string; includeDrafts?: string };
    const where = [eq(games.status, "live")];
    if (q.includeDrafts === "1" && req.headers["x-dev-key"] === env.DEV_API_KEY) where.length = 0;
    if (q.category) where.push(eq(games.category, q.category));
    if (q.q) where.push(or(ilike(games.name, `%${q.q}%`), ilike(games.description, `%${q.q}%`))!);
    const rows = await req.db.select().from(games).where(where.length ? and(...where) : undefined).orderBy(desc(games.featured), desc(games.createdAt));
    const since = new Date(Date.now() - 86400_000);
    const plays = await req.db.select({ gameId: matches.gameId, n: sql<number>`count(*)` }).from(matches).where(gte(matches.createdAt, since)).groupBy(matches.gameId);
    const online = await req.db.select({ gameId: matches.gameId, n: sql<number>`count(distinct ${matchPlayers.userId})` }).from(matchPlayers).innerJoin(matches, eq(matches.id, matchPlayers.matchId)).where(sql`${matches.status} in ('open','running')`).groupBy(matches.gameId);
    const out: GameSummary[] = [];
    for (const g of rows) {
      const v = g.liveVersion ? (await req.db.select().from(gameVersions).where(and(eq(gameVersions.gameId, g.id), eq(gameVersions.version, g.liveVersion))))[0] : null;
      const m: any = v?.manifest ?? {};
      out.push(summary(g, m, Number(plays.find((p) => p.gameId === g.id)?.n ?? 0), Number(online.find((p) => p.gameId === g.id)?.n ?? 0)));
    }
    if (q.sort === "popular") out.sort((a, b) => b.stats.plays24h - a.stats.plays24h);
    if (q.sort === "new") out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out;
  });

  app.get("/games/:id", async (req) => {
    const { id } = req.params as { id: string };
    const g = (await req.db.select().from(games).where(eq(games.id, id)))[0];
    if (!g) throw notFound("game_not_found");
    const v = g.liveVersion ? (await req.db.select().from(gameVersions).where(and(eq(gameVersions.gameId, g.id), eq(gameVersions.version, g.liveVersion))))[0] : null;
    const open = await req.db.select({ format: matches.format, entryCents: matches.entryCents, n: sql<number>`count(${matchPlayers.id})`, max: matches.maxPlayers }).from(matches).leftJoin(matchPlayers, and(eq(matchPlayers.matchId, matches.id), sql`${matchPlayers.status} in ('joined','finished')`)).where(and(eq(matches.gameId, id), eq(matches.status, "open"))).groupBy(matches.id, matches.format, matches.entryCents, matches.maxPlayers);
    return { ...summary(g, (v?.manifest as any) ?? {}, 0, 0), manifest: v?.manifest ?? null, openLobbies: open.map((o) => ({ ...o, n: Number(o.n) })), leaderboard: await leaderboard(req.db, id, 10) };
  });

  app.get("/games/:id/leaderboard", async (req) => leaderboard(req.db, (req.params as any).id, 100));
};

export function summary(g: typeof games.$inferSelect, m: any, plays24h: number, playersOnline: number): GameSummary {
  return {
    id: g.id, name: g.name, tagline: g.tagline ?? m.tagline ?? null, description: g.description || m.description || "", category: g.category, tags: g.tags, developer: g.developerName,
    coverUrl: g.coverUrl ?? (g.liveVersion && m.cover ? `${env.PUBLIC_GAMES_URL}/g/${g.id}/${g.liveVersion}/${m.cover}` : null), liveVersion: g.liveVersion,
    formats: (m.formats ?? []).map((f: any) => ({ format: f.format, minPlayers: f.minPlayers, maxPlayers: f.maxPlayers, entryTiersCents: f.entryTiersCents, rakeBps: f.rakeBps ?? 1000 })),
    stats: { plays24h, playersOnline, rating: g.rating }, featured: g.featured, isNew: Date.now() - g.createdAt.getTime() < 14 * 86400_000, status: g.status as any, createdAt: g.createdAt.toISOString(),
  };
}
