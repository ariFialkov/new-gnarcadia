import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { paymentIntents } from "../db/schema.js";
import * as L from "../services/ledger.js";
import { createDeposit, createWithdrawal, handleWebhook, payments, QUICK_AMOUNTS_CENTS, completeDeposit } from "../services/wallet.js";
import { depositsLast24h } from "../services/gates.js";
import { env } from "../env.js";
import type { Currency } from "@gnarcadia/protocol";

export const walletRoutes: FastifyPluginAsync = async (app) => {
  app.get("/wallet", { preHandler: (r) => app.authenticate(r) }, async (req) => {
    const u = req.user!; const cur = u.currency as Currency; const country = (u.country ?? "CA") as "CA" | "US";
    const [cash, bonus, used, intents] = await Promise.all([L.getBalance(req.db, L.userCash(u.id), cur), L.getBalance(req.db, L.userBonus(u.id), cur), depositsLast24h(req.db, u.id), req.db.select().from(paymentIntents).where(eq(paymentIntents.userId, u.id)).orderBy(desc(paymentIntents.createdAt)).limit(20)]);
    return { currency: cur, balanceCents: cash, bonusCents: bonus, quickAmountsCents: QUICK_AMOUNTS_CENTS, methods: payments.methods(country), provider: payments.name, limits: { dailyDepositCapCents: u.dailyDepositCapCents, usedTodayCents: used }, intents: intents.map((i) => ({ id: i.id, direction: i.direction, method: i.method, amountCents: i.amountCents, feeCents: i.feeCents, status: i.status, createdAt: i.createdAt })) };
  });
  app.get("/wallet/transactions", { preHandler: (r) => app.authenticate(r) }, async (req) => L.userStatement(req.db, req.user!.id, req.user!.currency as Currency));
  app.post("/wallet/deposit", { preHandler: (r) => app.authenticate(r), config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req) => createDeposit(req.db, req.user!, z.object({ amountCents: z.number().int(), method: z.enum(["card", "interac", "bank", "wallet"]) }).parse(req.body)));
  app.post("/wallet/withdraw", { preHandler: (r) => app.authenticate(r), config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (req) => createWithdrawal(req.db, req.user!, z.object({ amountCents: z.number().int(), method: z.enum(["interac", "bank", "card_push", "wallet"]), destination: z.record(z.string().max(200)).default({}) }).parse(req.body)));
  app.post("/payments/webhook/:provider", { config: { rateLimit: false } }, async (req) => handleWebhook(req.db, req.rawBodyString ?? "", req.headers as any));
  /** Dev helper: complete a pending mock intent (simulates the processor webhook). */
  if (!env.isProd) app.post("/dev/payments/complete", async (req) => completeDeposit(req.db, z.object({ intentId: z.string() }).parse(req.body).intentId));
};
