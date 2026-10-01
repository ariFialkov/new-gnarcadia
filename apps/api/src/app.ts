import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { env, testMode } from "./env.js";
import { getDb, type Db } from "./db/client.js";
import { users } from "./db/schema.js";
import { HttpError, unauthorized, forbidden } from "./lib/errors.js";
import { verifyAccessToken, verifyInternalSignature } from "./lib/auth.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { gameRoutes } from "./routes/games.js";
import { matchRoutes } from "./routes/matches.js";
import { walletRoutes } from "./routes/wallet.js";
import { marketRoutes } from "./routes/market.js";
import { devRoutes } from "./routes/dev.js";
import { internalRoutes } from "./routes/internal.js";
import { adminRoutes } from "./routes/admin.js";
import { staticRoutes } from "./routes/static.js";
import { analyticsRoutes } from "./routes/analytics.js";

declare module "fastify" {
  interface FastifyRequest { user?: typeof users.$inferSelect; db: Db; clientIp: string; rawBodyString?: string }
  interface FastifyInstance { db: Db; authenticate: (req: FastifyRequest) => Promise<typeof users.$inferSelect>; optionalAuth: (req: FastifyRequest) => Promise<void>; requireAdmin: (req: FastifyRequest) => Promise<void>; requireInternal: (req: FastifyRequest) => void; requireDevKey: (req: FastifyRequest) => Promise<void> }
}

export async function buildApp(): Promise<FastifyInstance> {
  const db = await getDb();
  const app = Fastify({ logger: env.NODE_ENV !== "test" ? { level: env.isProd ? "info" : "warn" } : false, trustProxy: true, bodyLimit: 2 * 1024 * 1024 });
  app.decorate("db", db);
  app.decorateRequest("db", null as any);
  app.decorateRequest("clientIp", "");
  app.addHook("onRequest", async (req) => { req.db = db; req.clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip; });

  // Keep raw body for webhook signature verification.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as any).rawBodyString = body as string;
    try { done(null, body ? JSON.parse(body as string) : {}); } catch (e) { done(e as Error, undefined); }
  });

  await app.register(cors, { origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin) || !env.isProd), credentials: true });
  await app.register(multipart, { limits: { fileSize: 150 * 1024 * 1024, files: 1 } });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute", allowList: (req) => req.url.startsWith("/g/") || req.url.startsWith("/internal/") });

  app.decorate("authenticate", async (req: FastifyRequest) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) throw unauthorized();
    let claims; try { claims = await verifyAccessToken(h.slice(7)); } catch { throw unauthorized("token_invalid"); }
    const u = (await db.select().from(users).where(eq(users.id, claims.sub)))[0];
    if (!u) throw unauthorized("user_missing");
    req.user = u;
    return u;
  });
  app.decorate("optionalAuth", async (req: FastifyRequest) => { if (req.headers.authorization) { try { await app.authenticate(req); } catch { /* anonymous */ } } });
  app.decorate("requireAdmin", async (req: FastifyRequest) => {
    if (req.headers["x-admin-key"] === env.ADMIN_API_KEY) return;
    const u = await app.authenticate(req).catch(() => null);
    if (!u || !u.roles.includes("admin")) throw forbidden("admin_only");
  });
  app.decorate("requireInternal", (req: FastifyRequest) => {
    const ok = verifyInternalSignature(req.rawBodyString ?? "", String(req.headers["x-gn-ts"] ?? ""), String(req.headers["x-gn-sig"] ?? ""));
    if (!ok) throw unauthorized("bad_internal_signature");
  });
  app.decorate("requireDevKey", async (req: FastifyRequest) => {
    const k = req.headers["x-dev-key"];
    if (k === env.DEV_API_KEY) return;
    const u = await app.authenticate(req).catch(() => null);
    if (!u || !(u.roles.includes("developer") || u.roles.includes("admin"))) throw forbidden("developer_only", "Provide X-Dev-Key or sign in as a developer");
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message, details: err.details });
    if (err instanceof ZodError) return reply.status(400).send({ error: "validation", message: "Invalid request", details: err.flatten() });
    if ((err as any).statusCode && (err as any).statusCode < 500) return reply.status((err as any).statusCode).send({ error: (err as any).code ?? "bad_request", message: err.message });
    req.log.error(err);
    return reply.status(500).send({ error: "internal", message: env.isProd ? "Internal error" : err.message });
  });

  app.get("/health", async () => ({ ok: true, env: env.NODE_ENV, testMode, providers: { geo: env.GEO_PROVIDER, kyc: env.KYC_PROVIDER, payments: env.PAYMENT_PROVIDER }, termsVersion: env.TERMS_VERSION, gamesUrl: env.PUBLIC_GAMES_URL }));

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(meRoutes);
  await app.register(gameRoutes);
  await app.register(matchRoutes);
  await app.register(walletRoutes);
  await app.register(marketRoutes);
  await app.register(analyticsRoutes);
  await app.register(devRoutes, { prefix: "/dev" });
  await app.register(internalRoutes, { prefix: "/internal" });
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(staticRoutes);
  return app;
}
