/**
 * Typed fetch wrapper for the Gnarcadia API.
 *  - Bearer auth from the token store, transparent refresh-and-retry-once on 401.
 *  - Errors normalised to ApiError {status, code, message, details} (the API returns {error, message, details}).
 *  - Network failures become ApiError(0, "network").
 */
import type { GameManifest, GameSummary, JoinMatchRequest, JoinMatchResponse, JurisdictionRule, MarketItem, UserMe, WalletTxn, Currency, KycStatus } from "@gnarcadia/protocol";
import { lsDel, lsGet, lsSet } from "./storage.ts";

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");
export const API_ORIGIN = new URL(API_URL).origin;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: any) {
    super(message || humanize(code));
    this.name = "ApiError";
  }
  is(code: string) { return this.code === code; }
}
const humanize = (code: string) => code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isApiError(e)) return e.message || fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

// ---------------- tokens ----------------
export interface Tokens { accessToken: string; refreshToken: string }
const TOKENS_KEY = "gn.auth.tokens";
type Listener = () => void;
const listeners = new Set<Listener>();
let tokens: Tokens | null = lsGet<Tokens | null>(TOKENS_KEY, null);

export const tokenStore = {
  get: () => tokens,
  set(t: Tokens | null) { tokens = t; if (t) lsSet(TOKENS_KEY, t); else lsDel(TOKENS_KEY); listeners.forEach((l) => l()); },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
};

// ---------------- dev region (DEV only) ----------------
const DEV_REGION_KEY = "gn.devRegion";
export const devRegion = {
  get: (): string => (import.meta.env.DEV ? lsGet<string>(DEV_REGION_KEY, "") : ""),
  set: (r: string) => { if (r) lsSet(DEV_REGION_KEY, r); else lsDel(DEV_REGION_KEY); },
};

// ---------------- core request ----------------
interface ReqOpts { method?: string; body?: unknown; auth?: boolean; headers?: Record<string, string>; signal?: AbortSignal; keepalive?: boolean; _retried?: boolean }

let refreshing: Promise<boolean> | null = null;
async function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const t = tokenStore.get();
    if (!t?.refreshToken) return false;
    try {
      const r = await fetch(`${API_URL}/auth/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: t.refreshToken }) });
      if (!r.ok) { tokenStore.set(null); return false; }
      const j = (await r.json()) as AuthResponse;
      tokenStore.set({ accessToken: j.accessToken, refreshToken: j.refreshToken });
      return true;
    } catch { return false; } finally { refreshing = null; }
  })();
  return refreshing;
}

export async function request<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const t = tokenStore.get();
  if (opts.auth !== false && t?.accessToken) headers.authorization = `Bearer ${t.accessToken}`;
  const dr = devRegion.get();
  if (dr) headers["x-gn-dev-region"] = dr;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: opts.signal, keepalive: opts.keepalive });
  } catch (e) {
    if ((e as any)?.name === "AbortError") throw e;
    throw new ApiError(0, "network", "Can't reach Gnarcadia right now. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: "bad_response", message: text.slice(0, 200) }; }
  if (res.ok) return data as T;
  const code: string = data?.error ?? (res.status === 401 ? "unauthorized" : res.status === 404 ? "not_found" : "request_failed");
  if (res.status === 401 && opts.auth !== false && !opts._retried && !path.startsWith("/auth/") && t?.refreshToken) {
    if (await refreshTokens()) return request<T>(path, { ...opts, _retried: true });
  }
  if (res.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/signup")) {
    // token truly dead: drop it so the UI falls back to signed-out state.
    if (code !== "bad_credentials") tokenStore.set(null);
  }
  throw new ApiError(res.status, code, data?.message, data?.details);
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};

// ---------------- response shapes not in protocol ----------------
export interface Eligibility { ok: boolean; code?: string; message?: string; details?: any }
export type Me = UserMe & { eligibility: Eligibility };
export interface AuthResponse { accessToken: string; refreshToken: string; user: Me }
export interface SignupInput { email: string; password: string; username: string; dob: string; country: "CA" | "US"; acceptTerms: true; marketingOptIn?: boolean }

export interface OpenLobby { format: string; entryCents: number; n: number; max: number }
export interface LeaderboardRow { userId: string; username: string; avatarUrl: string | null; wins: number; played: number; netCents: number; bestScore: number | null }
export type GameDetail = GameSummary & { manifest: GameManifest | null; openLobbies: OpenLobby[]; leaderboard: LeaderboardRow[] };

export type MatchStatus = "open" | "running" | "settled" | "cancelled" | string;
export interface RosterEntry { playerId: string; username: string; team: number | null; status: string; rank: number | null; score: number | null; payoutCents: number | null; isMe: boolean }
export interface Settlement { grossPoolCents: number; rakeCents: number; payouts: { playerId: string; cents: number }[]; results?: unknown[]; flagged?: string | null; settledAt?: string }
export interface MatchView {
  id: string; gameId: string; format: string; status: MatchStatus; entryCents: number; currency: Currency; rakeBps: number; maxPlayers: number; practice: boolean; seed: string;
  createdAt: string; startedAt: string | null; settledAt: string | null; settlement: Settlement | null; roster: RosterEntry[];
}
export interface MatchHistoryItem { matchId: string; gameId: string; gameName: string; format: string; entryCents: number; currency: Currency; status: MatchStatus; rank: number | null; score: number | null; payoutCents: number | null; joinedAt: string; practice: boolean }

export type DepositMethod = "card" | "interac" | "bank" | "wallet";
export type PayoutMethod = "interac" | "bank" | "card_push" | "wallet";
export interface PaymentIntent { id: string; direction: "deposit" | "withdrawal"; method: string; amountCents: number; feeCents: number; status: "pending" | "succeeded" | "failed" | "reversed" | string; createdAt: string }
export interface WalletInfo {
  currency: Currency; balanceCents: number; bonusCents: number; quickAmountsCents: number[];
  methods: { deposit: DepositMethod[]; payout: PayoutMethod[] }; provider: string;
  limits: { dailyDepositCapCents: number; usedTodayCents: number }; intents: PaymentIntent[];
}
export interface DepositResult { intentId: string; status: "pending" | "succeeded" | "failed"; redirectUrl: string | null }
export interface WithdrawResult { intentId: string; status: "pending" | "succeeded" | "failed" }

export interface GeoCheckResult { ok: boolean; region: string | null; reason?: string; ipRegion: string | null; gpsRegion: string | null; vpn: boolean; checkedAt: string }
export interface KycStartResult { status: KycStatus | "approved" | "pending"; url?: string | null; caseId?: string; tier?: number }
export interface PublicProfile { id: string; username: string; avatarUrl: string | null; createdAt: string; stats: { played: number; wins: number; netCents: number }; error?: string }
export interface AnalyticsEvent { event: string; props?: Record<string, unknown>; at?: number }

// ---------------- endpoints ----------------
export const api = {
  // auth
  signup: (input: SignupInput) => request<AuthResponse>("/auth/signup", { body: input, auth: false }),
  login: (email: string, password: string) => request<AuthResponse>("/auth/login", { body: { email, password }, auth: false }),
  logout: (refreshToken?: string) => request<{ ok: boolean }>("/auth/logout", { body: { refreshToken } }).catch(() => ({ ok: false })),

  // me
  me: () => request<Me>("/me"),
  patchMe: (b: { avatarUrl?: string | null; legalName?: string; address?: Record<string, string> }) => request<Me>("/me", { method: "PATCH", body: b }),
  myMatches: () => request<MatchHistoryItem[]>("/me/matches"),
  geoCheck: (b: { lat?: number; lng?: number; accuracyM?: number; mobile?: boolean }) => request<GeoCheckResult>("/geo/check", { body: b }),
  jurisdictions: () => request<Record<string, JurisdictionRule>>("/jurisdictions", { auth: false }),
  termsCurrent: () => request<{ version: string; url: string }>("/terms/current", { auth: false }),
  termsAccept: (version: string) => request<{ ok: boolean }>("/terms/accept", { body: { version } }),
  kycStart: (b: { tier: 1 | 2; legalName?: string; address?: Record<string, string> }) => request<KycStartResult>("/kyc/start", { body: b }),
  taxInfo: (b: { attestW9: true; legalName: string; tinLast4: string }) => request<{ ok: boolean }>("/me/tax-info", { body: b }),
  setDepositLimit: (capCents: number) => request<{ applied: boolean; capCents: number; appliesAt?: string }>("/me/limits/deposit", { body: { capCents } }),
  selfExclude: (days: number) => request<{ ok?: boolean; until?: string }>("/me/self-exclude", { body: { days } }),
  cooldown: (hours: number) => request<{ ok?: boolean; until?: string }>("/me/cooldown", { body: { hours } }),
  publicProfile: (username: string) => request<PublicProfile>(`/profile/${encodeURIComponent(username)}`, { auth: false }),

  // games
  games: (p: { sort?: "popular" | "new" | ""; category?: string; q?: string } = {}) => request<GameSummary[]>(`/games${qs(p)}`, { auth: false }),
  game: (id: string) => request<GameDetail>(`/games/${encodeURIComponent(id)}`, { auth: false }),
  leaderboard: (id: string) => request<LeaderboardRow[]>(`/games/${encodeURIComponent(id)}/leaderboard`, { auth: false }),

  // matches
  joinMatch: (b: JoinMatchRequest) => request<JoinMatchResponse>("/matches/join", { body: b }),
  match: (id: string, signal?: AbortSignal) => request<MatchView>(`/matches/${encodeURIComponent(id)}`, { signal }),
  submitScore: (id: string, b: { score: number; durationMs: number; inputLogHash?: string; inputLog?: unknown[] }) => request<{ ok: boolean }>(`/matches/${encodeURIComponent(id)}/submit`, { body: b }),
  leaveMatch: (id: string) => request<{ ok: boolean }>(`/matches/${encodeURIComponent(id)}/leave`, { body: {} }),

  // market
  marketItems: () => request<MarketItem[]>("/market/items"),
  inventory: () => request<MarketItem[]>("/market/inventory"),
  buyItem: (id: string) => request<{ ok: boolean }>(`/market/items/${encodeURIComponent(id)}/buy`, { body: {} }),
  equipItem: (id: string, equipped: boolean) => request<{ ok: boolean }>(`/market/items/${encodeURIComponent(id)}/equip`, { body: { equipped } }),

  // wallet
  wallet: () => request<WalletInfo>("/wallet"),
  transactions: () => request<WalletTxn[]>("/wallet/transactions"),
  deposit: (b: { amountCents: number; method: DepositMethod }) => request<DepositResult>("/wallet/deposit", { body: b }),
  withdraw: (b: { amountCents: number; method: PayoutMethod; destination: Record<string, string> }) => request<WithdrawResult>("/wallet/withdraw", { body: b }),

  // analytics
  analytics: (sessionId: string, events: AnalyticsEvent[], keepalive = false) => request<{ ok: boolean }>("/analytics/events", { body: { sessionId, events }, keepalive }),
};

/** Gate codes the API can return from requireCashEligible, in resolution order. */
export const GATE_CODES = ["terms_required", "geo_required", "geo_blocked", "underage", "self_excluded", "cooldown", "account_frozen", "kyc_required"] as const;
export type GateCode = (typeof GATE_CODES)[number];
export const isGateCode = (c: string | undefined): c is GateCode => !!c && (GATE_CODES as readonly string[]).includes(c);
