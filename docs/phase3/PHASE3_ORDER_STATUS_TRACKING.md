# Phase 3.1 — Order Status Tracking (Local-First)

Date: 2026-04-01
Status: IN PROGRESS (WP-A through WP-G implemented)
Depends on: `PHASE3_SALES_HISTORY.md` WP-1 through WP-4 (sales schema + routes must exist)

---

## 1. What we can build now vs what's blocked

### Buildable now (no API credentials needed)

| Capability | Why it's useful without API |
|---|---|
| **Status transition audit log** (`sale_status_history` table) | Records every `orderStatus` change with timestamp, previous/new status, source. Gives Dustin a timeline per order and lets future API sync merge cleanly. |
| **Guarded status transitions** in `PATCH /api/sales/:id` | Enforce valid state machine (`pending→confirmed→shipped→delivered`, `*→cancelled`). Reject illegal transitions. Currently the PATCH endpoint is unguarded. |
| **Batch status update** endpoint | `PATCH /api/sales/batch-status` — mark multiple orders shipped at once (common when doing a post-office run). |
| **Order pipeline summary** endpoint | `GET /api/sales/pipeline` — counts per status plus value sums. Powers a kanban/funnel widget. |
| **Dashboard pipeline widget** (web) | Visual status funnel on the Sales History tab: cards showing count + $ value per status. |
| **Inline status update** in `SalesTable` (web) | Dropdown or click-to-advance in the status column instead of opening a detail view. |

### Explicitly blocked (requires TCGPlayer API)

| Capability | Blocker |
|---|---|
| Scheduled order-status poll job | No API credentials / endpoint to call |
| Auto-create sales from incoming TCGPlayer orders | No order webhook or poll endpoint |
| Buyer address / shipping label data | Only available via API |
| Push tracking info back to TCGPlayer | Requires authenticated seller API |

**Decision:** Build the audit trail, state machine, batch ops, and pipeline UI now. Leave a clearly-marked `syncOrderStatuses()` stub that is never called until API access is granted. No scheduler job — the price-check scheduler pattern (`lib/price-check/scheduler.ts`) establishes the template; the order-sync scheduler will clone it when the time comes.

---

## 2. Data Model Changes

### New table: `sale_status_history`

```
sale_status_history
├── id              serial PK
├── saleId          integer FK → sales.id (CASCADE on delete)
├── previousStatus  order_status_enum (nullable — null for initial creation)
├── newStatus       order_status_enum NOT NULL
├── source          sale_update_source_enum NOT NULL DEFAULT 'manual'
│                   ('manual' | 'api_sync')
├── note            text (nullable — e.g. "Dropped off at USPS")
├── changedAt       timestamp with tz NOT NULL DEFAULT now()
```

**Why a separate table instead of a column on `sales`?**
- Sales can go through 3–5 status changes; a single `updatedAt` loses the history.
- The audit trail is the same structure the API sync will write into — no schema migration needed later.
- `source` column distinguishes manual entries from future automated ones.

### New enum: `sale_update_source_enum`

```
pgEnum('sale_update_source', ['manual', 'api_sync'])
```

Added now even though `api_sync` won't be written for a while — avoids a future `ALTER TYPE` migration.

### State machine (enforced in route logic, not DB constraint)

```
pending ──→ confirmed ──→ shipped ──→ delivered
   │            │            │
   └────────────┴────────────┴──→ cancelled
```

- Forward transitions only (no `shipped→confirmed`).
- Any non-terminal status can move to `cancelled`.
- `cancelled` and `delivered` are terminal — no further transitions.
- `cancelled` triggers quantity restoration (already specced in PHASE3_SALES_HISTORY.md open question #2).

---

## 3. File-Level Task List (strict order)

**Prerequisite:** PHASE3_SALES_HISTORY.md WP-1 through WP-4 must be implemented first (the `sales` table, `orderStatusEnum`, sales routes, and stats endpoint must exist).

---

### WP-A: Schema — status history table + migration

**Files:**
- `packages/server/src/db/schema/sale-status-history.ts` — **new file**: `saleUpdateSourceEnum` + `saleStatusHistory` table definition, types
- `packages/server/src/db/schema/index.ts` — add re-export
- Run `drizzle-kit generate` → new migration in `packages/server/drizzle/`

**Depends on:** Sales schema from PHASE3_SALES_HISTORY WP-1.
**Risk:** Low. Additive table, no existing schema touched.
**Verify:** `drizzle-kit generate` succeeds; migration SQL is clean; `pnpm --filter server test` passes.

---

### WP-B: Status transition logic + audit trail (server)

**Files:**
- `packages/server/src/lib/sales/status-machine.ts` — **new file**
  - `isValidTransition(from: OrderStatus, to: OrderStatus): boolean`
  - `TERMINAL_STATUSES` set (`cancelled`, `delivered`)
  - `VALID_TRANSITIONS` map
- `packages/server/src/lib/sales/index.ts` — **new file**: barrel export
- `packages/server/src/routes/sales.ts` — modify existing `PATCH /:id`:
  - Import + enforce `isValidTransition()`; return 400 on invalid transition
  - After status change succeeds, insert row into `sale_status_history` with `source: 'manual'`
  - On `cancelled`: restore card quantity + potentially reset card status from `sold→listed` (existing open question #2, resolved here)
- `packages/server/src/routes/sales.ts` — modify existing `POST /`:
  - After sale creation, insert initial `sale_status_history` row (`previousStatus: null, newStatus: <initial>`)

**Depends on:** WP-A.
**Risk:** Medium. Modifies two existing route handlers. The cancellation-restores-quantity logic has edge cases (card deleted, card already re-imported, etc.).
**Verify:** Tests in WP-C.

---

### WP-C: Tests — status machine + audit trail (server)

**Files:**
- `packages/server/src/lib/sales/__tests__/status-machine.test.ts` — **new file**
  - Valid forward transitions (pending→confirmed, confirmed→shipped, shipped→delivered)
  - Valid cancel transitions (pending→cancelled, confirmed→cancelled, shipped→cancelled)
  - Invalid backward transitions (shipped→confirmed, delivered→pending)
  - Terminal status rejects all transitions (cancelled→*, delivered→*)
- `packages/server/src/routes/__tests__/sales.test.ts` — **add cases to existing file**
  - `PATCH /api/sales/:id` — rejects invalid transition (e.g. `shipped→pending`) → 400
  - `PATCH /api/sales/:id` — rejects transition from terminal status → 400
  - `PATCH /api/sales/:id` — valid transition writes `sale_status_history` row
  - `PATCH /api/sales/:id` — cancel restores card quantity
  - `PATCH /api/sales/:id` — cancel on fully-sold card resets card status to `listed`
  - `PATCH /api/sales/:id` — cancel on card that was deleted (cardId=null) succeeds without crash
  - `POST /api/sales` — creates initial status history entry

**Depends on:** WP-A, WP-B.
**Risk:** Low.
**Verify:** `pnpm --filter server test`.

> Test-first: write WP-C tests before WP-B implementation, per project convention.

---

### WP-D: Batch status update endpoint (server)

**Files:**
- `packages/server/src/routes/sales.ts` — add `PATCH /batch-status`
  - Body: `{ saleIds: number[], newStatus: OrderStatus, note?: string }`
  - Validates each sale's current status allows the transition
  - Updates all valid ones, returns `{ updated: number, skipped: { id, reason }[] }`
  - Writes `sale_status_history` row per sale
  - If `newStatus === 'cancelled'`, runs quantity restoration per sale

**Depends on:** WP-B (uses `isValidTransition`, audit-trail insert logic).
**Risk:** Low-medium. Batch cancellation quantity restoration needs to be correct.
**Verify:** Test cases in WP-E.

---

### WP-E: Tests — batch status update (server)

**Files:**
- `packages/server/src/routes/__tests__/sales.test.ts` — **add cases**
  - Batch update happy path: 3 sales pending→confirmed
  - Batch update mixed: 2 valid + 1 already cancelled → 2 updated, 1 skipped
  - Batch update empty array → 400
  - Batch cancel restores quantities for all affected cards
  - Writes history rows for each updated sale

**Depends on:** WP-D.
**Verify:** `pnpm --filter server test`.

---

### WP-F: Pipeline summary endpoint (server)

**Files:**
- `packages/server/src/routes/sales.ts` — add `GET /pipeline`
  - Returns: `{ pipeline: { status: string, count: number, totalCents: number }[] }`
  - Single query: `SELECT order_status, count(*), sum(sale_price_cents) FROM sales GROUP BY order_status`

**Depends on:** Sales routes exist (PHASE3_SALES_HISTORY WP-2).
**Risk:** Low.
**Verify:** Add test case to `sales.test.ts`.

---

### WP-G: Status history endpoint (server)

**Files:**
- `packages/server/src/routes/sales.ts` — add `GET /:id/history`
  - Returns: `{ history: SaleStatusHistoryEntry[] }` ordered by `changedAt ASC`
  - Each entry: `{ id, previousStatus, newStatus, source, note, changedAt }`

**Depends on:** WP-A (table), WP-B (data gets written).
**Risk:** Low.
**Verify:** Test case in `sales.test.ts`.

---

### WP-H: API client + types (web)

**Files:**
- `packages/web/src/api/types.ts` — add:
  - `SaleStatusHistoryEntry` type
  - `GetSaleHistoryResponse` type
  - `BatchStatusUpdateRequest` / `BatchStatusUpdateResponse` types
  - `SalesPipelineEntry` / `GetSalesPipelineResponse` types
- `packages/web/src/api/client.ts` — add methods:
  - `getSaleStatusHistory(saleId)` 
  - `batchUpdateSaleStatus(request)`
  - `getSalesPipeline()`

**Depends on:** WP-D, WP-F, WP-G (API shapes must be defined).
**Risk:** Low.
**Verify:** `pnpm --filter web build`.

---

### WP-I: Pipeline widget + inline status control (web)

**Files:**
- `packages/web/src/components/SalesPipelineCard.tsx` — **new file**
  - Row of status cards: Pending / Confirmed / Shipped / Delivered / Cancelled
  - Each shows count + total $ value
  - Click a card → filters sales table to that status
- `packages/web/src/components/OrderStatusSelect.tsx` — **new file**
  - Dropdown rendered inline in `SalesTable` status column
  - Only shows valid forward transitions for current status
  - On change, calls `api.updateSale()` then refreshes
  - Terminal statuses render as static badge (no dropdown)
- `packages/web/src/components/SaleStatusTimeline.tsx` — **new file**
  - Vertical timeline of status changes for a single sale
  - Shows timestamp, from→to, source badge, note
  - Rendered in sale detail view or expandable row

**Depends on:** WP-H.
**Risk:** Low. UI-only.
**Verify:** Component tests (WP-J).

---

### WP-J: Frontend component tests (web)

**Files:**
- `packages/web/src/components/__tests__/SalesPipelineCard.test.tsx` — **new file**
  - Renders all 5 status cards with counts/values
  - Click emits filter callback
  - Zero-count statuses still render (dimmed)
- `packages/web/src/components/__tests__/OrderStatusSelect.test.tsx` — **new file**
  - Shows valid next statuses only
  - Terminal status renders as badge, not dropdown
  - Calls onChange with selected value
- `packages/web/src/components/__tests__/SaleStatusTimeline.test.tsx` — **new file**
  - Renders entries in chronological order
  - Shows source badge (manual vs api_sync)
  - Handles empty history

**Depends on:** WP-I.
**Verify:** `pnpm --filter web test`.

---

### WP-K: Wire pipeline + status controls into Sales History view (web)

**Files:**
- `packages/web/src/App.tsx` — add pipeline state, fetch on sales-history tab mount, pass to `SalesPipelineCard`; pipeline card click sets sales status filter
- `packages/web/src/components/SalesTable.tsx` — replace static status badge with `OrderStatusSelect`; add expandable row or modal to show `SaleStatusTimeline`; add checkbox column for batch selection
- `packages/web/src/App.tsx` — add batch status update handler: selected sales + target status → `api.batchUpdateSaleStatus()` → refresh
- `packages/web/src/App.css` — pipeline card styles, timeline styles

**Depends on:** WP-I, WP-J, and PHASE3_SALES_HISTORY WP-9 (sales tab must be wired).
**Risk:** Medium. Integration point — state management for pipeline + batch selection + inline updates. Most likely regression area.
**Verify:** `pnpm --filter web test` + `pnpm --filter web build`.

---

## 4. Implementation Order Summary

```
PHASE3_SALES_HISTORY WP-1..WP-10  (prerequisite — sales infrastructure)
         ↓
WP-A   Schema: sale_status_history table       [server]
         ↓
WP-B   Status machine + audit trail logic      [server]  ←─── test-first with WP-C
WP-C   Tests: machine + audit trail            [server]
         ↓
WP-D   Batch status update endpoint            [server]  ←─── test-first with WP-E
WP-E   Tests: batch update                     [server]
         ↓
WP-F   Pipeline summary endpoint               [server]
WP-G   Status history endpoint                 [server]   (F and G are independent)
         ↓
WP-H   API client + types                      [web]
         ↓
WP-I   Pipeline widget + status controls       [web]     ←─── test-first with WP-J
WP-J   Frontend component tests                [web]
         ↓
WP-K   Wire into Sales History view            [web]
```

**Parallelizable:** WP-F + WP-G (independent endpoints). WP-I + WP-J (test-first pair).
**Sequential bottleneck:** WP-A → WP-B → WP-D chain. WP-K last.

---

## 5. Tests to Write First

Per test-first convention, these are written **before** their implementation counterparts:

### Server (Vitest, `pnpm --filter server test`)

| Test file | Cases | Implements |
|---|---|---|
| `lib/sales/__tests__/status-machine.test.ts` | 4 groups (valid forward, valid cancel, invalid backward, terminal rejection) ~10 assertions | Before WP-B |
| `routes/__tests__/sales.test.ts` (additions) | 7 new cases for guarded PATCH + audit trail + cancel restoration | Before WP-B |
| `routes/__tests__/sales.test.ts` (additions) | 5 new cases for batch status update | Before WP-D |
| `routes/__tests__/sales.test.ts` (additions) | 1 case for pipeline endpoint, 1 for status history endpoint | Before WP-F/G |

### Web (Vitest + Testing Library, `pnpm --filter web test`)

| Test file | Cases | Implements |
|---|---|---|
| `components/__tests__/SalesPipelineCard.test.tsx` | 3 cases | Before WP-I |
| `components/__tests__/OrderStatusSelect.test.tsx` | 3 cases | Before WP-I |
| `components/__tests__/SaleStatusTimeline.test.tsx` | 3 cases | Before WP-I |

---

## 6. What Remains Blocked for Real API Sync

When TCGPlayer API credentials are granted, the following **new** work is needed (none of the above WPs need changing):

1. **`packages/server/src/lib/sales/sync-orders.ts`** — new module
   - Calls TCGPlayer order list endpoint
   - Matches order line items to `sales` rows via `tcgplayerOrderId`
   - Upserts: creates new sales for new orders, updates `orderStatus` for existing ones
   - Writes `sale_status_history` rows with `source: 'api_sync'`
   - Handles buyer name, address, shipping info population

2. **`packages/server/src/lib/sales/scheduler.ts`** — new module (clone price-check scheduler pattern)
   - BullMQ queue `order-sync`, repeating job every N minutes
   - Calls `syncOrders()` in worker
   - Env vars: `ORDER_SYNC_INTERVAL_MINUTES`, `TCGPLAYER_SELLER_API_KEY`, `TCGPLAYER_SELLER_API_SECRET`

3. **`packages/server/src/routes/sales.ts`** — new endpoint `POST /sync` for manual trigger

4. **Migration:** add unique partial index on `sales.tcgplayerOrderId WHERE tcgplayerOrderId IS NOT NULL`

5. **Env config:** `TCGPLAYER_SELLER_API_KEY`, `TCGPLAYER_SELLER_API_SECRET`, `ORDER_SYNC_INTERVAL_MINUTES` in `config/env.ts`

**Key point:** The `sale_status_history` table, state machine validation, pipeline endpoint, and all frontend components built in this plan work identically for manual and API-synced data. The only difference is the `source` column value.
