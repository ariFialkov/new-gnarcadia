# Deploying gnarcadia.com (one VM, one command, rebuild on push)

Everything runs on a single small Linux VM behind [Caddy](https://caddyserver.com) (automatic HTTPS). Rebuilding after a code
change is `scripts/deploy.sh` on the server, or automatic on every push to `main` once the GitHub Action is enabled.

```
https://gnarcadia.com                 arcade PWA (account required to play)
https://gnarcadia.com/analytics-hub   analytics hub — full-screen admin sign-in before anything renders
https://gnarcadia.com/api/*           API            https://games.gnarcadia.com/g/*  game bundles (separate origin, see below)
wss://gnarcadia.com/rt                realtime       https://gnarcadia.com/api/health   status (shows testMode)
```

## 0. What you need

- A VM: Hetzner CX22 (2 vCPU / 4 GB, ~€4/mo) or DigitalOcean/Linode/Vultr $6–12 tier, Ubuntu 24.04, with a public IPv4.
- DNS control for gnarcadia.com (wherever the domain is registered; Cloudflare is a good free DNS host — set the records to
  **DNS only / grey cloud**, not proxied, so Caddy can issue certificates and WebSockets pass through cleanly).
- The repo on GitHub with the branch you want live (merge `claude/wonderful-curie-83r0ix` into `main`, or deploy that branch
  directly with `BRANCH=claude/wonderful-curie-83r0ix`).

## 1. DNS (do this first, propagation takes a few minutes)

| Type | Name | Value |
|---|---|---|
| A | `@` (gnarcadia.com) | VM IP |
| A | `www` | VM IP |
| A | `games` | VM IP |

Why `games.gnarcadia.com`? Game bundles run in a sandboxed iframe. If they were served from the same origin as the arcade, a
game could read the player's session. A separate origin keeps the sandbox real. Nothing else is exposed on that host.

## 2. First-time server setup (≈10 minutes)

SSH into the VM as root and run:

```bash
curl -fsSL https://raw.githubusercontent.com/ariFialkov/new-gnarcadia/main/scripts/server-setup.sh | bash -s -- gnarcadia.com you@yourmail.com
# deploying a non-main branch:  curl ... | BRANCH=claude/wonderful-curie-83r0ix bash -s -- gnarcadia.com you@yourmail.com
```

The script installs Docker, clones the repo to `/opt/gnarcadia`, writes `deploy/.env` with freshly generated secrets, prints
your **admin login** and **dev upload key**, opens the firewall, builds the images and starts the stack. When DNS resolves,
Caddy fetches certificates and the site is live.

What's running (`docker compose ps` in `/opt/gnarcadia/deploy`):

| service | role |
|---|---|
| `web` | Caddy: TLS, static arcade + analytics hub, reverse proxy for `/api` and `/rt`, `games.` host |
| `api` | Fastify API (`node apps/api/dist/index.js`) |
| `realtime` | WebSocket room server |
| `postgres` | Postgres 16 (volume `pgdata`) |
| `backup` | nightly `pg_dump` into `deploy/backups/`, 35-day rotation |

Uploaded games live in the `game_storage` volume; the database in `pgdata`. Rebuilds never touch either.

## 3. Test mode vs. launch mode

`deploy/.env` starts in **test mode** (`ALLOW_MOCK_PROVIDERS=true`, mock geo/KYC/payments) so you can play with friends on real
devices today: sign up, "deposit" play money, enter paid lobbies, watch the ledger. The arcade shows a yellow *Test mode*
banner and `/api/health` reports `testMode: true`.

Caveats in test mode: location is not really checked (`GEO_DEV_REGION` applies to everyone), KYC auto-approves, deposits are
free. Do not announce it as real-money play. When vendors are contracted, set the real `GEO_PROVIDER` / `KYC_PROVIDER` /
`PAYMENT_PROVIDER` values, `ALLOW_MOCK_PROVIDERS=false`, and redeploy; the API refuses to boot with mocks after that.

## 4. Publishing games to the live site

From your laptop (repo checked out, `pnpm build` done once):

```bash
export GNARCADIA_API=https://gnarcadia.com/api
export GNARCADIA_DEV_KEY=<DEV_API_KEY from deploy/.env>
pnpm gnarcadia publish examples/games/pong-duel --promote      # or your own game folder
pnpm gnarcadia status
```

The three example games are also synced automatically on boot (`SYNC_EXAMPLE_GAMES=true`). Two people on two phones: both
sign up at https://gnarcadia.com, "deposit" in the wallet, open Pong Duel, pick the same entry tier, and you are matched.

## 5. Rebuilding after changes

Manual: `ssh root@<vm> /opt/gnarcadia/scripts/deploy.sh` (pulls the current branch, rebuilds images, restarts, waits for
health). Takes 2–5 minutes; players in a live match are disconnected during the restart (the realtime server ends matches
cleanly on SIGTERM and refunds un-started lobbies).

Automatic: in GitHub → Settings → Secrets and variables → Actions add secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`
(a key pair whose public half you append to `~/.ssh/authorized_keys` on the VM) and a repository **variable**
`DEPLOY_ENABLED=true`. Every push to `main` then runs `.github/workflows/deploy.yml`. `ci.yml` builds and tests every branch.

Zero-downtime deploys, blue/green, and a staging host are deliberate non-goals at this scale; add a second VM and a
`staging.gnarcadia.com` block to the Caddyfile when you need them.

## 6. Operations cheatsheet

```bash
cd /opt/gnarcadia/deploy
docker compose logs -f api realtime        # live logs
docker compose exec api node -e "fetch('http://localhost:4000/admin/ledger/reconcile',{headers:{'x-admin-key':process.env.ADMIN_API_KEY}}).then(r=>r.json()).then(console.log)"
docker compose exec postgres psql -U gnarcadia gnarcadia
ls backups/                                # nightly dumps; restore: gunzip -c f.sql.gz | docker compose exec -T postgres psql -U gnarcadia gnarcadia
docker compose --env-file .env down && docker compose --env-file .env up -d   # full restart
```

Rotate a secret: edit `deploy/.env`, run `deploy.sh`. Changing `JWT_SECRET` signs everyone out; changing `TERMS_VERSION`
forces re-acceptance.

## 7. Alternatives if you'd rather not run a VM

The same images deploy to Fly.io (`fly launch` per service, Fly Postgres, Fly's edge for TLS) or Railway/Render; the arcade and
hub can move to Cloudflare Pages with `VITE_API_URL=https://api.gnarcadia.com`. Keep the games-on-a-separate-origin rule.
