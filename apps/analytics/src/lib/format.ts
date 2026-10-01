import type { Currency } from "@gnarcadia/protocol";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US");

/** Cents -> "$1,234.56" with the currency code suffix (CAD/USD). */
export function money(cents: number, currency: Currency | string = "CAD", opts: { compact?: boolean; code?: boolean } = {}): string {
  const v = (cents ?? 0) / 100;
  const cur = currency === "USD" || currency === "CAD" ? currency : "CAD";
  let s: string;
  if (opts.compact && Math.abs(v) >= 10_000) {
    s = "$" + compact.format(v);
  } else {
    s = new Intl.NumberFormat("en-US", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol" }).format(v);
  }
  return opts.code === false ? s : `${s} ${cur}`;
}

export function num(n: number | null | undefined): string {
  return whole.format(n ?? 0);
}

export function numCompact(n: number | null | undefined): string {
  const v = n ?? 0;
  return Math.abs(v) >= 10_000 ? compact.format(v) : whole.format(v);
}

export function pct(part: number, total: number, digits = 1): string {
  if (!total) return "–";
  return `${((part / total) * 100).toFixed(digits)}%`;
}

export function dateShort(iso: string | Date | null | undefined): string {
  if (!iso) return "–";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function dateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "–";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return String(iso);
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
