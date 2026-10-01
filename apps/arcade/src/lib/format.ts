import { formatCents as protoFormatCents, type Currency } from "@gnarcadia/protocol";

/** Money: integer cents in, locale currency string out. Drops ".00" for whole dollars in compact mode. */
export function money(cents: number | null | undefined, currency: Currency = "CAD", opts: { compact?: boolean; sign?: boolean } = {}): string {
  const c = Number(cents ?? 0);
  const s = protoFormatCents(Math.abs(c), currency, currency === "USD" ? "en-US" : "en-CA");
  const out = opts.compact && c % 100 === 0 ? s.replace(/\.00(?=\D*$)/, "") : s;
  const neg = c < 0 ? "-" : opts.sign && c > 0 ? "+" : "";
  return neg + out;
}

export function pct(bps: number): string {
  const p = bps / 100;
  return (Number.isInteger(p) ? p.toFixed(0) : p.toFixed(1)) + "%";
}

export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function relativeTime(iso: string | number | Date | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(diff);
  const sign = diff > 0 ? -1 : 1;
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return rtf.format(sign * Math.round(abs / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(sign * Math.round(abs / 3_600_000), "hour");
  if (abs < 30 * 86_400_000) return rtf.format(sign * Math.round(abs / 86_400_000), "day");
  return new Date(t).toLocaleDateString();
}

export function dateTime(iso: string | number | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function clock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function initials(name: string): string {
  const words = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Deterministic playful gradient for a string (game ids, usernames). */
export function gradientFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 50 + (h >> 8) % 60) % 360;
  return `linear-gradient(135deg, hsl(${a} 90% 60%), hsl(${b} 95% 55%))`;
}

export const FORMAT_LABELS: Record<string, string> = {
  duel: "1v1 Duel",
  ffa: "Free-for-all",
  teams: "Teams",
  perpetual: "Perpetual lobby",
  async_score: "Score attack",
};
export const formatLabel = (f: string) => FORMAT_LABELS[f] ?? f;

export const CATEGORY_LABELS: Record<string, string> = {
  arcade: "Arcade", puzzle: "Puzzle", action: "Action", sports: "Sports", strategy: "Strategy", racing: "Racing", shooter: "Shooter", card: "Card", trivia: "Trivia", other: "More",
};
export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

export const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]); };
