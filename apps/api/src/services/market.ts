import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { inventory, marketItems, users } from "../db/schema.js";
import { uuid } from "../lib/ids.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import * as L from "./ledger.js";
import type { Currency, MarketItem } from "@gnarcadia/protocol";

export async function listItems(db: Db, currency: Currency, userId?: string): Promise<MarketItem[]> {
  const items = await db.select().from(marketItems).where(and(eq(marketItems.active, true), eq(marketItems.currency, currency)));
  const owned = userId ? await db.select().from(inventory).where(eq(inventory.userId, userId)) : [];
  return items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, description: i.description, kind: i.kind as any, slot: i.slot, gameId: i.gameId, priceCents: i.priceCents, currency: i.currency as Currency, imageUrl: i.imageUrl, rarity: i.rarity as any, grants: i.grants, owned: owned.some((o) => o.itemId === i.id), equipped: owned.some((o) => o.itemId === i.id && o.equipped) }));
}

export async function buyItem(db: Db, user: typeof users.$inferSelect, itemId: string) {
  const item = (await db.select().from(marketItems).where(eq(marketItems.id, itemId)))[0];
  if (!item || !item.active) throw notFound("item_not_found");
  if (item.currency !== user.currency) throw badRequest("currency_mismatch");
  const have = (await db.select().from(inventory).where(and(eq(inventory.userId, user.id), eq(inventory.itemId, itemId))))[0];
  if (have) throw conflict("already_owned");
  // Purchases are allowed from cash balance only (no bonus) and are final; cosmetics never affect gameplay.
  await L.post(db, { idempotencyKey: `buy:${user.id}:${itemId}`, kind: "marketplace_purchase", currency: item.currency as Currency, userId: user.id, ref: item.sku, meta: { itemId }, postings: L.transfer(L.userCash(user.id), L.platform("revenue"), item.priceCents) });
  await db.insert(inventory).values({ id: uuid(), userId: user.id, itemId, equipped: false });
  return { ok: true };
}

export async function equipItem(db: Db, userId: string, itemId: string, equipped: boolean) {
  const item = (await db.select().from(marketItems).where(eq(marketItems.id, itemId)))[0];
  if (!item) throw notFound("item_not_found");
  const have = (await db.select().from(inventory).where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId))))[0];
  if (!have) throw notFound("not_owned");
  if (equipped && item.slot) {
    // one item per slot (per game)
    const sameSlot = await db.select({ id: inventory.id }).from(inventory).innerJoin(marketItems, eq(marketItems.id, inventory.itemId)).where(and(eq(inventory.userId, userId), eq(inventory.equipped, true), eq(marketItems.slot, item.slot), item.gameId ? eq(marketItems.gameId, item.gameId) : eq(marketItems.gameId, marketItems.gameId)));
    for (const s of sameSlot) await db.update(inventory).set({ equipped: false }).where(eq(inventory.id, s.id));
  }
  await db.update(inventory).set({ equipped }).where(eq(inventory.id, have.id));
  return { ok: true };
}

/** Equipped cosmetics by slot for a game (global items + game-specific). Passed to games through the bridge. */
export async function getEquippedCosmetics(db: Db, userId: string, gameId: string): Promise<Record<string, string>> {
  const rows = await db.select({ slot: marketItems.slot, sku: marketItems.sku, gameId: marketItems.gameId }).from(inventory).innerJoin(marketItems, eq(marketItems.id, inventory.itemId)).where(and(eq(inventory.userId, userId), eq(inventory.equipped, true)));
  const out: Record<string, string> = {};
  for (const r of rows) if (r.slot && (!r.gameId || r.gameId === gameId)) out[r.slot] = r.sku;
  return out;
}

/** Does the user own an item granting e.g. "game:xyz" or "tournament:weekly"? */
export async function userGrants(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db.select({ grants: marketItems.grants }).from(inventory).innerJoin(marketItems, eq(marketItems.id, inventory.itemId)).where(eq(inventory.userId, userId));
  return new Set(rows.flatMap((r) => r.grants));
}
