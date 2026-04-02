# Phase 3.3 — Invoice / Packing Slip Generation

Date: 2026-04-01
Status: ✅ COMPLETE — all work packages (WP-I1 through WP-I8) delivered
Depends on: Phase 3.1 (sales) + Phase 3.2 (shipments) complete

---

## 1. Routing Check

**Next strict-order item:** `PROJECT_PLAN.md` §6.3 — all 4 tasks:

```
[ ] Build printable invoice template (HTML → PDF or browser print)
[ ] Include: buyer info, card details, sale price, order ID, your seller info
[ ] "Print" button on each sale that opens print-friendly view
[ ] Packing slip variant — simpler format for including in shipment
```

**Blocked by TCGPlayer API?** No. All 4 tasks are entirely local — HTML template rendering + browser `window.print()`. Zero external dependencies.

---

## 2. Approach

### Why server-rendered HTML, not client-side React

The invoice/packing-slip endpoints return **standalone HTML pages** from the server (`GET /api/sales/:id/invoice`, `GET /api/sales/:id/packing-slip`). The frontend opens them in a new tab and calls `window.print()`.

Rationale:

- Print CSS works best on a clean page without the SPA shell (no header, nav, sidebar in print output).
- The server already has direct DB access — one query joins sale + card + shipment into a complete invoice payload. No extra API round-trip from the client.
- The HTML is self-contained (inline CSS) — can be saved as a file or piped to a PDF library later without browser rendering.
- Matches the `PROJECT_PLAN.md` §6.5 endpoint spec (`GET /api/sales/:id/invoice`, `GET /api/sales/:id/packing-slip`).

### Data available for invoices

From the existing schema (no new tables needed):

| Field          | Source                                |
| -------------- | ------------------------------------- |
| Order ID       | `sales.tcgplayerOrderId`              |
| Sale date      | `sales.soldAt`                        |
| Buyer name     | `sales.buyerName`                     |
| Card name      | `cards.productName` (via join)        |
| Card set       | `cards.setName` (via join)            |
| Card condition | `cards.condition` (via join)          |
| Qty sold       | `sales.quantitySold`                  |
| Sale price     | `sales.salePriceCents`                |
| Order status   | `sales.orderStatus`                   |
| Carrier        | `shipments.carrier` (via join)        |
| Tracking #     | `shipments.trackingNumber` (via join) |
| Shipped date   | `shipments.shippedAt` (via join)      |
| Sale notes     | `sales.notes`                         |

### Seller info

No seller profile table exists. For this slice, seller info is configured via **env vars** (new):

```
SELLER_NAME=        # e.g. "Dustin's Card Shop"
SELLER_ID=          # e.g. TCGPlayer seller username (optional)
```

Defaults to empty strings. The template conditionally hides the seller block when unconfigured. A seller-settings table can replace this later without changing the template contract.

### Multi-card order grouping

Multiple `sales` rows can share the same `tcgplayerOrderId`. The invoice endpoint supports:

- **Single-sale invoice:** `GET /api/sales/:id/invoice` — one sale line-item
- **Order-grouped invoice:** `GET /api/sales/:id/invoice` — when the sale has a `tcgplayerOrderId`, the template includes ALL sales with that same order ID as line items. This gives a proper multi-line invoice for bundled orders.

The packing slip uses the same grouping logic.

---

## 3. Work Packages

### WP-I1: Env config for seller info

**Completed:** 2026-04-01

**Files:**

- `packages/server/src/config/env.ts` — add `SELLER_NAME` (string, optional, default `''`) and `SELLER_ID` (string, optional, default `''`)
- `.env.example` — add `SELLER_NAME=` and `SELLER_ID=` with comments

**Acceptance criteria:**

- App starts with or without these vars set
- `pnpm --filter server test` passes

**Risk:** Low. Additive config only.

---

### WP-I2: Invoice HTML renderer (server)

**Completed:** 2026-04-01

**Files:**

- `packages/server/src/lib/invoices/render-invoice.ts` — **new file**
  - `renderInvoiceHtml(data: InvoiceData): string`
  - Pure function: takes typed data, returns self-contained HTML string with inline CSS
  - Template includes:
    - Header: seller name/ID (if configured), "Invoice" title, date
    - Order info: TCGPlayer order ID, buyer name, order status
    - Line items table: card name, set, condition, qty, unit price, line total
    - Totals row: subtotal (sum of line items)
    - Shipping info: carrier, tracking number, shipped date (if shipment exists)
    - Footer: notes, "Thank you" message
  - Print-optimized CSS: `@media print` rules, no background colors, clean borders
- `packages/server/src/lib/invoices/render-packing-slip.ts` — **new file**
  - `renderPackingSlipHtml(data: PackingSlipData): string`
  - Simplified variant: card name, set, condition, qty only (no prices)
  - Includes: order ID, buyer name, shipping info, gift-pool items note if applicable
  - Compact layout designed for folding into a PWE or small package
- `packages/server/src/lib/invoices/types.ts` — **new file**
  - `InvoiceData`, `PackingSlipData`, `InvoiceLineItem`, `InvoiceShipment`, `InvoiceSellerInfo` interfaces
- `packages/server/src/lib/invoices/index.ts` — **new file**: barrel export

**Acceptance criteria:**

- `renderInvoiceHtml()` returns valid HTML with all sections populated
- `renderPackingSlipHtml()` returns valid HTML without price data
- Both are pure functions with no DB/IO dependency (testable in isolation)
- HTML passes basic structure validation (has `<html>`, `<head>`, `<body>`, `<table>`)

**Risk:** Low. Pure template functions.

---

### WP-I3: Invoice renderer tests (server)

**Completed:** 2026-04-01

**Files:**

- `packages/server/src/lib/invoices/__tests__/render-invoice.test.ts` — **new file**
  1. Renders invoice with all fields populated
  2. Renders invoice with missing optional fields (no buyer, no shipment, no seller info)
  3. Multi-line-item invoice renders all rows with correct totals
  4. Prices formatted as dollars (not cents)
  5. Contains `@media print` CSS
  6. Seller block hidden when `sellerName` is empty
- `packages/server/src/lib/invoices/__tests__/render-packing-slip.test.ts` — **new file** 7. Renders packing slip with card details but no prices 8. Renders shipping info when present 9. Renders without shipping info gracefully 10. Compact layout (no price columns)

**Acceptance criteria:** All 10 cases pass. `pnpm --filter server test` green.

> Test-first: write before WP-I2.

---

### WP-I4: Invoice/packing-slip routes (server)

**Completed:** 2026-04-01

**Files:**

- `packages/server/src/routes/invoices.ts` — **new file**
  - `GET /api/sales/:id/invoice`
    - Loads sale by ID; if sale has `tcgplayerOrderId`, loads all sales with that order ID
    - Joins card data for each sale line item
    - Left-joins shipment data (picks first shipment in the order group)
    - Reads `SELLER_NAME` / `SELLER_ID` from env
    - Calls `renderInvoiceHtml()`, returns `Content-Type: text/html`
    - 404 if sale not found
  - `GET /api/sales/:id/packing-slip`
    - Same data loading as invoice
    - Calls `renderPackingSlipHtml()`, returns `Content-Type: text/html`
    - 404 if sale not found
- `packages/server/src/routes/index.ts` — register invoice routes

**Acceptance criteria:**

- `GET /api/sales/1/invoice` returns HTML with `Content-Type: text/html`
- Multi-card order groups all line items
- Missing sale returns 404 JSON error
- Shipment data included when present, gracefully absent when not

**Risk:** Low-medium. The order-grouping query (find all sales with same `tcgplayerOrderId`) needs a null guard — sales without an order ID should NOT group with other null-order sales.

---

### WP-I5: Invoice route tests (server)

**Completed:** 2026-04-01

**Files:**

- `packages/server/src/routes/__tests__/invoices.test.ts` — **new file**
  1. `GET /api/sales/:id/invoice` — returns HTML with correct content-type
  2. `GET /api/sales/:id/invoice` — includes card name, price, buyer in output
  3. `GET /api/sales/:id/invoice` — groups multiple sales with same `tcgplayerOrderId`
  4. `GET /api/sales/:id/invoice` — sale without `tcgplayerOrderId` renders single line item (no grouping with other null-order sales)
  5. `GET /api/sales/:id/invoice` — includes shipment data when present
  6. `GET /api/sales/:id/invoice` — sale not found → 404
  7. `GET /api/sales/:id/packing-slip` — returns HTML without price data
  8. `GET /api/sales/:id/packing-slip` — sale not found → 404

**Acceptance criteria:** All 8 cases pass.

> Test-first: write before WP-I4.

---

### WP-I6: API client + types (web) ✅

**Files:**

- `packages/web/src/api/types.ts` — no new types needed (endpoints return HTML, not JSON)
- `packages/web/src/api/client.ts` — add methods:
  - `getInvoiceUrl(saleId: number): string` — returns URL string `/api/sales/${saleId}/invoice` (not a fetch — opens in new tab)
  - `getPackingSlipUrl(saleId: number): string` — returns URL string `/api/sales/${saleId}/packing-slip`

**Acceptance criteria:** `pnpm --filter web build` passes.

**Risk:** Low. These are URL builders, not fetch calls.

---

### WP-I7: Print buttons in SalesTable (web) ✅

**Files:**

- `packages/web/src/components/SalesTable.tsx` — add action buttons:
  - 🧾 "Invoice" button — visible for all non-cancelled sales; `onClick` opens `api.getInvoiceUrl(sale.id)` in new tab via `window.open()`
  - 📋 "Packing Slip" button — visible for `confirmed`/`shipped` sales; opens packing slip URL in new tab
- `packages/web/src/components/SalesTable.tsx` — update `colCount` to account for new action column width

**Acceptance criteria:**

- Invoice button visible for pending/confirmed/shipped/delivered sales
- Packing slip button visible for confirmed/shipped sales only
- Buttons open new browser tab with the HTML document
- `window.print()` is NOT auto-called (user can preview first, then print from browser)

**Risk:** Low. Small addition to existing component.

---

### WP-I8: Frontend tests (web) ✅

**Files:**

- `packages/web/src/components/__tests__/SalesTable.test.tsx` — **add cases**
  1. Invoice button renders for non-cancelled sale
  2. Invoice button hidden for cancelled sale
  3. Packing slip button renders for confirmed sale
  4. Packing slip button renders for shipped sale
  5. Packing slip button hidden for pending/delivered/cancelled sale
  6. Buttons have correct href/target attributes

**Acceptance criteria:** `pnpm --filter web test` passes.

---

## 4. Implementation Order

```
WP-I1  Env config (seller info)          [server, quick]
  ↓
WP-I2  Invoice + packing slip renderers  [server]  ←── test-first with WP-I3
WP-I3  Renderer tests                    [server]
  ↓
WP-I4  Invoice routes                    [server]  ←── test-first with WP-I5
WP-I5  Route tests                       [server]
  ↓
WP-I6  API client URL builders           [web] ✅
  ↓
WP-I7  Print buttons in SalesTable       [web] ✅ ←── test-first with WP-I8
WP-I8  Frontend tests                    [web] ✅
```

**Parallelizable:** WP-I2 + WP-I3 (test-first pair). WP-I4 + WP-I5 (test-first pair). WP-I7 + WP-I8 (test-first pair).
**Sequential bottleneck:** WP-I1 first (env config); WP-I4 depends on WP-I2.

---

## 5. Test Summary

### Server (18 test cases)

| Area                          | Cases | Key assertions                                                                                  |
| ----------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `render-invoice.test.ts`      | 6     | All fields, missing optionals, multi-line, price formatting, print CSS, seller block            |
| `render-packing-slip.test.ts` | 4     | No prices, shipping info present/absent, compact layout                                         |
| `invoices.test.ts` (routes)   | 8     | HTML content-type, card/buyer/price in output, order grouping, null-order guard, shipment, 404s |

### Web (6 test cases)

| Area                            | Cases | Key assertions                                   |
| ------------------------------- | ----- | ------------------------------------------------ |
| `SalesTable.test.tsx` additions | 6     | Button visibility by status, correct URL targets |

---

## 6. Blocked Items

**None.** All 4 §6.3 tasks are fully local. No external API dependency.

The only future enhancement that would need external access is auto-populating buyer shipping address on the invoice (from TCGPlayer order data), which is not in scope and not in the checklist.

---

## 7. Checklist Mapping (PROJECT_PLAN.md §6.3)

After all WPs complete:

```
- [x] Build printable invoice template (HTML → PDF or browser print)
- [x] Include: buyer info, card details, sale price, order ID, your seller info
- [x] "Print" button on each sale that opens print-friendly view
- [x] Packing slip variant — simpler format for including in shipment
```

Milestone 3.3 status: **complete** (4 of 4 tasks, no blockers).
