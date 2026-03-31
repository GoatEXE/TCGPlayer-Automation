# TCGPlayer Selling Automation — Project Plan

> **Author:** Plan Drafter (AI-assisted)
> **Date:** 2026-03-28
> **Last Updated:** 2026-03-29
> **Status:** Phase 1 — In Progress
> - Phase 1.1 (Scaffolding): ✅ COMPLETE
> - Phase 1.2 (Database Setup): ✅ COMPLETE
> - Phase 1.3 (Core Libraries): ✅ COMPLETE
> - Phase 1.4 (API + Dashboard): ✅ COMPLETE
> - Phase 1.5 (Remaining): 🚧 IN PROGRESS — duplicate handling, live pricing, listing workflow

---

## 1. Executive Summary

This project builds a self-hosted web application that assists with selling duplicate Riftbound TCG cards on TCGPlayer. The core workflow is: import cards you want to sell (via CSV or manual entry), automatically calculate optimal listing prices at 98% of market price, generate listing CSV exports for bulk upload to TCGPlayer seller portal, monitor and adjust prices on a lazy schedule, and track sales through a dashboard with Telegram notifications.

The application is built with Node.js/TypeScript, React for the frontend, PostgreSQL for persistence, and is fully Dockerized for deployment on an Ubuntu Linux server. It uses the TCGTracking API (free, no authentication) for market price data and catalog lookups.

**Note on TCGPlayer API:** As of 2026, TCGPlayer's Seller API is closed to new applicants. This project adapts to a **Level 1 seller workflow** — the app generates pricing recommendations and CSV exports, but actual listing is done manually via TCGPlayer's seller portal.

The rollout is phased intentionally. Phase 1 delivers MVP functionality (card ingestion + pricing + export generation). Phases 2 and 3 layer on automated price monitoring and a full sales dashboard respectively.

---

## 2. Architecture Overview

**Production:**
```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                         │
│              ┌───────────────────────┐                  │
│              │    API Server (app)    │                  │
│              │  Fastify + Static Web  │                  │
│              │        :3000           │                  │
│              └──────────┬─────────────┘                  │
│                         │                                │
│           ┌─────────────┼─────────────┐                  │
│           │             │             │                  │
│           ▼             ▼             ▼                  │
│    ┌──────────┐  ┌──────────┐  ┌──────────────┐         │
│    │PostgreSQL│  │Scheduler │  │TCGPlayer API │         │
│    │   (db)   │  │(BullMQ)  │  │  (external)  │         │
│    │ internal │  │ Phase 2  │  └──────────────┘         │
│    └──────────┘  └──────────┘         │                 │
│                                        ▼                 │
│                                 ┌──────────────┐         │
│                                 │ Telegram Bot │         │
│                                 │  (external)  │         │
│                                 └──────────────┘         │
└─────────────────────────────────────────────────────────┘
```

**Development (COMPOSE_PROFILES=dev in .env):**
- Vite dev server runs separately at :5173 with hot reload
- Fastify API server at :3000
- PostgreSQL exposed at :5432 for dev tools (Drizzle Studio, etc.)
- Source code mounted as volumes for live reload

**Data flow:**

1. **Ingest:** User uploads CSV or enters card manually via Web UI → API Server parses and stores cards in PostgreSQL
2. **List:** API Server reads unprocessed cards → calls TCGPlayer Seller API to create listings at 98% market price → stores listing metadata in DB
3. **Monitor:** BullMQ scheduler triggers price check jobs (Phase 2) → API Server fetches current market prices → adjusts listings that have drifted
4. **Sell:** TCGPlayer order webhook or polling → API Server records sale → sends Telegram notification → dashboard displays status

---

## 3. Data Model

### Entities & Relationships

```
Card ──< Listing ──< PriceHistory
                  └──< Sale ──< Shipment
```

### Card

Represents a physical card you own and want to sell.

| Field            | Type       | Notes                                             |
| ---------------- | ---------- | ------------------------------------------------- |
| `id`             | UUID (PK)  | Internal identifier                               |
| `tcgplayerId`    | bigint     | TCGPlayer product ID (nullable until matched)     |
| `name`           | string     | Card name                                         |
| `setName`        | string     | Set/expansion name (e.g. "Riftbound Base Set")    |
| `setCode`        | string?    | Set abbreviation if available                     |
| `number`         | string?    | Card number within set                            |
| `rarity`         | string?    | Common / Uncommon / Rare / etc.                   |
| `condition`      | enum       | NM, LP, MP, HP, DMG                               |
| `quantity`       | int        | How many duplicates of this specific card          |
| `source`         | enum       | `csv_import` / `manual_entry`                     |
| `status`         | enum       | `pending` / `matched` / `listed` / `needs_attention` / `gift` / `error` |
| `rawCsvData`     | jsonb?     | Original CSV row for debugging                    |
| `createdAt`      | timestamp  |                                                   |
| `updatedAt`      | timestamp  |                                                   |

**Card Status Flow:**
- `pending` → Card imported but not yet priced
- `matched` → Card has market price, calculated listing price, ready to list
- `listed` → Card is actually listed for sale on TCGPlayer (manual workflow at Level 1)
- `gift` → Market price < $0.05, marked for inclusion as freebie in orders
- `needs_attention` → No market price found, requires manual review or retry
- `error` → Processing error occurred

### Listing

A TCGPlayer marketplace listing tied to a card.

| Field              | Type       | Notes                                           |
| ------------------ | ---------- | ----------------------------------------------- |
| `id`               | UUID (PK)  |                                                 |
| `cardId`           | UUID (FK)  | → Card                                          |
| `tcgplayerSkuId`   | bigint     | TCGPlayer SKU for this card+condition combo      |
| `tcgplayerListingId` | bigint?  | Returned by TCGPlayer after listing creation     |
| `quantity`         | int        | Quantity listed                                  |
| `priceCents`       | int        | Current listing price in cents                   |
| `marketPriceCents` | int?       | Last known market price in cents                 |
| `status`           | enum       | `active` / `sold` / `removed` / `error`         |
| `lastPriceCheck`   | timestamp? | When market price was last fetched               |
| `listedAt`         | timestamp? | When listing went live on TCGPlayer              |
| `createdAt`        | timestamp  |                                                 |
| `updatedAt`        | timestamp  |                                                 |

### PriceHistory

Historical record of market price checks for a listing.

| Field              | Type       | Notes                                           |
| ------------------ | ---------- | ----------------------------------------------- |
| `id`               | UUID (PK)  |                                                 |
| `listingId`        | UUID (FK)  | → Listing                                       |
| `marketPriceCents` | int        | Market price at time of check                    |
| `ourPriceCents`    | int        | Our listing price at time of check               |
| `adjustedToPrice`  | int?       | If we adjusted, the new price (null = no change) |
| `checkedAt`        | timestamp  |                                                 |

### Sale

Records a completed sale from TCGPlayer.

| Field              | Type       | Notes                                           |
| ------------------ | ---------- | ----------------------------------------------- |
| `id`               | UUID (PK)  |                                                 |
| `listingId`        | UUID (FK)  | → Listing                                       |
| `tcgplayerOrderId` | string     | TCGPlayer order reference                        |
| `quantitySold`     | int        |                                                 |
| `salePriceCents`   | int        | Actual sale price                                |
| `buyerName`        | string?    |                                                 |
| `orderStatus`      | enum       | `pending` / `confirmed` / `shipped` / `delivered` / `cancelled` |
| `soldAt`           | timestamp  |                                                 |
| `createdAt`        | timestamp  |                                                 |
| `updatedAt`        | timestamp  |                                                 |

### Shipment

Shipping/tracking info for a sale.

| Field              | Type       | Notes                                           |
| ------------------ | ---------- | ----------------------------------------------- |
| `id`               | UUID (PK)  |                                                 |
| `saleId`           | UUID (FK)  | → Sale                                          |
| `carrier`          | string?    | USPS, UPS, etc.                                  |
| `trackingNumber`   | string?    |                                                 |
| `shippedAt`        | timestamp? |                                                 |
| `deliveredAt`      | timestamp? |                                                 |
| `labelData`        | jsonb?     | Raw label/packing slip data for printing         |
| `createdAt`        | timestamp  |                                                 |
| `updatedAt`        | timestamp  |                                                 |

---

## 4. Phase 1 — MVP: Ingest + List (Detailed Breakdown)

**Goal:** Import cards, match them to TCGPlayer catalog entries, and create live listings at 98% market price. Validate API access works end-to-end.

### 4.1 Project Scaffolding

**Deliverable:** Runnable project skeleton with build/dev tooling.

**Structure — single repo, two packages:**

```
tcgplayer-automation/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json              # Root workspace config
├── tsconfig.base.json
├── packages/
│   ├── server/               # Fastify API server
│   │   ├── src/
│   │   │   ├── index.ts      # Server entry point
│   │   │   ├── config.ts     # Env var loading + validation
│   │   │   ├── routes/       # Route modules
│   │   │   ├── services/     # Business logic layer
│   │   │   ├── lib/          # TCGPlayer client, CSV parser, etc.
│   │   │   ├── jobs/         # BullMQ job processors (Phase 2+)
│   │   │   └── db/           # Drizzle schema + migrations
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                  # Vite + React frontend
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   └── api/          # API client helpers
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── docs/
│   └── PROJECT_PLAN.md       # This file
└── scripts/
    └── seed.ts               # Dev seed data
```

**Why a workspace monorepo instead of a single app?**
Keeps the server and frontend independently buildable/testable, but avoids the overhead of separate repos. npm/pnpm workspaces handle linking. The Dockerfile uses a multi-stage build — server stage builds the API, web stage builds the static frontend, final stage serves both.

**Tasks:**
- [x] Initialize pnpm workspace with `packages/server` and `packages/web`
- [x] Configure TypeScript (strict mode, path aliases)
- [x] Set up ESLint + Prettier (minimal config, not over-engineered)
- [x] Set up Vitest for both `packages/server` and `packages/web`
- [x] Configure test scripts in root `package.json`
- [x] Create `.env.example` with all required env vars documented
- [x] Verify `pnpm dev` starts both server and frontend concurrently

### 4.2 Database Setup + Schema

**Deliverable:** PostgreSQL running in Docker, schema applied via Drizzle migrations.

**Tasks:**
- [x] Add PostgreSQL 16 to `docker-compose.yml` with a named volume
- [x] Install Drizzle ORM + drizzle-kit in `packages/server`
- [x] Define Drizzle schema for `Card` (other entities are Phase 2/3)
- [x] Generate and run initial migration
- [x] Add `drizzle-kit studio` for visual DB inspection during dev
- [x] Create seed script (`scripts/seed.ts`) with sample cards

### 4.3 TCGPlayer API Client

> **⚠️ N/A — TCGPlayer API is closed to new applicants.**
> 
> As of 2026, TCGPlayer has closed their Seller API to new applications. This project uses the following alternatives:
> - **Price data:** TCGTracking API (free, no authentication required)
> - **Catalog lookup:** TCGTracking API
> - **Listing management:** Manual via TCGPlayer seller portal (Level 1 seller workflow)
> 
> This section is preserved for reference but all tasks are marked N/A.

**Original Deliverable (N/A):** Typed client library wrapping the TCGPlayer Seller API.

**Tasks:**
- [N/A] Implement OAuth token acquisition with automatic refresh
- [N/A] Build catalog search — find product by name + set + number
- [N/A] Build market price fetcher — get current market/low prices
- [N/A] Build inventory management — create listing, update price, remove listing
- [N/A] Add rate limiting / retry logic
- [N/A] Write integration tests
- [N/A] **Milestone: Validate API access**

### 4.4 CSV Import Service

**Deliverable:** Parse TCGPlayer mobile app CSV exports and upsert cards into the database.

**Confirmed CSV Format:** 16 columns:
```
TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL
```

**Key Columns:**
- `TCGplayer Id` — Product/SKU ID (allows skipping catalog search)
- `Product Line` — "Riftbound: League of Legends Trading Card Game"
- `Set Name` — e.g., "Origins"
- `Add to Quantity` — Actual card count (use this, not `Total Quantity`)
- `TCG Market Price` — Current market price (useful for validation)

**Tasks:**
- [x] Sample CSV obtained — 16-column format with TCGplayer Id, Product Line, Set Name, Product Name, Title, Number, Rarity, Condition, pricing fields, Add to Quantity, Photo URL
- [x] Build CSV parser using `papaparse` or `csv-parse` with column-name-aware mapping
- [x] Map CSV columns to `Card` schema fields:
  - `TCGplayer Id` → `tcgplayerId`
  - `Product Name` → `name`
  - `Set Name` → `setName`
  - `Number` → `number`
  - `Rarity` → `rarity`
  - `Condition` → `condition`
  - `Add to Quantity` → `quantity`
  - `TCG Market Price` → use for initial price calculation
- [x] Handle duplicates (same card + condition = increment quantity, not new row)
  - CSV: matches on `tcgplayerId + condition`
  - TXT: matches on `productName + setName + number + condition`
- [x] Extract `tcgProductId` from photo URLs during CSV import (`/product/652954_...` → `652954`)
- [x] Store raw CSV row in `rawCsvData` for debugging
- [x] Return import summary: `{ imported: N, updated: N, errors: [...], cards: [...] }`
- [x] Create API endpoint: `POST /api/cards/import` (multipart file upload)
- [x] Support TXT import format: `"{quantity} {card name} [{set code}] {number}"` — requires catalog lookup to resolve TCGPlayer IDs
- [x] Build TXT parser with regex: `^(\d+)\s+(.+?)\s+\[(\w+)\]\s+(.+)$`
- [x] ~~Create API endpoint: `POST /api/cards/import-txt`~~ Combined with `POST /api/cards/import` (auto-detects format)

### 4.5 Manual Card Entry UI

> **⚠️ N/A for current workflow.**
>
> Project is explicitly CSV/TXT import-first. Dustin does not plan to add cards one-by-one through a manual entry form.

**Original Deliverable (N/A):** Web form to add cards one at a time.

**Tasks:**
- [N/A] Build card search component — user types card name, autocomplete searches TCGPlayer catalog (no API access)
- [N/A] Build card entry form — select card from search results, pick condition, enter quantity (not used in CSV-first workflow)
- [N/A] Create API endpoint: `POST /api/cards` (single card creation, not needed for CSV-first workflow)
- [N/A] Create API endpoint: `GET /api/cards/search?q=` (no TCGPlayer catalog access)
- [N/A] Show list of pending/unmatched cards with option to manually match (not needed for CSV-first workflow)

### 4.6 Listing Creation Pipeline

**Deliverable:** Take matched cards and push them to TCGPlayer as live listings at 98% of market price.

**Pipeline steps:**
1. Find all cards with `status = 'matched'` (or user triggers listing for specific cards)
2. For each card, fetch current market price from TCGPlayer
3. Calculate listing price: `Math.round(marketPriceCents * 0.98)` (round to nearest cent)
4. Call TCGPlayer inventory API to create the listing
5. Store listing record in DB, update card status to `listed`
6. Handle errors gracefully — mark card as `error` with details, don't block the batch

**Tasks:**
- [x] Implement pricing calculation function (98% of market, rounded to nearest penny)
- [N/A] Build batch listing service that processes a set of matched cards (manual listing at Level 1)
- [N/A] Create API endpoint: `POST /api/listings/create` (no API access for automated listing)
- [N/A] Create API endpoint: `POST /api/listings/create-all` (no API access for automated listing)
- [N/A] Add error handling and partial failure support (manual listing workflow at Level 1)
- [x] Handle cards with no market price data — skip listing, set card status to `needs_attention`, trigger notification, queue for retry on next price check cycle
- [x] Cards with market price < $0.05: mark as `gift` — these are freebies to include in orders to encourage positive reviews
- [x] Cards with market price >= $0.05: eligible for listing at 98% market price
- [x] No hard minimum listing floor — list everything $0.05+ to maximize inventory for order consolidation
- [x] Track profitability per ORDER (after $0.30 fee split), not per individual card
- [x] Foil price fallback — when Normal pricing unavailable, fall back to Foil pricing with `isFoilPrice` indicator
- [x] Build simple "review and confirm" UI step — show user what will be listed at what price before pushing

### 4.7 Basic API Endpoints (Full Phase 1 Summary)

| Method | Path                       | Status | Description                             |
| ------ | -------------------------- | ------ | --------------------------------------- |
| GET    | `/api/cards`               | ✅     | List all cards (paginated, filterable)  |
| POST   | `/api/cards`               | N/A    | Add single card manually (CSV-first workflow) |
| POST   | `/api/cards/import`        | ✅     | Upload CSV/TXT file for import          |
| GET    | `/api/cards/search`        | N/A    | Search TCGPlayer catalog (no API)       |
| PATCH  | `/api/cards/:id`           | ✅     | Update card details                     |
| DELETE | `/api/cards/:id`           | ✅     | Remove card                             |
| GET    | `/api/cards/stats`         | ✅     | Status counts (pending/matched/gift)    |
| POST   | `/api/cards/:id/reprice`   | ✅     | Re-price single card                    |
| POST   | `/api/cards/reprice-all`   | ✅     | Bulk re-price all cards                 |
| POST   | `/api/cards/fetch-prices`  | ✅     | Fetch latest prices from TCGTracking API |
| POST   | `/api/cards/mark-listed`   | ✅     | Bulk mark matched cards as listed       |
| POST   | `/api/cards/:id/unlist`    | ✅     | Return listed card back to matched      |
| GET    | `/api/listings`            | 📋     | List all listings                       |
| POST   | `/api/listings/create`     | N/A    | Create listings (no API, manual)        |
| POST   | `/api/listings/create-all` | N/A    | Create listings (no API, manual)        |
| GET    | `/api/health`              | ✅     | Health check                            |

**Legend:** ✅ Complete | 📋 TODO | N/A Not Applicable

### 4.8 Docker Compose Setup

**Deliverable:** `docker-compose up` starts the full stack — database + application server with built frontend.

```yaml
# Services:
#   db   — PostgreSQL 16 with named volume (internal only, not exposed in production)
#   app  — Node.js server (Fastify) serving API + static frontend build
```

**Multi-stage Dockerfile:**
1. **deps** — Install all dependencies (dev + prod)
2. **build-web** — Build React frontend (Vite)
3. **build-server** — Build server TypeScript → JavaScript
4. **prod-deps** — Install only production dependencies
5. **production** — Final runtime image with built code + prod deps only

**Key Features:**
- Single `docker-compose.yml` with profiles controlled by `COMPOSE_PROFILES` in `.env`
- Production mode (`COMPOSE_PROFILES=prod`): DB not exposed, serves built frontend, restart policy enabled
- Development mode (`COMPOSE_PROFILES=dev`): hot reload via bind mounts, DB exposed on port 5432, Vite dev server on 5173
- `@fastify/static` serves built frontend at `/` in production
- SPA fallback: all non-API routes serve `index.html` (client-side routing)
- Health check on DB before starting app
- `.env` file loaded for user configuration (Telegram tokens, pricing params, etc.)
- `restart: unless-stopped` for production reliability

**Tasks:**
- [x] Multi-stage Dockerfile: deps → build-web → build-server → prod-deps → production
- [x] Install `@fastify/static` for serving frontend
- [x] Configure Fastify to serve `packages/web/dist/` with SPA fallback
- [x] Single `docker-compose.yml` with profiles for dev and prod modes
- [x] Use `COMPOSE_PROFILES` env variable in `.env` to control mode
- [x] Development profile: hot reload, exposed DB port, Vite dev server
- [x] Production profile: built image, internal DB, restart policy
- [x] Environment variable passthrough via `.env` file
- [x] Update `.dockerignore` to exclude unnecessary files
- [x] Update `.env.example` to document profile usage
- [x] Update README.md with Docker-first workflow
- [x] Verify clean `docker compose up` from scratch works
- [x] Add database migration service or run migrations in app startup

### 4.9 Remaining Phase 1 Work

**Status:** ✅ COMPLETE

**Completed:**
- [x] Handle duplicates (same card + condition = increment quantity, not new row)
- [x] Wire up live TCGTracking price fetching with `POST /api/cards/fetch-prices`
- [x] Foil price fallback when Normal pricing unavailable

**Completed in this pass:**
- [x] Build "review and confirm" UI — preview what to list before committing
- [x] Add ability to mark cards as "listed" from the dashboard
- [x] Auto-run migrations on startup
- [x] ESLint + Prettier setup (nice to have)
- [x] Seed script for dev data (nice to have)
- [x] Manual one-by-one card entry scope clarified as N/A for CSV/TXT import-first workflow

---

## 5. Phase 2 — Price Monitoring & Auto-Adjustment

**Goal:** Keep listings competitively priced by checking market prices on a lazy schedule and adjusting when drift exceeds a threshold.

Implementation notes: [Phase 2.1 BullMQ + Redis Migration](./phase2/PHASE2_BULLMQ_REDIS.md)

### 5.1 Price Check Scheduler ✅ CORE COMPLETE (Phase 2.1 infrastructure)

**Implementation details:** See [PHASE2_BULLMQ_REDIS.md](phase2/PHASE2_BULLMQ_REDIS.md)

**Tasks:**
- [x] Set up BullMQ with a Redis container (add to `docker-compose.yml`)
- [x] Create repeating job: "check-prices" — runs every 12 hours by default (configurable via env var)
- [x] Make price check interval configurable via environment variable (e.g., `PRICE_CHECK_INTERVAL_HOURS`, default: 12)
- [x] Job fetches all cards, batches by set, fetches market prices from TCGTracking
- [x] Worker calls `runPriceCheck({ source: 'scheduled' })` which updates all card prices/statuses
- [ ] Expose price check interval in web UI settings
- [x] Record each check in `PriceHistory` (implemented via `price_history` + `runPriceCheck`)
- [ ] Re-check `needs_attention` cards during each price check cycle — if market price now available, auto-list at 98% and update status

### 5.2 Auto-Adjustment Logic

**Tasks:**
- [ ] Compare current listing price to 98% of current market price
- [ ] If difference exceeds threshold (configurable, default: ≥2%), update the listing
- [ ] Call TCGPlayer inventory API to update price
- [ ] Log adjustments in `PriceHistory` (with `adjustedToPrice` populated)
- [x] Add safeguards: max price drop per adjustment (e.g., no more than 20% drop in a single adjustment to catch API anomalies)
- [x] Add backend support for a floor price option per card (optional, default: none) to prevent listing below a minimum
- [x] Add floor price controls in the dashboard UI (set/clear per-card `floorPriceCents`)
- [ ] During price checks, evaluate active listings that should be REMOVED (market price dropped below $0.05) — delist and set card status to `gift`
- [ ] During price checks, evaluate `gift` cards that should be LISTED (market price rose above $0.05) — queue for relisting at 98% market
- [ ] Generate CSV diff per price check cycle: new listings to add, listings to remove, price changes

### 5.3 Monitoring UI

**Tasks:**
- [x] Add "Price History" view for each listing — show chart or table of price over time
- [x] Add "Last Checked" column on listings page
- [x] Add manual "Refresh Prices" button that triggers an immediate price check job
- [x] Show adjustment log — when prices were changed and why

---

## 6. Phase 3 — Dashboard, Notifications & Invoicing

**Goal:** Full operational dashboard for managing the selling workflow end-to-end.

### 6.1 Sales Dashboard

**Tasks:**
- [ ] Active listings view — sortable/filterable table with current price, market price, quantity, status
- [ ] Sales history view — completed sales with date, card, price, buyer, order status
- [ ] Summary stats cards: total listed, total sales revenue, active listing count, average sale price
- [ ] Order status tracking — sync order statuses from TCGPlayer API on a schedule

### 6.2 Shipment Tracking

**Tasks:**
- [ ] Create shipment records when orders are confirmed
- [ ] UI to enter tracking number and carrier
- [ ] Push tracking info back to TCGPlayer via their API (update order status)
- [ ] Display shipment status timeline in dashboard

### 6.3 Invoice / Packing Slip Generation

**Tasks:**
- [ ] Build printable invoice template (HTML → PDF or browser print)
- [ ] Include: buyer info, card details, sale price, order ID, your seller info
- [ ] "Print" button on each sale that opens print-friendly view
- [ ] Packing slip variant — simpler format for including in shipment

### 6.4 Telegram Notifications

**Tasks:**
- [ ] Create Telegram bot via BotFather, store token in env
- [ ] Implement notification service: `sendTelegramMessage(chatId, message)`
- [ ] Trigger on: new sale confirmed, order shipped, price adjustment (optional), card skipped due to missing market price (needs_attention)
- [ ] Message format: card name, sale price, buyer, order link
- [ ] Make notification triggers configurable (env vars or DB settings)

### 6.5 Additional API Endpoints (Phase 3)

| Method | Path                            | Description                              |
| ------ | ------------------------------- | ---------------------------------------- |
| GET    | `/api/sales`                    | List sales (paginated, filterable)       |
| GET    | `/api/sales/:id`                | Sale detail with shipment info           |
| POST   | `/api/sales/:id/ship`           | Record shipment + push to TCGPlayer      |
| GET    | `/api/sales/:id/invoice`        | Generate invoice HTML/PDF                |
| GET    | `/api/sales/:id/packing-slip`   | Generate packing slip HTML/PDF           |
| GET    | `/api/dashboard/stats`          | Aggregate stats for dashboard            |
| GET    | `/api/listings/:id/price-history` | Price history for a listing            |
| POST   | `/api/listings/refresh-prices`  | Trigger manual price check               |

---

## 7. API Design Notes

### Authentication
For Phase 1, the app is self-hosted and single-user, so we'll skip user auth. The API is only accessible from the local network / Docker network. If needed later, a simple API key middleware or basic auth can be added.

### Request/Response Conventions
- All responses: `{ data: T }` for success, `{ error: { message: string, code: string } }` for errors
- Pagination: `?page=1&limit=20` → response includes `{ data: T[], meta: { page, limit, total } }`
- Dates: ISO 8601 strings
- Money: always in **cents** (integer) to avoid floating point issues. Frontend formats for display.

### Error Handling
- Fastify error handler catches all unhandled errors
- TCGPlayer API errors are caught and translated into meaningful internal error codes
- Failed listing attempts are marked in DB with error details, not silently dropped

---

## 8. Tech Decisions

### Backend Framework: **Fastify**

Fastify over Express for:
- Built-in schema validation (JSON Schema / TypeBox) — we get request validation and auto-generated types
- Better performance (not critical at our scale, but nice to have)
- First-class TypeScript support
- Plugin system is clean and well-documented

Express would also work fine. Fastify is the recommendation but not a hill to die on.

### Frontend: **Vite + React**

Vite + React over Next.js because:
- This is a **single-page dashboard app**, not a content site — we don't need SSR, ISR, or file-based routing
- Vite is simpler to configure and faster to build
- The API server is separate (Fastify), so Next.js API routes would be redundant
- Smaller deployment footprint — just static files served by Fastify (or nginx)
- Less framework lock-in and fewer "magic" conventions to learn/fight

We'll use **React Router** for client-side routing and **TanStack Query** for API data fetching/caching.

### ORM: **Drizzle**

Drizzle over Prisma because:
- **SQL-first** — the query builder reads like SQL, which is easier to reason about for someone who knows SQL
- **No binary engine** — Prisma requires a Rust binary engine; Drizzle is pure TypeScript. Simpler Docker builds, smaller images
- Better migration story for iterative development (`drizzle-kit push` for dev, `drizzle-kit generate` for production migrations)
- TypeScript types are inferred directly from the schema — no code generation step
- Lighter weight overall

### Job Scheduling: **BullMQ** (Phase 2+)

BullMQ over node-cron because:
- Job persistence — if the server restarts, pending jobs aren't lost
- Job retries with configurable backoff
- Concurrency control — important for respecting TCGPlayer rate limits
- Dashboard available (Bull Board) for monitoring job status
- Overkill for Phase 1, so we only introduce it in Phase 2 when scheduling matters

For Phase 1, any one-off operations (like "list all matched cards") are just direct API calls — no scheduler needed.

### Package Manager: **pnpm**

Fast, disk-efficient, good workspace support. No strong opinion here — npm or yarn would also work.

---

## 9. Risk & Open Questions

### TCGPlayer API Access

| Risk | Detail | Mitigation |
| ---- | ------ | ---------- |
| **API key approval** | TCGPlayer requires a seller account and API application approval. This can take days/weeks. | Apply immediately. Phase 1 is designed so scaffolding and CSV import can proceed while waiting. |
| **API deprecation** | TCGPlayer has historically deprecated API versions. Current version (v2?) needs verification. | Check current API docs at time of implementation. Build the client as an isolated module for easy replacement. |
| **Rate limits** | Documented at ~300 requests/minute. Batch operations (price checks on 500 listings) need to respect this. | Build rate limiter into the API client. BullMQ concurrency controls in Phase 2. |
| **SKU matching complexity** | Cards have multiple SKUs (condition, printing, language). Matching CSV data to the right SKU may require fuzzy logic. | Start with exact matching. Add fuzzy/manual match fallback. Store `rawCsvData` for debugging. |

### Resolved Decisions

1. **TCGPlayer API closure:** TCGPlayer Seller API is closed to new applicants as of 2026. **Workaround:** Price data comes from TCGTracking API (free, no auth). Listing is manual via TCGPlayer seller portal (Level 1 seller workflow). This app generates CSV exports and pricing recommendations; actual listing is done by hand.
2. **No market price handling:** Do NOT list the card. Mark it as `needs_attention` in the UI, send a Telegram notification ("Card X couldn't be listed: no market price data"), and on the next price check cycle, re-attempt to find a market price. If a price is found, auto-list it at 98% market. This combines graceful skipping, user notification, and automatic retry.
3. **Minimum listing price:** Cards under $0.05 → gift pool (freebies for positive reviews). Everything $0.05+ gets listed. No hard floor — consolidation strategy prioritizes inventory breadth. Re-evaluated each price check cycle — auto-listed if market price rises above threshold. See `docs/research/tcgplayer-fees/FEE_ANALYSIS.md` for profitability analysis.
4. **Hosting/access:** Local network only, no external access. Telegram integration will use **polling mode** (not webhooks) to avoid needing inbound connections.
5. **Seller account:** Dustin does not have one yet; will apply. This is a known dependency for Phase 1 POC validation.

### Open Questions (To Resolve Before or During Phase 1)

1. **What does the TCGPlayer mobile app CSV actually look like?** We need a sample file to build the parser. Column names, delimiter, encoding, etc.
2. **Which TCGPlayer API version should we target?** Need to verify current API docs and endpoints. The v2 API may have different auth flows.

### Future / Backlog Ideas

- Automatic invoice printing (e.g., print server integration or Google Cloud Print successor)
- Bulk operations — select multiple cards and batch-change condition, price, etc.
- Advanced pricing strategies — tiered pricing, floor prices, condition-based multipliers
- Multi-game support — not just Riftbound (architecture should not assume single game, but we won't optimize for it in Phase 1)
- Additional notification channels — Discord, email
- Profit tracking — input card acquisition cost, track margin per sale

---

## 10. Development Workflow

### Testing Philosophy

This project follows a **test-first** workflow:
1. Write tests that define expected behavior
2. Implement the feature
3. Validate the implementation against the tests

We use **Vitest** as the test runner (aligned with the Vite ecosystem). Tests live alongside source files:
- `packages/server/src/services/csv-import.test.ts`
- `packages/server/src/lib/tcgplayer/catalog.test.ts`
- etc.

Key scripts:
- `pnpm test` — run all tests
- `pnpm test:watch` — watch mode during development
- `pnpm test:coverage` — coverage report

### Getting Started (Dev)
```bash
# Clone and install
git clone <repo>
cd tcgplayer-automation
pnpm install

# Start database
docker compose up db -d

# Run migrations
pnpm --filter server db:migrate

# Start dev servers (API + frontend with hot reload)
pnpm dev

# API available at http://localhost:3000
# Frontend available at http://localhost:5173
```

### Production Deployment
```bash
# Build and start everything
docker compose up --build -d

# App available at http://<server-ip>:3000
```

### Key Scripts
```json
{
  "dev": "concurrently \"pnpm --filter server dev\" \"pnpm --filter web dev\"",
  "build": "pnpm --filter server build && pnpm --filter web build",
  "test": "pnpm --filter server test && pnpm --filter web test",
  "test:watch": "pnpm --filter server test:watch",
  "test:coverage": "pnpm --filter server test -- --coverage",
  "db:migrate": "pnpm --filter server drizzle-kit migrate",
  "db:studio": "pnpm --filter server drizzle-kit studio",
  "db:seed": "pnpm --filter server tsx scripts/seed.ts"
}
```

---

## 11. Phase Milestones Summary

| Phase | Milestone | Key Deliverable | Status |
| ----- | --------- | --------------- | ------ |
| 1.1 | Scaffolding | Runnable project skeleton | ✅ COMPLETE |
| 1.2 | Database | Schema + migrations working | ✅ COMPLETE |
| 1.3 | ~~TCGPlayer Client~~ | ~~API client with auth + catalog + pricing~~ | N/A (API closed) |
| 1.4 | CSV Import | Upload and parse CSV → cards in DB | ✅ COMPLETE |
| 1.5 | Manual Entry | Web form to search + add cards | 📋 TODO |
| 1.6 | Listing Pipeline | Cards → live TCGPlayer listings | ⚠️ Manual workflow (no API) |
| 1.7 | Docker Setup | Full `docker compose up` deployment | ✅ COMPLETE |
| 1.8 | API Endpoints | Core CRUD + import + pricing | ✅ COMPLETE |
| 1.9 | Dashboard | Card management UI | ✅ COMPLETE |
| **1** | **MVP Complete** | **Cards imported and priced for listing** | 🚧 IN PROGRESS |
| 2.1 | Price Scheduler | BullMQ + Redis + repeating job | ✅ COMPLETE |
| 2.2 | Max Drop Safeguard | Cap single-cycle listing price drops | ✅ COMPLETE |
| 2.3 | Price History UI | Per-card price history viewer | ✅ COMPLETE |
| 2.4 | Floor Price Backend | Optional per-card minimum listing price | ✅ COMPLETE |
| 2.5 | Auto-Adjust Logic | Price drift detection + bidirectional threshold management | 📋 TODO |
| 2.6 | Frontend Floor UI | UI controls for setting floor prices | 📋 TODO |
| **2** | **Price Monitoring Complete** | **Listings stay competitively priced** | **🚧 IN PROGRESS** |
| 3.1 | Sales Dashboard | Active listings + sales history views | Medium |
| 3.2 | Shipment Tracking | Tracking entry + status sync | Medium |
| 3.3 | Invoicing | Printable invoice + packing slip | Small |
| 3.4 | Telegram | Sale notifications | Small |
| **3** | **Full Dashboard Complete** | **End-to-end selling workflow** | **—** |

---

*This plan is a living document. Update it as decisions are made and questions are resolved.*
