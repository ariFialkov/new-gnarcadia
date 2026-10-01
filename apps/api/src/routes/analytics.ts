import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { analyticsEvents } from "../db/schema.js";
import { uuid } from "../lib/ids.js";

/** Client event ingestion (arcade + games via bridge). Batched, anonymous allowed. */
export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/analytics/events", { preHandler: (r) => app.optionalAuth(r), config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req) => {
    const b = z.object({ sessionId: z.string().max(64).optional(), events: z.array(z.object({ event: z.string().max(60), props: z.record(z.any()).optional(), at: z.number().optional() })).max(50) }).parse(req.body);
    if (b.events.length) await req.db.insert(analyticsEvents).values(b.events.map((e) => ({ id: uuid(), userId: req.user?.id ?? null, sessionId: b.sessionId ?? null, event: e.event, props: e.props ?? {}, region: req.user?.region ?? null })));
    return { ok: true };
  });
};
