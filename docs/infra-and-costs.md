# Infrastructure & cost plan

Goal: prove the concept with 2k–5k players for roughly the price of a few streaming subscriptions, with no component that
bills per-user or leaks cost when idle.

## Launch topology (~$35–60 / month before vendor fees)

| Component | Where | Est. cost | Notes |
|---|---|---|---|
| `apps/arcade`, `apps/analytics` | Cloudflare Pages (or Netlify/Vercel free) | $0 | Static builds; PWA service worker; custom domains `gnarcadia.com`, `hub.gnarcadia.com` |
| `apps/api` | Fly.io shared-cpu-1x 1 GB **or** Hetzner CX22 | $5–10 | Node 22, `pnpm --filter @gnarcadia/api start`; put behind Cloudflare (proxy, WAF, rate limits) |
| `apps/realtime` | Same VM at first, separate VM when > ~1,500 concurrent sockets | $0–10 | Needs WebSocket passthrough (Cloudflare supports it); sticky not required (rooms keyed by `roomId`) |
| Postgres | Neon (free → Launch $19) or Supabase (free → Pro $25) or Fly Postgres | $0–25 | Point `DATABASE_URL`; daily backups on the paid tier; `pg_dump` cron on the free tier |
| Game bundles | API disk (volume 10 GB ≈ $1.50) → Cloudflare R2 | $0–2 | Same `/g/:id/:version/` URLs; R2 has free egress |
| Email (magic links, receipts) | Resend / Postmark free tier | $0 | Not wired yet |
| Monitoring | Fly metrics + UptimeRobot + Sentry free | $0 | |
| Domain / DNS | Cloudflare | ~$1 | |

**Total ≈ $10–50/month.** The previous AWS stack (GameLift + Lambda + API Gateway + RDS + NAT) had fixed floors (NAT gateway,
RDS, GameLift fleets) that bill with zero users; nothing here does except the one VM.

## Vendor fees that scale with use (see docs/payments.md and docs/compliance.md)

| Vendor | Launch choice | Rough cost |
|---|---|---|
| Payments | Nuvei/Paysafe cards + Interac aggregator (Paramount/Payper) + Aeropay (US bank) | ~2.5–3.5% + fixed/min fees; rolling reserve 5–10% |
| Geo | ipinfo Core ($49) or MaxMind GeoIP2 ($134) + IPQS (~$99) + HTML5 GPS cross-check (free) | ~$50–280/mo; Xpoint/Locance later |
| KYC | Didit (free tier) → Veriff/Sumsub | $0–2 per verification |
| Tax forms | Manual W-9 collection → Tax1099/Track1099 at scale | ~$3/form |

## Environments

- **dev**: `pnpm dev`, PGlite, all mocks. Nothing to sign up for.
- **staging**: same as prod but `GEO_PROVIDER=ipinfo` sandbox keys, `KYC_PROVIDER=didit` sandbox, `PAYMENT_PROVIDER=nuvei` test
  merchant, `NODE_ENV=production` (mocks are refused), seed disabled.
- **prod**: secrets via the host's secret store; `JWT_SECRET`, `INTERNAL_SECRET`, `ADMIN_API_KEY`, `DEV_API_KEY` all ≥ 32 random
  bytes; `CORS_ORIGINS` set to the real origins; `PUBLIC_*_URL` set; Postgres backups verified; `TERMS_VERSION` bumped on
  every terms change (forces re-acceptance).

## Deploy (Fly.io example)

```bash
# API
cd apps/api && fly launch --no-deploy --name gnarcadia-api && fly secrets set JWT_SECRET=… INTERNAL_SECRET=… ADMIN_API_KEY=… DEV_API_KEY=… DATABASE_URL=… GEO_PROVIDER=ipinfo IPINFO_TOKEN=… KYC_PROVIDER=didit DIDIT_API_KEY=… PAYMENT_PROVIDER=nuvei NODE_ENV=production
fly volumes create storage --size 10 && fly deploy
# Realtime
cd apps/realtime && fly launch --no-deploy --name gnarcadia-rt && fly secrets set JWT_SECRET=… INTERNAL_SECRET=… API_INTERNAL_URL=https://gnarcadia-api.internal:4000 NODE_ENV=production && fly deploy
# Arcade / analytics: `pnpm --filter @gnarcadia/arcade build` → upload dist/ to Cloudflare Pages with VITE_API_URL set
```

Dockerfiles are intentionally omitted until the host is chosen; both apps are single `node dist/index.js` processes
(`pnpm build` first; copy `migrations/` and `data/` with the API as its build script does).

## Capacity notes

- API: Fastify handles ~5–10k simple req/s per core; the hot path (`/matches/join`) does ~6 queries. 5k DAU is idle load.
- Realtime: each room ticks at 20–30 Hz in a worker; snapshots at 10–15 Hz × players. A 2-vCPU VM comfortably runs ~150
  concurrent 2–8 player rooms or ~20 perpetual 24-player lobbies. Shard by game when a single game's worker saturates a core.
- Postgres: ledger writes are the only contention; `SELECT … FOR UPDATE` per account keeps it correct. Free tiers (0.5 GB) last
  months at this scale; `analytics_events` is the table to prune/partition first.

## Backups & retention

Nightly `pg_dump` to R2 (encrypted), 35-day rotation; ledger, matches, KYC cases, geo checks and terms acceptances are retained
≥ 5 years (AML/consumer-protection expectations) — never hard-delete those tables; anonymise user PII on account deletion instead.
