# TCGPlayer Automation

> Self-hosted web application for automating the selling workflow of duplicate **Riftbound: League of Legends Trading Card Game** cards on TCGPlayer.

**Status:** Phase 2.1 — Price Scheduler Infrastructure Complete (In Development)

---

## Table of Contents

- [Project Overview](#project-overview)
- [Key Constraints](#key-constraints)
- [System Capabilities](#system-capabilities)
- [Tech Stack](#tech-stack)
- [Monorepo Structure](#monorepo-structure)
- [Data Model](#data-model)
- [Import Formats](#import-formats)
- [Pricing Strategy](#pricing-strategy)
- [TCGPlayer Fee Structure](#tcgplayer-fee-structure)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Testing](#testing)
- [Key Decisions](#key-decisions)
- [Phased Rollout](#phased-rollout)
- [License](#license)

---

## Project Overview

| Attribute          | Detail                                                     |
| ------------------ | ---------------------------------------------------------- |
| **Game**           | Riftbound: League of Legends Trading Card Game             |
| **Current Set**    | Origins (298 cards, 7 sets total on TCGPlayer)             |
| **TCGPlayer Category** | 89 (1,082 products, 7,408 SKUs across all sets)       |
| **User**           | Individual seller — Level 1 TCGPlayer seller account       |
| **Hosting**        | Ubuntu Linux server, Docker Compose, local network only    |
| **External Access**| None — no inbound connections from the internet            |

The system imports your duplicate cards (via mobile app CSV/TXT exports), fetches current market prices from the TCGTracking API, calculates optimal listing prices, and tells you exactly what to list at what price on TCGPlayer. It tracks your inventory, monitors price changes, and sends notifications via Telegram.

---

## Key Constraints

These constraints were discovered during the planning phase and fundamentally shaped the architecture:

### 1. TCGPlayer API is Closed
TCGPlayer stopped granting new API access in late 2022. There is no programmatic way to create listings, manage inventory, or check prices directly through TCGPlayer. Existing key holders can still use the API, but new registrations are permanently closed. No v2 API or waitlist has been announced.

### 2. CSV Bulk Upload Requires Level 4 Seller
TCGPlayer's CSV bulk upload tool is gated behind Level 4 seller status. As a Level 1 seller, Dustin can only list cards manually through the seller portal one at a time. The system generates listing recommendations with exact prices — manual entry until Level 4 is reached.

### 3. TCGTracking API is Available
[TCGTracking](https://tcgtracking.com/tcgapi/) provides a free, open, no-auth API that mirrors TCGPlayer's market pricing data with daily updates. Riftbound is fully supported (Category 89). This is our primary price data source.

### 4. Telegram Must Use Polling
With no external server access, the Telegram bot cannot receive webhooks. All Telegram integration uses long-polling mode.

---

## System Capabilities

### Phase 1 — MVP (Current)

- **Import cards** from TCGPlayer mobile app exports (CSV 16-column format + TXT share format)
- **Fetch market prices** automatically via TCGTracking API (free, no auth, daily updates)
- **Calculate optimal listing price** at 98% of market price, rounded to nearest penny
- **Categorize cards by market value:**
  - `< $0.05` → `gift` pool (freebies to include in shipments for positive reviews)
  - `≥ $0.05` → recommended for listing
  - No market price available → `needs_attention` (retry next cycle, Telegram notification)
- **Dashboard** showing all cards, their status, recommended prices, and actions needed
- **Manual listing guidance** — the system tells you exactly what to list and at what price (since bulk upload isn't available at Level 1)
- **Telegram notifications** for cards needing attention

### Phase 2 — Price Monitoring

**Status:** Phase 2.1 (BullMQ scheduler) ✅ Complete — See [PHASE2_BULLMQ_REDIS.md](docs/phase2/PHASE2_BULLMQ_REDIS.md)

- **BullMQ + Redis scheduler** ✅ Implemented — persistent repeatable background checks every 12 hours (configurable)
- **Lazy price checks** ✅ Implemented — runs via BullMQ repeatable job calling `runPriceCheck({ source: 'scheduled' })`
- **Manual "Refresh Prices" button** ✅ Implemented — `POST /api/cards/fetch-prices` triggers on-demand checks
- **Price history tracking** ✅ Implemented — per-card 📈 action opens modal with price/adjustment history table
- **Last Checked column** ✅ Implemented — sortable column in card table shows relative time since last price check (e.g., "2 hours ago")
- **Max drop safeguard** ✅ Implemented — caps single-cycle listing price drops at 20% (configurable via `MAX_PRICE_DROP_PERCENT`)

Implementation details:
- [Phase 2.1 Scheduler Migration](docs/phase2/PHASE2_BULLMQ_REDIS.md)
- [Phase 2.3 Price History UI](docs/phase2/PHASE2_PRICE_HISTORY_UI.md)
- [Phase 2.2 Max Drop Safeguard](docs/phase2/PHASE2_MAX_DROP_SAFEGUARD.md)

- **Bidirectional threshold management:** (Planned)
  - Listed card drops below `$0.05` market → recommend delisting, move to gift pool
  - Gift card rises above `$0.05` → recommend listing
  - Listed card with `>2%` price drift → recommend price update

### Phase 3 — Dashboard, Notifications & Invoicing

- Sales tracking and order status management
- Shipment tracking with carrier/tracking number entry
- Invoice and packing slip generation (printable from dashboard)
- Full Telegram notification suite (sales, shipments, price adjustments)

### Future — When Level 4 is Reached

- CSV export generation for bulk upload to TCGPlayer seller portal
- Automated price adjustment exports
- Diff-based CSV exports (only changed cards)

---

## Tech Stack

| Layer              | Technology                              | Notes                                          |
| ------------------ | --------------------------------------- | ---------------------------------------------- |
| **Runtime**        | Node.js 20+ / TypeScript               | Strict mode enabled                            |
| **Backend**        | Fastify                                 | Schema validation via TypeBox, plugin system    |
| **Frontend**       | Vite + React                            | SPA dashboard, React Router, TanStack Query    |
| **Database**       | PostgreSQL 16                           | Docker container with named volume             |
| **ORM**            | Drizzle                                 | SQL-first, no binary engine, inferred types    |
| **Job Scheduling** | BullMQ + Redis                          | Phase 2.1+ — repeatable price check jobs        |
| **Package Manager**| pnpm workspaces                         | Monorepo with `packages/server` + `packages/web` |
| **Testing**        | Vitest                                  | Vite ecosystem alignment, test-first workflow  |
| **Deployment**     | Docker Compose on Ubuntu Linux          | Multi-stage Dockerfile                         |
| **Price Data**     | TCGTracking Open API                    | Free, no auth, daily TCGPlayer price mirrors   |
| **Notifications**  | Telegram Bot                            | Polling mode (no webhooks)                     |

---

## Monorepo Structure

```
tcgplayer-automation/
├── docker-compose.yml          # PostgreSQL, app, migrate services
├── Dockerfile                  # Multi-stage: build server → build web → runtime
├── .env.example                # All environment variables documented
├── package.json                # Root workspace config + shared scripts
├── tsconfig.base.json          # Shared TypeScript configuration
├── packages/
│   ├── server/                 # Fastify API server
│   │   ├── src/
│   │   │   ├── index.ts        # Server entry point
│   │   │   ├── config.ts       # Env var loading + validation
│   │   │   ├── routes/         # Route modules
│   │   │   ├── services/       # Business logic layer
│   │   │   ├── lib/            # TCGTracking client, CSV parser, etc.
│   │   │   ├── jobs/           # BullMQ job processors (Phase 2+)
│   │   │   └── db/             # Drizzle schema + migrations
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                    # Vite + React dashboard
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   └── api/            # API client helpers
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── docs/
│   ├── PROJECT_PLAN.md         # Full project plan with task breakdowns
│   └── research/               # Planning phase research
│       ├── README.md
│       ├── sample-app-exports/ # Sample CSV + TXT from TCGPlayer mobile app
│       ├── tcgplayer-api/      # TCGPlayer API research & Postman collection
│       │   └── postman-tcgp/   # Postman collection for API testing
│       ├── tcgplayer-fees/     # Fee analysis + profitability modeling
│       └── alternatives/       # CardTrader, CrystalCommerce, eBay research
└── scripts/
    └── seed.ts                 # Dev seed data
```

---

## Data Model

### Entity Relationships

```
Card ──< Listing ──< PriceHistory
                  └──< Sale ──< Shipment
```

### Card

Represents a physical card you own and want to sell.

| Field         | Type      | Notes                                                               |
| ------------- | --------- | ------------------------------------------------------------------- |
| `id`          | UUID (PK) | Internal identifier                                                 |
| `tcgplayerId` | bigint   | TCGPlayer product ID (nullable until matched)                       |
| `name`        | string    | Card name                                                           |
| `setName`     | string    | Set/expansion name (e.g., "Origins")                                |
| `setCode`     | string?   | Set abbreviation if available (e.g., "OGN")                         |
| `number`      | string?   | Card number within set                                              |
| `rarity`      | string?   | Common / Uncommon / Rare / etc.                                     |
| `condition`   | enum      | NM, LP, MP, HP, DMG                                                 |
| `quantity`     | int      | How many duplicates of this specific card                           |
| `source`      | enum      | `csv_import` / `txt_import` / `manual_entry`                        |
| `status`      | enum      | `pending` / `matched` / `listed` / `needs_attention` / `gift` / `error` |
| `rawCsvData`  | jsonb?    | Original import row for debugging                                   |
| `createdAt`   | timestamp |                                                                     |
| `updatedAt`   | timestamp |                                                                     |

### Listing

A TCGPlayer marketplace listing tied to a card.

| Field                 | Type       | Notes                                        |
| --------------------- | ---------- | -------------------------------------------- |
| `id`                  | UUID (PK)  |                                              |
| `cardId`              | UUID (FK)  | → Card                                       |
| `tcgplayerSkuId`      | bigint     | TCGPlayer SKU (card + condition combo)       |
| `quantity`            | int        | Quantity listed                              |
| `priceCents`          | int        | Current listing price in cents               |
| `marketPriceCents`    | int?       | Last known market price in cents             |
| `status`              | enum       | `active` / `sold` / `removed` / `error`     |
| `lastPriceCheck`      | timestamp? | When market price was last fetched           |
| `listedAt`            | timestamp? | When listing went live on TCGPlayer          |
| `createdAt`           | timestamp  |                                              |
| `updatedAt`           | timestamp  |                                              |

### PriceHistory

Historical record of market price checks for a listing.

| Field              | Type       | Notes                                              |
| ------------------ | ---------- | -------------------------------------------------- |
| `id`               | UUID (PK)  |                                                    |
| `listingId`        | UUID (FK)  | → Listing                                          |
| `marketPriceCents` | int        | Market price at time of check                      |
| `ourPriceCents`    | int        | Our listing price at time of check                 |
| `adjustedToPrice`  | int?       | If we adjusted, the new price (null = no change)   |
| `checkedAt`        | timestamp  |                                                    |

### Sale (Phase 3)

| Field              | Type       | Notes                                              |
| ------------------ | ---------- | -------------------------------------------------- |
| `id`               | UUID (PK)  |                                                    |
| `listingId`        | UUID (FK)  | → Listing                                          |
| `tcgplayerOrderId` | string     | TCGPlayer order reference                          |
| `quantitySold`     | int        |                                                    |
| `salePriceCents`   | int        | Actual sale price                                  |
| `buyerName`        | string?    |                                                    |
| `orderStatus`      | enum       | `pending` / `confirmed` / `shipped` / `delivered` / `cancelled` |
| `soldAt`           | timestamp  |                                                    |

### Shipment (Phase 3)

| Field            | Type       | Notes                                              |
| ---------------- | ---------- | -------------------------------------------------- |
| `id`             | UUID (PK)  |                                                    |
| `saleId`         | UUID (FK)  | → Sale                                             |
| `carrier`        | string?    | USPS, UPS, etc.                                    |
| `trackingNumber` | string?    |                                                    |
| `shippedAt`      | timestamp? |                                                    |
| `deliveredAt`    | timestamp? |                                                    |
| `labelData`      | jsonb?     | Raw label/packing slip data for printing           |

---

## Import Formats

### CSV — TCGPlayer Mobile App Export (16 columns)

```csv
TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL
```

**Key column mappings:**

| CSV Column          | Maps To           | Notes                                    |
| ------------------- | ----------------- | ---------------------------------------- |
| `TCGplayer Id`      | `tcgplayerId`     | SKU ID — can skip catalog lookup         |
| `Product Name`      | `name`            | Card name                                |
| `Set Name`          | `setName`         | e.g., "Origins"                          |
| `Number`            | `number`          | Card number within set                   |
| `Rarity`            | `rarity`          | Common, Uncommon, Rare, etc.             |
| `Condition`         | `condition`       | Near Mint, Lightly Played, etc.          |
| `Add to Quantity`   | `quantity`         | **Use this**, not `Total Quantity`      |
| `TCG Market Price`  | *(validation)*    | Useful for cross-checking TCGTracking    |

**API endpoint:** `POST /api/cards/import` (multipart file upload)

### TXT — TCGPlayer Mobile App Share Format

```
3 Brazen Buccaneer [OGN] 002/298
1 Lux [OGN] 145/298
```

**Pattern:** `{quantity} {card name} [{set code}] {number}`

- Parsed with regex: `^(\d+)\s+(.+?)\s+\[(\w+)\]\s+(.+)$`
- Less data than CSV — requires catalog lookup to resolve TCGPlayer IDs
- Set code `OGN` = Origins

**API endpoint:** `POST /api/cards/import-txt` (text file or paste)

---

## Pricing Strategy

### Price Calculation

```
listing_price = round(market_price × 0.98, 2)
```

List at **98% of TCGPlayer market price** (sourced from TCGTracking API), rounded to the nearest penny.

### Card Categorization by Market Price

| Market Price    | Action                  | Status            | Rationale                                    |
| --------------- | ----------------------- | ----------------- | -------------------------------------------- |
| `≥ $0.05`       | List at 98% market      | `listed`          | Consolidation magnet — more inventory = better margins via cart optimizer |
| `< $0.05`       | Add to gift pool        | `gift`            | Include as freebies in shipments to encourage positive reviews |
| Not available   | Skip, notify, retry     | `needs_attention` | Telegram alert; auto-list when price found on next check cycle |

### Why No Hard Floor

Cards below `$0.50` lose money individually (after fees), but listing large cheap inventory serves as a **consolidation magnet**. TCGPlayer's cart optimizer bundles multiple cards from the same seller into a single order, splitting the `$0.30` transaction fee across all items. More inventory breadth = more consolidation = better per-order margins.

### Bidirectional Price Checks (Phase 2)

Price monitoring re-evaluates every card each cycle:
- Listed card drops below `$0.05` → **delist**, move to gift pool
- Gift card rises above `$0.05` → **promote** to listing
- Listed card drifts `>2%` from target → **update** price

Configurable via `MIN_LISTING_PRICE_CENTS` (default: `5`).

---

## TCGPlayer Fee Structure

| Fee Type                 | Amount                      | Applied To     |
| ------------------------ | --------------------------- | -------------- |
| Marketplace Commission   | 10.75% of order subtotal    | Per order      |
| Payment Processing       | 2.5% + $0.30               | Per order      |
| **Combined**             | **~13.25% + $0.30/order**   | Per order      |

**Critical detail:** The `$0.30` transaction fee is per **order**, not per card. This is why consolidation strategy matters — a 5-card order pays `$0.30` once, not `$1.50`.

- No monthly fees
- No listing fees
- No subscription required
- Profitability should be tracked per **order**, not per individual card

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/tcgplayer

# Redis (Phase 2.1+)
REDIS_URL=redis://localhost:6379   # Use redis://redis:6379 in Docker
                                    # Use redis://redis-dev:6379 in dev profile

# TCGTracking API (free, no auth needed)
TCGTRACKING_BASE_URL=https://tcgtracking.com/tcgapi/v1

# Riftbound category ID on TCGPlayer/TCGTracking
RIFTBOUND_CATEGORY_ID=89

# Pricing
MIN_LISTING_PRICE_CENTS=5          # Cards below this market price → gift pool
LISTING_PRICE_MULTIPLIER=0.98      # List at this % of market price
MAX_PRICE_DROP_PERCENT=20          # Max single-cycle listing price drop % (safeguard)

# Price checking (Phase 2.1+)
PRICE_CHECK_INTERVAL_HOURS=12      # How often to re-check market prices

# Telegram (Phase 3)
TELEGRAM_BOT_TOKEN=                # From @BotFather
TELEGRAM_CHAT_ID=                  # Your chat/group ID

# Server
PORT=3000
NODE_ENV=development
```

---

## Development

### Prerequisites

- Docker & Docker Compose (only requirement for running the app)
- Node.js 20+ and pnpm 9+ (optional, for local development without Docker)

### Quick Start (Docker — Recommended)

The project uses a single `docker-compose.yml` file controlled by the `COMPOSE_PROFILES` variable in `.env`:

**Development mode (default):**
```bash
# Clone and configure
git clone <repo-url>
cd tcgplayer-automation
cp .env.example .env

# .env contains COMPOSE_PROFILES=dev by default
# Start with hot reload, exposed DB port, Vite dev server
docker compose up

# API:      http://localhost:3000
# Frontend: http://localhost:5173 (Vite dev server with hot reload)
# Database: localhost:5432 (exposed for pgAdmin, DBeaver, etc.)
```

**Production mode:**
```bash
cp .env.example .env

# Edit .env and set:
# COMPOSE_PROFILES=prod

# Build and start everything
docker compose up -d

# App available at http://localhost:3000
# - Frontend served at /
# - API at /health, /api/*
# - Database is internal (not exposed)
```

**Switching modes:**
Just update `COMPOSE_PROFILES` in `.env` and restart:
```bash
# Edit .env: change COMPOSE_PROFILES=dev to COMPOSE_PROFILES=prod
docker compose down
docker compose up -d
```

### Local Development (Without Docker)

If you prefer to run services locally without Docker:

```bash
# Install dependencies
pnpm install

# Start PostgreSQL (via Docker, or use local install)
docker compose up db -d

# Update .env to use localhost instead of 'db' hostname
# DATABASE_URL=postgresql://tcgplayer:tcgplayer@localhost:5432/tcgplayer

# Start dev servers (API + frontend with hot reload)
# Migrations auto-run when the server starts
pnpm dev

# API:      http://localhost:3000
# Frontend: http://localhost:5173
```

### Key Docker Commands

```bash
docker compose up -d              # Start in background (production mode)
docker compose up                 # Start with logs in foreground
docker compose down               # Stop and remove containers
docker compose down -v            # Stop and remove volumes (destroys DB data)
docker compose logs -f app        # Follow application logs
docker compose logs -f db         # Follow database logs
docker compose build              # Rebuild images after code changes
docker compose restart app        # Restart just the app service
```

### Automatic Migrations on Startup

- The server runs Drizzle migrations during startup before registering API routes.
- Works in both Docker profiles (`app-dev` and `app`).
- If migrations fail, startup fails fast with a visible error in logs.

### Key Scripts (Local Development)

```bash
pnpm dev              # Start API + frontend concurrently (hot reload)
pnpm build            # Build server + web for production
pnpm test             # Run all tests
pnpm test:watch       # Watch mode during development
pnpm lint             # Run ESLint across workspace
pnpm format           # Format code with Prettier
pnpm format:check     # Check formatting without writing

# Database
pnpm --filter server db:migrate    # Run Drizzle migrations manually (optional)
pnpm --filter server db:seed       # Seed dev database with sample cards
pnpm --filter server db:studio     # Open Drizzle Studio (visual DB inspector)

# Note: Migrations auto-run on server startup in both dev and prod Docker profiles
```

---

## Testing

This project follows a **test-first** workflow:

1. **Write tests** that define expected behavior
2. **Implement** the feature
3. **Validate** the implementation against tests

Tests use **Vitest** (Vite ecosystem alignment) and live alongside source files:

```
packages/server/src/services/csv-import.test.ts
packages/server/src/services/pricing.test.ts
packages/server/src/lib/tcgtracking/client.test.ts
```

All monetary values are stored as **integers in cents** to avoid floating-point issues. The frontend handles display formatting.

---

## Key Decisions

| Decision                        | Rationale                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| TCGTracking for price data      | TCGPlayer API is closed; TCGTracking mirrors their prices daily, free, no auth        |
| CSV generation (not API listing)| No API access; generate CSVs for manual upload (Level 1) or bulk upload (Level 4)     |
| `$0.05` listing threshold       | Below this, cards lose money even with consolidation; use as review-bait gifts instead |
| No hard minimum floor           | List everything `$0.05`+ to maximize consolidation opportunities                     |
| Telegram polling, not webhooks  | Server has no external access — can't receive inbound webhook calls                   |
| Lazy price checks (1–2×/day)    | TCGTracking updates daily; more frequent checks waste resources                       |
| Per-order profitability         | `$0.30` fee is per order — per-card tracking is misleading                            |
| Fastify over Express            | Built-in schema validation, better TypeScript support, plugin system                  |
| Vite + React over Next.js       | SPA dashboard, no SSR needed; API is separate (Fastify)                               |
| Drizzle over Prisma             | SQL-first, no binary engine, lighter Docker images, inferred types                    |
| BullMQ only in Phase 2+         | Overkill for Phase 1 — direct API calls suffice until scheduled jobs are needed       |
| Money in cents (integers)       | Avoids floating-point rounding errors in price calculations                           |

---

## Phased Rollout

### Phase 1 — MVP: Ingest + Price + Recommend (Current)

Import cards, fetch prices, calculate listings, display dashboard with manual listing guidance.

| Milestone       | Deliverable                              | Status  |
| --------------- | ---------------------------------------- | ------- |
| 1.1 Scaffolding | Runnable project skeleton                | Planned |
| 1.2 Database    | Schema + Drizzle migrations              | Planned |
| 1.3 CSV Import  | Parse CSV/TXT → cards in DB              | Planned |
| 1.4 Price Engine| TCGTracking integration + price calc     | Planned |
| 1.5 Dashboard   | Card list with status, prices, actions   | Planned |
| 1.6 Docker      | Full `docker compose up` deployment      | Planned |

### Phase 2 — Price Monitoring

BullMQ + Redis for scheduled price checks. Auto-detect drift, recommend adjustments, track price history. Bidirectional gift/listing threshold management.

### Phase 3 — Sales Dashboard, Notifications & Invoicing

Full operational dashboard: sales history, shipment tracking, printable invoices/packing slips, Telegram notifications for sales and price changes.

### Future — Level 4 + Multi-Platform

CSV bulk upload automation when Level 4 is reached. Potential CardTrader API integration (open API, 5% fees). eBay for high-value cards.

---

## API Endpoints (Phase 1 + Phase 2.1)

| Method | Path                           | Description                                      |
| ------ | ------------------------------ | ------------------------------------------------ |
| GET    | `/api/health`                  | Health check                                     |
| GET    | `/api/cards`                   | List all cards (paginated, filterable)           |
| POST   | `/api/cards`                   | Add single card manually (not used in CSV-first workflow) |
| POST   | `/api/cards/import`            | Upload CSV/TXT file for import                   |
| PATCH  | `/api/cards/:id`               | Update card details                              |
| DELETE | `/api/cards/:id`               | Remove card                                      |
| GET    | `/api/cards/stats`             | Get status counts (pending/matched/gift/etc)     |
| POST   | `/api/cards/:id/reprice`       | Re-price single card                             |
| POST   | `/api/cards/reprice-all`       | Bulk re-price all cards                          |
| POST   | `/api/cards/fetch-prices`      | Fetch latest prices from TCGTracking API (manual trigger) |
| GET    | `/api/cards/price-check-status`| Get scheduler status, interval, last run (Phase 2.1) |
| GET    | `/api/cards/:id/price-history` | Get price history for a card (limit, sorted by checkedAt DESC) |
| POST   | `/api/cards/mark-listed`       | Bulk mark matched cards as listed on TCGPlayer   |
| POST   | `/api/cards/:id/unlist`        | Unlist a card, returns to matched status         |
| GET    | `/api/listings`                | List all listings                                |
| POST   | `/api/listings/create`         | Create listings for selected cards               |

**Note:** This project runs as a CSV/TXT import-first workflow. Manual single-card entry is intentionally out of scope for current Phase 1 usage.

### Import Deduplication

When re-importing the same card, the system increments quantity instead of creating duplicates:
- **CSV imports**: Matches on `tcgplayerId + condition`
- **TXT imports**: Matches on `productName + setName + number + condition`

Import responses include: `{ imported, updated, errors, cards }` showing newly imported vs. updated quantities.

### Live Price Fetching

The `POST /api/cards/fetch-prices` endpoint fetches the latest market prices from TCGTracking API for all Riftbound sets, matches them to your cards via `tcgProductId` (extracted from Photo URLs during CSV import), and automatically re-runs the pricing engine.

### Foil Price Fallback

When a card has no Normal market pricing available but does have Foil pricing, the system automatically falls back to Foil price for listing recommendations. Cards using foil-sourced pricing are marked with an `isFoilPrice` indicator and display a ✨ sparkle icon in the dashboard with a tooltip explanation. This fallback is automatically cleared if Normal pricing becomes available in future price updates.

### Mark as Listed Workflow

The dashboard provides a bulk workflow for marking cards as listed on TCGPlayer once you've manually entered them in the seller portal:

- **Checkbox selection**: Only enabled for `matched` cards (cards ready to list with calculated prices)
- **Select all**: Header checkbox selects all matched cards on current page
- **Bulk action**: "📋 Mark X as Listed" opens a review modal before applying changes
- **Review modal**: Shows selected cards, quantity, listing price, and estimated total value before confirmation
- **Visual distinction**: Listed cards show green background + ↩️ unlist button
- **Unlist**: Returns card to `matched` status and re-runs pricing engine
- **Status preservation**: Repricing operations preserve `listed` status unless price drops below thresholds

### Response Conventions

- Success: `{ data: T }` or `{ data: T[], meta: { page, limit, total } }`
- Error: `{ error: { message: string, code: string } }`
- Pagination: `?page=1&limit=20`
- Dates: ISO 8601
- Money: always in **cents** (integer)

---

## External Resources

| Resource             | URL                                            | Notes                        |
| -------------------- | ---------------------------------------------- | ---------------------------- |
| TCGTracking API      | https://tcgtracking.com/tcgapi/                | Price data source            |
| Riftbound Sets       | https://tcgtracking.com/tcgapi/v1/89/sets      | All Riftbound set data       |
| Riftbound Pricing    | https://tcgtracking.com/tcgapi/v1/89/sets/{set}/pricing | Daily price updates |
| TCGPlayer (archived) | https://docs.tcgplayer.com/docs/getting-started | Closed API documentation     |
| CardTrader API       | https://www.cardtrader.com/docs/api/full        | Open API, potential Phase 4  |

---

## License

Private — All rights reserved.
