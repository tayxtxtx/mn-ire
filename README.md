# MakeNashville Booking System

A resource reservation platform for makerspace. Members book equipment, check in on arrival, and a no-show timer automatically releases unused slots. Staff get an admin console, and a TV-friendly status screen shows live facility state.

---

## Feature Overview

| Feature | Description |
|---|---|
| **Resource booking** | Members book any certified resource up to 7 days out (configurable per resource) |
| **Certification gating** | Resources require specific certifications; certs are sourced from Authentik scopes or managed in the DB |
| **No-show protection** | Bookings auto-cancelled 15 min after start time if not checked in; DM + guild channel notification sent |
| **Cooldown enforcement** | High-demand resources (CNC, Laser) enforce a 4-hour cooldown after each session |
| **Google Calendar sync** | Bidirectional sync per shop calendar; loop prevention via `mn-booking-` UID prefix |
| **Slack bot** | Booking / cancellation / check-in / no-show notifications to the relevant guild channel |
| **Admin console** | Paginated booking table with status/date/resource filters; inline edit and force-cancel; user admin promotion |
| **Status screen** | Full-bleed TV display — green (available), yellow (reserved soon), red (occupied), orange (maintenance/down) |
| **Switchable identity provider** | `AUTH_PROVIDER=authentik` (OIDC with cert scopes) or `AUTH_PROVIDER=slack` (Sign in with Slack) |
| **Kiosk mode** | Tablet-friendly check-in UI (Device Authorization Grant or RFID keyboard emulation) |

---

## Architecture

```
apps/
  api/       Fastify 4 + TypeScript — REST API, auth, workers  (port 4000)
  web/       Vite + React 18 + IBM Carbon — member portal      (port 5173)
  kiosk/     Vite + React 18 + IBM Carbon — check-in kiosk     (port 5174)
  status/    Vite + React 18 — TV status board                 (port 5175)
packages/
  db/        Prisma schema + generated client
  shared/    Constants, enums, shared TS types
  tsconfig/  Base TypeScript configs
```

**Stack:** Node 20, Fastify 4, Prisma + PostgreSQL 16, Redis 7, BullMQ, Slack Bolt (Socket Mode), Google Calendar API v3, IBM Carbon Design System, pnpm workspaces + Turborepo.

---

## Prerequisites

- Node 20 (`nvm use` reads `.nvmrc`)
- pnpm 9 — `npm i -g pnpm`
- Docker (for local Postgres + Redis)

---

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start Postgres and Redis

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env
# edit .env — see the sections below for each feature
```

### 4. Run database migrations and seed

```bash
pnpm db:migrate   # applies all Prisma migrations
pnpm db:seed      # seeds 5 shops, demo resources, and a demo user
```

### 5. Choose your identity provider

#### Option A — Authentik OIDC (default)

1. In Authentik, create an **OAuth2/OpenID Provider** for the booking system.
2. Add a custom property mapping that includes certification scopes in the token (e.g. `woodshop_basic metal_lathe cnc_advanced`).
3. Set in `.env`:

```env
AUTH_PROVIDER=authentik
AUTHENTIK_ISSUER_URL=https://auth.yourdomain.org/application/o/booking/
AUTHENTIK_CLIENT_ID=<client-id>
AUTHENTIK_CLIENT_SECRET=<client-secret>
AUTHENTIK_REDIRECT_URI=http://localhost:5173/auth/callback
AUTHENTIK_CERT_SCOPES=woodshop_basic,woodshop_advanced,metal_lathe,metal_mill,cnc_basic,cnc_advanced,laser_certified,3dprint_basic,welding_mig,welding_tig,electronics_basic
```

#### Option B — Sign in with Slack

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps).
2. Under **OAuth & Permissions**, add scopes: `openid profile email`.
3. Enable **Sign in with Slack** (OpenID Connect).
4. Add `http://localhost:4000/auth/callback` to Redirect URLs.
5. Set in `.env`:

```env
AUTH_PROVIDER=slack
SLACK_CLIENT_ID=<client-id>
SLACK_CLIENT_SECRET=<client-secret>
SLACK_REDIRECT_URI=http://localhost:4000/auth/callback
```

> **Switching providers** — change `AUTH_PROVIDER` and restart the API. Existing user accounts are matched by email, so members keep their booking history regardless of which provider they log in with.

### 6. Set up admin access

```env
ADMIN_EMAILS=you@example.com,otherperson@example.com
```

Any email in this list gets `isAdmin = true` automatically on first login. After that, admin status can be managed from the admin console (`PATCH /api/admin/users/:id`) — you no longer need to keep the email in this list.

### 7. Start the development servers

```bash
pnpm dev
```

| App | URL |
|---|---|
| Member portal | http://localhost:5173 |
| API | http://localhost:4000 |
| Kiosk | http://localhost:5174 |
| Status screen | http://localhost:5175 |

---

## Pages & URLs

### Member Portal (`http://localhost:5173`)

| Page | URL | Who can access |
|---|---|---|
| Facility overview | `/` | All logged-in members |
| Shop detail | `/shop/<slug>` | All logged-in members |
| My bookings | `/my-bookings` | All logged-in members |
| Admin — bookings | `/admin` | Users with `isAdmin = true` |
| Admin — shops & resources | `/admin/shops` | Users with `isAdmin = true` |

> Append `?test` to any URL (e.g. `http://localhost:5173?test`) to activate **test mode** — all pages render with mock data, no API or login required.

### Kiosk (`http://localhost:5174`)

| Page | URL | Notes |
|---|---|---|
| Walk-in sign-in | `/` | Public — no login required |
| Reservation check-in | `/checkin` | Public — lists today's confirmed bookings |
| Who's In | `/whos-in` | Public — shows all active sessions |
| Active session | `/session` | Reached automatically after sign-in or check-in |

> Append `?test` to activate test mode. The kiosk is designed to run on a locked-down tablet at the front desk.

### Status Screen (`http://localhost:5175`)

| URL | What it shows |
|---|---|
| `http://localhost:5175` | All shops and all resources |
| `http://localhost:5175/<shop-slug>` | Single shop only (e.g. `/woodshop`) |
| `http://localhost:5175?test` | All shops, mock data |
| `http://localhost:5175/woodshop?test` | Single shop, mock data |

Configure each TV or monitor to open `http://<your-status-host>/<shop-slug>` so it shows only the relevant shop. The page auto-refreshes every 30 seconds.

### API (`http://localhost:4000`)

| Endpoint group | Base path | Auth |
|---|---|---|
| Auth | `/auth/*` | — |
| Member bookings | `/api/bookings/*` | Session cookie |
| Shops / resources (read) | `/api/shops/*` | Session cookie |
| Walk-in | `/api/walkin/*` | None (kiosk-trusted) |
| Kiosk session | `/api/kiosk/*` | None (kiosk-trusted) |
| Facility status | `/api/status` | None |
| Who's In | `/api/admin/whos-in` | None |
| Admin bookings | `/api/admin/bookings/*` | `isAdmin` required |
| Admin shops & resources | `/api/admin/shops/*`, `/api/admin/resources/*` | `isAdmin` required |

---

## Status Screen

The status screen (`apps/status`) is a standalone Vite app with no login requirement — mount it on any TV or monitor connected to a browser.

**Four states per resource card:**

| State | Background | Text | Condition |
|---|---|---|---|
| Available | Green `#24A148` | White | No active session, no upcoming booking |
| Reserved soon | Yellow `#F1C21B` | Black | A confirmed booking starts within 60 minutes |
| Occupied | Red `#DA1E28` | White | A member is currently checked in |
| Down / Maintenance | Orange `#FF6D00` | Black | Resource set to MAINTENANCE, or API unreachable |

Cards auto-size in a responsive grid (2 columns ≤ 4 resources, 3 columns ≤ 9, 4 columns for larger sets).

**Test mode** — append `?test` to the URL to render all four states with mock data, no API required:

```
http://localhost:5175?test
```

This uses the data in [`apps/status/src/mockData.ts`](apps/status/src/mockData.ts). Delete that file and the import in `App.tsx` when you no longer need it.

---

## Admin Console

The admin console is accessible at `/admin` in the member portal for any user with `isAdmin = true`.

**Capabilities:**

- **Booking table** — paginated list of all bookings across all resources; filterable by status, resource, shop, user, and date range.
- **Edit booking** — change booking status or reschedule start/end times (overlap check enforced).
- **Force-cancel** — cancel any booking regardless of state.
- **Shops & Resources** — create, edit, and delete shops; add and configure resources per shop (certifications required, cooldown, booking window, kiosk visibility).
- **Maintenance toggle** — put any resource in/out of MAINTENANCE from the resource detail page.
- **User management** — promote or demote admin status via `PATCH /api/admin/users/:id`.

---

## Google Calendar Sync

Each shop has an optional `gcalCalendarId` field in the database. When populated, the API:

1. **Creates** a GCal event when a booking is confirmed, stamping `extendedProperties.private.mnUid = mn-booking-{id}`.
2. **Polls** each calendar every 60 seconds via incremental sync tokens.
3. **Ignores** any incoming GCal change whose `mnUid` starts with `mn-booking-` — this prevents infinite sync loops.
4. **Recovers** from stale sync tokens (HTTP 410 Gone) by performing a full re-sync.

Set credentials in `.env`:

```env
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REFRESH_TOKEN=
```

---

## Slack Bot

The bot runs in Socket Mode (no inbound webhook required). Set credentials in `.env`:

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
SLACK_GUILD_CHANNELS=woodshop=#woodshop-captains,metalshop=#metal-captains,cnc=#cnc-captains,laser=#laser-captains,electronics=#electronics-captains
```

**Notifications sent:**

| Event | Channel |
|---|---|
| Booking created | Guild channel for the resource's shop |
| Booking cancelled | Guild channel |
| Member checked in | Guild channel |
| No-show detected | Guild channel + DM to the member |

---

## Booking Rules

| Rule | Default | Override |
|---|---|---|
| Booking window | 7 days ahead | `bookingWindowDays` per resource |
| No-show grace period | 15 min after start | `DEFAULT_NO_SHOW_GRACE_MINUTES` env var |
| High-demand cooldown | 4 hours between sessions | `cooldownHours` per resource |
| Session length | Unlimited | No cap — set by member's chosen end time |

Certification requirements are stored per resource (`requiredCertifications` string array). A member's certifications are either parsed from Authentik OIDC scopes on login or managed manually in the DB when using Slack login.

---

## Production Deployment

1. Set `NODE_ENV=production` and generate a strong `SESSION_SECRET`.
2. Point `DATABASE_URL` and `REDIS_URL` at your production instances.
3. Build all apps: `pnpm build`.
4. Run the API: `node apps/api/dist/index.js`.
5. Serve `apps/web/dist`, `apps/kiosk/dist`, and `apps/status/dist` from your static host or reverse proxy.
6. Set `API_PUBLIC_URL`, `WEB_PUBLIC_URL`, `KIOSK_PUBLIC_URL` to your production URLs.
7. Update all `*_REDIRECT_URI` env vars to match production URLs.

---

## Development Commands

```bash
pnpm dev              # start all apps in parallel (watch mode)
pnpm build            # production build for all apps
pnpm typecheck        # type-check all packages
pnpm db:migrate       # apply Prisma migrations
pnpm db:seed          # seed demo data
pnpm db:generate      # regenerate Prisma client after schema changes
pnpm db:studio        # open Prisma Studio
```
