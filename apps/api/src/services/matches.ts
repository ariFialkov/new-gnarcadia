import { and, eq, sql, desc, lt, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { games, gameVersions, matches, matchPlayers, users } from "../db/schema.js";
import { uuid, seed as makeSeed } from "../lib/ids.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { signMatchTicket } from "../lib/auth.js";
import * as L from "./ledger.js";
import { env } from "../env.js";
import { getEquippedCosmetics } from "./market.js";
import {
  GameManifestSchema, computeRake, splitPrizePool, defaultPayoutTable,
  type FormatConfig, type GameManifest, type MatchResult, type JoinMatchResponse, type Currency,
} from "@gnarcadia/protocol";

const REALTIME_FORMATS = new Set(["duel", "ffa", "teams", "perpetual"]);
type UserRow = typeof users.$inferSelect;
type MatchRow = typeof matches.$inferSelect;

export async function liveManifest(db: Db, gameId: string): Promise<{ manifest: GameManifest; version: string; game: typeof games.$inferSelect }> {
  const g = (await db.select().from(games).where(eq(games.id, gameId)))[0];
  if (!g || !g.liveVersion) throw notFound("game_not_live");
  const v = (await db.select().from(gameVersions).where(and(eq(gameVersions.gameId, gameId), eq(gameVersions.version, g.liveVersion))))[0];
  if (!v) throw notFound("version_missing");
  return { manifest: GameManifestSchema.parse(v.manifest), version: v.version, game: g };
}

export function gameUrl(gameId: string, version: string, entry = "index.html") {
  return `${env.PUBLIC_API_URL}/g/${gameId}/${version}/${entry}`;
}

/**
 * Join (or create) a match. Money: entry moves user cash -> match escrow in the same request, so a
 * player can never be in a match without the stake being locked.
 */
export async function joinMatch(db: Db, user: UserRow, input: { gameId: string; format: string; entryCents: number; practice?: boolean; team?: number; region: string | null }): Promise<JoinMatchResponse> {
  const { manifest, version, game } = await liveManifest(db, input.gameId);
  if (game.status !== "live") throw badRequest("game_not_live");
  const fmt = manifest.formats.find((f) => f.format === input.format);
  if (!fmt) throw badRequest("format_unsupported");
  const practice = !!input.practice || input.entryCents === 0;
  if (!practice && !fmt.entryTiersCents.includes(input.entryCents)) throw badRequest("invalid_entry_tier", undefined, { allowed: fmt.entryTiersCents });
  const entryCents = practice ? 0 : input.entryCents;
  const currency = user.currency as Currency;
  const country = user.country ?? (currency === "CAD" ? "CA" : "US");

  // Reject double-entry into another live match of the same game/format (prevents self-collusion & escrow pile-ups).
  const active = await db.select({ id: matchPlayers.matchId }).from(matchPlayers).innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(eq(matchPlayers.userId, user.id), eq(matches.gameId, input.gameId), eq(matches.format, input.format), inArray(matches.status, ["open", "running"]), inArray(matchPlayers.status, ["joined"])));
  if (active[0]) {
    const existing = await getMatch(db, active[0].id);
    return buildJoinResponse(db, user, existing, manifest, fmt, (await playerRow(db, existing.id, user.id))!.playerId);
  }

  const match = await db.transaction(async (tx) => {
    // Perpetual lobbies and async brackets stay joinable after they start (until full / window closes).
    const joinableStatuses = fmt.format === "perpetual" || fmt.format === "async_score" ? ["open", "running"] : ["open"];
    const open = await tx.select().from(matches)
      .where(and(eq(matches.gameId, input.gameId), eq(matches.format, input.format), inArray(matches.status, joinableStatuses), eq(matches.country, country), eq(matches.entryCents, entryCents), eq(matches.practice, practice), eq(matches.gameVersion, version)))
      .orderBy(matches.createdAt).limit(5);
    for (const m of open) {
      if (fmt.format === "async_score" && Date.now() > m.createdAt.getTime() + fmt.maxDurationSec * 1000) continue; // bracket window closed
      const count = await tx.select({ n: sql<number>`count(*)` }).from(matchPlayers).where(and(eq(matchPlayers.matchId, m.id), inArray(matchPlayers.status, ["joined", "finished"])));
      if (Number(count[0].n) < m.maxPlayers) return m;
    }
    const id = uuid();
    const row: typeof matches.$inferInsert = { id, gameId: input.gameId, gameVersion: version, format: input.format, country, currency, entryCents, rakeBps: fmt.rakeBps, seed: makeSeed(), status: "open", practice, roomId: id, maxPlayers: fmt.maxPlayers, config: fmt as any };
    await tx.insert(matches).values(row);
    return (await tx.select().from(matches).where(eq(matches.id, id)))[0];
  });

  const playerId = "p_" + uuid().slice(0, 8);
  let entryTxnId: string | null = null;
  if (!practice) {
    const r = await L.post(db, { idempotencyKey: `entry:${match.id}:${user.id}`, kind: "match_entry", currency, userId: user.id, ref: match.id, meta: { gameId: input.gameId, format: input.format }, postings: L.transfer(L.userCash(user.id), L.matchEscrow(match.id), entryCents) });
    entryTxnId = r.txn.id;
  }
  const deadline = fmt.format === "async_score" ? new Date(Date.now() + (fmt.roundTimeLimitSec ?? 300) * 1000) : null;
  try {
    await db.insert(matchPlayers).values({ id: uuid(), matchId: match.id, userId: user.id, playerId, team: input.team ?? null, entryTxnId, status: "joined", deadlineAt: deadline, region: input.region });
  } catch (e) {
    if (entryTxnId) await L.post(db, { idempotencyKey: `entry-rollback:${match.id}:${user.id}`, kind: "match_refund", currency, userId: user.id, ref: match.id, postings: L.transfer(L.matchEscrow(match.id), L.userCash(user.id), entryCents) });
    throw conflict("already_in_match");
  }
  if (fmt.format === "async_score") {
    // async brackets are "running" from first entry; they settle in the janitor.
    await db.update(matches).set({ status: "running", startedAt: match.startedAt ?? new Date() }).where(and(eq(matches.id, match.id), eq(matches.status, "open")));
  }
  return buildJoinResponse(db, user, match, manifest, fmt, playerId);
}

async function buildJoinResponse(db: Db, user: UserRow, match: MatchRow, manifest: GameManifest, fmt: FormatConfig, playerId: string): Promise<JoinMatchResponse> {
  const base: JoinMatchResponse = {
    matchId: match.id, playerId, format: match.format, seed: match.seed, entryCents: match.entryCents, rakeBps: match.rakeBps, currency: match.currency as Currency, practice: match.practice,
    gameUrl: gameUrl(match.gameId, match.gameVersion, manifest.entry), timeLimitSec: fmt.format === "async_score" ? (fmt.roundTimeLimitSec ?? 300) : fmt.maxDurationSec, maxPlayers: match.maxPlayers,
  };
  if (REALTIME_FORMATS.has(match.format)) {
    const mp = await playerRow(db, match.id, user.id);
    const ticket = await signMatchTicket({ sub: user.id, mid: match.id, pid: playerId, gid: match.gameId, gv: match.gameVersion, rid: match.roomId, fmt: match.format, name: user.username, team: mp?.team ?? undefined, cos: await getEquippedCosmetics(db, user.id, match.gameId), cur: match.currency, entry: match.entryCents, practice: match.practice });
    base.realtime = { url: env.PUBLIC_REALTIME_URL, roomId: match.roomId, ticket };
  }
  return base;
}

export async function getMatch(db: Db, id: string) {
  const m = (await db.select().from(matches).where(eq(matches.id, id)))[0];
  if (!m) throw notFound("match_not_found");
  return m;
}
export async function playerRow(db: Db, matchId: string, userId: string) {
  return (await db.select().from(matchPlayers).where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId))))[0] ?? null;
}
export async function matchRoster(db: Db, matchId: string) {
  return db.select({ playerId: matchPlayers.playerId, userId: matchPlayers.userId, team: matchPlayers.team, status: matchPlayers.status, username: users.username, region: matchPlayers.region, rank: matchPlayers.rank, score: matchPlayers.score, payoutCents: matchPlayers.payoutCents })
    .from(matchPlayers).innerJoin(users, eq(users.id, matchPlayers.userId)).where(eq(matchPlayers.matchId, matchId));
}

/** async_score: record a submission. */
export async function submitScore(db: Db, user: UserRow, matchId: string, input: { score: number; durationMs: number; inputLogHash?: string; inputLog?: unknown[] }) {
  const m = await getMatch(db, matchId);
  if (m.format !== "async_score") throw badRequest("not_async_format");
  const mp = await playerRow(db, matchId, user.id);
  if (!mp) throw notFound("not_in_match");
  if (mp.status === "finished") throw conflict("already_submitted");
  if (mp.deadlineAt && Date.now() > mp.deadlineAt.getTime() + 15_000) throw conflict("deadline_passed");
  const cfg = m.config as unknown as FormatConfig;
  if (input.durationMs > (cfg.roundTimeLimitSec ?? 300) * 1000 + 15_000) throw badRequest("duration_exceeds_limit");
  await db.update(matchPlayers).set({ status: "finished", score: input.score, submittedAt: new Date(), inputLogHash: input.inputLogHash ?? null, inputLog: input.inputLog ? (input.inputLog.slice(0, 5000) as any) : null }).where(eq(matchPlayers.id, mp.id));
  await maybeSettleAsync(db, m.id);
  return { ok: true };
}

/** Called by the janitor and after each submission. */
export async function maybeSettleAsync(db: Db, matchId: string) {
  const m = await getMatch(db, matchId);
  if (m.format !== "async_score" || m.status === "settled" || m.status === "cancelled") return;
  const cfg = m.config as unknown as FormatConfig;
  const roster = await db.select().from(matchPlayers).where(and(eq(matchPlayers.matchId, matchId), inArray(matchPlayers.status, ["joined", "finished"])));
  const now = Date.now();
  const full = roster.length >= m.maxPlayers;
  const windowClosed = now > m.createdAt.getTime() + cfg.maxDurationSec * 1000;
  const allDone = roster.every((p) => p.status === "finished" || (p.deadlineAt && now > p.deadlineAt.getTime()));
  if (!allDone) return;
  if (!full && !windowClosed) return;
  if (roster.length < cfg.minPlayers) {
    if (windowClosed) await cancelMatch(db, matchId, "not_enough_players");
    return;
  }
  const results: MatchResult[] = roster.map((p) => ({ playerId: p.playerId, userId: p.userId, rank: 0, score: p.status === "finished" ? (p.score ?? 0) : Number.NEGATIVE_INFINITY, disconnected: p.status !== "finished" }))
    .sort((a, b) => b.score - a.score);
  let rank = 0, prev = Number.NaN;
  results.forEach((r, i) => { if (r.score !== prev) { rank = i + 1; prev = r.score; } r.rank = rank; });
  await settleMatch(db, matchId, results);
}

/**
 * Settle: escrow -> winners + revenue, in a single idempotent ledger transaction.
 * Pure function `computePayouts` is unit-tested separately.
 */
export function computePayouts(format: string, cfg: FormatConfig, entryCents: number, rakeBps: number, entrants: { playerId: string; team: number | null }[], results: MatchResult[]) {
  const gross = entryCents * entrants.length;
  const payouts = new Map<string, number>();
  if (gross === 0) return { gross, rake: 0, payouts };
  if (format === "perpetual") {
    let sum = 0; for (const r of results) { const c = Math.max(0, Math.floor(r.cashOutCents ?? 0)); payouts.set(r.playerId, c); sum += c; }
    if (sum > gross) { // never pay out more than escrow; scale down proportionally and flag
      const k = gross / sum; let acc = 0;
      for (const [pid, c] of payouts) { const v = Math.floor(c * k); payouts.set(pid, v); acc += v; }
      return { gross, rake: gross - acc, payouts, flagged: "cashout_exceeded_escrow" as const };
    }
    return { gross, rake: gross - sum, payouts };
  }
  const rake = computeRake(gross, rakeBps);
  const net = gross - rake;
  if (format === "teams") {
    const winTeam = results.find((r) => r.rank === 1)?.team;
    const winners = entrants.filter((e) => e.team === winTeam).map((e) => e.playerId);
    if (winners.length === 0) return { gross, rake: gross, payouts, flagged: "no_winning_team" as const };
    const shares = splitPrizePool(net, winners.map(() => Math.floor(10_000 / winners.length)));
    winners.forEach((pid, i) => payouts.set(pid, shares[i]));
    return { gross, rake, payouts };
  }
  // duel / ffa / async_score: payout table by rank with tie splitting.
  const table = cfg.payoutBps ?? defaultPayoutTable(entrants.length);
  const slots = splitPrizePool(net, table);
  const ranked = [...results].filter((r) => entrants.some((e) => e.playerId === r.playerId)).sort((a, b) => a.rank - b.rank);
  let i = 0;
  while (i < ranked.length) {
    let j = i; while (j + 1 < ranked.length && ranked[j + 1].rank === ranked[i].rank) j++;
    const group = ranked.slice(i, j + 1);
    const pot = slots.slice(i, j + 1).reduce((a, b) => a + b, 0);
    if (pot > 0) {
      const each = Math.floor(pot / group.length); let rem = pot - each * group.length;
      for (const r of [...group].sort((a, b) => a.playerId.localeCompare(b.playerId))) { payouts.set(r.playerId, each + (rem > 0 ? 1 : 0)); if (rem > 0) rem--; }
    }
    i = j + 1;
  }
  const paid = [...payouts.values()].reduce((a, b) => a + b, 0);
  return { gross, rake: gross - paid, payouts };
}

export async function settleMatch(db: Db, matchId: string, results: MatchResult[]) {
  const m = await getMatch(db, matchId);
  if (m.status === "settled") return m.settlement;
  if (m.status === "cancelled") throw conflict("match_cancelled");
  const cfg = m.config as unknown as FormatConfig;
  const roster = await db.select().from(matchPlayers).where(and(eq(matchPlayers.matchId, matchId), inArray(matchPlayers.status, ["joined", "finished", "left"])));
  const entrants = roster.filter((p) => p.status !== "refunded").map((p) => ({ playerId: p.playerId, team: p.team, userId: p.userId }));
  if (m.format === "perpetual") {
    // Players were paid individually via cashOut(); whatever is left in escrow is forfeited bounty = platform revenue.
    const remaining = await L.getBalance(db, L.matchEscrow(matchId), m.currency as Currency);
    if (remaining > 0) await L.post(db, { idempotencyKey: `settle:${matchId}`, kind: "match_rake", currency: m.currency as Currency, ref: matchId, meta: { perpetual: true }, postings: L.transfer(L.matchEscrow(matchId), L.platform("revenue"), remaining) });
    for (const p of roster) if (p.status !== "finished") await db.update(matchPlayers).set({ status: "finished", payoutCents: p.payoutCents ?? 0 }).where(eq(matchPlayers.id, p.id));
    const paid = roster.reduce((a, p) => a + (p.payoutCents ?? 0), 0);
    const settlement = { grossPoolCents: paid + remaining, rakeCents: remaining, payouts: roster.filter((p) => (p.payoutCents ?? 0) > 0).map((p) => ({ playerId: p.playerId, cents: p.payoutCents! })), results, flagged: null, settledAt: new Date().toISOString() };
    await db.update(matches).set({ status: "settled", settledAt: new Date(), settlement }).where(eq(matches.id, matchId));
    return settlement;
  }
  const { gross, rake, payouts, flagged } = computePayouts(m.format, cfg, m.entryCents, m.rakeBps, entrants, results) as any;
  const postings: L.Posting[] = [];
  if (gross > 0) {
    postings.push({ account: L.matchEscrow(matchId), deltaCents: -gross });
    for (const e of entrants) { const c = payouts.get(e.playerId) ?? 0; if (c > 0) postings.push({ account: L.userCash(e.userId), deltaCents: c }); }
    if (rake > 0) postings.push({ account: L.platform("revenue"), deltaCents: rake });
    await L.post(db, { idempotencyKey: `settle:${matchId}`, kind: "match_payout", currency: m.currency as Currency, ref: matchId, meta: { gross, rake, flagged: flagged ?? null }, postings });
  }
  for (const p of roster) {
    const r = results.find((x) => x.playerId === p.playerId);
    await db.update(matchPlayers).set({ status: "finished", rank: r?.rank ?? null, score: Number.isFinite(r?.score) ? r!.score : null, payoutCents: payouts.get(p.playerId) ?? 0 }).where(eq(matchPlayers.id, p.id));
  }
  const settlement = { grossPoolCents: gross, rakeCents: rake, payouts: [...payouts.entries()].map(([playerId, cents]) => ({ playerId, cents })), results, flagged: flagged ?? null, settledAt: new Date().toISOString() };
  await db.update(matches).set({ status: "settled", settledAt: new Date(), settlement }).where(eq(matches.id, matchId));
  if (flagged) await db.update(users).set({ flags: sql`${users.flags} || '["review_settlement"]'::jsonb` }).where(inArray(users.id, entrants.map((e) => e.userId)));
  return settlement;
}

export async function cancelMatch(db: Db, matchId: string, reason: string) {
  const m = await getMatch(db, matchId);
  if (m.status === "settled" || m.status === "cancelled") return;
  const roster = await db.select().from(matchPlayers).where(and(eq(matchPlayers.matchId, matchId), inArray(matchPlayers.status, ["joined", "finished", "left"])));
  if (m.entryCents > 0) {
    const postings: L.Posting[] = [{ account: L.matchEscrow(matchId), deltaCents: -m.entryCents * roster.length }];
    for (const p of roster) postings.push({ account: L.userCash(p.userId), deltaCents: m.entryCents });
    if (roster.length) await L.post(db, { idempotencyKey: `cancel:${matchId}`, kind: "match_refund", currency: m.currency as Currency, ref: matchId, meta: { reason }, postings });
  }
  await db.update(matchPlayers).set({ status: "refunded" }).where(eq(matchPlayers.matchId, matchId));
  await db.update(matches).set({ status: "cancelled", settlement: { reason, cancelledAt: new Date().toISOString() } }).where(eq(matches.id, matchId));
}

/** A player leaves before the match starts: refund them only. After start it is a forfeit (handled by results). */
export async function leaveBeforeStart(db: Db, matchId: string, playerId: string) {
  const m = await getMatch(db, matchId);
  const mp = (await db.select().from(matchPlayers).where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.playerId, playerId))))[0];
  if (!mp || mp.status !== "joined") return;
  if (m.status !== "open") { await db.update(matchPlayers).set({ status: "left" }).where(eq(matchPlayers.id, mp.id)); return; }
  if (m.entryCents > 0) await L.post(db, { idempotencyKey: `leave:${matchId}:${mp.userId}`, kind: "match_refund", currency: m.currency as Currency, userId: mp.userId, ref: matchId, postings: L.transfer(L.matchEscrow(matchId), L.userCash(mp.userId), m.entryCents) });
  await db.update(matchPlayers).set({ status: "refunded" }).where(eq(matchPlayers.id, mp.id));
}

/** Perpetual lobbies: pay a player out of escrow the moment they cash out / are eliminated. Idempotent per player. */
export async function cashOut(db: Db, matchId: string, playerId: string, cents: number) {
  const m = await getMatch(db, matchId);
  const mp = (await db.select().from(matchPlayers).where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.playerId, playerId))))[0];
  if (!mp) throw notFound("player_not_in_match");
  if (mp.status === "finished") return { ok: true, replayed: true };
  const amount = Math.max(0, Math.floor(cents));
  if (m.entryCents > 0 && amount > 0) {
    const escrow = await L.getBalance(db, L.matchEscrow(matchId), m.currency as Currency);
    if (amount > escrow) throw conflict("cashout_exceeds_escrow");
    await L.post(db, { idempotencyKey: `cashout:${matchId}:${playerId}`, kind: "match_payout", currency: m.currency as Currency, userId: mp.userId, ref: matchId, meta: { perpetual: true }, postings: L.transfer(L.matchEscrow(matchId), L.userCash(mp.userId), amount) });
  }
  await db.update(matchPlayers).set({ status: "finished", payoutCents: amount, score: amount }).where(eq(matchPlayers.id, mp.id));
  return { ok: true };
}

export async function markStarted(db: Db, matchId: string) {
  await db.update(matches).set({ status: "running", startedAt: new Date() }).where(and(eq(matches.id, matchId), eq(matches.status, "open")));
}

/** Janitor: cancel stale open realtime matches, settle/cancel async brackets. */
export async function sweep(db: Db) {
  const staleRealtime = await db.select({ id: matches.id }).from(matches).where(and(eq(matches.status, "open"), lt(matches.createdAt, new Date(Date.now() - 10 * 60_000)), sql`${matches.format} <> 'async_score'`));
  for (const m of staleRealtime) await cancelMatch(db, m.id, "no_start_timeout");
  const asyncOpen = await db.select({ id: matches.id }).from(matches).where(and(inArray(matches.status, ["open", "running"]), eq(matches.format, "async_score")));
  for (const m of asyncOpen) await maybeSettleAsync(db, m.id).catch((e) => console.error("async settle failed", m.id, e));
  // Running realtime matches that never settled (server crash) — refund after 2h.
  const zombie = await db.select({ id: matches.id }).from(matches).where(and(eq(matches.status, "running"), sql`${matches.format} <> 'async_score'`, lt(matches.startedAt, new Date(Date.now() - 2 * 3600_000))));
  for (const m of zombie) await cancelMatch(db, m.id, "zombie_timeout");
}

export async function userMatchHistory(db: Db, userId: string, limit = 30) {
  return db.select({ matchId: matches.id, gameId: matches.gameId, gameName: games.name, format: matches.format, entryCents: matches.entryCents, currency: matches.currency, status: matches.status, rank: matchPlayers.rank, score: matchPlayers.score, payoutCents: matchPlayers.payoutCents, joinedAt: matchPlayers.joinedAt, practice: matches.practice })
    .from(matchPlayers).innerJoin(matches, eq(matches.id, matchPlayers.matchId)).innerJoin(games, eq(games.id, matches.gameId)).where(eq(matchPlayers.userId, userId)).orderBy(desc(matchPlayers.joinedAt)).limit(limit);
}

export async function leaderboard(db: Db, gameId: string, limit = 50) {
  return db.select({ userId: users.id, username: users.username, avatarUrl: users.avatarUrl, wins: sql<number>`sum(case when ${matchPlayers.rank} = 1 then 1 else 0 end)`, played: sql<number>`count(*)`, netCents: sql<number>`coalesce(sum(${matchPlayers.payoutCents}),0) - sum(${matches.entryCents})`, bestScore: sql<number>`max(${matchPlayers.score})` })
    .from(matchPlayers).innerJoin(matches, eq(matches.id, matchPlayers.matchId)).innerJoin(users, eq(users.id, matchPlayers.userId))
    .where(and(eq(matches.gameId, gameId), eq(matches.status, "settled"), eq(matches.practice, false)))
    .groupBy(users.id, users.username, users.avatarUrl).orderBy(sql`3 desc, 5 desc`).limit(limit);
}
