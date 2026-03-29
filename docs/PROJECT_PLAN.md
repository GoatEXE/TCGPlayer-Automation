# TCGPlayer Selling Automation — Project Plan

> **Author:** Plan Drafter (AI-assisted)
> **Date:** 2026-03-28
> **Status:** Draft — awaiting Dustin's review before implementation begins

---

## 1. Executive Summary

This project builds a self-hosted web application that automates selling duplicate Riftbound TCG cards on TCGPlayer. The core workflow is: import cards you want to sell (via CSV or manual entry), automatically list them on TCGPlayer at 98% of market price, monitor and adjust prices on a lazy schedule, and track sales through a dashboard with Telegram notifications.

The application is built with Node.js/TypeScript, React for the frontend, PostgreSQL for persistence, and is fully Dockerized for deployment on an Ubuntu Linux server. It communicates with the TCGPlayer Seller API for catalog lookups, inventory management, and order tracking.

The rollout is phased intentionally. Phase 1 serves double duty as both MVP functionality (card ingestion + automated listing) and as a proof-of-concept to validate TCGPlayer API access early — before investing in dashboard polish and monitoring infrastructure. Phases 2 and 3 layer on price monitoring and a full sales dashboard respectively.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                         │
│  ┌──────────────┐     ┌──────────────┐                  │
│  │   Frontend    │────▶│  API Server  │                  │
│  │  (Vite+React) │     │  (Fastify)   │                  │
│  │  :5173        │     │  :3000       │                  │
│  └──────────────┘     └──────┬───────┘                  │
│                              │                           │
│                 ┌────────────┼────────────┐              │
│                 │            │            │              │
│                 ▼            ▼            ▼              │
│          ┌──────────┐ ┌──────────┐ ┌──────────────┐     │
│          │PostgreSQL│ │Scheduler │ │TCGPlayer API │     │
│          │  :5432   │ │(BullMQ)  │ │  (external)  │     │
│          └──────────┘ └──────────┘ └──────────────┘     │
│                                          │              │
│                                          ▼              │
│                                   ┌──────────────┐      │
│                                   │ Telegram Bot │      │
│                                   │  (external)  │      │
│                                   └──────────────┘      │
└─────────────────────────────────────────────────────────┘
```

**Data flow:**

1. **Ingest:** User uploads CSV or enters card manually via Web UI → API Server parses and stores cards in PostgreSQL
2. **List:** API Server reads unprocessed cards → calls TCGPlayer Seller API to create listings at 98% market price → stores listing metadata in DB
3. **Monitor:** BullMQ scheduler triggers price check jobs → API Server fetches current market prices → adjusts listings that have drifted
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
| `status`         | enum       | `pending` / `matched` / `listed` / `needs_attention` / `error` |
| `rawCsvData`     | jsonb?     | Original CSV row for debugging                    |
| `createdAt`      | timestamp  |                                                   |
| `updatedAt`      | timestamp  |                                                   |

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
- [ ] Initialize pnpm workspace with `packages/server` and `packages/web`
- [ ] Configure TypeScript (strict mode, path aliases)
- [ ] Set up ESLint + Prettier (minimal config, not over-engineered)
- [ ] Set up Vitest for both `packages/server` and `packages/web`
- [ ] Configure test scripts in root `package.json`
- [ ] Create `.env.example` with all required env vars documented
- [ ] Verify `pnpm dev` starts both server and frontend concurrently

### 4.2 Database Setup + Schema

**Deliverable:** PostgreSQL running in Docker, schema applied via Drizzle migrations.

**Tasks:**
- [ ] Add PostgreSQL 16 to `docker-compose.yml` with a named volume
- [ ] Install Drizzle ORM + drizzle-kit in `packages/server`
- [ ] Define Drizzle schema for `Card`, `Listing`, `PriceHistory`, `Sale`, `Shipment`
- [ ] Generate and run initial migration
- [ ] Add `drizzle-kit studio` for visual DB inspection during dev
- [ ] Create seed script (`scripts/seed.ts`) with sample cards

### 4.3 TCGPlayer API Client

**Deliverable:** Typed client library wrapping the TCGPlayer Seller API.

**Key endpoints needed (Phase 1):**
- `POST /token` — OAuth bearer token (client credentials flow)
- `GET /catalog/products` — Search products by name
- `GET /pricing/product/{productIds}/marketprices` — Get market prices
- `GET /catalog/skus` — Get SKUs for a product (condition + printing combos)
- `POST /inventory` — Create/update inventory listings
- `GET /inventory` — Read current inventory

**Implementation:**
```
packages/server/src/lib/tcgplayer/
├── client.ts          # Axios/fetch wrapper with auth token management
├── auth.ts            # Token acquisition + refresh + caching
├── catalog.ts         # Product search, SKU lookup
├── pricing.ts         # Market price fetching
├── inventory.ts       # Listing CRUD
└── types.ts           # TypeScript types for API responses
```

**Tasks:**
- [ ] Implement OAuth token acquisition with automatic refresh
- [ ] Build catalog search — find product by name + set + number
- [ ] Build market price fetcher — get current market/low prices
- [ ] Build inventory management — create listing, update price, remove listing
- [ ] Add rate limiting / retry logic (TCGPlayer rate limits: ~300 req/min per their docs)
- [ ] Write integration tests (can be run against real API with test credentials)
- [ ] **Milestone: Validate API access** — manually run a catalog search and confirm we get results back

### 4.4 CSV Import Service

**Deliverable:** Parse TCGPlayer mobile app CSV exports and upsert cards into the database.

**Tasks:**
- [ ] Obtain a sample CSV export from the TCGPlayer mobile app to understand column structure
- [ ] Build CSV parser using `papaparse` or `csv-parse`
- [ ] Map CSV columns to `Card` schema fields
- [ ] Handle duplicates (same card + condition = increment quantity, not new row)
- [ ] Store raw CSV row in `rawCsvData` for debugging
- [ ] Return import summary: `{ imported: N, duplicatesUpdated: N, errors: [...] }`
- [ ] Create API endpoint: `POST /api/cards/import` (multipart file upload)

### 4.5 Manual Card Entry UI

**Deliverable:** Web form to add cards one at a time, with TCGPlayer catalog search for matching.

**Tasks:**
- [ ] Build card search component — user types card name, autocomplete searches TCGPlayer catalog
- [ ] Build card entry form — select card from search results, pick condition, enter quantity
- [ ] Create API endpoint: `POST /api/cards` (single card creation)
- [ ] Create API endpoint: `GET /api/cards/search?q=` (proxies to TCGPlayer catalog search)
- [ ] Show list of pending/unmatched cards with option to manually match

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
- [ ] Implement pricing calculation function (98% of market, rounded to nearest penny)
- [ ] Build batch listing service that processes a set of matched cards
- [ ] Create API endpoint: `POST /api/listings/create` (trigger listing for selected cards)
- [ ] Create API endpoint: `POST /api/listings/create-all` (list all matched cards)
- [ ] Add error handling and partial failure support
- [ ] Handle cards with no market price data — skip listing, set card status to `needs_attention`, trigger notification, queue for retry on next price check cycle
- [ ] Build simple "review and confirm" UI step — show user what will be listed at what price before pushing

### 4.7 Basic API Endpoints (Full Phase 1 Summary)

| Method | Path                       | Description                             |
| ------ | -------------------------- | --------------------------------------- |
| GET    | `/api/cards`               | List all cards (paginated, filterable)  |
| POST   | `/api/cards`               | Add single card manually                |
| POST   | `/api/cards/import`        | Upload CSV file for import              |
| GET    | `/api/cards/search`        | Search TCGPlayer catalog                |
| PATCH  | `/api/cards/:id`           | Update card details                     |
| DELETE | `/api/cards/:id`           | Remove card                             |
| GET    | `/api/listings`            | List all listings                       |
| POST   | `/api/listings/create`     | Create listings for selected cards      |
| POST   | `/api/listings/create-all` | Create listings for all matched cards   |
| GET    | `/api/health`              | Health check                            |

### 4.8 Docker Compose Setup

**Deliverable:** `docker-compose up` starts the full stack.

```yaml
# Services:
#   app      — Node.js server (Fastify) serving API + static frontend build
#   db       — PostgreSQL 16 with named volume
#   migrate  — One-shot container that runs Drizzle migrations on startup
```

**Tasks:**
- [ ] Multi-stage Dockerfile: build server → build frontend → runtime image
- [ ] `docker-compose.yml` with `app`, `db`, and `migrate` services
- [ ] Environment variable passthrough for TCGPlayer API keys, DB URL, etc.
- [ ] Development override: `docker-compose.override.yml` with hot reload via bind mounts
- [ ] Verify clean `docker compose up` from scratch works

---

## 5. Phase 2 — Price Monitoring & Auto-Adjustment

**Goal:** Keep listings competitively priced by checking market prices on a lazy schedule and adjusting when drift exceeds a threshold.

### 5.1 Price Check Scheduler

**Tasks:**
- [ ] Set up BullMQ with a Redis container (add to `docker-compose.yml`)
- [ ] Create repeating job: "check-prices" — runs every 12 hours by default (configurable via env var)
- [ ] Job fetches all active listings, batches them into groups of ~50 (to stay within rate limits)
- [ ] For each batch, fetch market prices from TCGPlayer
- [ ] Record each check in `PriceHistory`
- [ ] Re-check `needs_attention` cards during each price check cycle — if market price now available, auto-list at 98% and update status

### 5.2 Auto-Adjustment Logic

**Tasks:**
- [ ] Compare current listing price to 98% of current market price
- [ ] If difference exceeds threshold (configurable, default: ≥2%), update the listing
- [ ] Call TCGPlayer inventory API to update price
- [ ] Log adjustments in `PriceHistory` (with `adjustedToPrice` populated)
- [ ] Add safeguards: max price drop per adjustment (e.g., no more than 20% drop in a single adjustment to catch API anomalies)
- [ ] Add a floor price option per card (optional, default: none) to prevent listing below a minimum

### 5.3 Monitoring UI

**Tasks:**
- [ ] Add "Price History" view for each listing — show chart or table of price over time
- [ ] Add "Last Checked" column on listings page
- [ ] Add manual "Refresh Prices" button that triggers an immediate price check job
- [ ] Show adjustment log — when prices were changed and why

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

1. **No market price handling:** Do NOT list the card. Mark it as `needs_attention` in the UI, send a Telegram notification ("Card X couldn't be listed: no market price data"), and on the next price check cycle, re-attempt to find a market price. If a price is found, auto-list it at 98% market. This combines graceful skipping, user notification, and automatic retry.
2. **Minimum price:** No floor price. Follow the market value as-is.
3. **Hosting/access:** Local network only, no external access. Telegram integration will use **polling mode** (not webhooks) to avoid needing inbound connections.
4. **Seller account:** Dustin does not have one yet; will apply. This is a known dependency for Phase 1 POC validation.

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

| Phase | Milestone | Key Deliverable | Est. Effort |
| ----- | --------- | --------------- | ----------- |
| 1.1 | Scaffolding | Runnable project skeleton | Small |
| 1.2 | Database | Schema + migrations working | Small |
| 1.3 | TCGPlayer Client | API client with auth + catalog + pricing | Medium |
| 1.4 | CSV Import | Upload and parse CSV → cards in DB | Small |
| 1.5 | Manual Entry | Web form to search + add cards | Medium |
| 1.6 | Listing Pipeline | Cards → live TCGPlayer listings | Medium |
| 1.7 | Docker Setup | Full `docker compose up` deployment | Small |
| **1** | **MVP Complete** | **Cards imported and listed on TCGPlayer** | **—** |
| 2.1 | Price Scheduler | BullMQ + Redis + repeating job | Medium |
| 2.2 | Auto-Adjust | Price drift detection + update | Medium |
| 2.3 | Monitoring UI | Price history views + manual refresh | Small |
| **2** | **Price Monitoring Complete** | **Listings stay competitively priced** | **—** |
| 3.1 | Sales Dashboard | Active listings + sales history views | Medium |
| 3.2 | Shipment Tracking | Tracking entry + status sync | Medium |
| 3.3 | Invoicing | Printable invoice + packing slip | Small |
| 3.4 | Telegram | Sale notifications | Small |
| **3** | **Full Dashboard Complete** | **End-to-end selling workflow** | **—** |

---

*This plan is a living document. Update it as decisions are made and questions are resolved.*
