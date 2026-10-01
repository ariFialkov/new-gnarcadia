#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04/24.04 VM (Hetzner CX22, DigitalOcean $6, etc.) as the Gnarcadia host.
# Usage (as root or a sudo user):  curl -fsSL https://raw.githubusercontent.com/ariFialkov/new-gnarcadia/main/scripts/server-setup.sh | bash -s -- gnarcadia.com you@email.com
set -euo pipefail
DOMAIN="${1:-}"; EMAIL="${2:-}"; REPO="${REPO:-https://github.com/ariFialkov/new-gnarcadia.git}"; BRANCH="${BRANCH:-main}"
[ -n "$DOMAIN" ] && [ -n "$EMAIL" ] || { echo "usage: server-setup.sh <domain> <acme-email>"; exit 1; }

echo "▶ installing docker"
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
command -v git >/dev/null || (apt-get update -y && apt-get install -y git)

echo "▶ cloning $REPO ($BRANCH) to /opt/gnarcadia"
if [ ! -d /opt/gnarcadia ]; then git clone --branch "$BRANCH" "$REPO" /opt/gnarcadia; fi
cd /opt/gnarcadia/deploy

if [ ! -f .env ]; then
  echo "▶ generating deploy/.env with fresh secrets"
  gen() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-48; }
  ADMIN_PW="$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-20)"
  sed -e "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" -e "s|^ACME_EMAIL=.*|ACME_EMAIL=$EMAIL|" -e "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=$EMAIL|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(gen)|" -e "s|^JWT_SECRET=.*|JWT_SECRET=$(gen)|" -e "s|^INTERNAL_SECRET=.*|INTERNAL_SECRET=$(gen)|" \
      -e "s|^ADMIN_API_KEY=.*|ADMIN_API_KEY=$(gen)|" -e "s|^DEV_API_KEY=.*|DEV_API_KEY=$(gen)|" -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$ADMIN_PW|" .env.example > .env
  chmod 600 .env
  echo
  echo "  ┌──────────────────────────────────────────────────────────────"
  echo "  │ Admin login (analytics hub + arcade):  $EMAIL / $ADMIN_PW"
  echo "  │ Dev upload key (gnarcadia publish --key):  $(grep ^DEV_API_KEY= .env | cut -d= -f2)"
  echo "  │ Saved in /opt/gnarcadia/deploy/.env — keep it safe."
  echo "  └──────────────────────────────────────────────────────────────"
  echo
fi

echo "▶ firewall (ufw): allow ssh/http/https"
if command -v ufw >/dev/null; then ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null; ufw --force enable >/dev/null; fi

echo "▶ first deploy (builds images; 3–6 minutes)"
bash /opt/gnarcadia/scripts/deploy.sh

cat <<MSG

✔ Gnarcadia is starting. Make sure DNS has A records for:
     $DOMAIN        → this server's IP
     www.$DOMAIN    → this server's IP
     games.$DOMAIN  → this server's IP
  Caddy issues HTTPS certificates automatically once DNS resolves (usually within a minute).

  Arcade:         https://$DOMAIN
  Analytics hub:  https://$DOMAIN/analytics-hub   (admin login required before anything renders)
  Health:         https://$DOMAIN/api/health

  Rebuild after changes:  ssh in and run  /opt/gnarcadia/scripts/deploy.sh   (or push to main with the deploy workflow configured)
MSG
