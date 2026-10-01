import { and, eq, lte, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { paymentIntents, users } from "../db/schema.js";
import { uuid } from "../lib/ids.js";
import { badRequest, conflict, notFound, forbidden } from "../lib/errors.js";
import * as L from "./ledger.js";
import { depositsLast24h, requireCashEligible } from "./gates.js";
import { makePaymentProvider, type DepositMethod, type PayoutMethod } from "../providers/payments/index.js";
import { env } from "../env.js";
import { getJurisdiction, type Currency } from "@gnarcadia/protocol";

export const payments = makePaymentProvider();
type UserRow = typeof users.$inferSelect;

export const QUICK_AMOUNTS_CENTS = [1000, 2000, 5000, 10000, 20000];
const MIN_DEPOSIT = 500, MAX_DEPOSIT = 100_000, MIN_WITHDRAW = 1000;

export async function createDeposit(db: Db, user: UserRow, input: { amountCents: number; method: DepositMethod }) {
  await requireCashEligible(db, user, { requireKycTier: 1 });
  if (!Number.isInteger(input.amountCents) || input.amountCents < MIN_DEPOSIT || input.amountCents > MAX_DEPOSIT) throw badRequest("invalid_amount", `Deposit must be between ${MIN_DEPOSIT / 100} and ${MAX_DEPOSIT / 100}`);
  const country = (user.country ?? "CA") as "CA" | "US";
  if (!payments.methods(country).deposit.includes(input.method)) throw badRequest("method_unavailable");
  const used = await depositsLast24h(db, user.id);
  const j = getJurisdiction(user.region);
  const cap = Math.min(user.dailyDepositCapCents, j?.defaultDailyDepositCapCents ?? Infinity);
  if (used + input.amountCents > cap) throw forbidden("deposit_limit", `This deposit would exceed your daily limit of ${(cap / 100).toFixed(0)}.`, { capCents: cap, usedCents: used });
  const id = uuid();
  await db.insert(paymentIntents).values({ id, userId: user.id, provider: payments.name, direction: "deposit", method: input.method, amountCents: input.amountCents, currency: user.currency, status: "pending" });
  const res = await payments.createDeposit({ intentId: id, userId: user.id, email: user.email, amountCents: input.amountCents, currency: user.currency as Currency, method: input.method, country, returnUrl: `${env.PUBLIC_ARCADE_URL}/wallet/return?intent=${id}`, webhookUrl: `${env.PUBLIC_API_URL}/payments/webhook/${payments.name}` });
  await db.update(paymentIntents).set({ providerRef: res.providerRef, feeCents: res.feeCents ?? 0, updatedAt: new Date() }).where(eq(paymentIntents.id, id));
  if (res.status === "succeeded") await completeDeposit(db, id);
  if (res.status === "failed") await db.update(paymentIntents).set({ status: "failed", updatedAt: new Date() }).where(eq(paymentIntents.id, id));
  return { intentId: id, status: res.status, redirectUrl: res.redirectUrl };
}

/** Credit the wallet once the processor confirms funds. Idempotent. */
export async function completeDeposit(db: Db, intentId: string) {
  const pi = (await db.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)))[0];
  if (!pi) throw notFound("intent_not_found");
  if (pi.status === "succeeded") return pi;
  await L.post(db, { idempotencyKey: `deposit:${pi.id}`, kind: "deposit", currency: pi.currency as Currency, userId: pi.userId, ref: pi.id, meta: { method: pi.method, provider: pi.provider }, postings: L.transfer(L.platform("clearing"), L.userCash(pi.userId), pi.amountCents) });
  await db.update(paymentIntents).set({ status: "succeeded", updatedAt: new Date() }).where(eq(paymentIntents.id, pi.id));
  return pi;
}

/** Chargeback / return: pull funds back out; the account can go into review if the balance is insufficient. */
export async function reverseDeposit(db: Db, intentId: string) {
  const pi = (await db.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)))[0];
  if (!pi || pi.status !== "succeeded") return;
  try {
    await L.post(db, { idempotencyKey: `deposit-reversal:${pi.id}`, kind: "deposit_reversal", currency: pi.currency as Currency, userId: pi.userId, ref: pi.id, postings: L.transfer(L.userCash(pi.userId), L.platform("clearing"), pi.amountCents) });
  } catch {
    await db.update(users).set({ flags: ["frozen", "chargeback"] }).where(eq(users.id, pi.userId));
  }
  await db.update(paymentIntents).set({ status: "reversed", updatedAt: new Date() }).where(eq(paymentIntents.id, pi.id));
}

export async function createWithdrawal(db: Db, user: UserRow, input: { amountCents: number; method: PayoutMethod; destination: Record<string, string> }) {
  await requireCashEligible(db, user, { requireKycTier: 1 });
  if (!Number.isInteger(input.amountCents) || input.amountCents < MIN_WITHDRAW) throw badRequest("invalid_amount", `Minimum withdrawal is ${MIN_WITHDRAW / 100}`);
  const country = (user.country ?? "CA") as "CA" | "US";
  if (!payments.methods(country).payout.includes(input.method)) throw badRequest("method_unavailable");
  // Tax-ID gate: US winners past the 1099 threshold must have a W-9 on file before further payouts.
  const j = getJurisdiction(user.region);
  if (j && Number.isFinite(j.taxIdThresholdCents)) {
    const winnings = await yearToDateWinnings(db, user.id);
    if (winnings >= j.taxIdThresholdCents && !user.taxIdCollected) throw forbidden("tax_id_required", "We need your tax information (W-9) before paying out further winnings.", { thresholdCents: j.taxIdThresholdCents });
  }
  if (user.kycTier < 2 && input.amountCents > 50_000) throw forbidden("kyc_required", "Withdrawals over 500 need enhanced verification.", { tier: 2 });
  const id = uuid();
  // Debit first (funds leave the wallet immediately and are held in clearing until the payout settles).
  await L.post(db, { idempotencyKey: `withdraw:${id}`, kind: "withdrawal", currency: user.currency as Currency, userId: user.id, ref: id, meta: { method: input.method }, postings: L.transfer(L.userCash(user.id), L.platform("clearing"), input.amountCents) });
  await db.insert(paymentIntents).values({ id, userId: user.id, provider: payments.name, direction: "withdrawal", method: input.method, amountCents: input.amountCents, currency: user.currency, status: "pending", meta: { destination: redact(input.destination) } });
  try {
    const res = await payments.createPayout({ intentId: id, userId: user.id, email: user.email, legalName: user.legalName, amountCents: input.amountCents, currency: user.currency as Currency, method: input.method, country, destination: input.destination, webhookUrl: `${env.PUBLIC_API_URL}/payments/webhook/${payments.name}` });
    await db.update(paymentIntents).set({ providerRef: res.providerRef, feeCents: res.feeCents ?? 0, status: res.status === "succeeded" ? "succeeded" : res.status === "failed" ? "failed" : "pending", updatedAt: new Date() }).where(eq(paymentIntents.id, id));
    if (res.status === "failed") await failWithdrawal(db, id);
    return { intentId: id, status: res.status };
  } catch (e) {
    await failWithdrawal(db, id); throw e;
  }
}

export async function failWithdrawal(db: Db, intentId: string) {
  const pi = (await db.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)))[0];
  if (!pi || pi.status === "failed") return;
  await L.post(db, { idempotencyKey: `withdraw-reversal:${pi.id}`, kind: "withdrawal_reversal", currency: pi.currency as Currency, userId: pi.userId, ref: pi.id, postings: L.transfer(L.platform("clearing"), L.userCash(pi.userId), pi.amountCents) });
  await db.update(paymentIntents).set({ status: "failed", updatedAt: new Date() }).where(eq(paymentIntents.id, pi.id));
}

export async function handleWebhook(db: Db, rawBody: string, headers: Record<string, any>) {
  const ev = await payments.parseWebhook(rawBody, headers);
  const pi = (await db.select().from(paymentIntents).where(and(eq(paymentIntents.provider, payments.name), eq(paymentIntents.providerRef, ev.providerRef))))[0];
  if (!pi) throw notFound("intent_for_ref_not_found");
  if (ev.kind === "deposit") {
    if (ev.status === "succeeded") await completeDeposit(db, pi.id);
    else if (ev.status === "failed") await db.update(paymentIntents).set({ status: "failed", updatedAt: new Date() }).where(eq(paymentIntents.id, pi.id));
    else if (ev.status === "reversed") await reverseDeposit(db, pi.id);
  } else {
    if (ev.status === "succeeded") await db.update(paymentIntents).set({ status: "succeeded", updatedAt: new Date() }).where(eq(paymentIntents.id, pi.id));
    else await failWithdrawal(db, pi.id);
  }
  return { ok: true };
}

export async function yearToDateWinnings(db: Db, userId: string): Promise<number> {
  const { matchPlayers, matches } = await import("../db/schema.js");
  const { sql, gte } = await import("drizzle-orm");
  const jan1 = new Date(new Date().getUTCFullYear(), 0, 1);
  const r = await db.select({ total: sql<number>`coalesce(sum(greatest(${matchPlayers.payoutCents} - ${matches.entryCents}, 0)), 0)` }).from(matchPlayers).innerJoin(matches, eq(matches.id, matchPlayers.matchId)).where(and(eq(matchPlayers.userId, userId), gte(matchPlayers.joinedAt, jan1)));
  return Number(r[0]?.total ?? 0);
}

/** Responsible gaming: lowering a limit applies now; raising applies after 24h. */
export async function setDepositLimit(db: Db, user: UserRow, capCents: number) {
  if (!Number.isInteger(capCents) || capCents < 0) throw badRequest("invalid_limit");
  const j = getJurisdiction(user.region);
  const max = j?.defaultDailyDepositCapCents ?? 50_000;
  if (capCents > max) throw badRequest("limit_above_max", undefined, { maxCents: max });
  if (capCents <= user.dailyDepositCapCents) { await db.update(users).set({ dailyDepositCapCents: capCents, pendingDepositCapCents: null, pendingDepositCapAt: null }).where(eq(users.id, user.id)); return { applied: true, capCents }; }
  const at = new Date(Date.now() + 24 * 3600_000);
  await db.update(users).set({ pendingDepositCapCents: capCents, pendingDepositCapAt: at }).where(eq(users.id, user.id));
  return { applied: false, capCents, appliesAt: at.toISOString() };
}
export async function applyPendingLimitChanges(db: Db) {
  const due = await db.select().from(users).where(and(isNotNull(users.pendingDepositCapAt), lte(users.pendingDepositCapAt, new Date())));
  for (const u of due) await db.update(users).set({ dailyDepositCapCents: u.pendingDepositCapCents!, pendingDepositCapCents: null, pendingDepositCapAt: null }).where(eq(users.id, u.id));
}
export async function selfExclude(db: Db, user: UserRow, days: number) {
  if (![1, 7, 30, 90, 180, 365].includes(days)) throw badRequest("invalid_duration");
  const until = new Date(Date.now() + days * 86400_000);
  await db.update(users).set({ selfExcludedUntil: until }).where(eq(users.id, user.id));
  return { until: until.toISOString() };
}
export async function coolDown(db: Db, user: UserRow, hours: number) {
  if (![1, 6, 24, 72].includes(hours)) throw badRequest("invalid_duration");
  const until = new Date(Date.now() + hours * 3600_000);
  await db.update(users).set({ cooldownUntil: until }).where(eq(users.id, user.id));
  return { until: until.toISOString() };
}

function redact(d: Record<string, string>) { const o: Record<string, string> = {}; for (const [k, v] of Object.entries(d)) o[k] = v.length > 4 ? "••••" + v.slice(-4) : v; return o; }
export { conflict };
