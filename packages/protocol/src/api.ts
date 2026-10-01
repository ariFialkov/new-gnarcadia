/** REST DTOs shared between API, arcade, analytics and CLI. */
import type { Currency } from "./money.js";

export type KycTier = 0 | 1 | 2;
export type KycStatus = "none" | "pending" | "approved" | "rejected" | "review";

export interface UserPublic {
  id: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface UserMe extends UserPublic {
  email: string;
  dob: string;
  country: "CA" | "US" | null;
  region: string | null;        // verified region code, e.g. "CA-ON"
  currency: Currency;
  kycTier: KycTier;
  kycStatus: KycStatus;
  termsVersion: string | null;
  balanceCents: number;
  bonusCents: number;
  limits: { dailyDepositCapCents: number; selfExcludedUntil: string | null; cooldownUntil: string | null };
  geo: { region: string | null; checkedAt: string | null; ok: boolean; reason?: string };
  roles: string[];
}

export interface GameSummary {
  id: string;
  name: string;
  tagline: string | null;
  description: string;
  category: string;
  tags: string[];
  coverUrl: string | null;
  developer: string;
  liveVersion: string | null;
  formats: { format: string; minPlayers: number; maxPlayers: number; entryTiersCents: number[]; rakeBps: number }[];
  stats: { plays24h: number; playersOnline: number; rating: number };
  featured: boolean;
  isNew: boolean;
  status: "draft" | "review" | "live" | "paused";
  createdAt: string;
}

export interface MarketItem {
  id: string;
  sku: string;
  name: string;
  description: string;
  kind: "cosmetic" | "pass" | "bundle";
  slot: string | null;
  gameId: string | null;
  priceCents: number;
  currency: Currency;
  imageUrl: string | null;
  rarity: "common" | "rare" | "epic" | "legendary";
  grants: string[];
  owned?: boolean;
  equipped?: boolean;
}

export interface JoinMatchRequest { gameId: string; format: string; entryCents: number; practice?: boolean; team?: number }
export interface JoinMatchResponse {
  matchId: string;
  playerId: string;
  format: string;
  seed: string;
  entryCents: number;
  rakeBps: number;
  currency: Currency;
  practice: boolean;
  gameUrl: string;           // where the iframe loads the game bundle from
  realtime?: { url: string; roomId: string; ticket: string };
  timeLimitSec: number;
  maxPlayers: number;
}

export interface WalletTxn { id: string; kind: string; deltaCents: number; balanceAfterCents: number; ref: string | null; createdAt: string; status: string }

export interface AnalyticsOverview {
  users: { total: number; new7d: number; dau: number; wau: number; mau: number; kycApproved: number };
  money: { depositsCents: number; withdrawalsCents: number; rakeCents: number; marketplaceCents: number; floatCents: number; currency: Currency }[];
  matches: { total: number; last24h: number; avgEntryCents: number; byFormat: Record<string, number> };
  regions: { code: string; users: number; dau: number; depositsCents: number; rakeCents: number; status: string }[];
  funnel: { signups: number; geoVerified: number; kycApproved: number; deposited: number; played: number; withdrew: number };
  timeseries: { day: string; signups: number; matches: number; rakeCents: number; depositsCents: number }[];
}
