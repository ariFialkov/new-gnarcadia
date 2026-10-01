# Gnarcadia

A bootstrapped, browser-first (PWA) arcade for **real-money skill-based multiplayer games**. Players enter lobbies for a cash
entry fee, compete on skill, and the prize pool (minus a disclosed platform fee) is paid to the winners. No chance, no house
edge on outcomes, geo-fenced to the jurisdictions in `packages/protocol/src/jurisdictions.ts`.

> **Status:** v0.1 — full vertical slice running locally with zero external services. See [docs/architecture.md](docs/architecture.md)
> for the design, [docs/sdk.md](docs/sdk.md) to start building games, and [docs/legal/jurisdiction-analysis.md](docs/legal/jurisdiction-analysis.md)
> + [docs/payments.md](docs/payments.md) + [docs/compliance.md](docs/compliance.md) before launch.

## What's in the box

| Path | What | Stack |
|---|---|---|
| `apps/arcade` | Player PWA: games, marketplace, profile, wallet, auth, geo/KYC/terms gates, game runner | React 19 · Vite · vite-plugin-pwa |
| `apps/api` | Accounts, double-entry wallet ledger, matchmaking + settlement, marketplace, KYC/geo gates, dev upload pipeline, admin analytics | Fastify 5 · Drizzle · Postgres (embedded PGlite in dev) |
| `apps/realtime` | Authoritative multiplayer room server; game server modules run in isolated worker threads | Node `ws` · worker_threads |
| `apps/analytics` | Internal analytics hub: North America map, dashboards, ops tools | React · d3 |
| `packages/sdk` | Browser game SDK (`@gnarcadia/sdk`, 17 KB) — iframe bridge, seeded RNG, realtime client, standalone dev mode | TypeScript |
| `packages/sdk-server` | `defineGame()` contract + deterministic room runtime (FFA, duel, teams, perpetual, async score) | TypeScript |
| `packages/cli` | `gnarcadia init / dev / validate / pack / publish / status` | TypeScript · esbuild |
| `packages/protocol` | Shared types, manifest schema, wire protocols, jurisdiction rules, money helpers | TypeScript · zod |
| `examples/games` | Tap Rush (async score attack), Pong Duel (realtime 1v1), Blob Royale (perpetual lobby) | plain HTML/JS |
| `sdk/unity` | Unity WebGL bridge (reference) | C# · jslib |
| `docs/` | Legal analysis, payments strategy, compliance model, architecture, SDK guide, infra & costs, launch checklist | — |

## Run it (5 minutes, no accounts needed)

```bash
pnpm install
pnpm build            # builds protocol, sdk, sdk-server, cli (apps build too; optional for dev)
cp .env.example .env  # defaults are fine for local dev
pnpm dev              # api :4000 · realtime :4100 · arcade :5173 · analytics :5174
```

First boot creates an embedded Postgres in `apps/api/.pglite`, seeds demo players/matches across the launch regions,
and publishes the three example games. Logins: `admin@gnarcadia.local / password123`, `dev@gnarcadia.local / password123`.
Analytics hub admin key: `dev-admin-key`. In dev the geo provider is mocked (`GEO_DEV_REGION`, or header `X-GN-Dev-Region`),
KYC auto-approves, and the payment provider credits deposits instantly.

End-to-end check (with `pnpm dev` running): `pnpm smoke` — signs up two players, verifies location, passes KYC, deposits,
plays a live Pong Duel over WebSocket to settlement, cashes out of a perpetual lobby, and reconciles the ledger.

## Build a game in 60 seconds

```bash
pnpm gnarcadia init my-game --template realtime   # or: async | perpetual
cd my-game && pnpm gnarcadia dev                   # http://localhost:5180 with hot reload
pnpm gnarcadia publish --promote                   # appears in the arcade immediately
```

See [docs/sdk.md](docs/sdk.md).

## Production shape (cheap)

Arcade + analytics on Cloudflare Pages (free) · API + realtime on one or two small VMs (Fly.io / Hetzner, ~$10–25/mo) ·
Postgres on Neon/Supabase (free → $19/mo) · game bundles on the API disk, then R2 (free egress). Target under **$60/month**
before payment/KYC/geo vendor fees. Details and the scale-out path in [docs/infra-and-costs.md](docs/infra-and-costs.md).

## Repository conventions

- All money is integer cents; every balance is the sum of ledger entries; every settlement is one idempotent transaction.
- Anything a player's outcome depends on is server-authoritative. Clients send inputs, never results (async score attack is
  the one exception, mitigated by shared seeds, input logs, duration checks and anomaly review).
- Jurisdiction rules live in one file, reviewed by counsel; the API refuses to boot with mock providers in production.
