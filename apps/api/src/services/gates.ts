import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { geoChecks, users, paymentIntents } from "../db/schema.js";
import { env } from "../env.js";
import { forbidden } from "../lib/errors.js";
import { ageFromDob, getJurisdiction, isPlayableRegion } from "@gnarcadia/protocol";

export type UserRow = typeof users.$inferSelect;

/**
 * Eligibility gates. Every real-money action calls `requireCashEligible`; the order of checks is the
 * order the UI should resolve them in (terms -> geo -> age -> KYC -> responsible-gaming state).
 * Each failure carries a machine code the arcade maps to the right modal.
 */
export async function latestGeo(db: Db, userId: string) {
  const rows = await db.select().from(geoChecks).where(eq(geoChecks.userId, userId)).orderBy(desc(geoChecks.createdAt)).limit(1);
  return rows[0] ?? null;
}

export function geoIsFresh(check: { createdAt: Date } | null) {
  return !!check && Date.now() - check.createdAt.getTime() < env.GEO_CHECK_TTL_MIN * 60_000;
}

export interface GateResult { ok: boolean; code?: string; message?: string; details?: Record<string, unknown> }

export async function cashEligibility(db: Db, user: UserRow, opts: { requireKycTier?: number } = {}): Promise<GateResult> {
  if (user.termsVersion !== env.TERMS_VERSION) return { ok: false, code: "terms_required", message: "Please accept the current terms of service.", details: { version: env.TERMS_VERSION } };
  const geo = await latestGeo(db, user.id);
  if (!geo || !geoIsFresh(geo)) return { ok: false, code: "geo_required", message: "We need to verify your location before you can play for cash." };
  if (!geo.ok || !geo.region || !isPlayableRegion(geo.region)) return { ok: false, code: "geo_blocked", message: geo.reason ?? "Cash play isn't available in your location yet.", details: { region: geo.region } };
  const j = getJurisdiction(geo.region)!;
  if (ageFromDob(user.dob) < j.minAge) return { ok: false, code: "underage", message: `You must be ${j.minAge}+ to play for cash in ${j.name}.`, details: { minAge: j.minAge } };
  if (user.selfExcludedUntil && user.selfExcludedUntil.getTime() > Date.now()) return { ok: false, code: "self_excluded", message: "Your account is self-excluded from cash play.", details: { until: user.selfExcludedUntil.toISOString() } };
  if (user.cooldownUntil && user.cooldownUntil.getTime() > Date.now()) return { ok: false, code: "cooldown", message: "You're on a cooling-off break.", details: { until: user.cooldownUntil.toISOString() } };
  if (user.flags.includes("frozen")) return { ok: false, code: "account_frozen", message: "Your account is under review. Contact support." };
  const need = opts.requireKycTier ?? 1;
  if (user.kycTier < need) return { ok: false, code: "kyc_required", message: "Verify your identity to continue.", details: { tier: need, status: user.kycStatus } };
  return { ok: true };
}

export async function requireCashEligible(db: Db, user: UserRow, opts?: { requireKycTier?: number }) {
  const g = await cashEligibility(db, user, opts);
  if (!g.ok) throw forbidden(g.code!, g.message, g.details);
  return g;
}

/** Deposits in the trailing 24h (succeeded or pending). */
export async function depositsLast24h(db: Db, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000);
  const r = await db.select({ total: sql<number>`coalesce(sum(${paymentIntents.amountCents}), 0)` }).from(paymentIntents)
    .where(and(eq(paymentIntents.userId, userId), eq(paymentIntents.direction, "deposit"), gte(paymentIntents.createdAt, since), sql`${paymentIntents.status} in ('pending','succeeded')`));
  return Number(r[0]?.total ?? 0);
}
