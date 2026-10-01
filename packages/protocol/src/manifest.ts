import { z } from "zod";

/**
 * gnarcadia.json — the game manifest every uploaded build must contain at its root.
 * Validated by the CLI (`gnarcadia validate`) and again by the API on upload.
 */

export const MATCH_FORMATS = ["ffa", "teams", "perpetual", "async_score", "duel"] as const;
export type MatchFormat = (typeof MATCH_FORMATS)[number];

export const FORMAT_DESCRIPTIONS: Record<MatchFormat, string> = {
  duel: "1v1 head-to-head. Both players pay the entry; winner takes the net pool.",
  ffa: "Classic free-for-all. N players, one round, ranked finish, payout table by rank.",
  teams: "Team vs team. Entry per player, winning team splits the net pool.",
  perpetual: "Perpetual lobby. Players spawn in/out at will; entry becomes a bounty; eliminating a player claims their bounty; leaving cashes out.",
  async_score: "Asynchronous score attack. Each entrant plays the same seeded round solo; highest scores win when the bracket fills or times out.",
};

export const FormatConfigSchema = z.object({
  format: z.enum(MATCH_FORMATS),
  minPlayers: z.number().int().min(1).max(64),
  maxPlayers: z.number().int().min(1).max(64),
  /** Entry fee tiers offered in the lobby UI, in cents of the player's currency. */
  entryTiersCents: z.array(z.number().int().min(0).max(100_000)).min(1),
  /** Rake in basis points of the gross pool. Max 25%. */
  rakeBps: z.number().int().min(0).max(2500).default(1000),
  /** Payout table in bps of the NET pool by rank (ffa/async_score/duel). Must sum to 10000. */
  payoutBps: z.array(z.number().int().min(0).max(10_000)).optional(),
  /** Team count for 'teams'. */
  teams: z.number().int().min(2).max(8).optional(),
  /** Max match duration in seconds (hard stop; results computed from state). */
  maxDurationSec: z.number().int().min(10).max(3600).default(300),
  /** Seconds to wait for more players once minPlayers reached. */
  fillWaitSec: z.number().int().min(0).max(600).default(20),
  /** async_score: seconds an entrant has to submit after starting. */
  roundTimeLimitSec: z.number().int().min(10).max(3600).optional(),
  /** perpetual: fraction (bps) of a victim's bounty paid to the eliminator (rest returns to pool/rake). */
  bountyBps: z.number().int().min(0).max(10_000).optional(),
});
export type FormatConfig = z.infer<typeof FormatConfigSchema>;

export const GameManifestSchema = z.object({
  /** Stable slug, lowercase, [a-z0-9-], unique across the platform. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,40}$/),
  name: z.string().min(2).max(60),
  /** Semver string. */
  version: z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/),
  sdkVersion: z.string().default("0.1"),
  description: z.string().max(400).default(""),
  tagline: z.string().max(80).optional(),
  developer: z.string().min(1).max(80),
  category: z.enum(["arcade", "puzzle", "action", "sports", "strategy", "racing", "shooter", "card", "trivia", "other"]).default("arcade"),
  tags: z.array(z.string().max(20)).max(10).default([]),
  /** Entry HTML relative to bundle root (client). */
  entry: z.string().default("index.html"),
  /** Optional server module relative to bundle root (ESM, exports default defineGame(...)). Required for realtime formats. */
  server: z.string().optional(),
  /** Cover image relative to bundle root. */
  cover: z.string().optional(),
  orientation: z.enum(["any", "landscape", "portrait"]).default("any"),
  /** Pixel aspect hint for the iframe (w:h). */
  aspect: z.string().regex(/^\d+:\d+$/).optional(),
  formats: z.array(FormatConfigSchema).min(1),
  /** Declared skill statement for the legal file (why outcomes are determined by skill). */
  skillStatement: z.string().min(20).max(1000),
  /** Declares whether the game uses randomness; if yes, it MUST be seeded by the platform identically for all entrants. */
  randomness: z.enum(["none", "seeded_shared"]).default("none"),
  /** Marketplace cosmetic slots the game renders (e.g. "skin", "trail"). */
  cosmeticSlots: z.array(z.string().max(20)).max(10).default([]),
  /** Minimum build size checks etc. */
  permissions: z.object({
    fullscreen: z.boolean().default(true),
    pointerLock: z.boolean().default(false),
    gamepad: z.boolean().default(false),
  }).default({}),
});
export type GameManifest = z.infer<typeof GameManifestSchema>;

/** Extra invariants zod can't express declaratively. Returns a list of problems (empty = ok). */
export function validateManifestInvariants(m: GameManifest): string[] {
  const problems: string[] = [];
  for (const f of m.formats) {
    if (f.minPlayers > f.maxPlayers) problems.push(`${f.format}: minPlayers > maxPlayers`);
    if (f.format === "duel" && (f.minPlayers !== 2 || f.maxPlayers !== 2)) problems.push("duel must be exactly 2 players");
    if (f.format === "teams" && !f.teams) problems.push("teams format requires 'teams' count");
    if (f.format === "teams" && f.teams && f.maxPlayers % f.teams !== 0) problems.push("teams: maxPlayers must be divisible by teams");
    if (f.format === "perpetual" && f.bountyBps === undefined) problems.push("perpetual format requires bountyBps");
    if (f.format === "async_score" && !f.roundTimeLimitSec) problems.push("async_score requires roundTimeLimitSec");
    if (["ffa", "async_score", "duel"].includes(f.format)) {
      const table = f.payoutBps ?? (f.format === "duel" ? [10_000] : undefined);
      if (!table) problems.push(`${f.format}: payoutBps required`);
      else {
        const sum = table.reduce((a, b) => a + b, 0);
        if (sum !== 10_000) problems.push(`${f.format}: payoutBps must sum to 10000 (got ${sum})`);
        if (table.length > f.maxPlayers) problems.push(`${f.format}: payoutBps has more ranks than maxPlayers`);
      }
    }
    if (["ffa", "teams", "perpetual", "duel"].includes(f.format) && !m.server) problems.push(`${f.format} is a realtime format and requires a 'server' module`);
    if (f.entryTiersCents.some((c) => c % 25 !== 0)) problems.push(`${f.format}: entry tiers must be multiples of 25 cents`);
  }
  if (m.randomness === "none" && /random|dice|loot|gacha/i.test(m.description)) problems.push("description mentions randomness but manifest declares randomness: none");
  return problems;
}

export const defaultPayoutTable = (players: number): number[] => {
  if (players <= 2) return [10_000];
  if (players <= 4) return [7000, 3000];
  if (players <= 8) return [5000, 3000, 2000];
  return [4000, 2500, 1500, 1000, 1000];
};
