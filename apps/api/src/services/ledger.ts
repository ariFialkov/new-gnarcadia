import { and, eq, sql, desc } from "drizzle-orm";
import type { Db, Tx } from "../db/client.js";
import { accounts, ledgerEntries, transactions } from "../db/schema.js";
import { uuid } from "../lib/ids.js";
import { HttpError } from "../lib/errors.js";
import type { Currency, LedgerKind } from "@gnarcadia/protocol";

/**
 * Double-entry ledger. Rules:
 *  - Every transaction's entries sum to zero.
 *  - User accounts may never go negative. Platform 'clearing' is the counterparty for external money
 *    (deposits/withdrawals) and may be negative (it represents cash held at the processor/bank).
 *  - Posting is idempotent on idempotency_key: replays return the original transaction.
 */
export interface AccountRef { ownerType: "user" | "match" | "platform"; ownerId: string; key: string }
export const userCash = (userId: string): AccountRef => ({ ownerType: "user", ownerId: userId, key: "cash" });
export const userBonus = (userId: string): AccountRef => ({ ownerType: "user", ownerId: userId, key: "bonus" });
export const matchEscrow = (matchId: string): AccountRef => ({ ownerType: "match", ownerId: matchId, key: "escrow" });
export const platform = (key: "clearing" | "revenue" | "promo"): AccountRef => ({ ownerType: "platform", ownerId: "platform", key });

export interface Posting { account: AccountRef; deltaCents: number }
export interface PostInput {
  idempotencyKey: string;
  kind: LedgerKind;
  currency: Currency;
  userId?: string;
  ref?: string;
  meta?: Record<string, unknown>;
  postings: Posting[];
}

export async function ensureAccount(tx: Tx | Db, ref: AccountRef, currency: Currency) {
  const existing = await tx.select().from(accounts).where(and(eq(accounts.ownerType, ref.ownerType), eq(accounts.ownerId, ref.ownerId), eq(accounts.key, ref.key), eq(accounts.currency, currency))).limit(1);
  if (existing[0]) return existing[0];
  const row = { id: uuid(), ownerType: ref.ownerType, ownerId: ref.ownerId, key: ref.key, currency, balanceCents: 0 };
  await tx.insert(accounts).values(row).onConflictDoNothing();
  const again = await tx.select().from(accounts).where(and(eq(accounts.ownerType, ref.ownerType), eq(accounts.ownerId, ref.ownerId), eq(accounts.key, ref.key), eq(accounts.currency, currency))).limit(1);
  return again[0];
}

export async function getBalance(db: Db | Tx, ref: AccountRef, currency: Currency): Promise<number> {
  const a = await ensureAccount(db, ref, currency);
  return Number(a.balanceCents);
}

/** Post a balanced transaction atomically. Throws HttpError(402, 'insufficient_funds') for user overdrafts. */
export async function post(db: Db, input: PostInput) {
  const sum = input.postings.reduce((a, p) => a + p.deltaCents, 0);
  if (sum !== 0) throw new Error(`unbalanced transaction ${input.kind}: sum=${sum}`);
  if (input.postings.some((p) => !Number.isInteger(p.deltaCents))) throw new Error("non-integer posting");
  return db.transaction(async (tx) => {
    const dup = await tx.select().from(transactions).where(eq(transactions.idempotencyKey, input.idempotencyKey)).limit(1);
    if (dup[0]) return { txn: dup[0], replayed: true as const };
    const txnId = uuid();
    await tx.insert(transactions).values({ id: txnId, idempotencyKey: input.idempotencyKey, kind: input.kind, currency: input.currency, userId: input.userId ?? null, ref: input.ref ?? null, meta: input.meta ?? {} });
    // Lock & update accounts in a stable order to avoid deadlocks.
    const ordered = [...input.postings].sort((a, b) => `${a.account.ownerType}${a.account.ownerId}${a.account.key}`.localeCompare(`${b.account.ownerType}${b.account.ownerId}${b.account.key}`));
    for (const p of ordered) {
      const acct = await ensureAccount(tx, p.account, input.currency);
      const locked = await tx.execute(sql`SELECT balance_cents FROM accounts WHERE id = ${acct.id} FOR UPDATE`);
      const current = Number((locked as any).rows[0].balance_cents);
      const next = current + p.deltaCents;
      if (next < 0 && p.account.ownerType !== "platform") {
        throw new HttpError(402, "insufficient_funds", `insufficient funds in ${p.account.ownerType}:${p.account.key}`, { needed: -next });
      }
      await tx.update(accounts).set({ balanceCents: next }).where(eq(accounts.id, acct.id));
      await tx.insert(ledgerEntries).values({ id: uuid(), txnId, accountId: acct.id, deltaCents: p.deltaCents, balanceAfterCents: next });
    }
    const txn = (await tx.select().from(transactions).where(eq(transactions.id, txnId)))[0];
    return { txn, replayed: false as const };
  });
}

/** Convenience: move cents from A to B. */
export function transfer(from: AccountRef, to: AccountRef, cents: number): Posting[] {
  if (cents < 0) throw new Error("negative transfer");
  return [{ account: from, deltaCents: -cents }, { account: to, deltaCents: cents }];
}

export async function userStatement(db: Db, userId: string, currency: Currency, limit = 50) {
  const cash = await ensureAccount(db, userCash(userId), currency);
  const rows = await db.select({
    id: ledgerEntries.id, deltaCents: ledgerEntries.deltaCents, balanceAfterCents: ledgerEntries.balanceAfterCents, createdAt: ledgerEntries.createdAt,
    kind: transactions.kind, ref: transactions.ref, status: transactions.status, meta: transactions.meta,
  }).from(ledgerEntries).innerJoin(transactions, eq(ledgerEntries.txnId, transactions.id)).where(eq(ledgerEntries.accountId, cash.id)).orderBy(desc(ledgerEntries.createdAt)).limit(limit);
  return rows.map((r) => ({ ...r, deltaCents: Number(r.deltaCents), balanceAfterCents: Number(r.balanceAfterCents), createdAt: r.createdAt.toISOString() }));
}

/** Reconciliation: sum of all user balances must equal -(clearing) adjusted by revenue/promo/escrow. */
export async function reconcile(db: Db, currency: Currency) {
  const rows = await db.select({ ownerType: accounts.ownerType, key: accounts.key, total: sql<number>`sum(${accounts.balanceCents})` }).from(accounts).where(eq(accounts.currency, currency)).groupBy(accounts.ownerType, accounts.key);
  const get = (t: string, k: string) => Number(rows.find((r) => r.ownerType === t && r.key === k)?.total ?? 0);
  const userCashTotal = get("user", "cash"), userBonusTotal = get("user", "bonus"), escrow = get("match", "escrow");
  const clearing = get("platform", "clearing"), revenue = get("platform", "revenue"), promo = get("platform", "promo");
  const sumAll = userCashTotal + userBonusTotal + escrow + clearing + revenue + promo;
  return { currency, userCashTotal, userBonusTotal, escrow, clearing, revenue, promo, balanced: sumAll === 0, /** cash the platform must hold for players */ floatCents: userCashTotal + escrow };
}
