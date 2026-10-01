#!/usr/bin/env bash
# Rebuild + restart the production stack from the current branch. Safe to re-run any time.
# Runs on the server: /opt/gnarcadia/scripts/deploy.sh [branch]
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
echo "▶ pulling $BRANCH"
git fetch origin "$BRANCH" && git checkout -q "$BRANCH" && git pull --ff-only origin "$BRANCH"
cd deploy
[ -f .env ] || { echo "deploy/.env missing — run scripts/server-setup.sh first"; exit 1; }
echo "▶ building images"
docker compose --env-file .env build --pull
echo "▶ restarting services (database and uploaded games are kept in volumes)"
docker compose --env-file .env up -d --remove-orphans
docker image prune -f >/dev/null
echo "▶ waiting for health"
for i in $(seq 1 30); do
  if docker compose --env-file .env exec -T api wget -qO- http://localhost:4000/health >/dev/null 2>&1; then echo "✔ api healthy"; break; fi; sleep 2
done
docker compose --env-file .env ps
echo "✔ deployed $(git rev-parse --short HEAD) — https://$(grep ^DOMAIN= .env | cut -d= -f2)"
