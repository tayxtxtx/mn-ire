#!/usr/bin/env bash
# =============================================================================
# MakeNashville Booking System — Server Install Script
# =============================================================================
# Run this once on a fresh Ubuntu/Debian server after cloning the repo.
# Usage:
#   chmod +x scripts/install.sh
#   sudo scripts/install.sh
#
# What it does:
#   1. Installs Node 20, pnpm, Docker, PM2, Nginx, Certbot
#   2. Starts Postgres + Redis via Docker Compose
#   3. Prompts for domain names and secrets, writes .env
#   4. Runs DB migrations and seeds the first admin invite
#   5. Builds all apps (API + 3 frontends)
#   6. Configures PM2 to run the API
#   7. Writes and enables an Nginx config
#   8. Optionally provisions SSL via Certbot
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
success() { echo -e "${GREEN}[ok]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
die()     { echo -e "${RED}[error]${RESET} $*" >&2; exit 1; }

# ── Must run as root ──────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Please run as root: sudo $0"

# ── Locate repo root (script lives in <repo>/scripts/) ────────────────────────
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"
info "Repo root: $REPO_DIR"

# =============================================================================
# 1. System dependencies
# =============================================================================
echo
echo -e "${BOLD}── Step 1: System dependencies ──────────────────────────────────────────${RESET}"

apt_install() {
  apt-get install -y "$@" > /dev/null
}

info "Updating apt..."
apt-get update -qq

# Node 20
if ! command -v node &>/dev/null || [[ "$(node -e 'process.stdout.write(process.version.split(".")[0].slice(1))')" -lt 20 ]]; then
  info "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null
  apt_install nodejs
  success "Node $(node --version) installed."
else
  success "Node $(node --version) already installed."
fi

# pnpm
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm --silent
  success "pnpm $(pnpm --version) installed."
else
  success "pnpm $(pnpm --version) already installed."
fi

# Docker + Compose plugin
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  apt_install ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt_install docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  success "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') installed."
else
  success "Docker already installed."
fi

# PM2
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2 --silent
  success "PM2 installed."
else
  success "PM2 already installed."
fi

# Nginx + Certbot
if ! command -v nginx &>/dev/null; then
  info "Installing Nginx..."
  apt_install nginx
  success "Nginx installed."
else
  success "Nginx already installed."
fi

if ! command -v certbot &>/dev/null; then
  info "Installing Certbot..."
  apt_install certbot python3-certbot-nginx
  success "Certbot installed."
else
  success "Certbot already installed."
fi

# =============================================================================
# 2. Docker Compose — Postgres + Redis
# =============================================================================
echo
echo -e "${BOLD}── Step 2: Postgres + Redis ──────────────────────────────────────────────${RESET}"

info "Starting Postgres and Redis via Docker Compose..."
docker compose up -d
success "Postgres + Redis running."

# =============================================================================
# 3. Configure .env
# =============================================================================
echo
echo -e "${BOLD}── Step 3: Environment configuration ────────────────────────────────────${RESET}"

prompt() {
  local var="$1" prompt="$2" default="${3:-}"
  if [[ -n "$default" ]]; then
    read -rp "$(echo -e "${CYAN}${prompt}${RESET} [${default}]: ")" val
    val="${val:-$default}"
  else
    read -rp "$(echo -e "${CYAN}${prompt}${RESET}: ")" val
    while [[ -z "$val" ]]; do
      warn "This field is required."
      read -rp "$(echo -e "${CYAN}${prompt}${RESET}: ")" val
    done
  fi
  printf -v "$var" '%s' "$val"
}

prompt_secret() {
  local var="$1" prompt="$2"
  local val=""
  while [[ -z "$val" ]]; do
    read -rsp "$(echo -e "${CYAN}${prompt}${RESET}: ")" val
    echo
    [[ -z "$val" ]] && warn "This field is required."
  done
  printf -v "$var" '%s' "$val"
}

if [[ -f .env ]]; then
  warn ".env already exists. Skipping interactive setup."
  warn "Edit $REPO_DIR/.env manually if you need to change anything."
else
  echo
  info "No .env found — let's configure it now."
  echo

  prompt API_DOMAIN   "API domain (e.g. api.yourdomain.com)"
  prompt WEB_DOMAIN   "Member portal domain (e.g. app.yourdomain.com)"
  prompt KIOSK_DOMAIN "Kiosk domain (e.g. kiosk.yourdomain.com)"
  prompt STATUS_DOMAIN "Status screen domain (e.g. status.yourdomain.com)"
  prompt ADMIN_EMAIL  "First admin email (gets admin access on first login)"

  SESSION_SECRET="$(openssl rand -hex 32)"
  DB_PASS="$(openssl rand -hex 16)"

  cat > .env <<EOF
NODE_ENV=production

# ----- Postgres -----
DATABASE_URL=postgresql://mnbooking:${DB_PASS}@localhost:5432/mnbooking?schema=public

# ----- Redis -----
REDIS_URL=redis://localhost:6379

# ----- Auth (local email+password, no external accounts required) -----
AUTH_PROVIDER=local

# ----- Authentik OIDC (optional — set AUTH_PROVIDER=authentik to enable) -----
AUTHENTIK_ISSUER_URL=
AUTHENTIK_CLIENT_ID=
AUTHENTIK_CLIENT_SECRET=
AUTHENTIK_REDIRECT_URI=https://${API_DOMAIN}/auth/callback
AUTHENTIK_CERT_SCOPES=

# ----- Slack OAuth (optional — set AUTH_PROVIDER=slack to enable) -----
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=https://${API_DOMAIN}/auth/callback

# ----- Slack Bot (optional) -----
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_GUILD_CHANNELS=

# ----- Google Calendar (optional) -----
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REFRESH_TOKEN=
GOOGLE_CALENDAR_UID_PREFIX=mn-booking-

# ----- API -----
API_PORT=4000
API_PUBLIC_URL=https://${API_DOMAIN}
WEB_PUBLIC_URL=https://${WEB_DOMAIN}
KIOSK_PUBLIC_URL=https://${KIOSK_DOMAIN}
SESSION_SECRET=${SESSION_SECRET}

# ----- Admin -----
ADMIN_EMAILS=${ADMIN_EMAIL}

# ----- Booking policy -----
DEFAULT_BOOKING_WINDOW_DAYS=7
DEFAULT_NO_SHOW_GRACE_MINUTES=15
HIGH_DEMAND_COOLDOWN_HOURS=4
EOF

  # Update docker-compose Postgres password to match
  if grep -q 'POSTGRES_PASSWORD' docker-compose.yml 2>/dev/null; then
    sed -i "s/POSTGRES_PASSWORD:.*/POSTGRES_PASSWORD: ${DB_PASS}/" docker-compose.yml
    sed -i "s/POSTGRES_USER:.*/POSTGRES_USER: mnbooking/" docker-compose.yml
    sed -i "s/POSTGRES_DB:.*/POSTGRES_DB: mnbooking/" docker-compose.yml
    docker compose up -d
  fi

  success ".env written."
fi

# Load env for use in this script
set -a; source .env; set +a

# =============================================================================
# 4. Install dependencies, migrate DB, seed
# =============================================================================
echo
echo -e "${BOLD}── Step 4: Dependencies, migrations, seed ───────────────────────────────${RESET}"

info "Installing Node dependencies..."
pnpm install --frozen-lockfile

info "Running database migrations..."
pnpm db:migrate

info "Seeding database (creates bootstrap admin invite)..."
pnpm db:seed

success "Database ready."

# =============================================================================
# 5. Build all apps
# =============================================================================
echo
echo -e "${BOLD}── Step 5: Building all apps ────────────────────────────────────────────${RESET}"

info "Building... (this takes a minute)"
pnpm build
success "Build complete."

# =============================================================================
# 6. PM2 — run the API
# =============================================================================
echo
echo -e "${BOLD}── Step 6: PM2 ──────────────────────────────────────────────────────────${RESET}"

if pm2 describe mn-api &>/dev/null; then
  info "mn-api already in PM2 — restarting..."
  pm2 restart mn-api
else
  info "Starting API with PM2..."
  pm2 start "$REPO_DIR/apps/api/dist/index.js" \
    --name mn-api \
    --env production \
    --log "$REPO_DIR/logs/api.log" \
    --time
fi

pm2 save
success "API running under PM2."

# Generate startup command and run it
STARTUP_CMD="$(pm2 startup | grep 'sudo' | tail -1)"
if [[ -n "$STARTUP_CMD" ]]; then
  info "Enabling PM2 on boot..."
  eval "$STARTUP_CMD" > /dev/null
fi

# =============================================================================
# 7. Nginx config
# =============================================================================
echo
echo -e "${BOLD}── Step 7: Nginx ────────────────────────────────────────────────────────${RESET}"

# Read domains from .env (already sourced)
API_DOMAIN_VALUE="${API_PUBLIC_URL#https://}"; API_DOMAIN_VALUE="${API_DOMAIN_VALUE#http://}"
WEB_DOMAIN_VALUE="${WEB_PUBLIC_URL#https://}"; WEB_DOMAIN_VALUE="${WEB_DOMAIN_VALUE#http://}"
KIOSK_DOMAIN_VALUE="${KIOSK_PUBLIC_URL#https://}"; KIOSK_DOMAIN_VALUE="${KIOSK_DOMAIN_VALUE#http://}"

# STATUS_DOMAIN may not be in .env — prompt if needed
STATUS_DOMAIN_VALUE="${STATUS_DOMAIN:-}"
if [[ -z "$STATUS_DOMAIN_VALUE" ]]; then
  prompt STATUS_DOMAIN_VALUE "Status screen domain (e.g. status.yourdomain.com)"
fi

NGINX_CONF="/etc/nginx/sites-available/mnbooking"

cat > "$NGINX_CONF" <<NGINX
# MakeNashville Booking System — generated by install.sh

# API
server {
    listen 80;
    server_name ${API_DOMAIN_VALUE};

    location / {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}

# Member portal
server {
    listen 80;
    server_name ${WEB_DOMAIN_VALUE};
    root ${REPO_DIR}/apps/web/dist;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}

# Kiosk
server {
    listen 80;
    server_name ${KIOSK_DOMAIN_VALUE};
    root ${REPO_DIR}/apps/kiosk/dist;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}

# Status screen
server {
    listen 80;
    server_name ${STATUS_DOMAIN_VALUE};
    root ${REPO_DIR}/apps/status/dist;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/mnbooking
nginx -t
systemctl reload nginx
success "Nginx configured and reloaded."

# =============================================================================
# 8. SSL via Certbot (optional)
# =============================================================================
echo
echo -e "${BOLD}── Step 8: SSL (optional) ───────────────────────────────────────────────${RESET}"

read -rp "$(echo -e "${CYAN}Provision SSL certificates with Certbot? [y/N]${RESET}: ")" want_ssl
if [[ "${want_ssl,,}" == "y" ]]; then
  prompt SSL_EMAIL "Email for Let's Encrypt notifications"
  certbot --nginx \
    -d "$API_DOMAIN_VALUE" \
    -d "$WEB_DOMAIN_VALUE" \
    -d "$KIOSK_DOMAIN_VALUE" \
    -d "$STATUS_DOMAIN_VALUE" \
    --non-interactive \
    --agree-tos \
    --email "$SSL_EMAIL" \
    --redirect
  success "SSL certificates provisioned."
else
  warn "Skipped SSL. Run 'sudo certbot --nginx' later to add HTTPS."
fi

# =============================================================================
# Done
# =============================================================================
echo
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  MakeNashville Booking System installed successfully!${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════════════${RESET}"
echo
echo -e "  Member portal  →  ${CYAN}https://${WEB_DOMAIN_VALUE}${RESET}"
echo -e "  Kiosk          →  ${CYAN}https://${KIOSK_DOMAIN_VALUE}${RESET}"
echo -e "  Status screen  →  ${CYAN}https://${STATUS_DOMAIN_VALUE}${RESET}"
echo -e "  API            →  ${CYAN}https://${API_DOMAIN_VALUE}${RESET}"
echo
echo -e "  ${YELLOW}Next step:${RESET} check the seed output above for your bootstrap admin"
echo -e "  invite URL, open it, set your password, and you're in as admin."
echo
echo -e "  To deploy updates:"
echo -e "    ${CYAN}git pull && pnpm install && pnpm build && pnpm db:migrate && pm2 restart mn-api${RESET}"
echo
