# Sell Workflow — Implementation Plan

**Status:** Superseded by Inventory order/gift workflow

The original sell workflow below is retained as historical context for the first sales UI. Current behavior differs in these important ways:

- The **Active Listings** tab has been removed from web navigation.
- **Inventory** is now the place to attach paid-eligible rows to an order. It still preserves the Ready to List bulk-listing action when the matched filter is active.
- A **Notifications** tab owns notification history. Sales History no longer fetches or renders notifications.
- Bulk order recording uses `POST /api/sales/bulk`, not parallel single-sale requests.
- `tcgplayerOrderId` is required for bulk order recording. `orderStatus` defaults to `confirmed`.
- Bulk payloads accept optional `buyerName`, `soldAt`, `notes`, and `applyEstimatedExpenses`, plus a `lines` array.
- Each line is `{ cardId, quantitySold, salePriceCents, lineItemType: 'sale' | 'gift' }`.
- Paid sale lines require listed or listed-origin `needs_attention` cards and `salePriceCents > 0`.
- Gift lines require gift-pool cards and `salePriceCents === 0`; they decrement inventory and move cards to `gifted` when quantity reaches 0.
- Sales, stats, and performance exclude gift rows by default. Invoices and packing slips include gift lines grouped by TCGPlayer Order ID.
- Existing single-card `POST /api/sales` still works for paid sales and returns `lineItemType: 'sale'`.

## Original implementation record

**Status:** ✅ COMPLETE (2026-04-08)
- **Commit:** `707afe5`
- **Tests:** 270 passing, 0 failures
- **Implementation:** All 6 slices delivered and tested
- **Verification:** Full end-to-end integration tested via App.tsx

## Problem Statement

The dashboard currently manages card ingestion, pricing, and listing, and has a complete Sales History view for tracking existing sales. However, there is **no way to create a sale from the card views**. Users must mentally track which cards sold, then (hypothetically) create sale records through an API call. The sell workflow closes this gap by enabling single-card and bulk sale creation directly from the Active Listings and Inventory views, plus inline listing-price editing for active listings.

## Constraints

- **Existing backend is complete.** `POST /api/sales` already handles sale creation, card quantity decrement, and `sold` status transition. No new endpoints are needed.
- **`PATCH /api/cards/:id`** already accepts `listingPrice` (numeric → stored as string). No backend changes needed for inline price editing.
- **`sold` exists in the DB enum** (`packages/server/src/db/schema/cards.ts` line 19) but is **absent from the frontend** `Card.status` type union, `StatusBadge` config, `CardStats` interface, and `StatsBar` display.
- **No `createSale` method** exists on the frontend `ApiClient` (`packages/web/src/api/client.ts`). Must be added.
- **No `CreateSaleRequest`/`CreateSaleResponse` types** exist in `packages/web/src/api/types.ts`. Must be added.
- **Modal patterns** are well-established: `ReviewListModal`, `ShipmentFormModal`, `PriceHistoryModal` all use `modal-backdrop` / `modal-content` CSS classes with consistent backdrop-click/escape-to-close behavior.
- **Bulk selection pattern** exists in `CardTable` (checkbox column, `selectedIds` state, action bar) but is currently **hardcoded to `matched` status only**. Must be extended to also support `listed` cards.
- **Test-first workflow**: Vitest + React Testing Library (web), Vitest + Fastify injection (server). All new code gets tests before implementation.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (packages/web)                                │
│                                                         │
│  types.ts ──► client.ts ──► App.tsx ──► CardTable.tsx   │
│     │                          │           │            │
│     │         RecordSaleModal ◄┘           │            │
│     │         BulkSellModal  ◄─────────────┘            │
│     │                                                   │
│     └── StatusBadge.tsx (+ sold config)                  │
│     └── StatsBar.tsx (+ sold count)                     │
│     └── ViewTabs.tsx (no changes)                       │
└─────────────────────────────────────────────────────────┘
         │ POST /api/sales (existing)
         │ PATCH /api/cards/:id (existing)
         ▼
┌─────────────────────────────────────────────────────────┐
│  Backend (packages/server) — NO CHANGES NEEDED          │
└─────────────────────────────────────────────────────────┘
```

## Implementation Slices

Slices are ordered by strict dependency. Each slice is independently testable and deployable. Slices 1–2 can be parallelized. Slices 3–4 depend on Slice 1. Slice 5 depends on Slices 3 + 4. Slice 6 depends on Slices 3 + 4 + 5.

---

### Slice 1: Sold Status Visibility (Frontend Types + UI)

**Goal:** Make `sold` a first-class status in the frontend so cards transitioned by the sales endpoint are visible.

**Scope:** Frontend only — the DB enum and backend handling already exist.

**Files changed:**

| File | Change |
|------|--------|
| `packages/web/src/api/types.ts` | Add `'sold'` to `Card.status` union; add `sold: number` to `CardStats` |
| `packages/web/src/components/StatusBadge.tsx` | Add `sold` entry to `STATUS_CONFIG` (label: `"Sold"`, color: `"#6366f1"` indigo or similar) |
| `packages/web/src/components/StatsBar.tsx` | Add sold count display (same pattern as other statuses, show when > 0) |
| `packages/web/src/App.tsx` | Add `{ value: 'sold', label: 'Sold' }` to `statusFilters` array in the inventory view |

**Test targets:**

| Test file | Cases |
|-----------|-------|
| `packages/web/src/components/__tests__/StatusBadge.test.tsx` | Renders `"Sold"` label and correct color for `status="sold"` |
| `packages/web/src/App.test.tsx` | Sold filter pill renders; clicking it triggers fetch with `status=sold` |

**Dependencies:** None.

**Risks:** Low. Purely additive frontend change. The server already returns `sold` status on cards; the frontend currently ignores/drops it.

**Acceptance criteria:**
- [x] `Card.status` type includes `'sold'`
- [x] `CardStats` type includes `sold: number`
- [x] StatusBadge renders a styled "Sold" pill for `status="sold"`
- [x] StatsBar shows sold count when > 0
- [x] Inventory view has a "Sold" filter pill
- [x] Sold cards appear in inventory when "Sold" filter is active
- [x] Sold cards do NOT appear in Active Listings view (Active Listings hardcodes `status=listed`)
- [x] All existing tests still pass

**Status:** ✅ COMPLETE

---

### Slice 2: API Client — `createSale` Method + Types

**Goal:** Add the frontend API client method and TypeScript types for creating a sale.

**Scope:** Frontend API layer only.

**Files changed:**

| File | Change |
|------|--------|
| `packages/web/src/api/types.ts` | Add `CreateSaleRequest` interface (matches `RecordSaleBody` in server) and `CreateSaleResponse` type alias for `Sale` |
| `packages/web/src/api/client.ts` | Add `createSale(data: CreateSaleRequest): Promise<Sale>` method that POSTs to `/sales` |

**`CreateSaleRequest` interface:**
```ts
export interface CreateSaleRequest {
  cardId: number;
  quantitySold: number;
  salePriceCents: number;
  buyerName?: string | null;
  tcgplayerOrderId?: string | null;
  orderStatus?: OrderStatus;
  soldAt?: string;
  notes?: string | null;
}
```

**Test targets:**

| Test file | Cases |
|-----------|-------|
| `packages/web/src/api/__tests__/client.test.ts` | `createSale` sends POST to `/api/sales` with correct body; returns `Sale`; throws on error response |

**Dependencies:** None. Can be built in parallel with Slice 1.

**Risks:** None. Server endpoint already exists and is tested.

**Acceptance criteria:**
- [x] `api.createSale(...)` sends `POST /api/sales` with JSON body
- [x] Returns typed `Sale` object on success
- [x] Throws on non-ok response
- [x] Types match server's `RecordSaleBody` exactly

**Status:** ✅ COMPLETE

---

### Slice 3: Inline Listing Price Editing (Active Listings)

**Goal:** Make the Listing Price column editable inline in the Active Listings tab, following the same inline editing pattern previously used for floor price editing.

**Scope:** Frontend `CardTable` component.

**Files changed:**

| File | Change |
|------|--------|
| `packages/web/src/components/CardTable.tsx` | Add inline editing state/handlers for listing price; show editable listing price cell when card is `listed`; add "Recommended" column header |

**Detailed behavior:**
- When viewing Active Listings (all cards are `listed`), the Listing Price column becomes click-to-edit
- Click on a listing price → input field appears
- Enter → save via `onUpdateCard(id, { listingPrice: newValueAsNumber })`
- Escape → cancel edit
- Blur → save
- For reference: show Market Value and a computed "Recommended" price (98% of market, read-only) alongside the editable listing price. The recommended price is computed client-side: `Math.round(parseFloat(card.marketPrice) * 98) / 100` formatted to 2 decimals. Show `—` if no market price.
- The column headers should be: **Market** (existing), **Rec'd** (new, computed), **Listing** (existing, now editable for listed cards)

**Test targets:**

| Test file | Cases |
|-----------|-------|
| `packages/web/src/components/__tests__/CardTable.test.tsx` | Listed card shows clickable listing price; clicking opens input; Enter calls `onUpdateCard` with numeric listingPrice; Escape cancels; non-listed cards show non-editable listing price |

**Dependencies:** None directly, but logically grouped after Slice 1 (sold status) to avoid type conflicts.

**Risks:**
- Low. Mirrors an established inline editing pattern in the same component.
- The `PATCH /api/cards/:id` endpoint already accepts `listingPrice` as a number and converts to string for storage (confirmed in `cards.ts` line 351).

**Acceptance criteria:**
- [x] Listing price is clickable on listed cards in CardTable
- [x] Click opens numeric input pre-filled with current price
- [x] Enter saves, Escape cancels, blur saves
- [x] New "Rec'd" column shows 98% of market price (read-only)
- [x] Non-listed cards show listing price as plain text (not editable)
- [x] `onUpdateCard` called with `{ listingPrice: <number> }`

**Status:** ✅ COMPLETE

---

### Slice 4: RecordSaleModal Component

**Goal:** Build the modal for recording a single sale, with all required and optional fields.

**Scope:** New frontend component + types.

**Files created:**

| File | Purpose |
|------|---------|
| `packages/web/src/components/RecordSaleModal.tsx` | Modal component |
| `packages/web/src/components/__tests__/RecordSaleModal.test.tsx` | Tests |

**Props interface:**
```ts
interface RecordSaleModalProps {
  card: Card;
  onSubmit: (data: CreateSaleRequest) => Promise<void>;
  onClose: () => void;
}
```

**Modal fields:**

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| Quantity | number input | Yes | `card.quantity` | 1 ≤ value ≤ `card.quantity` |
| Sale Price ($) | number input | Yes | `card.listingPrice` (parsed) | > 0 |
| Buyer Name | text input | No | empty | — |
| TCGPlayer Order ID | text input | No | empty | — |
| Sold Date | datetime-local input | No | now (ISO) | valid date |
| Notes | textarea | No | empty | — |

**Behavior:**
- Shows card name, set, condition, quantity, and market/listing price as read-only context at the top
- Displays computed total: `quantity × salePrice`
- Submit button: "💰 Record Sale"
- On submit: constructs `CreateSaleRequest` with `salePriceCents = Math.round(salePrice * 100)`, calls `onSubmit`, shows loading state
- On success: `onSubmit` resolves, modal closes (caller handles)
- On error: display error message in modal, keep modal open
- Backdrop click / Escape closes (when not saving)
- Uses established modal CSS classes (`modal-backdrop`, `modal-content`, `modal-header`, `modal-actions`)

**Test targets:**

| Test file | Cases |
|-----------|-------|
| `RecordSaleModal.test.tsx` | Renders with card context; defaults quantity to card.quantity; defaults price to listing price; validates qty ≤ card.quantity; validates price > 0; submit calls onSubmit with correct CreateSaleRequest; shows loading state; displays error on rejection; Escape closes; backdrop click closes |

**Dependencies:** Slice 2 (CreateSaleRequest type).

**Risks:** Low. Follows established modal pattern from `ShipmentFormModal`.

**Acceptance criteria:**
- [x] Modal renders card info header
- [x] Quantity defaults to card.quantity, max enforced
- [x] Price defaults to listing price (in dollars, not cents)
- [x] Submit sends correct `CreateSaleRequest` (price converted to cents)
- [x] Computed total updates live
- [x] Loading spinner during save
- [x] Error display on failure
- [x] Close on backdrop click and Escape

**Status:** ✅ COMPLETE

---

### Slice 5: BulkSellModal Component

**Goal:** Build the modal for attaching multiple selected cards to a single order.

**Scope:** New frontend component.

**Files created:**

| File | Purpose |
|------|---------|
| `packages/web/src/components/BulkSellModal.tsx` | Modal component |
| `packages/web/src/components/__tests__/BulkSellModal.test.tsx` | Tests |

**Props interface:**
```ts
interface BulkSellModalProps {
  cards: Card[];
  onSubmit: (sales: CreateSaleRequest[]) => Promise<void>;
  onClose: () => void;
}
```

**Modal layout:**

1. **Shared order fields** (top):
   - Buyer Name (text, optional)
   - TCGPlayer Order ID (text, optional)
   - Sold Date (datetime-local, defaults to now)
   - Notes (textarea, optional)

2. **Per-card table:**

   | Card Name | Market | Rec'd | Listed | Qty (editable) | Sale Price (editable) | Subtotal |
   |-----------|--------|-------|--------|----------------|-----------------------|----------|
   | Card A    | $1.00  | $0.98 | $0.98  | [2]            | [$0.98]               | $1.96    |
   | Card B    | $0.50  | $0.49 | $0.49  | [1]            | [$0.49]               | $0.49    |

   - Qty default: `card.quantity`, max: `card.quantity`, min: 1
   - Sale Price default: `card.listingPrice` (parsed to dollars)
   - Subtotal: `qty × price` (read-only, computed)
   - "Recommended" (Rec'd) column: `Math.round(parseFloat(card.marketPrice) * 98) / 100`

3. **Footer:**
   - Grand total: sum of all subtotals
   - Card count: `N cards`
   - Submit: "💰 Attach to Order" (or "Record N Sales")

**Behavior:**
- On submit: constructs one `CreateSaleRequest` per card, all sharing buyer/orderId/date/notes. Calls `onSubmit` with the array.
- `salePriceCents` = `Math.round(perCardPrice * 100)` per card
- Loading state during save; error display on failure
- Escape/backdrop close when not saving

**Test targets:**

| Test file | Cases |
|-----------|-------|
| `BulkSellModal.test.tsx` | Renders all cards in table; shared fields populate all requests; per-card qty/price editable; grand total computes correctly; submit produces correct `CreateSaleRequest[]`; qty validation per card; loading state; error display |

**Dependencies:** Slices 2 + 4 (types and modal pattern established).

**Risks:**
- Medium. This is the most complex new component. Per-card editable fields in a table within a modal is UI-dense.
- The bulk operation is **not atomic** on the server side — each `POST /api/sales` is independent. A partial failure mid-batch will leave some sales created and some not. The modal should show a summary of successes and failures.

**Edge cases:**
- If a card's quantity was reduced by another tab/user between opening the modal and submitting, the server returns `400` ("quantitySold cannot exceed available card quantity"). The modal should catch per-card errors and show which cards failed.
- Empty card selection (shouldn't happen — button is disabled, but guard anyway).

**Acceptance criteria:**
- [x] Shared fields apply to all generated sale requests
- [x] Per-card qty and price are independently editable
- [x] Grand total updates live
- [x] Each card produces one `CreateSaleRequest`
- [x] Per-card errors displayed (partial failure handling)
- [x] Submit disabled when any card has invalid qty or price

**Status:** ✅ COMPLETE

---

### Slice 6: Wiring — CardTable + App Integration

**Goal:** Wire RecordSaleModal and BulkSellModal into CardTable and App.tsx. Add a "Record sale" row action and bulk sell checkbox flow.

**Scope:** Modifications to existing components.

**Files changed:**

| File | Change |
|------|--------|
| `packages/web/src/components/CardTable.tsx` | (1) Add a `Record sale` row action for `listed` cards. (2) Extend checkbox selection to include `listed` cards (not just `matched`). (3) Add "Attach to Order" bulk action button when listed cards are selected. (4) State for `recordSaleCardId` (which card's modal is open) and `showBulkSellModal`. (5) Import and render `RecordSaleModal` and `BulkSellModal`. |
| `packages/web/src/App.tsx` | (1) Add `handleRecordSale` callback that calls `api.createSale`, then refreshes cards/stats. (2) Add `handleBulkSell` callback that calls `api.createSale` for each request in the array, then refreshes. (3) Pass new callbacks through `CardTable` props. (4) Add `onRecordSale` and `onBulkSell` to `CardTableProps`. |

**CardTable prop additions:**
```ts
interface CardTableProps {
  // ... existing props ...
  onRecordSale: (data: CreateSaleRequest) => Promise<void>;
  onBulkSell: (sales: CreateSaleRequest[]) => Promise<void>;
}
```

**Detailed CardTable changes:**

1. **`Record sale` row action** — shown in the Actions menu for `listed` cards and opens `RecordSaleModal` for that card.

2. **Checkbox selection expansion** — Currently, checkboxes are only enabled for `matched` cards. The change:
   - In Active Listings view: checkboxes enabled for `listed` cards (for bulk sell)
   - In Inventory view: checkboxes still only for `matched` cards (for mark-listed)
   - This requires a new prop or detection of which view is active. Simplest approach: add an `enableSellFlow?: boolean` prop to CardTable, set to `true` when `activeView === 'active-listings'`.

3. **Bulk action bar** — When `enableSellFlow` is true and listed cards are selected:
   ```tsx
   <button onClick={() => setShowBulkSellModal(true)}>
     💰 Attach {selectedIds.size} to Order
   </button>
   ```
   When `enableSellFlow` is false and matched cards are selected (existing behavior):
   ```tsx
   <button onClick={handleOpenReview}>
     📋 Mark {selectedIds.size} as Listed
   </button>
   ```

4. **Record sale in Inventory view** — The `Record sale` action also appears on `listed` cards in the Inventory view. Only the bulk-sell checkbox flow is limited to Active Listings.

**App.tsx handler implementations:**

```ts
const handleRecordSale = async (data: CreateSaleRequest) => {
  await api.createSale(data);
  fetchCards();
  fetchStats();
};

const handleBulkSell = async (salesData: CreateSaleRequest[]) => {
  const results = await Promise.allSettled(
    salesData.map(data => api.createSale(data))
  );
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    // throw with summary so BulkSellModal can display
    throw new Error(`${results.length - failures.length} of ${results.length} sales recorded. ${failures.length} failed.`);
  }
  fetchCards();
  fetchStats();
};
```

**Test targets:**

| Test file | Cases |
|-----------|-------|
| `packages/web/src/components/__tests__/CardTable.test.tsx` | "Record Sale" button appears on listed cards; clicking it opens RecordSaleModal; "Attach to Order" button appears when listed cards are selected with `enableSellFlow`; bulk sell button hidden when `enableSellFlow` is false |
| `packages/web/src/App.test.tsx` | Integration: record sale flow calls createSale and refreshes; bulk sell flow calls createSale for each card |

**Dependencies:** Slices 1, 2, 3, 4, 5.

**Risks:**
- Medium. This slice modifies two core files (`CardTable.tsx`, `App.tsx`) that are large and complex.
- The checkbox selection logic change (matched vs listed) needs careful conditional handling to avoid breaking the existing "Mark as Listed" flow.
- `Promise.allSettled` for bulk sell means partial failures are possible. The error message must be clear.

**Edge cases:**
- User opens RecordSaleModal, then the card's quantity is 0 (sold via another path): server returns 400. Modal should show error.
- User records a sale that sets qty to 0 → card goes to `sold` status → it disappears from Active Listings on refresh. Expected behavior.
- Bulk sell with one card already sold: partial success. Summary shown.
- No cards selected: bulk sell button disabled (existing pattern from mark-listed).

**Acceptance criteria:**
- [x] "Record Sale" button visible on listed cards in both Active Listings and Inventory views
- [x] Clicking "Record Sale" opens RecordSaleModal with correct card data
- [x] Modal submit creates sale via API, refreshes card list and stats
- [x] Success feedback shown (alert or toast)
- [x] Checkboxes enabled for listed cards in Active Listings view
- [x] "Attach to Order" button appears for selected listed cards
- [x] Clicking opens BulkSellModal with all selected cards
- [x] Bulk submit creates one sale per card, refreshes on completion
- [x] Partial failure shows summary
- [x] Existing "Mark as Listed" flow unaffected in Inventory view
- [x] After sale, user stays on current view (no auto-switch to Sales History)

**Status:** ✅ COMPLETE

---

## Dependency Graph

```
Slice 1 (Sold status)  ────────────────────────┐
                                                 │
Slice 2 (API types/client) ──┬──────────────────┤
                              │                  │
Slice 3 (Inline price edit)  │ (independent)     │
                              │                  │
Slice 4 (RecordSaleModal) ◄──┘                  │
                              │                  │
Slice 5 (BulkSellModal) ◄────┤                  │
                              │                  │
Slice 6 (Wiring) ◄───────────┴──────────────────┘
```

**Parallelizable:** Slices 1, 2, and 3 can all run concurrently.
**Sequential:** Slice 4 requires Slice 2. Slice 5 requires Slices 2 + 4. Slice 6 requires all prior slices.

---

## Edge Cases & Risks Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Partial failure in bulk sell (some cards already sold) | Medium | Use `Promise.allSettled`, show per-card success/failure summary in BulkSellModal |
| Race condition: card qty changes between modal open and submit | Low | Server validates qty; modal shows server error message |
| Checkbox logic regression (breaking "Mark as Listed") | Medium | `enableSellFlow` prop isolates the two modes; existing mark-listed tests must continue to pass |
| Large bulk selection (50+ cards) | Low | Modal uses scrollable table; no batching needed since each POST is lightweight |
| Listing price edit saves invalid value | Low | Input validation: `min=0`, `step=0.01`; server also validates |
| `salePriceCents` rounding | Low | Use `Math.round(dollars * 100)` consistently in both modals |
| Sold card disappears from active listings | Expected | Active Listings filters by `status=listed`; sold cards naturally excluded. Document this for users. |

---

## Files Changed Summary

### New Files
- `packages/web/src/components/RecordSaleModal.tsx`
- `packages/web/src/components/__tests__/RecordSaleModal.test.tsx`
- `packages/web/src/components/BulkSellModal.tsx`
- `packages/web/src/components/__tests__/BulkSellModal.test.tsx`

### Modified Files
- `packages/web/src/api/types.ts` — `CreateSaleRequest`, `Card.status` union, `CardStats.sold`
- `packages/web/src/api/client.ts` — `createSale()` method
- `packages/web/src/components/StatusBadge.tsx` — sold config
- `packages/web/src/components/StatsBar.tsx` — sold count display
- `packages/web/src/components/CardTable.tsx` — inline listing price edit, `Record sale` row action, bulk sell checkbox flow, `enableSellFlow` prop
- `packages/web/src/App.tsx` — sold filter, handleRecordSale, handleBulkSell, prop wiring

### NOT Modified (Backend)
- `packages/server/src/routes/sales.ts` — existing POST / is sufficient
- `packages/server/src/routes/cards.ts` — existing PATCH /:id accepts listingPrice
- `packages/server/src/db/schema/cards.ts` — `sold` already in enum
- `packages/server/src/db/schema/sales.ts` — no changes needed

---

## Test Plan (per test-first workflow)

For each slice, write tests BEFORE implementation:

1. **Slice 1 tests:** StatusBadge sold rendering, StatsBar sold count, sold filter pill in App
2. **Slice 2 tests:** `api.createSale()` fetch mock — correct URL, method, body, response parsing
3. **Slice 3 tests:** Listing price click-to-edit on listed cards, save on Enter, cancel on Escape, non-listed not editable
4. **Slice 4 tests:** RecordSaleModal rendering, default values, validation, submit payload, error handling
5. **Slice 5 tests:** BulkSellModal rendering, per-card editing, shared fields, grand total, submit payload array
6. **Slice 6 tests:** CardTable `Record sale` action rendering, modal opening, bulk sell flow, App integration handlers

All existing tests must continue to pass after each slice.

---

## Open Questions

1. **Success feedback pattern:** The codebase currently uses `alert()` for user feedback. Should the sell workflow follow this pattern or introduce a toast/notification component? (Recommendation: follow existing `alert()` pattern for consistency; toast can be a future enhancement.)

2. **"Rec'd" column visibility:** Should the Recommended Price column always show, or only in Active Listings view? (Recommendation: always show — it's useful context for pricing decisions in Inventory view too.)

3. **Bulk sell — sequential vs parallel:** Should `createSale` calls be made in parallel (`Promise.allSettled`) or sequentially? Parallel is faster but concurrent card quantity updates could theoretically race. (Recommendation: parallel — the server does per-card validation and card quantity updates are atomic per-sale.)
