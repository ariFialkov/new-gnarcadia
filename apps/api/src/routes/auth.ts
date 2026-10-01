import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import { users, refreshTokens, termsAcceptances } from "../db/schema.js";
import { hashPassword, verifyPassword, signAccessToken } from "../lib/auth.js";
import { uuid, token } from "../lib/ids.js";
import { badRequest, conflict, unauthorized } from "../lib/errors.js";
import { env } from "../env.js";
import { ageFromDob } from "@gnarcadia/protocol";
import { meView } from "./me.js";

const SignupSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(8).max(128),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  country: z.enum(["CA", "US"]),
  acceptTerms: z.literal(true),
  marketingOptIn: z.boolean().optional(),
});
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/signup", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const b = SignupSchema.parse(req.body);
    if (ageFromDob(b.dob) < 18) throw badRequest("underage", "You must be at least 18 to create an account.");
    const dup = await req.db.select({ id: users.id }).from(users).where(or(eq(users.email, b.email.toLowerCase()), eq(users.username, b.username)));
    if (dup[0]) throw conflict("account_exists", "An account with that email or username already exists.");
    const id = uuid();
    await req.db.insert(users).values({ id, email: b.email.toLowerCase(), passwordHash: await hashPassword(b.password), username: b.username, dob: b.dob, country: b.country, currency: b.country === "CA" ? "CAD" : "USD", termsVersion: env.TERMS_VERSION, roles: [] });
    await req.db.insert(termsAcceptances).values({ id: uuid(), userId: id, version: env.TERMS_VERSION, ip: req.clientIp });
    const u = (await req.db.select().from(users).where(eq(users.id, id)))[0];
    return reply.status(201).send(await issue(req.db, u));
  });

  app.post("/login", { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req) => {
    const b = z.object({ email: z.string(), password: z.string() }).parse(req.body);
    const u = (await req.db.select().from(users).where(or(eq(users.email, b.email.toLowerCase()), eq(users.username, b.email))))[0];
    if (!u || !(await verifyPassword(b.password, u.passwordHash))) throw unauthorized("bad_credentials", "Incorrect email or password.");
    await req.db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, u.id));
    return issue(req.db, u);
  });

  app.post("/refresh", async (req) => {
    const b = z.object({ refreshToken: z.string() }).parse(req.body);
    const row = (await req.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha(b.refreshToken))))[0];
    if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) throw unauthorized("refresh_invalid");
    await req.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
    const u = (await req.db.select().from(users).where(eq(users.id, row.userId)))[0];
    return issue(req.db, u);
  });

  app.post("/logout", async (req) => {
    const b = z.object({ refreshToken: z.string().optional() }).parse(req.body ?? {});
    if (b.refreshToken) await req.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, sha(b.refreshToken)));
    return { ok: true };
  });

  async function issue(db: typeof app.db, u: typeof users.$inferSelect) {
    const refresh = token(32);
    await db.insert(refreshTokens).values({ id: uuid(), userId: u.id, tokenHash: sha(refresh), expiresAt: new Date(Date.now() + 30 * 86400_000) });
    return { accessToken: await signAccessToken(u.id, u.roles), refreshToken: refresh, user: await meView(db, u) };
  }
};
