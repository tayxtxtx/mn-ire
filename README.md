# MN-IRE — Make Nashville Integrated Resource Ecosystem

A mission-critical reservation and resource management system for a 12,000 sq ft makerspace. Built for real-time visibility, safety enforcement, and zero double-bookings.

---

## Features

### Booking Engine
- **2-hour session cap** with per-resource overrides
- **7-day rolling window** — members can only book within the coming week
- **Cooldown enforcement** for high-demand tools (CNC router, laser cutters): 4-hour gap between sessions from the same member
- **Atomic overlap prevention** via PostgreSQL serializable transactions — two members clicking "Book" simultaneously will never double-book the same slot
- **Availability timeline** endpoint for building calendar UIs

### Safety Certification Gating
- Certifications live in Authentik as custom OIDC scopes (`woodshop_basic`, `cnc_advanced`, `laser_certified`, etc.)
- On every login the API snapshots the member's current certs into the database
- Booking attempts are rejected with a 403 if the member lacks any required cert for that resource — no client-side trust

### "Who's In" Dashboard
- Real-time view of every active session: member name, machine, minutes remaining
- Rendered on both the web dashboard and the kiosk home screen
- Auto-refreshes every 30 seconds on the kiosk

### Google Calendar Sync (Bidirectional)
- Every confirmed booking is pushed to the shop's Google Calendar as an event
- Incremental inbound sync via `syncToken` — only changed events are fetched (no full scan per cycle)
- **Loop prevention**: all MN-IRE events are stamped with `extendedProperties.private.mnUid = "mn-booking-{id}"`. The inbound watcher skips any event carrying that prefix — no infinite update loops possible
- Sync runs every 60 seconds; if a `syncToken` expires (HTTP 410), the service falls back to a full sync automatically

### Slack Bot (Socket Mode)
- **Booking confirmed** → DM to the member with resource, time, and booking ID
- **High-demand tool booked** → guild alert posted to the shop's captain channel (e.g. `#cnc-captains`)
- **No-show logic** → if a member hasn't checked in within 15 minutes of their start time, the slot is released, the member is DM'd, and the guild is notified
- **Booking cancelled** → DM to member; slot-released alert to guild if high-demand
- **Check-in confirmed** → DM to member with session end time
- `/mnire-status` slash command for a quick health check from Slack

### Kiosk Mode (Raspberry Pi 5)
- Persistent **Device Authorization Grant** (RFC 8628) — the kiosk displays a code + QR; the member authenticates on their phone
- All touch targets are a minimum of 64 px — glove-friendly
- Check-in screen shows only the member's upcoming confirmed bookings
- Read-only "Who's In" view updates automatically

### Web Dashboard (IBM Carbon Design System)
- **Facility Overview** — F-pattern layout: stat bar → "Who's In" sidebar → shop card grid with per-resource status tags
- **Shop Detail** — resource cards with certification requirements, session limits, and live status
- **My Bookings** — tabular history with cancel action on upcoming bookings
- High-contrast `g100` dark theme; IBM Plex Sans; semantic color coding (green = available/success, blue = in-progress, red = failed/maintenance)

---

## Tech Stack

| Layer | Technology |
|---|---|
| API | Node.js 20 · Fastify 4 · TypeScript |
| Database | PostgreSQL 16 · Prisma ORM |
| Cache / Queue | Redis 7 · BullMQ |
| Identity | Authentik (OIDC) |
| Calendar | Google Calendar API v3 |
| Messaging | Slack Bolt SDK (Socket Mode) |
| Web / Kiosk UI | React 18 · Vite · IBM Carbon Design System |
| Monorepo | pnpm workspaces · Turborepo |

---

## Repository Layout

```
mn-ire/
├── apps/
│   ├── api/          # Fastify API — port 4000
│   ├── web/          # Member web dashboard — port 5173
│   └── kiosk/        # Touchscreen kiosk — port 5174
├── packages/
│   ├── db/           # Prisma schema, migrations, seed
│   ├── shared/       # Constants, DTOs, type helpers (used by all apps)
│   └── tsconfig/     # Shared TypeScript configs
├── docker-compose.yml
└── .env.example
```

---

## Self-Hosting

### Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 20.11.0 |
| pnpm | 9.x |
| Docker + Docker Compose | 24.x |
| GitHub CLI (`gh`) | optional, for deploy scripts |

---

### 1. Clone and install

```bash
git clone https://github.com/<your-org>/mn-ire.git
cd mn-ire
pnpm install
```

---

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in each section. The table below shows which variables are required for the system to start versus optional integrations.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `SESSION_SECRET` | ✅ | Min 32 characters — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `AUTHENTIK_ISSUER_URL` | ✅ | e.g. `https://auth.example.org/application/o/mn-ire/` |
| `AUTHENTIK_CLIENT_ID` | ✅ | From the Authentik provider detail page |
| `AUTHENTIK_CLIENT_SECRET` | ✅ | From the Authentik provider detail page |
| `AUTHENTIK_REDIRECT_URI` | ✅ | Must match redirect URI registered in Authentik |
| `GOOGLE_CALENDAR_CLIENT_ID` | ❌ | GCal sync disabled if omitted |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | ❌ | GCal sync disabled if omitted |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | ❌ | GCal sync disabled if omitted |
| `SLACK_BOT_TOKEN` | ❌ | Slack bot disabled if omitted |
| `SLACK_APP_TOKEN` | ❌ | Slack bot disabled if omitted |
| `SLACK_SIGNING_SECRET` | ❌ | Slack bot disabled if omitted |

---

### 3. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL 16 and Redis 7 with persistent volumes. Healthchecks are configured — both containers must report healthy before the API will connect successfully.

---

### 4. Run database migrations and seed

```bash
pnpm db:migrate   # applies schema to Postgres
pnpm db:seed      # creates shops, resources, and a demo member
```

To browse the database with a GUI:

```bash
pnpm db:studio    # opens Prisma Studio at http://localhost:5555
```

---

### 5. Set up Authentik

1. Deploy Authentik (see [Authentik docs](https://docs.goauthentik.io/docs/installation/docker-compose)) or use an existing instance.
2. Create an **OAuth2/OpenID Provider** with:
   - **Redirect URI**: `https://your-domain/auth/callback`
   - **Scopes**: `openid profile email` plus one scope per certification (e.g. `woodshop_basic`, `laser_certified`)
3. For each certification scope, create a **Scope Mapping** under **Customization → Property Mappings**:
   ```python
   # Example: woodshop_basic mapping
   return {"woodshop_basic": True}
   ```
   Assign the mapping to the provider's allowed scopes.
4. Create an **Application** backed by that provider. Copy the **Client ID** and **Client Secret** into `.env`.
5. Assign certifications to members by editing their user profile and granting the relevant scope mappings.

---

### 6. Set up Google Calendar (optional)

1. Create a Google Cloud project and enable the **Google Calendar API**.
2. Create an **OAuth 2.0 Client ID** (type: Web application). Set the redirect URI to `https://your-domain:4000/oauth2callback`.
3. Run the token exchange once to get a refresh token:

   ```bash
   # Step 1 — get the authorization URL
   node -e "
   const {google} = require('googleapis');
   const c = new google.auth.OAuth2('CLIENT_ID','CLIENT_SECRET','https://your-domain:4000/oauth2callback');
   console.log(c.generateAuthUrl({access_type:'offline',scope:['https://www.googleapis.com/auth/calendar'],prompt:'consent'}));
   "

   # Step 2 — exchange the code from the redirect URL
   node -e "
   const {google} = require('googleapis');
   const c = new google.auth.OAuth2('CLIENT_ID','CLIENT_SECRET','https://your-domain:4000/oauth2callback');
   c.getToken('CODE_FROM_URL').then(r => console.log(r.tokens));
   "
   ```

4. Paste the `refresh_token` into `.env`.
5. In Prisma Studio, set `gcalCalendarId` on each `Shop` row to the corresponding Google Calendar ID (found under **Calendar Settings → Integrate calendar → Calendar ID**).

---

### 7. Set up Slack (optional)

1. Create a new app at [api.slack.com/apps](https://api.slack.com/apps).
2. **Settings → Socket Mode** → Enable, create an App-Level Token with scope `connections:write`.
3. **OAuth & Permissions → Bot Token Scopes**: add `chat:write`, `im:write`, `commands`.
4. **Install to Workspace** and copy the bot token.
5. Copy **Basic Information → Signing Secret**.
6. Fill in `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, and `SLACK_SIGNING_SECRET` in `.env`.
7. For DMs to work, populate `slackUserId` on each `User` row (the member's Slack member ID, format `U01ABC123`). Members can find this in Slack: **Profile → ⋮ → Copy member ID**.

---

### 8. Run in development

```bash
pnpm dev
```

Starts all three apps in parallel with hot-reload:

| App | URL |
|---|---|
| API | `http://localhost:4000` |
| Web dashboard | `http://localhost:5173` |
| Kiosk | `http://localhost:5174` |

---

### 9. Run in production

#### Option A — systemd on a Linux VPS

Build all apps:

```bash
pnpm build
```

Create a systemd unit for the API (`/etc/systemd/system/mn-ire-api.service`):

```ini
[Unit]
Description=MN-IRE API
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=mnire
WorkingDirectory=/opt/mn-ire/apps/api
EnvironmentFile=/opt/mn-ire/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now mn-ire-api
```

Serve the web and kiosk builds as static files via Nginx (see sample config below).

#### Option B — Docker Compose (all-in-one)

Add a `Dockerfile` to `apps/api` and extend `docker-compose.yml` with an `api`, `web`, and `kiosk` service. The infrastructure services (`postgres`, `redis`) are already defined.

#### Nginx sample config

```nginx
# Web dashboard
server {
    listen 443 ssl;
    server_name mn-ire.makenashville.org;

    root /opt/mn-ire/apps/web/dist;
    index index.html;

    # SPA fallback
    location / { try_files $uri $uri/ /index.html; }

    # Proxy API and auth to Fastify
    location ~ ^/(api|auth|health) {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Kiosk (Raspberry Pi devices hit this from the LAN)
server {
    listen 443 ssl;
    server_name kiosk.makenashville.org;

    root /opt/mn-ire/apps/kiosk/dist;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    location ~ ^/(api|auth|health) {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

### 10. Kiosk device setup (Raspberry Pi 5)

1. Install Raspberry Pi OS (64-bit, desktop).
2. Install Chromium and set it to launch in kiosk mode on boot:

   ```bash
   # /etc/xdg/autostart/kiosk.desktop
   [Desktop Entry]
   Type=Application
   Name=MN-IRE Kiosk
   Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars \
        --touch-events=enabled https://kiosk.makenashville.org
   ```

3. Disable screen saver and power management:

   ```bash
   sudo raspi-config
   # Display Options → Screen Blanking → Disable
   ```

4. The kiosk boots directly into the Device Code Flow screen. Members scan the QR code with their phone to authenticate — no keyboard needed.

#### Optional: RFID check-in

Connect a USB RFID reader (HID keyboard emulation mode). The reader types the member's ID as keystrokes. Wire a `/api/checkin/rfid` endpoint that maps the scanned ID to a `User` and calls `checkInBooking` — the kiosk screen then auto-advances to the confirmed state.

---

## Useful Commands

```bash
# Development
pnpm dev                  # start all apps with hot-reload
pnpm typecheck            # type-check all packages
pnpm db:studio            # open Prisma GUI at :5555

# Database
pnpm db:migrate           # apply pending migrations
pnpm db:seed              # seed shops, resources, demo user
pnpm db:generate          # regenerate Prisma client after schema changes

# Infrastructure
docker compose up -d      # start Postgres + Redis
docker compose down       # stop
docker compose logs -f    # follow logs

# Production
pnpm build                # build all apps to dist/
```

---

## Booking Policy Defaults

All policy values are overrideable per-resource in the database and configurable via environment variables.

| Policy | Default | Env variable |
|---|---|---|
| Max session length | 120 min | `DEFAULT_MAX_SESSION_MINUTES` |
| Booking window | 7 days | `DEFAULT_BOOKING_WINDOW_DAYS` |
| No-show grace period | 15 min | `DEFAULT_NO_SHOW_GRACE_MINUTES` |
| High-demand cooldown | 4 hours | `HIGH_DEMAND_COOLDOWN_HOURS` |

---

## License

UNLICENSED — internal tool for Make Nashville. Not for redistribution.
