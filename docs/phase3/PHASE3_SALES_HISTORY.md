# Phase 3.1 — Sales History View

Date: 2026-04-01
Status: PLAN (not yet implemented)

---

## 1. Current-State Assessment

### What exists today for sales/order data: **Nothing.**

The DB has two tables: `cards` and `price_history`. There is no `sales`, `orders`, or `shipments` table. The `PROJECT_PLAN.md` data model section designs `Sale` and `Shipment` entities, but they were never implemented — they were deferred to Phase 3.

The card lifecycle currently ends at `status = 'listed'`. There is no `sold` status in the `cardStatusEnum` (`pending | matched | listed | needs_attention | gift | error`). There is no way to record that a card was sold, to whom, at what price, or under which TCGPlayer order.

The frontend has two views — **Inventory** and **Active Listings** — both rendering the same `CardTable` component with different status filters. There are no sales-oriented UI components.

The `PROJECT_PLAN.md` phase 3 API endpoints (`GET /api/sales`, `GET /api/sales/:id`, `POST /api/sales/:id/ship`, etc.) are entirely unbuilt.

### Key constraints
- **TCGPlayer API is blocked.** No automated order sync. Sales must be entered manually (or via future CSV/API import once access is granted).
- **No `sold` card status.** The enum needs extending.
- **No sales DB table.** Must be created from scratch.
- **Pricing is in dollars (numeric strings), not cents.** Despite `PROJECT_PLAN.md` specifying cents, the actual implementation stores `numeric(10,2)` dollar values. The sales schema must match.

---

## 2. Minimal Viable Vertical Slice

### Goal
Let Dustin record a sale against one or more listed cards, then view a paginated, sortable, filterable sales history table in a new dashboard tab.

### What's in scope
1. **`sales` DB table** — records a completed sale line-item (card, quantity sold, sale price, buyer name, TCGPlayer order number, order status, sold date).
2. **`sold` card status** — new enum value; card transitions `listed → sold` when a sale is recorded (or quantity is decremented if partially sold).
3. **Backend CRUD** — `POST /api/sales` (record sale), `GET /api/sales` (list with pagination/filtering), `GET /api/sales/:id` (detail), `PATCH /api/sales/:id` (update order status).
4. **Frontend** — new "Sales History" tab, `SalesTable` component, "Record Sale" modal triggered from listed cards, summary stats for sales.
5. **Manual entry only** — no API sync. Fields are designed so future API sync can write the same table.

### What's explicitly out of scope for this slice
- Shipment tracking (Phase 3.2)
- Invoice/packing slip generation (Phase 3.3)
- Telegram sale notifications (Phase 3.4)
- Automated order import from TCGPlayer API
- Revenue/profit analytics beyond basic count/sum stats
- Bulk sale recording (one sale at a time for now)

---

## 3. Data Model

### New enum value

Extend `cardStatusEnum` to include `'sold'`:

```
pgEnum('card_status', [
  'pending', 'matched', 'listed', 'needs_attention', 'gift', 'error', 'sold'
])
```

### New `sales` table

```
sales
├── id              serial PK
├── cardId          integer FK → cards.id (SET NULL on delete)
├── tcgplayerOrderId text (nullable — manual sales may not have one yet)
├── quantitySold    integer NOT NULL (≥1)
├── salePriceCents  integer NOT NULL (stored in cents for precision)
├── buyerName       text (nullable)
├── orderStatus     order_status_enum NOT NULL DEFAULT 'pending'
│                   ('pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled')
├── soldAt          timestamp with tz NOT NULL (when the sale happened)
├── notes           text (nullable)
├── createdAt       timestamp with tz DEFAULT now()
├── updatedAt       timestamp with tz DEFAULT now()
```

**Design notes:**
- `salePriceCents` is in **cents** (integer) to match the `PROJECT_PLAN.md` spec and avoid floating-point rounding. The existing card prices are `numeric(10,2)` strings — the conversion happens at write time.
- `cardId` uses `SET NULL` on delete so sale history survives card cleanup.
- `tcgplayerOrderId` is nullable — until API access, Dustin may not copy the order ID. When API sync lands, this becomes the join key.
- One sale row = one card sold in one order. If an order contains 3 different cards, that's 3 sale rows sharing a `tcgplayerOrderId`. This matches TCGPlayer's line-item model and keeps the schema simple.
- `orderStatus` gets its own enum separate from card status — the lifecycle is different.

---

## 4. File-Level Task List (strict implementation order)

### WP-1: Schema + Migration (server)
**Files:**
- `packages/server/src/db/schema/cards.ts` — add `'sold'` to `cardStatusEnum`
- `packages/server/src/db/schema/sales.ts` — **new file**, define `orderStatusEnum` + `sales` table
- `packages/server/src/db/schema/index.ts` — re-export from `sales.ts`
- Run `drizzle-kit generate` → new migration SQL in `packages/server/drizzle/`

**Dependencies:** None. This is the foundation.
**Risk:** Medium — enum extension requires an `ALTER TYPE ... ADD VALUE` migration. Drizzle-kit handles this, but verify the generated SQL is correct before applying.
**Verification:** `pnpm --filter server drizzle-kit generate` succeeds; inspect migration SQL for correctness; `pnpm --filter server test` still passes (no regressions).

---

### WP-2: Sales route — record + list + detail + update (server)
**Files:**
- `packages/server/src/routes/sales.ts` — **new file** with:
  - `POST /` — record a sale (body: `{ cardId, quantitySold, salePriceCents, buyerName?, tcgplayerOrderId?, orderStatus?, soldAt?, notes? }`)
    - Validates card exists and is `listed`
    - Decrements `cards.quantity` by `quantitySold`
    - If quantity reaches 0, sets card status to `sold`
    - If partial (quantity > quantitySold), card stays `listed`
    - Returns created sale
  - `GET /` — paginated list (query: `page`, `limit`, `orderStatus`, `search`, `dateFrom`, `dateTo`)
    - Joins `cards` to get card name/set for display
    - Sorts by `soldAt` DESC by default
  - `GET /:id` — single sale detail with joined card data
  - `PATCH /:id` — update `orderStatus`, `buyerName`, `tcgplayerOrderId`, `notes`
- `packages/server/src/routes/index.ts` — register `salesRoutes` at `/api/sales`

**Dependencies:** WP-1 (schema must exist).
**Risk:** Low-medium. The card quantity decrement + conditional status change is the main logic. Edge cases: selling more than available quantity, selling a non-listed card, selling when quantity is already 0.
**Verification:** Route tests (WP-3).

---

### WP-3: Sales route tests (server)
**Files:**
- `packages/server/src/routes/__tests__/sales.test.ts` — **new file**

**Test cases:**
1. `POST /api/sales` — happy path: creates sale, decrements card quantity, card stays `listed` (partial)
2. `POST /api/sales` — full sell: quantity goes to 0, card status changes to `sold`
3. `POST /api/sales` — rejects sale on non-listed card (400)
4. `POST /api/sales` — rejects sale with `quantitySold` > available quantity (400)
5. `POST /api/sales` — rejects sale with missing required fields (400)
6. `POST /api/sales` — card not found (404)
7. `GET /api/sales` — returns paginated list with card data joined
8. `GET /api/sales` — filters by `orderStatus`
9. `GET /api/sales` — filters by date range
10. `GET /api/sales` — search by card name or buyer name
11. `GET /api/sales/:id` — returns sale detail
12. `GET /api/sales/:id` — returns 404 for non-existent sale
13. `PATCH /api/sales/:id` — updates order status
14. `PATCH /api/sales/:id` — returns 404 for non-existent sale

**Dependencies:** WP-1, WP-2 (tests import the route module and schema).
**Risk:** Low.
**Verification:** `pnpm --filter server test` passes.

> Note: Per Dustin's test-first preference, WP-3 tests should be **written before** WP-2 implementation, then WP-2 code is written to make them pass. In practice, the worker implementing WP-2+WP-3 should do them together in test-first order.

---

### WP-4: Sales stats endpoint (server)
**Files:**
- `packages/server/src/routes/sales.ts` — add `GET /stats` endpoint
  - Returns: `{ totalSales, totalRevenueCents, averageSaleCents, salesByStatus: { pending, confirmed, shipped, delivered, cancelled } }`

**Dependencies:** WP-1, WP-2.
**Risk:** Low.
**Verification:** Add test cases to `sales.test.ts`.

---

### WP-5: API client + types (web)
**Files:**
- `packages/web/src/api/types.ts` — add `Sale`, `SaleListItem`, `GetSalesParams`, `GetSalesResponse`, `SalesStats`, `RecordSaleRequest`, `UpdateSaleRequest` types
- `packages/web/src/api/client.ts` — add methods: `getSales()`, `getSale()`, `recordSale()`, `updateSale()`, `getSalesStats()`

**Dependencies:** WP-2 (API must be designed; actual server doesn't need to be running).
**Risk:** Low.
**Verification:** Type-checks pass (`pnpm --filter web build`).

---

### WP-6: SalesTable component (web)
**Files:**
- `packages/web/src/components/SalesTable.tsx` — **new file**
  - Paginated table: Date, Card Name, Set, Qty Sold, Sale Price, Buyer, Order #, Status, Actions
  - Sortable columns (reuse pattern from `CardTable`)
  - Status badge for order status (reuse/extend `StatusBadge`)
  - "View" action opens detail or expands row
  - Date range filter inputs
  - Search input (card name or buyer)
- `packages/web/src/components/SalesStatusBadge.tsx` — **new file** (or extend existing `StatusBadge` with sale-specific statuses)

**Dependencies:** WP-5 (types and API client).
**Risk:** Low. UI-only.
**Verification:** Component tests (WP-8).

---

### WP-7: RecordSaleModal component (web)
**Files:**
- `packages/web/src/components/RecordSaleModal.tsx` — **new file**
  - Modal form triggered from a listed card's action column (new action button)
  - Pre-fills card name, current listing price, available quantity
  - Fields: quantity to sell, sale price (defaults to listing price), buyer name, TCGPlayer order #, order status dropdown, sold date (defaults to now), notes
  - Submit calls `api.recordSale()`
  - On success, refreshes card list and sales data

**Dependencies:** WP-5, WP-6.
**Risk:** Low. UI-only; follows `ReviewListModal` pattern.
**Verification:** Component tests (WP-8).

---

### WP-8: Frontend component tests (web)
**Files:**
- `packages/web/src/components/__tests__/SalesTable.test.tsx` — **new file**
- `packages/web/src/components/__tests__/RecordSaleModal.test.tsx` — **new file**

**Test cases for SalesTable:**
1. Renders table with sale data
2. Empty state message when no sales
3. Loading state
4. Sorts by column
5. Formats price from cents to dollars
6. Renders order status badge

**Test cases for RecordSaleModal:**
1. Pre-fills card info from props
2. Submits with correct payload
3. Validates quantity ≤ available
4. Calls onClose on cancel
5. Shows loading state during submit

**Dependencies:** WP-6, WP-7.
**Risk:** Low.
**Verification:** `pnpm --filter web test` passes.

---

### WP-9: Wire into App + new tab (web)
**Files:**
- `packages/web/src/components/ViewTabs.tsx` — add `'sales-history'` to `ViewMode` union; add tab `{ value: 'sales-history', label: '💰 Sales History' }`
- `packages/web/src/App.tsx` — 
  - Import `SalesTable`, `RecordSaleModal`
  - Add sales state management (sales list, sales stats, sales loading)
  - Handle `sales-history` view mode: render `SalesTable` instead of `CardTable`
  - Add "Record Sale" button in `CardTable` actions for `listed` cards (triggers `RecordSaleModal`)
  - Add sales stats to `StatsBar` (or a secondary stats row on the sales view)
- `packages/web/src/App.css` — styles for new components (sale table, modal, stats)

**Dependencies:** WP-5, WP-6, WP-7, WP-8.
**Risk:** Medium. This is the integration point — wiring state, callbacks, and conditional rendering. Most likely place for regressions in existing views.
**Verification:** Update `App.test.tsx` with sales-history tab tests; full `pnpm --filter web test` + `pnpm --filter web build`.

---

### WP-10: CardTable "Record Sale" action (web)
**Files:**
- `packages/web/src/components/CardTable.tsx` — add "Record Sale" action button (💲 or 🏷️) for cards with `status === 'listed'`; clicking opens `RecordSaleModal` with card data pre-filled

**Dependencies:** WP-7, WP-9.
**Risk:** Low. Small addition to existing component.
**Verification:** Existing `CardTable` tests still pass; add test for new button visibility.

---

## 5. Implementation Order Summary

```
WP-1  Schema + Migration          [server, blocking]
  ↓
WP-2  Sales routes                [server, blocking]
WP-3  Sales route tests           [server, parallel with WP-2 in test-first flow]
  ↓
WP-4  Sales stats endpoint        [server]
  ↓
WP-5  API client + types          [web, can start after WP-2 API shape is designed]
  ↓
WP-6  SalesTable component        [web]
WP-7  RecordSaleModal component   [web]
WP-8  Frontend component tests    [web, parallel with WP-6/WP-7]
  ↓
WP-9  App integration + tab       [web]
WP-10 CardTable action button     [web]
```

**Parallelizable:** WP-2 + WP-3 (test-first pair). WP-6 + WP-7 + WP-8 (independent components).
**Sequential bottlenecks:** WP-1 must come first. WP-9 depends on everything.

---

## 6. Test Plan

### Server tests (`pnpm --filter server test`)

| Area | File | Coverage |
|------|------|----------|
| Sales CRUD | `routes/__tests__/sales.test.ts` | Create, list, detail, update, validation, error cases |
| Card status transition | `routes/__tests__/sales.test.ts` | `listed→sold` on full sell, stays `listed` on partial |
| Quantity decrement | `routes/__tests__/sales.test.ts` | Correct math, rejects oversell |
| Sales stats | `routes/__tests__/sales.test.ts` | Aggregation correctness |
| Existing tests | All existing test files | Regression — no existing tests should break |

### Web tests (`pnpm --filter web test`)

| Area | File | Coverage |
|------|------|----------|
| SalesTable | `components/__tests__/SalesTable.test.tsx` | Rendering, sorting, empty/loading states |
| RecordSaleModal | `components/__tests__/RecordSaleModal.test.tsx` | Form behavior, validation, submit payload |
| ViewTabs | `components/__tests__/ViewTabs.test.tsx` | New tab renders, click handler emits `sales-history` |
| App integration | `App.test.tsx` | Sales tab triggers sales fetch, correct view renders |
| CardTable | `components/__tests__/CardTable.test.tsx` | Record Sale button appears for listed cards |

### Manual validation checklist (after all WPs complete)
- [ ] Import cards → price → mark listed → record sale → verify sales history tab shows it
- [ ] Partial sell: card with qty 3, sell 1 → card stays listed with qty 2, sale appears in history
- [ ] Full sell: card with qty 1, sell 1 → card becomes `sold`, sale appears in history
- [ ] Sales list paginates correctly with 50+ sales
- [ ] Order status update from sales history view
- [ ] Stats bar shows sales summary data on sales tab
- [ ] Existing inventory/listing views unaffected

---

## 7. Future API Sync Compatibility

When TCGPlayer API access is eventually granted, the `sales` table is designed to accept automated data:

1. **`tcgplayerOrderId`** — nullable now (manual entry), will be the primary correlation key for API-synced orders. Add a unique partial index (`WHERE tcgplayerOrderId IS NOT NULL`) to prevent duplicate imports.

2. **`orderStatus` enum** — matches TCGPlayer's order lifecycle (`pending → confirmed → shipped → delivered`), plus `cancelled`. API sync updates this field.

3. **`salePriceCents`** — integer cents, directly mappable from API order line items.

4. **`buyerName`** — populated from API order data; nullable allows manual entries without it.

5. **Import path:** Future `POST /api/sales/sync` endpoint (or a scheduled job) would:
   - Poll TCGPlayer order API
   - Match orders to cards via `tcgplayerOrderId` / SKU
   - Upsert into `sales` table
   - Auto-update card quantities and statuses
   - Same table, same schema — no migration needed

6. **No breaking changes required.** The manual-entry schema is a strict subset of what API sync needs. The only additions would be:
   - A `source` column (`manual | api_sync`) — can be added later without breaking existing rows (defaulting to `manual`)
   - The unique index on `tcgplayerOrderId`
   - A sync job in the scheduler

7. **Card quantity management is the same** regardless of source — decrement on sale, transition to `sold` when exhausted. The API sync path just calls the same logic.

---

## 8. Open Questions

1. **Should "Record Sale" decrement from the DB `quantity` column directly, or should we track "listed quantity" vs "available quantity" separately?**
   Recommendation: Decrement directly for now. The quantity column already means "how many we have." A sale reduces that. If we later need audit-trail granularity, the `sales` table provides it (sum `quantitySold` grouped by `cardId`).

2. **Should cancelled sales restore card quantity?**
   Recommendation: Yes — `PATCH /api/sales/:id` with `orderStatus: 'cancelled'` should increment `cards.quantity` back and potentially restore `listed` status if card was moved to `sold`. This should be in WP-2 from the start.

3. **Price display: cents vs dollars?**
   The sales table stores cents (integer). The frontend formats to dollars for display. This is consistent with `PROJECT_PLAN.md` and avoids floating-point issues. The existing card prices are `numeric(10,2)` strings — the `RecordSaleModal` converts the listing price to cents when submitting.
