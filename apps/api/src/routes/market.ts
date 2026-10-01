import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { listItems, buyItem, equipItem } from "../services/market.js";
import type { Currency } from "@gnarcadia/protocol";

export const marketRoutes: FastifyPluginAsync = async (app) => {
  app.get("/market/items", { preHandler: (r) => app.optionalAuth(r) }, async (req) => {
    const q = req.query as { currency?: string };
    const cur = (req.user?.currency ?? q.currency ?? "CAD") as Currency;
    return listItems(req.db, cur, req.user?.id);
  });
  app.post("/market/items/:id/buy", { preHandler: (r) => app.authenticate(r) }, async (req) => buyItem(req.db, req.user!, (req.params as any).id));
  app.post("/market/items/:id/equip", { preHandler: (r) => app.authenticate(r) }, async (req) => equipItem(req.db, req.user!.id, (req.params as any).id, z.object({ equipped: z.boolean().default(true) }).parse(req.body ?? {}).equipped));
  app.get("/market/inventory", { preHandler: (r) => app.authenticate(r) }, async (req) => (await listItems(req.db, req.user!.currency as Currency, req.user!.id)).filter((i) => i.owned));
};
