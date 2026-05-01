#!/usr/bin/env bash
# =============================================================================
# MakeNashville Booking System — Server Install Script
# =============================================================================
# Run once on a fresh Ubuntu/Debian server after cloning the repo.
# Requires no input — everything is auto-configured.
# Configure domains, integrations, and all settings from the admin dashboard
# after first boot.
#
# Usage:
#   chmod +x scripts/install.sh
#   sudo scripts/install.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
success() { echo -e "${GREEN}[ok]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
die()     { echo -e "${RED}[error]${RESET} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Please run as root: sudo $0"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"
info "Repo root: $REPO_DIR"

# Detect server's public IP for the initial access URL
SERVER_IP="$(curl -fsSL https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"

# If no .env exists yet and the Postgres volume is already initialised (from a
# previous failed run), wipe the volume so it re-initialises with the new password.
if [[ ! -f .env ]] && docker volume inspect mn-bookingsys_pgdata &>/dev/null; then
  warn "Existing Postgres volume found without a matching .env — removing it so"
  warn "Postgres re-initialises with the new auto-generated credentials."
  docker compose down -v >/dev/null 2>&1 || true
fi

# =============================================================================
# 1. System dependencies
# =============================================================================
echo
echo -e "${BOLD}── Step 1: System dependencies ──────────────────────────────────────────${RESET}"

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq

# Node 20
if ! node -e "process.exit(+process.version.split('.')[0].slice(1) >= 20 ? 0 : 1)" 2>/dev/null; then
  info "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null 2>&1
fi
success "Node $(node --version)"

# pnpm
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm --silent
fi
success "pnpm $(pnpm --version)"

# Docker
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  apt-get install -y ca-certificates curl gnupg lsb-release >/dev/null 2>&1
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
  systemctl enable --now docker
fi
success "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

# PM2
command -v pm2 &>/dev/null || npm install -g pm2 --silent
success "PM2 $(pm2 --version)"

# Nginx
if ! command -v nginx &>/dev/null; then
  apt-get install -y nginx >/dev/null 2>&1
fi
success "Nginx $(nginx -v 2>&1 | grep -o '[0-9.]*$')"

# Certbot
if ! command -v certbot &>/dev/null; then
  apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1
fi
success "Certbot ready"

# =============================================================================
# 2. Generate .env — credentials must exist BEFORE Docker starts Postgres
# =============================================================================
echo
echo -e "${BOLD}── Step 2: Environment ───────────────────────────────────────────────────${RESET}"

if [[ -f .env ]]; then
  warn ".env already exists — skipping generation."
else
  DB_PASS="$(openssl rand -hex 16)"
  SESSION_SECRET="$(openssl rand -hex 32)"

  # Patch docker-compose.yml so Postgres initialises with these credentials
  if grep -q 'POSTGRES_PASSWORD' docker-compose.yml 2>/dev/null; then
    sed -i \
      -e "s/POSTGRES_PASSWORD:.*/POSTGRES_PASSWORD: ${DB_PASS}/" \
      -e "s/POSTGRES_USER:.*/POSTGRES_USER: mnbooking/" \
      -e "s/POSTGRES_DB:.*/POSTGRES_DB: mnbooking/" \
      docker-compose.yml
  fi

  cat > .env <<EOF
NODE_ENV=production

DATABASE_URL=postgresql://mnbooking:${DB_PASS}@localhost:5432/mnbooking?schema=public
REDIS_URL=redis://localhost:6379
SESSION_SECRET=${SESSION_SECRET}

AUTH_PROVIDER=local

API_PORT=4000
API_PUBLIC_URL=http://${SERVER_IP}:4000
WEB_PUBLIC_URL=http://${SERVER_IP}
KIOSK_PUBLIC_URL=http://${SERVER_IP}/kiosk

AUTHENTIK_ISSUER_URL=
AUTHENTIK_CLIENT_ID=
AUTHENTIK_CLIENT_SECRET=
AUTHENTIK_REDIRECT_URI=
AUTHENTIK_CERT_SCOPES=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_GUILD_CHANNELS=
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REFRESH_TOKEN=
GOOGLE_CALENDAR_UID_PREFIX=mn-booking-
ADMIN_EMAILS=
DEFAULT_BOOKING_WINDOW_DAYS=7
DEFAULT_NO_SHOW_GRACE_MINUTES=15
HIGH_DEMAND_COOLDOWN_HOURS=4
EOF
  success ".env generated with random DB password and session secret."
fi

# Load .env into the current shell so all subsequent steps see DATABASE_URL etc.
set -a; source .env; set +a

# =============================================================================
# 3. Docker Compose — Postgres + Redis
# =============================================================================
echo
echo -e "${BOLD}── Step 3: Postgres + Redis ──────────────────────────────────────────────${RESET}"

info "Starting Postgres and Redis..."
docker compose up -d
# Give Postgres a moment to finish initialising on a brand-new volume
sleep 3
success "Postgres + Redis running."

# =============================================================================
# 4. Dependencies, migrations, seed
# =============================================================================
echo
echo -e "${BOLD}── Step 4: Dependencies, migrations, seed ───────────────────────────────${RESET}"

info "Installing Node dependencies (including devDeps for Prisma CLI)..."
# Override NODE_ENV so pnpm installs devDependencies (prisma CLI, tsx)
NODE_ENV=development pnpm install --frozen-lockfile

info "Running database migrations..."
pnpm db:migrate:prod

info "Seeding database..."
pnpm db:seed

success "Database ready."

# =============================================================================
# 5. Build
# =============================================================================
echo
echo -e "${BOLD}── Step 5: Building all apps ────────────────────────────────────────────${RESET}"

info "Building... (takes ~30–60 seconds)"
NODE_ENV=production pnpm build
success "Build complete."

mkdir -p logs

# =============================================================================
# 6. PM2
# =============================================================================
echo
echo -e "${BOLD}── Step 6: PM2 ──────────────────────────────────────────────────────────${RESET}"

if pm2 describe mn-api &>/dev/null; then
  pm2 restart mn-api
else
  pm2 start "$REPO_DIR/apps/api/dist/index.js" \
    --name mn-api \
    --log "$REPO_DIR/logs/api.log" \
    --time
fi

pm2 save

# Register PM2 as a system service
STARTUP_CMD="$(pm2 startup systemd -u root --hp /root 2>/dev/null | grep 'sudo' | tail -1 || true)"
[[ -n "$STARTUP_CMD" ]] && eval "$STARTUP_CMD" >/dev/null 2>&1 || true

success "API running via PM2."

# =============================================================================
# 7. Nginx — serve everything, no domain required
# =============================================================================
echo
echo -e "${BOLD}── Step 7: Nginx ────────────────────────────────────────────────────────${RESET}"

cat > /etc/nginx/sites-available/mnbooking <<NGINX
# MakeNashville Booking System
# Generated by install.sh — update with: sudo scripts/setup-nginx.sh

server {
    listen 80 default_server;
    server_name _;

    # Member portal (/)
    root ${REPO_DIR}/apps/web/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API (/api/* and /auth/*)
    location ~ ^/(api|auth|health) {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    # Kiosk (/kiosk/*)
    location /kiosk/ {
        alias ${REPO_DIR}/apps/kiosk/dist/;
        try_files \$uri \$uri/ /kiosk/index.html;
    }

    # Status screen (/status/*)
    location /status/ {
        alias ${REPO_DIR}/apps/status/dist/;
        try_files \$uri \$uri/ /status/index.html;
    }
}
NGINX

# Disable default site if it exists
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/mnbooking /etc/nginx/sites-enabled/mnbooking

nginx -t && systemctl reload nginx
success "Nginx configured."

# =============================================================================
# Done
# =============================================================================
echo
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Installation complete!${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════════════${RESET}"
echo
echo -e "  Open in your browser:"
echo -e "    Member portal  →  ${CYAN}http://${SERVER_IP}${RESET}"
echo -e "    Kiosk          →  ${CYAN}http://${SERVER_IP}/kiosk${RESET}"
echo -e "    Status screen  →  ${CYAN}http://${SERVER_IP}/status${RESET}"
echo
echo -e "  ${YELLOW}First-time setup:${RESET}"
echo -e "  1. Check the seed output above for your admin invite URL"
echo -e "  2. Open the invite URL and set your password"
echo -e "  3. Go to ${CYAN}Admin → Settings${RESET} to configure domains, Slack, GCal, etc."
echo -e "  4. Once domains are set, run ${CYAN}sudo scripts/setup-nginx.sh${RESET} to"
echo -e "     apply Nginx vhosts and get SSL certificates"
echo
echo -e "  To deploy updates: ${CYAN}sudo scripts/update.sh${RESET}"
echo
