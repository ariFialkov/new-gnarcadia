import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { JURISDICTIONS, type AnalyticsOverview } from "@gnarcadia/protocol";

const n = (v: unknown) => Number(v ?? 0);
const q = async (db: Db, s: ReturnType<typeof sql>) => ((await db.execute(s)) as any).rows as any[];

/** Admin analytics. Plain SQL so it runs identically on PGlite and Postgres. */
export async function overview(db: Db, days = 30): Promise<AnalyticsOverview> {
  const [u] = await q(db, sql`SELECT count(*) total,
      count(*) FILTER (WHERE created_at > now() - interval '7 days') new7d,
      count(*) FILTER (WHERE last_seen_at > now() - interval '1 day') dau,
      count(*) FILTER (WHERE last_seen_at > now() - interval '7 days') wau,
      count(*) FILTER (WHERE last_seen_at > now() - interval '30 days') mau,
      count(*) FILTER (WHERE kyc_status = 'approved') kyc FROM users`);
  const money = await q(db, sql`SELECT currency,
      coalesce(sum(amount_cents) FILTER (WHERE direction='deposit' AND status='succeeded'),0) deposits,
      coalesce(sum(amount_cents) FILTER (WHERE direction='withdrawal' AND status IN ('pending','succeeded')),0) withdrawals
      FROM payment_intents GROUP BY currency`);
  const rev = await q(db, sql`SELECT t.currency, t.kind, coalesce(sum(le.delta_cents),0) cents FROM ledger_entries le
      JOIN accounts a ON a.id = le.account_id JOIN transactions t ON t.id = le.txn_id
      WHERE a.owner_type='platform' AND a.key='revenue' GROUP BY t.currency, t.kind`);
  const floatRows = await q(db, sql`SELECT currency, coalesce(sum(balance_cents),0) cents FROM accounts WHERE (owner_type='user' AND key='cash') OR owner_type='match' GROUP BY currency`);
  const [m] = await q(db, sql`SELECT count(*) total, count(*) FILTER (WHERE created_at > now() - interval '1 day') last24h, coalesce(avg(entry_cents) FILTER (WHERE practice = false),0) avg_entry FROM matches`);
  const byFormat = await q(db, sql`SELECT format, count(*) c FROM matches GROUP BY format`);
  const regions = await q(db, sql`SELECT u.region code, count(*) users, count(*) FILTER (WHERE u.last_seen_at > now() - interval '1 day') dau,
      coalesce((SELECT sum(amount_cents) FROM payment_intents p WHERE p.user_id = ANY(array_agg(u.id)) AND p.direction='deposit' AND p.status='succeeded'),0) deposits,
      coalesce((SELECT sum(mp.payout_cents) FROM match_players mp WHERE mp.user_id = ANY(array_agg(u.id))),0) payouts,
      coalesce((SELECT sum(mt.entry_cents) FROM match_players mp JOIN matches mt ON mt.id = mp.match_id WHERE mp.user_id = ANY(array_agg(u.id)) AND mt.status='settled'),0) entries
      FROM users u WHERE u.region IS NOT NULL GROUP BY u.region`);
  const [f] = await q(db, sql`SELECT count(*) signups,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM geo_checks g WHERE g.user_id=u.id AND g.ok)) geo,
      count(*) FILTER (WHERE kyc_status='approved') kyc,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM payment_intents p WHERE p.user_id=u.id AND p.direction='deposit' AND p.status='succeeded')) deposited,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM match_players mp JOIN matches mt ON mt.id=mp.match_id WHERE mp.user_id=u.id AND mt.practice=false)) played,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM payment_intents p WHERE p.user_id=u.id AND p.direction='withdrawal')) withdrew FROM users u`);
  const ts = await q(db, sql`WITH d AS (SELECT generate_series((now() - make_interval(days => cast(${days} as int)))::date, now()::date, '1 day')::date AS dt)
      SELECT d.dt::text AS dt,
        (SELECT count(*) FROM users WHERE created_at::date = d.dt) signups,
        (SELECT count(*) FROM matches WHERE created_at::date = d.dt) matches,
        (SELECT coalesce(sum(le.delta_cents),0) FROM ledger_entries le JOIN accounts a ON a.id=le.account_id JOIN transactions t ON t.id=le.txn_id WHERE a.owner_type='platform' AND a.key='revenue' AND t.kind='match_payout' AND le.created_at::date = d.dt) rake,
        (SELECT coalesce(sum(amount_cents),0) FROM payment_intents WHERE direction='deposit' AND status='succeeded' AND created_at::date = d.dt) deposits
      FROM d ORDER BY d.dt`);
  const currencies = ["CAD", "USD"] as const;
  return {
    users: { total: n(u.total), new7d: n(u.new7d), dau: n(u.dau), wau: n(u.wau), mau: n(u.mau), kycApproved: n(u.kyc) },
    money: currencies.map((c) => ({ currency: c, depositsCents: n(money.find((r) => r.currency === c)?.deposits), withdrawalsCents: n(money.find((r) => r.currency === c)?.withdrawals), rakeCents: n(rev.find((r) => r.currency === c && r.kind === "match_payout")?.cents), marketplaceCents: n(rev.find((r) => r.currency === c && r.kind === "marketplace_purchase")?.cents), floatCents: n(floatRows.find((r) => r.currency === c)?.cents) })),
    matches: { total: n(m.total), last24h: n(m.last24h), avgEntryCents: Math.round(n(m.avg_entry)), byFormat: Object.fromEntries(byFormat.map((r) => [r.format, n(r.c)])) },
    regions: regions.map((r) => ({ code: r.code, users: n(r.users), dau: n(r.dau), depositsCents: n(r.deposits), rakeCents: Math.max(0, n(r.entries) - n(r.payouts)), status: JURISDICTIONS[r.code]?.status ?? "blocked" })),
    funnel: { signups: n(f.signups), geoVerified: n(f.geo), kycApproved: n(f.kyc), deposited: n(f.deposited), played: n(f.played), withdrew: n(f.withdrew) },
    timeseries: ts.map((r) => ({ day: r.dt, signups: n(r.signups), matches: n(r.matches), rakeCents: n(r.rake), depositsCents: n(r.deposits) })),
  };
}

export async function regionDetail(db: Db, code: string) {
  const [u] = await q(db, sql`SELECT count(*) users, count(*) FILTER (WHERE last_seen_at > now() - interval '1 day') dau, count(*) FILTER (WHERE last_seen_at > now() - interval '7 days') wau,
      count(*) FILTER (WHERE kyc_status='approved') kyc, count(*) FILTER (WHERE created_at > now() - interval '7 days') new7d,
      round(avg(date_part('year', age(dob))))::int avg_age FROM users WHERE region = ${code}`);
  const games = await q(db, sql`SELECT g.id, g.name, count(*) plays, coalesce(sum(mt.entry_cents),0) volume FROM match_players mp JOIN matches mt ON mt.id=mp.match_id JOIN games g ON g.id=mt.game_id JOIN users us ON us.id=mp.user_id WHERE us.region=${code} GROUP BY g.id, g.name ORDER BY plays DESC LIMIT 8`);
  const [money] = await q(db, sql`SELECT coalesce(sum(p.amount_cents) FILTER (WHERE p.direction='deposit' AND p.status='succeeded'),0) deposits, coalesce(sum(p.amount_cents) FILTER (WHERE p.direction='withdrawal'),0) withdrawals FROM payment_intents p JOIN users us ON us.id=p.user_id WHERE us.region=${code}`);
  const geo = await q(db, sql`SELECT ok, count(*) c, count(*) FILTER (WHERE vpn) vpn FROM geo_checks WHERE ip_region=${code} OR gps_region=${code} OR region=${code} GROUP BY ok`);
  const hours = await q(db, sql`SELECT date_part('hour', mp.joined_at)::int h, count(*) c FROM match_players mp JOIN users us ON us.id=mp.user_id WHERE us.region=${code} GROUP BY 1 ORDER BY 1`);
  return { code, jurisdiction: JURISDICTIONS[code] ?? null, users: { total: n(u.users), dau: n(u.dau), wau: n(u.wau), kycApproved: n(u.kyc), new7d: n(u.new7d), avgAge: n(u.avg_age) }, money: { depositsCents: n(money.deposits), withdrawalsCents: n(money.withdrawals) }, topGames: games.map((g) => ({ id: g.id, name: g.name, plays: n(g.plays), volumeCents: n(g.volume) })), geo: { passed: n(geo.find((g) => g.ok)?.c), blocked: n(geo.find((g) => !g.ok)?.c), vpn: geo.reduce((a, g) => a + n(g.vpn), 0) }, activityByHour: Array.from({ length: 24 }, (_, h) => n(hours.find((r) => r.h === h)?.c)) };
}
