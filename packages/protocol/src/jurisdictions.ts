/**
 * Jurisdiction rules. Region codes are ISO 3166-2 (e.g. "CA-ON", "US-CA").
 * Derived from docs/legal/jurisdiction-analysis.md. Changing a rule here changes what players can do
 * in production, so changes should be reviewed by counsel.
 */
import type { Currency } from "./money.js";

export type RegionStatus = "live" | "target" | "paused" | "blocked";

export interface JurisdictionRule {
  code: string;
  name: string;
  country: "CA" | "US";
  currency: Currency;
  status: RegionStatus;
  /** Minimum age to play for cash. */
  minAge: number;
  /** Maximum single entry fee in cents (soft cap, product decision). */
  maxEntryCents: number;
  /** Default daily deposit cap in cents (player can lower, never raise above this without review). */
  defaultDailyDepositCapCents: number;
  /** Lifetime winnings (per calendar year) that triggers tax-ID collection. */
  taxIdThresholdCents: number;
  /** Notes for the UI / legal (why paused, etc.). */
  note?: string;
}

const CA_BASE = {
  country: "CA" as const,
  currency: "CAD" as const,
  maxEntryCents: 10_000,
  defaultDailyDepositCapCents: 50_000,
  // Canada: no prize reporting threshold for casual skill-contest winners; keep SIN collection off by default.
  taxIdThresholdCents: Number.POSITIVE_INFINITY,
};
const US_BASE = {
  country: "US" as const,
  currency: "USD" as const,
  minAge: 18,
  maxEntryCents: 10_000,
  defaultDailyDepositCapCents: 50_000,
  // US: Form 1099-MISC threshold is $2,000 for tax year 2026 (OBBBA). Collect W-9/SSN before paying past it.
  taxIdThresholdCents: 200_000,
};

export const JURISDICTIONS: Record<string, JurisdictionRule> = {
  "CA-ON": { ...CA_BASE, code: "CA-ON", name: "Ontario", status: "target", minAge: 19, note: "Age 19 aligns with iGaming Ontario standard; no iGO registration available for pure-skill." },
  "CA-AB": { ...CA_BASE, code: "CA-AB", name: "Alberta", status: "target", minAge: 18 },
  "CA-BC": { ...CA_BASE, code: "CA-BC", name: "British Columbia", status: "target", minAge: 19 },
  "CA-NS": { ...CA_BASE, code: "CA-NS", name: "Nova Scotia", status: "target", minAge: 19 },
  "US-CA": { ...US_BASE, code: "US-CA", name: "California", status: "target" },
  "US-CO": { ...US_BASE, code: "US-CO", name: "Colorado", status: "target" },
  "US-MO": { ...US_BASE, code: "US-MO", name: "Missouri", status: "target", note: "Material-degree chance test; counsel review of each game's skill analysis." },
  "US-NY": { ...US_BASE, code: "US-NY", name: "New York", status: "target", note: "Material-degree chance test; counsel review of each game's skill analysis." },
  "US-OH": { ...US_BASE, code: "US-OH", name: "Ohio", status: "target" },
  "US-PA": { ...US_BASE, code: "US-PA", name: "Pennsylvania", status: "paused", note: "Paused pending counsel review of the June 2026 PA Supreme Court skill-games decision." },
};

export function getJurisdiction(code: string | null | undefined): JurisdictionRule | undefined {
  return code ? JURISDICTIONS[code] : undefined;
}

export function isPlayableRegion(code: string | null | undefined): boolean {
  const j = getJurisdiction(code);
  return !!j && (j.status === "live" || j.status === "target");
}

export function ageFromDob(dobIso: string, now = new Date()): number {
  const dob = new Date(dobIso);
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** Names used by the analytics map (all of North America) for status colouring. */
export const ALL_NA_REGION_CODES = [
  "CA-AB","CA-BC","CA-MB","CA-NB","CA-NL","CA-NS","CA-NT","CA-NU","CA-ON","CA-PE","CA-QC","CA-SK","CA-YT",
  "US-AL","US-AK","US-AZ","US-AR","US-CA","US-CO","US-CT","US-DE","US-DC","US-FL","US-GA","US-HI","US-ID","US-IL","US-IN","US-IA","US-KS","US-KY","US-LA","US-ME","US-MD","US-MA","US-MI","US-MN","US-MS","US-MO","US-MT","US-NE","US-NV","US-NH","US-NJ","US-NM","US-NY","US-NC","US-ND","US-OH","US-OK","US-OR","US-PA","US-RI","US-SC","US-SD","US-TN","US-TX","US-UT","US-VT","US-VA","US-WA","US-WV","US-WI","US-WY",
] as const;
