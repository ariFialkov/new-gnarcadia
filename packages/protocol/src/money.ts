/** All money on the platform is integer minor units (cents). Never floats. */
export type Cents = number;
export type Currency = "CAD" | "USD";

export const LEDGER_KINDS = [
  "deposit",
  "deposit_reversal",
  "withdrawal",
  "withdrawal_reversal",
  "match_entry",
  "match_refund",
  "match_payout",
  "match_rake",
  "bounty_transfer",
  "marketplace_purchase",
  "bonus_grant",
  "adjustment",
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const ACCOUNT_OWNER_TYPES = ["user", "match", "platform"] as const;
export type AccountOwnerType = (typeof ACCOUNT_OWNER_TYPES)[number];

/** Platform-level system accounts (one per currency). */
export const PLATFORM_ACCOUNTS = {
  /** Funds owed to players; the "float" (sum of user balances). */
  clearing: "clearing",
  /** Platform revenue from rake and marketplace. */
  revenue: "revenue",
  /** Promotional credit funding account. */
  promo: "promo",
} as const;
export type PlatformAccountKey = keyof typeof PLATFORM_ACCOUNTS;

export function formatCents(cents: Cents, currency: Currency, locale = "en-CA"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/** Default rake schedule, basis points of pool. Disclosed pre-entry in the lobby UI. */
export const DEFAULT_RAKE_BPS = 1000; // 10%
export function computeRake(poolCents: Cents, rakeBps = DEFAULT_RAKE_BPS): Cents {
  return Math.floor((poolCents * rakeBps) / 10_000);
}

/** Split a prize pool across ranked winners using a payout table (bps per rank). Remainder goes to rank 1. */
export function splitPrizePool(netPool: Cents, payoutBps: number[]): Cents[] {
  const out = payoutBps.map((bps) => Math.floor((netPool * bps) / 10_000));
  const distributed = out.reduce((a, b) => a + b, 0);
  if (out.length > 0) out[0] += netPool - distributed;
  return out;
}
