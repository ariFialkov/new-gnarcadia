# Launch checklist (bootstrapped)

**Legal (docs/legal/jurisdiction-analysis.md §6 has the paste-ready opinion request)**
- [ ] Engage gaming counsel; obtain written skill-game opinion covering CA, CO, OH (green), MO, NY (yellow), ON, AB, BC, NS (yellow); defer PA until the June-2026 ruling's reach is clear (`US-PA` is `paused` in code).
- [ ] Money-transmission / RPAA / FINTRAC opinion on the wallet model; decide between segregated operating account vs processor-held (FBO) balances.
- [ ] Terms, privacy, responsible-play pages finalised (drafts live in `apps/arcade/src/legal`); bump `TERMS_VERSION`.
- [ ] Per-game skill statements reviewed (manifest `skillStatement`), especially for MO/NY "material degree" tests and the Canadian "systematic resort to chance" test.

**Payments (docs/payments.md)**
- [ ] Underwriting packages sent to Nuvei/Paysafe (cards), Paramount or Payper (Interac), Aeropay (US pay-by-bank); PayPal pre-approval request filed.
- [ ] Implement the chosen adapters in `apps/api/src/providers/payments` (the Nuvei skeleton shows the shape); webhook signature verification mandatory.
- [ ] Rolling reserve and chargeback KPIs in the analytics hub; same-source withdrawals enforced in `createWithdrawal` destination validation.

**Compliance (docs/compliance.md)**
- [ ] `GEO_PROVIDER=ipinfo` (or MaxMind) with VPN detection; mobile cash play requires GPS (`mobile: true` in `/geo/check`); re-check every `GEO_CHECK_TTL_MIN` (default 30) and on every paid entry.
- [ ] `KYC_PROVIDER=didit` (or Veriff) live keys; Tier 2 EDD at > $500 withdrawals / $2,000 US winnings (W-9 collection UI exists; vault TINs with the vendor, not in Postgres).
- [ ] AML policy + compliance officer named; alerting on structuring, rapid deposit-withdraw cycles, multi-accounting (`flags`).
- [ ] Responsible-gaming defaults reviewed (`JURISDICTIONS` deposit caps, cooling-off, self-exclusion), support@ mailbox and complaint SLA published.
- [ ] Data retention + breach-notification runbook (CA/CO/NY 30 days etc.).

**Engineering**
- [ ] Production secrets rotated; `NODE_ENV=production` boot verified (mocks refused).
- [ ] Postgres backups + restore drill; nightly `GET /admin/ledger/reconcile` alert if unbalanced.
- [ ] Realtime server on its own VM once > ~1,500 concurrent sockets; health checks on `/health` for both services.
- [ ] Error tracking (Sentry) in all four apps; uptime monitor; log retention.
- [ ] PWA icons/splash finalised; Lighthouse PWA audit ≥ 90; test install on iOS Safari + Android Chrome.
- [ ] Load test: 200 concurrent duels + 50 async brackets (`scripts/smoke.mjs` is the template).
- [ ] Game review checklist for indie uploads (skill evidence, no external calls, cosmetics-only, IP/content review).

**Go-live sequence**
1. Soft launch in Ontario + Alberta only (flip `status: "live"` in `jurisdictions.ts`), $1–$5 entries, 100 invited players.
2. Add BC, NS, then CA/CO/OH after processor settlement and chargeback data look clean for 30 days.
3. MO/NY after counsel sign-off on the game catalogue; PA stays paused.
