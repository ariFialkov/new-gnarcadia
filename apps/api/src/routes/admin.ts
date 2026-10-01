import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { users, games, gameVersions, auditLog, kycCases } from "../db/schema.js";
import { overview, regionDetail } from "../services/analytics.js";
import { reconcile } from "../services/ledger.js";
import { uuid } from "../lib/ids.js";
import { notFound } from "../lib/errors.js";

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req) => app.requireAdmin(req));
  const audit = (req: any, action: string, target: string, meta: Record<string, unknown> = {}) => req.db.insert(auditLog).values({ id: uuid(), actor: req.user?.id ?? "admin-key", action, target, meta });

  app.get("/analytics/overview", async (req) => overview(req.db, (req.query as any).days ? Number((req.query as any).days) : 30));
  app.get("/analytics/regions/:code", async (req) => regionDetail(req.db, (req.params as any).code));
  app.get("/ledger/reconcile", async (req) => ({ CAD: await reconcile(req.db, "CAD"), USD: await reconcile(req.db, "USD") }));

  app.get("/users", async (req) => {
    const q = (req.query as any).q as string | undefined;
    const rows = await req.db.select({ id: users.id, email: users.email, username: users.username, region: users.region, country: users.country, kycTier: users.kycTier, kycStatus: users.kycStatus, flags: users.flags, roles: users.roles, createdAt: users.createdAt, lastSeenAt: users.lastSeenAt }).from(users).where(q ? or(ilike(users.email, `%${q}%`), ilike(users.username, `%${q}%`)) : undefined).orderBy(desc(users.createdAt)).limit(100);
    return rows;
  });
  app.post("/users/:id/kyc", async (req) => {
    const b = z.object({ tier: z.number().int().min(0).max(2), status: z.enum(["none", "pending", "approved", "rejected", "review"]) }).parse(req.body);
    await req.db.update(users).set({ kycTier: b.tier, kycStatus: b.status }).where(eq(users.id, (req.params as any).id));
    await req.db.update(kycCases).set({ status: b.status, updatedAt: new Date() }).where(eq(kycCases.userId, (req.params as any).id));
    await audit(req, "kyc.set", (req.params as any).id, b); return { ok: true };
  });
  app.post("/users/:id/flags", async (req) => {
    const b = z.object({ flags: z.array(z.string()) }).parse(req.body);
    await req.db.update(users).set({ flags: b.flags }).where(eq(users.id, (req.params as any).id));
    await audit(req, "flags.set", (req.params as any).id, b); return { ok: true };
  });
  app.post("/users/:id/roles", async (req) => {
    const b = z.object({ roles: z.array(z.enum(["admin", "developer"])) }).parse(req.body);
    await req.db.update(users).set({ roles: b.roles }).where(eq(users.id, (req.params as any).id));
    await audit(req, "roles.set", (req.params as any).id, b); return { ok: true };
  });
  app.get("/games", async (req) => {
    const rows = await req.db.select().from(games).orderBy(desc(games.updatedAt));
    return Promise.all(rows.map(async (g) => ({ ...g, versions: await req.db.select().from(gameVersions).where(eq(gameVersions.gameId, g.id)).orderBy(desc(gameVersions.uploadedAt)) })));
  });
  app.post("/games/:id/review", async (req) => {
    const b = z.object({ version: z.string(), decision: z.enum(["approve", "reject"]), notes: z.string().max(500).optional(), featured: z.boolean().optional() }).parse(req.body);
    const id = (req.params as any).id;
    const v = (await req.db.select().from(gameVersions).where(sql`${gameVersions.gameId} = ${id} and ${gameVersions.version} = ${b.version}`))[0];
    if (!v) throw notFound("version_not_found");
    await req.db.update(gameVersions).set({ status: b.decision === "approve" ? "approved" : "rejected", notes: b.notes ?? null }).where(eq(gameVersions.id, v.id));
    if (b.decision === "approve") await req.db.update(games).set({ liveVersion: b.version, status: "live", featured: b.featured ?? undefined, updatedAt: new Date() }).where(eq(games.id, id));
    else await req.db.update(games).set({ status: "draft", updatedAt: new Date() }).where(eq(games.id, id));
    await audit(req, "game.review", id, b); return { ok: true };
  });
  app.get("/audit", async (req) => req.db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200));
};
