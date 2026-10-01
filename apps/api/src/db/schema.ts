import { pgTable, text, integer, bigint, boolean, timestamp, jsonb, date, index, uniqueIndex, doublePrecision } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  username: text("username").notNull().unique(),
  dob: date("dob").notNull(),
  country: text("country"),
  region: text("region"),
  currency: text("currency").notNull().default("CAD"),
  kycTier: integer("kyc_tier").notNull().default(0),
  kycStatus: text("kyc_status").notNull().default("none"),
  termsVersion: text("terms_version"),
  roles: jsonb("roles").$type<string[]>().notNull().default([]),
  avatarUrl: text("avatar_url"),
  dailyDepositCapCents: integer("daily_deposit_cap_cents").notNull().default(50_000),
  pendingDepositCapCents: integer("pending_deposit_cap_cents"),
  pendingDepositCapAt: timestamp("pending_deposit_cap_at", { withTimezone: true }),
  selfExcludedUntil: timestamp("self_excluded_until", { withTimezone: true }),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  taxIdCollected: boolean("tax_id_collected").notNull().default(false),
  taxIdEncrypted: text("tax_id_encrypted"),
  legalName: text("legal_name"),
  address: jsonb("address").$type<Record<string, string>>(),
  flags: jsonb("flags").$type<string[]>().notNull().default([]),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const geoChecks = pgTable("geo_checks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  ip: text("ip"),
  ipRegion: text("ip_region"),
  gpsRegion: text("gps_region"),
  lat: doublePrecision("lat"), lng: doublePrecision("lng"), accuracyM: doublePrecision("accuracy_m"),
  vpn: boolean("vpn").notNull().default(false),
  ok: boolean("ok").notNull(),
  region: text("region"),
  reason: text("reason"),
  provider: text("provider"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("geo_checks_user_idx").on(t.userId, t.createdAt)]);

export const kycCases = pgTable("kyc_cases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  tierRequested: integer("tier_requested").notNull(),
  status: text("status").notNull().default("pending"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const termsAcceptances = pgTable("terms_acceptances", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  version: text("version").notNull(),
  ip: text("ip"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Double-entry ledger. Every balance is the sum of its entries. */
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  ownerType: text("owner_type").notNull(),  // user | match | platform
  ownerId: text("owner_id").notNull(),      // user id | match id | 'platform'
  key: text("key").notNull(),               // user: cash|bonus ; match: escrow ; platform: clearing|revenue|promo
  currency: text("currency").notNull(),
  balanceCents: bigint("balance_cents", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("accounts_owner_key_cur").on(t.ownerType, t.ownerId, t.key, t.currency)]);

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("posted"),
  currency: text("currency").notNull(),
  userId: text("user_id"),
  ref: text("ref"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("txn_user_idx").on(t.userId, t.createdAt)]);

export const ledgerEntries = pgTable("ledger_entries", {
  id: text("id").primaryKey(),
  txnId: text("txn_id").notNull().references(() => transactions.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  deltaCents: bigint("delta_cents", { mode: "number" }).notNull(),
  balanceAfterCents: bigint("balance_after_cents", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ledger_account_idx").on(t.accountId, t.createdAt)]);

export const paymentIntents = pgTable("payment_intents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  direction: text("direction").notNull(), // deposit | withdrawal
  method: text("method").notNull(),
  amountCents: integer("amount_cents").notNull(),
  feeCents: integer("fee_cents").notNull().default(0),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("pending"), // pending | succeeded | failed | reversed | cancelled
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("pi_user_idx").on(t.userId, t.createdAt), index("pi_provider_ref_idx").on(t.provider, t.providerRef)]);

export const games = pgTable("games", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  developerUserId: text("developer_user_id"),
  developerName: text("developer_name").notNull().default(""),
  status: text("status").notNull().default("draft"), // draft | review | live | paused
  featured: boolean("featured").notNull().default(false),
  category: text("category").notNull().default("arcade"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  description: text("description").notNull().default(""),
  tagline: text("tagline"),
  coverUrl: text("cover_url"),
  liveVersion: text("live_version"),
  rating: doublePrecision("rating").notNull().default(4.5),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gameVersions = pgTable("game_versions", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull().references(() => games.id),
  version: text("version").notNull(),
  manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
  storagePath: text("storage_path").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  status: text("status").notNull().default("uploaded"), // uploaded | approved | rejected
  notes: text("notes"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("game_versions_unique").on(t.gameId, t.version)]);

export const devKeys = pgTable("dev_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  label: text("label").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const matches = pgTable("matches", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull().references(() => games.id),
  gameVersion: text("game_version").notNull(),
  format: text("format").notNull(),
  country: text("country").notNull(),
  currency: text("currency").notNull(),
  entryCents: integer("entry_cents").notNull(),
  rakeBps: integer("rake_bps").notNull(),
  seed: text("seed").notNull(),
  status: text("status").notNull().default("open"), // open | running | settled | cancelled
  practice: boolean("practice").notNull().default(false),
  roomId: text("room_id").notNull(),
  maxPlayers: integer("max_players").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  settlement: jsonb("settlement").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
}, (t) => [index("matches_open_idx").on(t.gameId, t.format, t.status, t.country, t.entryCents)]);

export const matchPlayers = pgTable("match_players", {
  id: text("id").primaryKey(),
  matchId: text("match_id").notNull().references(() => matches.id),
  userId: text("user_id").notNull().references(() => users.id),
  playerId: text("player_id").notNull(),
  team: integer("team"),
  entryTxnId: text("entry_txn_id"),
  status: text("status").notNull().default("joined"), // joined | left | finished | refunded
  rank: integer("rank"),
  score: doublePrecision("score"),
  payoutCents: integer("payout_cents"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }),
  inputLogHash: text("input_log_hash"),
  inputLog: jsonb("input_log"),
  region: text("region"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("match_players_unique").on(t.matchId, t.userId), index("match_players_user_idx").on(t.userId, t.joinedAt)]);

export const marketItems = pgTable("market_items", {
  id: text("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  kind: text("kind").notNull().default("cosmetic"),
  slot: text("slot"),
  gameId: text("game_id"),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull(),
  imageUrl: text("image_url"),
  rarity: text("rarity").notNull().default("common"),
  grants: jsonb("grants").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventory = pgTable("inventory", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  itemId: text("item_id").notNull().references(() => marketItems.id),
  equipped: boolean("equipped").notNull().default(false),
  acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("inventory_unique").on(t.userId, t.itemId)]);

export const analyticsEvents = pgTable("analytics_events", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  event: text("event").notNull(),
  props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
  region: text("region"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("events_idx").on(t.event, t.createdAt), index("events_user_idx").on(t.userId, t.createdAt)]);

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
