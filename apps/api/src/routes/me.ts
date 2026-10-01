import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users, termsAcceptances, kycCases } from "../db/schema.js";
import * as L from "../services/ledger.js";
import { cashEligibility, latestGeo, geoIsFresh } from "../services/gates.js";
import { runGeoCheck } from "../services/geo.js";
import { setDepositLimit, selfExclude, coolDown } from "../services/wallet.js";
import { makeKycProvider } from "../providers/kyc/index.js";
import { userMatchHistory } from "../services/matches.js";
import { uuid } from "../lib/ids.js";
import { env } from "../env.js";
import { badRequest } from "../lib/errors.js";
import { JURISDICTIONS, type UserMe, type Currency } from "@gnarcadia/protocol";

const kyc = makeKycProvider();

export async function meView(db: Db, u: typeof users.$inferSelect): Promise<UserMe & { eligibility: { ok: boolean; code?: string; message?: string; details?: unknown } }> {
  const [cash, bonus, geo] = await Promise.all([L.getBalance(db, L.userCash(u.id), u.currency as Currency), L.getBalance(db, L.userBonus(u.id), u.currency as Currency), latestGeo(db, u.id)]);
  const eligibility = await cashEligibility(db, u);
  return {
    id: u.id, username: u.username, avatarUrl: u.avatarUrl, createdAt: u.createdAt.toISOString(), email: u.email, dob: u.dob, country: u.country as any, region: geo?.ok ? geo.region : u.region,
    currency: u.currency as Currency, kycTier: u.kycTier as any, kycStatus: u.kycStatus as any, termsVersion: u.termsVersion, balanceCents: cash, bonusCents: bonus,
    limits: { dailyDepositCapCents: u.dailyDepositCapCents, selfExcludedUntil: u.selfExcludedUntil?.toISOString() ?? null, cooldownUntil: u.cooldownUntil?.toISOString() ?? null },
    geo: { region: geo?.region ?? null, checkedAt: geo?.createdAt.toISOString() ?? null, ok: !!geo && geo.ok && geoIsFresh(geo), reason: geo?.reason ?? undefined },
    roles: u.roles, eligibility,
  };
}

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", { preHandler: (r) => app.authenticate(r) }, async (req) => meView(req.db, req.user!));

  app.patch("/me", { preHandler: (r) => app.authenticate(r) }, async (req) => {
    const b = z.object({ avatarUrl: z.string().url().max(300).nullable().optional(), legalName: z.string().max(120).optional(), address: z.record(z.string().max(120)).optional() }).parse(req.body);
    await req.db.update(users).set({ ...b, updatedAt: new Date() }).where(eq(users.id, req.user!.id));
    return meView(req.db, (await req.db.select().from(users).where(eq(users.id, req.user!.id)))[0]);
  });

  app.get("/me/matches", { preHandler: (r) => app.authenticate(r) }, async (req) => userMatchHistory(req.db, req.user!.id));

  /** Location verification. Mobile clients send a GPS fix; desktop may omit it. */
  app.post("/geo/check", { preHandler: (r) => app.authenticate(r), config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } }, async (req) => {
    const b = z.object({ lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(), accuracyM: z.number().min(0).optional(), mobile: z.boolean().optional() }).parse(req.body ?? {});
    const devRegion = env.isProd ? undefined : (req.headers["x-gn-dev-region"] as string | undefined);
    const res = await runGeoCheck(req.db, { userId: req.user!.id, ip: req.clientIp, gps: b.lat !== undefined && b.lng !== undefined ? { lat: b.lat, lng: b.lng, accuracyM: b.accuracyM } : undefined, devRegion, requireGps: !!b.mobile });
    if (res.ok && res.region) await req.db.update(users).set({ region: res.region, country: res.region.split("-")[0] }).where(eq(users.id, req.user!.id));
    return res;
  });

  app.get("/jurisdictions", async () => JURISDICTIONS);

  app.get("/terms/current", async () => ({ version: env.TERMS_VERSION, url: `${env.PUBLIC_ARCADE_URL}/legal/terms` }));
  app.post("/terms/accept", { preHandler: (r) => app.authenticate(r) }, async (req) => {
    const b = z.object({ version: z.string() }).parse(req.body);
    if (b.version !== env.TERMS_VERSION) throw badRequest("terms_version_stale");
    await req.db.insert(termsAcceptances).values({ id: uuid(), userId: req.user!.id, version: b.version, ip: req.clientIp });
    await req.db.update(users).set({ termsVersion: b.version }).where(eq(users.id, req.user!.id));
    return { ok: true };
  });

  /** KYC: start a verification session for the requested tier. */
  app.post("/kyc/start", { preHandler: (r) => app.authenticate(r) }, async (req) => {
    const b = z.object({ tier: z.union([z.literal(1), z.literal(2)]).default(1), legalName: z.string().max(120).optional(), address: z.record(z.string().max(120)).optional() }).parse(req.body ?? {});
    const u = req.user!;
    if (u.kycTier >= b.tier) return { status: "approved", tier: u.kycTier };
    const res = await kyc.start({ userId: u.id, email: u.email, tier: b.tier, callbackUrl: `${env.PUBLIC_API_URL}/kyc/webhook/${kyc.name}`, redirectUrl: `${env.PUBLIC_ARCADE_URL}/profile?kyc=done` });
    const caseId = uuid();
    await req.db.insert(kycCases).values({ id: caseId, userId: u.id, provider: kyc.name, providerRef: res.providerRef, tierRequested: b.tier, status: res.autoApproved ? "approved" : "pending", data: { legalName: b.legalName, address: b.address } });
    await req.db.update(users).set({ kycStatus: res.autoApproved ? "approved" : "pending", kycTier: res.autoApproved ? b.tier : u.kycTier, legalName: b.legalName ?? u.legalName, address: b.address ?? u.address }).where(eq(users.id, u.id));
    return { status: res.autoApproved ? "approved" : "pending", url: res.url, caseId };
  });

  app.post("/kyc/webhook/:provider", { config: { rateLimit: false } }, async (req) => {
    const ev = await kyc.parseWebhook(req.rawBodyString ?? "", req.headers as any);
    const c = (await req.db.select().from(kycCases).where(eq(kycCases.providerRef, ev.providerRef)))[0];
    if (!c) return { ok: false };
    await req.db.update(kycCases).set({ status: ev.status, data: { ...c.data, result: ev.data }, updatedAt: new Date() }).where(eq(kycCases.id, c.id));
    if (ev.status === "approved") await req.db.update(users).set({ kycStatus: "approved", kycTier: c.tierRequested }).where(eq(users.id, c.userId));
    else if (ev.status === "rejected" || ev.status === "review") await req.db.update(users).set({ kycStatus: ev.status }).where(eq(users.id, c.userId));
    return { ok: true };
  });

  /** Tax info (US): mark W-9 collected. In production, store via the KYC/tax vendor, never raw here. */
  app.post("/me/tax-info", { preHandler: (r) => app.authenticate(r) }, async (req) => {
    const b = z.object({ attestW9: z.literal(true), legalName: z.string().min(2).max(120), tinLast4: z.string().regex(/^\d{4}$/) }).parse(req.body);
    await req.db.update(users).set({ taxIdCollected: true, legalName: b.legalName, taxIdEncrypted: `vault:last4:${b.tinLast4}` }).where(eq(users.id, req.user!.id));
    return { ok: true };
  });

  /** Responsible gaming controls. */
  app.post("/me/limits/deposit", { preHandler: (r) => app.authenticate(r) }, async (req) => setDepositLimit(req.db, req.user!, z.object({ capCents: z.number().int() }).parse(req.body).capCents));
  app.post("/me/self-exclude", { preHandler: (r) => app.authenticate(r) }, async (req) => selfExclude(req.db, req.user!, z.object({ days: z.number().int() }).parse(req.body).days));
  app.post("/me/cooldown", { preHandler: (r) => app.authenticate(r) }, async (req) => coolDown(req.db, req.user!, z.object({ hours: z.number().int() }).parse(req.body).hours));

  app.get("/profile/:username", async (req) => {
    const { username } = req.params as { username: string };
    const u = (await req.db.select().from(users).where(eq(users.username, username)))[0];
    if (!u) return { error: "not_found" };
    const history = await userMatchHistory(req.db, u.id, 200);
    const settled = history.filter((h) => h.status === "settled" && !h.practice);
    return { id: u.id, username: u.username, avatarUrl: u.avatarUrl, createdAt: u.createdAt.toISOString(), stats: { played: settled.length, wins: settled.filter((h) => h.rank === 1).length, netCents: settled.reduce((a, h) => a + (h.payoutCents ?? 0) - h.entryCents, 0) } };
  });
};
