# Architecture

Gnarcadia is a monorepo of four deployables and four packages. The design goal is **"$50/month until it isn't"**: every
component runs on commodity hosting, has no per-seat vendor cost, and can be swapped for a managed service behind an
interface when (if) growth demands it.

```
 ┌───────────────┐   HTTPS/JSON    ┌──────────────────┐  HMAC-signed   ┌──────────────────────┐
 │  Arcade PWA   │ ──────────────► │   API (Fastify)  │ ◄───────────── │  Realtime (ws rooms) │
 │  React/Vite   │                 │  ledger · matches│   /internal    │  worker per game     │
 │  game runner  │                 │  games · market  │                │  RoomRuntime         │
 │   └ iframe ───┼── postMessage ─►│  kyc · geo · pay │                └──────────┬───────────┘
 │     (game +   │                 └────────┬─────────┘                           │ WebSocket (ticket JWT)
 │      SDK)  ◄──┼───────────────────────────┼───────────────────────────────────────┘
 └───────────────┘                           │ Drizzle
                                    ┌────────▼─────────┐        ┌──────────────────┐
                                    │ Postgres         │        │ Analytics hub    │──► /admin/* (API)
                                    │ (PGlite in dev)  │        │ React · d3 map   │
                                    └──────────────────┘        └──────────────────┘
```

## Key decisions

| Decision | Why |
|---|---|
| **Hand-rolled WebSocket room server** instead of GameLift / Colyseus / Nakama | ~700 lines you fully own; one $10 VM handles thousands of sockets; no per-DAU pricing; the SDK stays tiny. Scale by adding VMs and sharding rooms by `roomId` (the API already hands out `realtime.url`). |
| **Game server code in `worker_threads`, one worker per game@version** | Crash/CPU isolation between games without the complexity of containers-per-match. Indie uploads later: move the worker to `isolated-vm` or a microVM; the message protocol doesn't change. |
| **Games run in a sandboxed iframe, talk to the host only via postMessage** | Game code never sees user tokens; a malicious bundle can't call the API as the player. Realtime tickets are handed over only on request and are match-scoped JWTs. |
| **Double-entry ledger in Postgres, integer cents** | Auditable money. User cash → match escrow → winners + revenue, one idempotent transaction per step. `GET /admin/ledger/reconcile` must always be balanced. |
| **Embedded Postgres (PGlite) in dev, real Postgres in prod** | Zero-setup `pnpm dev`; same SQL, same Drizzle queries; no "works on SQLite, breaks on Postgres" drift. |
| **Provider adapters** (`PaymentProvider`, `GeoProvider`, `KycProvider`) | Swap Nuvei/Paysafe/Aeropay, ipinfo/MaxMind/Xpoint, Didit/Veriff behind stable interfaces. Mocks make the whole product runnable offline; the API refuses mocks in production. |
| **Jurisdiction rules in one file** | `packages/protocol/src/jurisdictions.ts` is the single legal switchboard (status, min age, caps, tax thresholds). Changes are code-reviewed, ideally with counsel. |
| **Async score attack as a first-class format** | Most real-money skill apps (Skillz, WorldWinner) run seeded solo rounds compared asynchronously. It needs no realtime server and fills brackets without simultaneous players — ideal for a 2k–5k community. |

## Money flow

1. **Deposit**: processor webhook → `completeDeposit` → ledger `clearing → user.cash`.
2. **Entry**: `POST /matches/join` → gates (terms, fresh geo, age, KYC, RG limits, entry cap) → `user.cash → match.escrow` in the
   same request. A player is never in a cash match without a locked stake.
3. **Settlement** (realtime: room server posts results; async: janitor when bracket completes) → one transaction
   `escrow → winners (payout table / team split / cash-outs) + revenue (rake)`. Ties split; practice matches move no money.
4. **Perpetual lobbies**: entry = bounty. `ctx.eliminate(victim, killer)` moves `bountyBps` of the victim's bounty to the killer's
   bank; eliminated players keep their bank; `leave` cashes out bank + remaining bounty immediately (`/internal/matches/:id/cashout`).
   When the room closes, whatever is left in escrow is forfeited bounty = revenue.
5. **Withdrawal**: debit `user.cash → clearing` first, then instruct the processor; failures reverse. US winners past the
   $2,000 1099 threshold must have tax info on file.
6. **Refunds**: leaving an un-started lobby, lobbies that never fill, zombie matches after a crash — all refund escrow → cash.

## Request lifecycle for a realtime match

```
join ──► API creates/opens match, debits escrow, signs ticket {sub, mid, pid, rid, gid, gv, fmt, name, cos, entry, practice}
     ──► arcade loads game iframe, game SDK says hello, host sends init (no secrets)
     ──► game asks for ticket → host hands it over → SDK opens ws → {t:"join", ticket}
     ──► realtime verifies JWT, lazily creates Room: /internal/matches/:id/describe → ensures worker for game@version
         (server.js fetched once from API and cached; "dev" version is fetched from `gnarcadia dev` every time)
     ──► RoomRuntime: waiting → countdown → playing (tick loop, snapshots 10–15 Hz, inputs sequenced + flood-limited)
     ──► game calls ctx.end(results) or time/last-standing rule → effects: results → /internal/matches/:id/settle
     ──► API settles ledger, marks match, broadcasts results to clients, room closes after 3 s
```

## Anti-cheat posture

- Realtime formats: fully server-authoritative; clients only send inputs; inputs are validated by the game's `onInput`
  (throw to reject; 50 rejections = kick) and rate-limited to 120/s per connection.
- Async format: shared deterministic seed (`SeededRandom`), per-round deadline, duration sanity check, input log + FNV hash
  stored per submission for replay/anomaly review; players flagged by settlement anomalies get `review_settlement`.
- One active entry per user per game/format; matches pooled per country/currency; no cross-border pools.
- Device/behavioural signals (velocity of deposits, multi-accounting) are left to the analytics events + `flags` for now.

## Scaling path (when 5k players stop being a side project)

| Component | Now | Next |
|---|---|---|
| API | 1 VM, PGlite/Neon | 2–3 VMs behind a load balancer, managed Postgres with read replica |
| Realtime | 1 VM, all rooms | N VMs; API assigns `realtime.url` by region/load; sticky by `roomId` |
| Game bundles | API disk | Cloudflare R2 + CDN, same `/g/:id/:version/` paths |
| Geo | ipinfo + HTML5 GPS cross-check | Xpoint / Locance, then GeoComply |
| KYC | Didit / Veriff | Add Trulioo non-doc for Canada, EDD vendor at Tier 2 |
| Payments | Nuvei/Paysafe + Interac aggregator + Aeropay | Add PayPal (if approved), Play+ style wallet, FBO custody |
