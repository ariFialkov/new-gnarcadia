import type { AnalyticsOverview, Currency, JurisdictionRule, KycStatus, KycTier } from "@gnarcadia/protocol";

export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:4000";
export const ADMIN_KEY_STORAGE = "gnarcadia.analytics.adminKey";
export const DEFAULT_DEV_KEY = "dev-admin-key";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
  get unauthorized() {
    return this.status === 401 || this.status === 403;
  }
}

export function getAdminKey(): string | null {
  try {
    return localStorage.getItem(ADMIN_KEY_STORAGE);
  } catch {
    return null;
  }
}
export function setAdminKey(key: string | null) {
  try {
    if (key) localStorage.setItem(ADMIN_KEY_STORAGE, key);
    else localStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    /* storage unavailable */
  }
}

type Listener = (err: ApiError) => void;
const unauthorizedListeners = new Set<Listener>();
/** Subscribe to 401/403 responses (used by the app shell to re-prompt for the admin key). */
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const key = getAdminKey();
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers as Record<string, string> | undefined) };
  if (key) headers["X-Admin-Key"] = key;
  if (init.body) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, `Cannot reach API at ${API_BASE}`);
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* no json body */
    }
    const msg = (body as { message?: string; error?: string } | null)?.message ?? (body as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`;
    const err = new ApiError(res.status, msg, body);
    if (err.unauthorized) unauthorizedListeners.forEach((fn) => fn(err));
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- DTOs for endpoints not covered by the protocol package ----

export interface RegionDetail {
  code: string;
  jurisdiction: JurisdictionRule | null;
  users: { total: number; dau: number; wau: number; kycApproved: number; new7d: number; avgAge: number };
  money: { depositsCents: number; withdrawalsCents: number };
  topGames: { id: string; name: string; plays: number; volumeCents: number }[];
  geo: { passed: number; blocked: number; vpn: number };
  activityByHour: number[];
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  region: string | null;
  country: string | null;
  kycTier: KycTier | number;
  kycStatus: KycStatus | string;
  flags: string[];
  roles: string[];
  createdAt: string;
  lastSeenAt: string | null;
}

export interface GameVersionRow {
  id: string;
  gameId: string;
  version: string;
  status: "uploaded" | "approved" | "rejected" | string;
  notes: string | null;
  sizeBytes: number;
  uploadedAt: string;
}

export interface AdminGame {
  id: string;
  name: string;
  developerName: string;
  status: "draft" | "review" | "live" | "paused" | string;
  featured: boolean;
  category: string;
  tags: string[];
  liveVersion: string | null;
  rating: number;
  createdAt: string;
  updatedAt: string;
  versions: GameVersionRow[];
}

export interface Reconciliation {
  currency: Currency;
  userCashTotal: number;
  userBonusTotal: number;
  escrow: number;
  clearing: number;
  revenue: number;
  promo: number;
  balanced: boolean;
  floatCents: number;
}

export interface AuditRow {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export const api = {
  overview: (days: number, signal?: AbortSignal) => request<AnalyticsOverview>(`/admin/analytics/overview?days=${days}`, {}, signal),
  region: (code: string, signal?: AbortSignal) => request<RegionDetail>(`/admin/analytics/regions/${encodeURIComponent(code)}`, {}, signal),
  users: (q = "", signal?: AbortSignal) => request<AdminUser[]>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`, {}, signal),
  setKyc: (id: string, tier: number, status: string) => request<{ ok: true }>(`/admin/users/${id}/kyc`, { method: "POST", body: JSON.stringify({ tier, status }) }),
  setFlags: (id: string, flags: string[]) => request<{ ok: true }>(`/admin/users/${id}/flags`, { method: "POST", body: JSON.stringify({ flags }) }),
  games: (signal?: AbortSignal) => request<AdminGame[]>(`/admin/games`, {}, signal),
  reviewGame: (id: string, body: { version: string; decision: "approve" | "reject"; notes?: string; featured?: boolean }) =>
    request<{ ok: true }>(`/admin/games/${id}/review`, { method: "POST", body: JSON.stringify(body) }),
  reconcile: (signal?: AbortSignal) => request<{ CAD: Reconciliation; USD: Reconciliation }>(`/admin/ledger/reconcile`, {}, signal),
  audit: (signal?: AbortSignal) => request<AuditRow[]>(`/admin/audit`, {}, signal),
};
