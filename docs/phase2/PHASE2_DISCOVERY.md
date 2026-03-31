# Phase 2 Discovery Scan

Scope: historical discovery snapshot of scheduler/drift touchpoints. Phase 2.1 implementation has since landed (see status section below).

---

## ✅ Implementation Status (2026-03-31)

**Phase 2.1 (BullMQ + Redis Scheduler) is now COMPLETE.**

See [PHASE2_BULLMQ_REDIS.md](PHASE2_BULLMQ_REDIS.md) for full implementation details:
- BullMQ + Redis integration added to Docker Compose (dev + prod profiles)
- `REDIS_URL` environment variable support
- Repeatable job `check-prices` runs every `PRICE_CHECK_INTERVAL_HOURS` (default: 12)
- Worker calls existing `runPriceCheck({ source: 'scheduled' })` from `run-price-check.ts`
- Manual price checks via `POST /api/cards/fetch-prices` still work independently
- Status endpoint `/api/cards/price-check-status` reports scheduler state
- Tests pass, Docker verified, endpoint validated

**Remaining Phase 2 work:**
- Auto-adjustment logic + safeguards (apply drift decisions to operational listing workflow)
- Monitoring UI expansion (price history views, last-checked/adjustment logs)
- Scheduler controls in UI (config editing and run-now ergonomics)

> Note: sections below are discovery notes captured before Phase 2.1 implementation and may reference pre-implementation assumptions.

---

## 1) Current `fetch-prices` logic

**Primary location:** `packages/server/src/routes/cards.ts`

### Route + flow
- `POST /api/cards/fetch-prices` is defined in `cardsRoutes()`.
- It instantiates `new TCGTrackingClient()`.
- It calls:
  - `client.getSets()` to fetch Riftbound sets
  - `client.getPricing(set.id)` for each set
- It loads all cards from DB once: `const allCards = await db.select().from(cards);`
- It loops sets → cards, matches on `card.tcgProductId`, then chooses pricing by condition.

### Status / listing price computation
- Pricing engine is shared via `calculatePrice()` from `packages/server/src/lib/pricing/engine.ts`.
- On each matched card:
  - determine `conditionKey`:
    - default `Normal`
    - if `card.condition.toLowerCase().includes('foil')`, use `Foil`
  - read `productPricing.tcg[conditionKey]`
  - if `Normal` is missing and `Foil` exists, it falls back to Foil pricing and sets `isFoilFallback = true`
  - if no usable market price, `notFound++` and continue
  - otherwise call `calculatePrice({ marketPrice: newMarketPrice })`
- Update writes:
  - `marketPrice: newMarketPrice.toString()`
  - `listingPrice: pricingResult.listingPrice?.toString() ?? null`
  - `status: newStatus`
  - `isFoilPrice: isFoilFallback`
  - `notes` adds/removes `Price from Foil (no Normal pricing available)`

### Important pricing rules in engine
**File:** `packages/server/src/lib/pricing/engine.ts`
- `null` market price → `status: 'needs_attention'`, `listingPrice: null`
- market price below `minListingPriceCents / 100` → `status: 'gift'`, `listingPrice: null`
- otherwise → `status: 'matched'`, `listingPrice = round(marketPrice * priceMultiplier)`
- defaults are hardcoded in engine:
  - `DEFAULT_MIN_LISTING_PRICE_CENTS = 5`
  - `DEFAULT_PRICE_MULTIPLIER = 0.98`

### Integration note for Phase 2
Minimal-change hook points for scheduling/drift work:
- reuse `POST /api/cards/fetch-prices` logic as the core sync job
- extract the fetch/update loop into a service function so it can be called by both route and scheduler
- emit per-card drift events from the update path after DB write

---

## 2) Existing Telegram integration points

**Current status:** no Telegram runtime integration found in server code.

### What exists today
- `packages/server/src/config/env.ts` defines optional env vars:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`
- I did **not** find any server files importing or using Telegram libs, nor any `telegram` string matches under `packages/server/src`.
- No message-sending helper or notification service currently exists.

### Implication for Phase 2
- Telegram notification support is a greenfield addition.
- Best integration point is likely a small notification service in `packages/server/src/lib/notifications/telegram.ts` (or similar) called from price-drift / needs-attention paths.

---

## 3) Existing env config patterns in server

**File:** `packages/server/src/config/env.ts`

### Pattern
- Uses `zod` schema parsing directly at module load:
  - `export const env = envSchema.parse(process.env);`
- Defaults are encoded in schema, not scattered in callers.
- Coerces numbers with `z.coerce.number()`.
- Optional vars use `.optional()`.

### Current env entries
- `DATABASE_URL`
- `TCGTRACKING_BASE_URL`
- `RIFTBOUND_CATEGORY_ID`
- `MIN_LISTING_PRICE_CENTS`
- `LISTING_PRICE_MULTIPLIER`
- `PRICE_CHECK_INTERVAL_HOURS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `PORT`
- `HOST`
- `NODE_ENV`

### Minimal-change integration point
- Add any scheduler / notification config here first, then consume through `env`.
- The current pricing engine still hardcodes defaults; if Phase 2 needs runtime-configurable thresholds, that would be a follow-on change.

---

## 4) DB schema / migration patterns and price history placement

### Current schema location
- `packages/server/src/db/schema/cards.ts`
- exported through `packages/server/src/db/schema/index.ts`
- DB connection in `packages/server/src/db/index.ts`

### Migration pattern
- SQL migrations live in `packages/server/drizzle/*.sql`
- `packages/server/src/db/migrate.ts` resolves the migrations folder and runs Drizzle migrator
- App startup runs migrations before registering routes in `packages/server/src/index.ts`

### Existing card columns relevant to Phase 2
- `market_price`
- `listing_price`
- `status`
- `is_foil_price`
- `updated_at`

### Where a price history table should be added
Recommended place:
- `packages/server/src/db/schema/` for the Drizzle table definition
- matching SQL migration in `packages/server/drizzle/0003_*.sql` (next sequential file)

### Minimal-change integration point
- Add a dedicated `price_history` table rather than overloading `cards`
- likely columns:
  - `id`
  - `card_id` FK
  - `market_price`
  - `listing_price`
  - `status`
  - `source` / `reason`
  - `is_foil_price`
  - `captured_at`
- write history in the same update path that fetches prices, so drift can be measured before/after the card update

---

## 5) Existing route/test patterns for new endpoints

### Route pattern
- `packages/server/src/routes/index.ts` registers route plugins under `/api`
- `cardsRoutes` is registered with prefix `/api/cards`
- route file: `packages/server/src/routes/cards.ts`

### Current endpoint style in `cards.ts`
- Uses Fastify route handlers directly inside a plugin function
- Strongly typed request/response interfaces are declared near the top of the file
- Common patterns:
  - `fastify.post('/import', ...)`
  - `fastify.get('/', ...)`
  - `fastify.patch('/:id', ...)`
  - `fastify.post('/:id/reprice', ...)`
  - `fastify.post('/fetch-prices', ...)`

### Test pattern
- Tests live in `packages/server/src/routes/__tests__/cards.test.ts`
- Uses Vitest + `Fastify()` + `app.register(cardsRoutes, { prefix: '/api/cards' })`
- Database and service deps are mocked with `vi.mock(...)`
- Calls are exercised via `app.inject(...)`

### Minimal-change integration point
- Add new Phase 2 endpoints as additional handlers inside `cardsRoutes()` or a new route plugin registered from `routes/index.ts`.
- Add endpoint tests in `packages/server/src/routes/__tests__/...` using the same `app.inject` pattern.

---

## Recommended minimal-change integration points for Phase 2

1. **Core price sync service**
   - Extract from `packages/server/src/routes/cards.ts` `POST /fetch-prices` into a reusable function.
2. **Scheduler entrypoint**
   - Add a cron/scheduler runner that calls the same service on `PRICE_CHECK_INTERVAL_HOURS`.
3. **Notification service**
   - Add Telegram send helper gated by `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`.
4. **Price history table**
   - Add `packages/server/src/db/schema/price-history.ts` and a new SQL migration.
5. **Drift detection**
   - Capture before/after price + status in the same update loop and send Telegram when drift crosses your threshold.

---

## Files reviewed
- `packages/server/src/routes/cards.ts`
- `packages/server/src/lib/pricing/engine.ts`
- `packages/server/src/lib/tcgtracking/client.ts`
- `packages/server/src/config/env.ts`
- `packages/server/src/db/migrate.ts`
- `packages/server/src/db/schema/cards.ts`
- `packages/server/src/routes/index.ts`
- `packages/server/src/routes/__tests__/cards.test.ts`
- `packages/server/drizzle/0000_jittery_justin_hammer.sql`
- `packages/server/drizzle/0001_dark_cable.sql`
- `packages/server/drizzle/0002_bent_gunslinger.sql`
