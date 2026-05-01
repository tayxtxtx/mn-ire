#!/usr/bin/env bash
# =============================================================================
# MakeNashville Booking System — Update Script
# =============================================================================
# Run from the repo root to pull latest changes and redeploy.
# Usage: sudo scripts/update.sh
# =============================================================================

set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
success() { echo -e "${GREEN}[ok]${RESET}    $*"; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

info "Pulling latest changes..."
git pull

info "Installing dependencies..."
pnpm install --frozen-lockfile

set -a; source .env; set +a
ln -sf "$REPO_DIR/.env" "$REPO_DIR/packages/db/.env"

info "Applying schema changes..."
pnpm db:push

info "Generating Prisma client..."
pnpm db:generate

info "Building apps..."
pnpm build

info "Restarting API..."
pm2 restart mn-api

success "Update complete."
pm2 status mn-api
