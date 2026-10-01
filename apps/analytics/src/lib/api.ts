import type { AnalyticsOverview, Currency, JurisdictionRule, KycStatus, KycTier } from "@gnarcadia/protocol";

export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:4000";
export const ADMIN_KEY_STORAGE = "gnarcadia.analytics.adminKey";
export const SESSION_STORAGE = "gnarcadia.analytics.session";

export interface AdminSession { accessToken: string; refreshToken: string; email: string; username: string }
export function getSession(): AdminSession | null {
  try { const raw = sessionStorage.getItem(SESSION_STORAGE); return raw ? (JSON.parse(raw) as AdminSession) : null; } catch { return null; }
}
export function setSession(s: AdminSession | null) {
  try { if (s) sessionStorage.setItem(SESSION_STORAGE, JSON.stringify(s)); else sessionStorage.removeItem(SESSION_STORAGE); } catch { /* ignore */ }
}
/** Sign in with an admin account (email/username + password). Rejects non-admin accounts. */
export async function adminLogin(email: string, password: string): Promise<AdminSession> {
  const res = await fetch(`${API_BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email, password }) });
  const body = (await res.json().catch(() => null)) as { accessToken?: string; refreshToken?: string; user?: { email: string; username: string; roles: string[] }; message?: string } | null;
  if (!res.ok || !body?.accessToken || !body.user) throw new ApiError(res.status, body?.message ?? "Sign-in failed", body);
  if (!body.user.roles?.includes("admin")) throw new ApiError(403, "This account is not an administrator.", body);
  const s: AdminSession = { accessToken: body.accessToken, refreshToken: body.refreshToken!, email: body.user.email, username: body.user.username };
  setSession(s);
  return s;
}
let refreshing: Promise<AdminSession | null> | null = null;
async function refreshSession(): Promise<AdminSession | null> {
  const cur = getSession(); if (!cur) return null;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: cur.refreshToken }) });
      if (!res.ok) { setSession(null); return null; }
      const b = (await res.json()) as { accessToken: string; refreshToken: string };
      const next = { ...cur, accessToken: b.accessToken, refreshToken: b.refreshToken }; setSession(next); return next;
    } catch { return null; } finally { refreshing = null; }
  })();
  return refreshing;
}

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

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal, retried = false): Promise<T> {
  const session = getSession();
  const key = getAdminKey();
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers as Record<string, string> | undefined) };
  if (session) headers.Authorization = `Bearer ${session.accessToken}`;
  else if (key) headers["X-Admin-Key"] = key;
  if (init.body) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, `Cannot reach API at ${API_BASE}`);
  }
  if (res.status === 401 && session && !retried) {
    const next = await refreshSession();
    if (next) return request<T>(path, init, signal, true);
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
