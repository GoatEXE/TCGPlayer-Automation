# Expense Tracking + Profitability View — Implementation Plan

**Status:** 📝 Planned
**Date:** 2026-04-18
**Scope:** Add practical expense tracking + P&L summary to the existing TCGPlayer dashboard, with optional sale-flow auto-estimates.

---

## Problem Statement

The app currently tracks inventory, listings, and sales revenue, but not business expenses. This makes profitability incomplete. Dustin needs a lightweight accounting layer for a solo TCGPlayer operation (supplies, shipping, fees, inventory acquisition, other), plus a simple performance summary (revenue − expenses).

---

## Codebase-Constrained Design Principles

Based on current project patterns:

- **Backend:** Fastify route plugins (`packages/server/src/routes/*.ts`) with inline validation and Drizzle queries.
- **DB:** Drizzle schema files per domain (`packages/server/src/db/schema/*`), exported via `schema/index.ts`, migrations in `packages/server/drizzle`.
- **Frontend:** Single `App.tsx` orchestrating tab views; feature components in `packages/web/src/components`.
- **API client:** typed methods in `packages/web/src/api/client.ts` + contracts in `types.ts`.
- **Tests:**
  - server: Vitest + Fastify `app.inject` route tests
  - web: Vitest + RTL integration/component tests
- **Money model:** sales already use **cents integers** (`salePriceCents`), so expenses should also use cents for precision.

---

## Feature Scope (MVP)

1. **Expense categories**
   - `supplies`
   - `shipping`
   - `tcgplayer_fees`
   - `inventory_acquisition`
   - `other`

2. **Expense recording fields**
   - date (`occurredAt`)
   - amount (`amountCents`)
   - category
   - description
   - optional quantity + unit
   - computed/stored per-unit cost (`unitCostCents`) when quantity exists

3. **Profitability view**
   - revenue (from sales)
   - expenses (from new expenses table)
   - net profit
   - margin %
   - category breakdown

4. **Sale-flow integration (optional estimates)**
   - optional auto-create estimated shipping/supplies/fees when recording sales
   - defaults managed in Expense Settings

---

## Architecture Overview

```text
Frontend (web)
  ViewTabs (+ Performance tab)
      ↓
  App.tsx (new performance state + handlers)
      ↓
  Performance components:
    - PerformanceSummaryCard
    - ExpenseSettingsCard
    - ExpenseTable
    - ExpenseFormModal
      ↓
  api/client.ts
      ↓
Backend (server)
  /api/expenses routes
  sales route integration (optional estimate hook)
      ↓
Drizzle/Postgres
  expense tables + settings
```

---

## Database Design (Drizzle)

## 1) New schema file: `packages/server/src/db/schema/expenses.ts`

### Enums

- `expense_category`
  - `supplies`
  - `shipping`
  - `tcgplayer_fees`
  - `inventory_acquisition`
  - `other`

- `expense_source`
  - `manual`
  - `sale_auto_estimate`

- `auto_expense_kind` (nullable; used for auto-estimate dedupe/reporting)
  - `shipping_order`
  - `supplies_order`
  - `transaction_flat_order`
  - `marketplace_percent_line`
  - `transaction_percent_line`

### Table: `expenses`

- `id` serial PK
- `occurredAt` timestamptz not null default now
- `amountCents` int not null
- `category` expense_category not null
- `subcategory` text nullable (used for supplies detail: envelopes/sleeves/top loaders/team bags/other)
- `description` text nullable
- `quantity` int nullable
- `unit` text nullable
- `unitCostCents` int nullable
- `source` expense_source not null default `manual`
- `isEstimate` boolean not null default false
- `autoKind` auto_expense_kind nullable
- `saleId` int nullable FK -> `sales.id` (`onDelete: set null`)
- `tcgplayerOrderId` text nullable
- `createdAt` timestamptz not null default now
- `updatedAt` timestamptz not null default now

### Indexing

- index on `occurredAt`
- index on `category`
- index on `saleId`
- index on `tcgplayerOrderId`
- unique partial index for order-level auto estimates (`tcgplayerOrderId + autoKind`) for fixed-cost kinds, to prevent duplicates during parallel bulk sale writes

---

## 2) New schema file: `packages/server/src/db/schema/expense-settings.ts`

### Table: `expense_settings` (singleton semantics)

- `id` serial PK
- `autoRecordSaleExpenses` boolean default false
- `autoRecordShipping` boolean default true
- `shippingCostCents` int default 99
- `autoRecordSupplies` boolean default true
- `suppliesCostCents` int default 25
- `autoRecordTcgplayerFees` boolean default true
- `marketplaceFeeBps` int default 1075
- `transactionFeeBps` int default 250
- `transactionFlatFeeCents` int default 30
- `createdAt`, `updatedAt`

> Singleton pattern: read first row; if none exists, insert defaults and return it.

---

## 3) Existing schema export update

- `packages/server/src/db/schema/index.ts`
  - export new `expenses` + `expense-settings` modules

---

## 4) Migration

- Generate next migration: `packages/server/drizzle/0010_*.sql`
- Include enum creation, tables, FKs, indexes

---

## API Design

New route plugin: `packages/server/src/routes/expenses.ts`
Registered in `packages/server/src/routes/index.ts` at prefix `/api/expenses`.

## 1) `GET /api/expenses`

Paginated expense list with filters.

**Query params:**
- `page`, `limit`
- `category`
- `source`
- `search` (description/subcategory/order id)
- `dateFrom`, `dateTo`

**Response:**
```ts
{ expenses: Expense[]; total: number; page: number; limit: number }
```

## 2) `POST /api/expenses`

Create manual expense.

**Body (manual):**
- `amountCents` (required, int > 0)
- `category` (required)
- `occurredAt?`
- `description?`
- `subcategory?`
- `quantity?`
- `unit?`
- `isEstimate?` (default false)

**Behavior:**
- compute `unitCostCents` when `quantity` is provided
- set `source = 'manual'`

## 3) `PATCH /api/expenses/:id`

Edit expense fields; recompute unit cost if amount/quantity changes.

## 4) `DELETE /api/expenses/:id`

Delete incorrect or obsolete expense entry.

## 5) `GET /api/expenses/performance`

Simple P&L summary endpoint.

**Query params:** `dateFrom?`, `dateTo?`

**Response:**
```ts
{
  revenueCents: number;
  expensesCents: number;
  netProfitCents: number;
  marginPercent: number | null;
  salesCount: number;
  expenseCount: number;
  estimatedExpensesCents: number;
  actualExpensesCents: number;
  byCategory: Array<{
    category: ExpenseCategory;
    totalCents: number;
    count: number;
  }>;
}
```

**Revenue rule:** exclude `sales.orderStatus = 'cancelled'`.

## 6) `GET /api/expenses/settings`

Return singleton expense settings (auto-create defaults if missing).

## 7) `POST /api/expenses/settings`

Update settings with integer validation (`>= 0`, bps ranges, etc.).

---

## Sales-Flow Integration Design

Update `POST /api/sales` in `packages/server/src/routes/sales.ts`:

- Add optional body field: `applyEstimatedExpenses?: boolean`
- Determine effective behavior:
  - If field provided, it overrides global setting for that request
  - Else fallback to `expense_settings.autoRecordSaleExpenses`
- If enabled, call helper in `lib/expenses` to create estimate entries:
  - shipping (order-level fixed)
  - supplies (order-level fixed)
  - marketplace fee % (line-level)
  - transaction fee % (line-level)
  - transaction flat fee (order-level fixed)

### Dedupe behavior for bulk sale flow

Bulk sell currently sends multiple `POST /api/sales` in parallel. Order-level fixed estimates must be deduped by DB unique index + `onConflictDoNothing`.

### Practical limitations (documented)

- If no `tcgplayerOrderId` is provided, order-level fixed costs are applied per sale line (conservative over-estimate).
- Transaction % is estimated against sale subtotal (shipping/tax unknown).

---

## Frontend Design

## New/updated contracts in `packages/web/src/api/types.ts`

Add:
- `ExpenseCategory`, `ExpenseSource`, `AutoExpenseKind`
- `Expense`, `CreateExpenseRequest`, `UpdateExpenseRequest`
- `GetExpensesParams`, `GetExpensesResponse`
- `PerformanceSummaryResponse`
- `ExpenseSettings`, `UpdateExpenseSettingsRequest`
- extend `CreateSaleRequest` with optional `applyEstimatedExpenses?: boolean`

## API client additions in `packages/web/src/api/client.ts`

- `getExpenses(params)`
- `createExpense(data)`
- `updateExpense(id, data)`
- `deleteExpense(id)`
- `getPerformanceSummary(params)`
- `getExpenseSettings()`
- `updateExpenseSettings(data)`

---

## UI Components

## 1) `ViewTabs` update

Add `performance` view:
- label: `📊 Performance`

## 2) New components

- `PerformanceSummaryCard.tsx`
  - revenue, expenses, net, margin, estimated/actual split
- `ExpenseSettingsCard.tsx`
  - auto-estimate toggles + cost/fee defaults
- `ExpenseTable.tsx`
  - date/category/description/qty/unit-cost/amount/source/order actions
- `ExpenseFormModal.tsx`
  - create/edit expense entry

## 3) `App.tsx` integration

Add performance states:
- expenses list + pagination + filters
- performance summary
- settings
- modal state for create/edit

Behavior:
- switching to Performance tab triggers:
  - `getPerformanceSummary`
  - `getExpenses`
  - `getExpenseSettings`
- create/update/delete expense refreshes list + summary
- settings save updates auto-estimate defaults

## 4) Sale flow UI integration

- `RecordSaleModal` + `BulkSellModal` add checkbox:
  - “Apply estimated expenses”
- default checkbox state from `expense_settings.autoRecordSaleExpenses`
- include `applyEstimatedExpenses` in `createSale` payload

---

## Implementation Slices

Each slice is independently verifiable and follows test-first sequencing.

---

### Slice 1 — DB Foundation (Expenses + Settings)

**Goal:** Add persisted expense data model and defaults.

**Files:**
- `packages/server/src/db/schema/expenses.ts` (new)
- `packages/server/src/db/schema/expense-settings.ts` (new)
- `packages/server/src/db/schema/index.ts`
- `packages/server/drizzle/0010_*.sql` (generated)

**Acceptance criteria:**
- [ ] New tables/enums exist and migrate cleanly
- [ ] Indexes + FK constraints present
- [ ] Server boots with migrations applied

**Risk:** low

---

### Slice 2 — Expenses API (CRUD + P&L + Settings)

**Goal:** Enable manual expense tracking and performance summaries.

**Files:**
- `packages/server/src/routes/expenses.ts` (new)
- `packages/server/src/routes/index.ts`
- `packages/server/src/routes/__tests__/expenses.test.ts` (new)

**Endpoints:**
- `GET /api/expenses`
- `POST /api/expenses`
- `PATCH /api/expenses/:id`
- `DELETE /api/expenses/:id`
- `GET /api/expenses/performance`
- `GET /api/expenses/settings`
- `POST /api/expenses/settings`

**Acceptance criteria:**
- [ ] CRUD + filters work
- [ ] P&L endpoint returns correct revenue/expense/net math
- [ ] Settings endpoint persists + validates

**Risk:** medium (aggregation correctness)

---

### Slice 3 — Auto-Estimate Helper + Sales Route Hook

**Goal:** Optional automatic cost deduction from sale flow.

**Files:**
- `packages/server/src/lib/expenses/auto-estimates.ts` (new)
- `packages/server/src/lib/expenses/index.ts` (new)
- `packages/server/src/lib/expenses/__tests__/auto-estimates.test.ts` (new)
- `packages/server/src/routes/sales.ts`
- `packages/server/src/routes/__tests__/sales.test.ts`

**Acceptance criteria:**
- [ ] `POST /api/sales` accepts optional `applyEstimatedExpenses`
- [ ] Auto-estimates inserted when enabled
- [ ] Order-level fixed costs dedupe under parallel bulk sell
- [ ] Existing sales behavior unchanged when disabled

**Risk:** medium-high (parallel dedupe + regression sensitivity in sales tests)

---

### Slice 4 — Web API Contracts + Client

**Goal:** Expose expense/performance endpoints to frontend.

**Files:**
- `packages/web/src/api/types.ts`
- `packages/web/src/api/client.ts`
- `packages/web/src/api/__tests__/client.test.ts`

**Acceptance criteria:**
- [ ] New methods available and typed
- [ ] Existing methods unaffected

**Risk:** low

---

### Slice 5 — Performance UI Components

**Goal:** Build reusable UI pieces for expense tracking and P&L.

**Files (new):**
- `packages/web/src/components/PerformanceSummaryCard.tsx`
- `packages/web/src/components/ExpenseSettingsCard.tsx`
- `packages/web/src/components/ExpenseTable.tsx`
- `packages/web/src/components/ExpenseFormModal.tsx`
- corresponding `__tests__/*`

**Acceptance criteria:**
- [ ] Expenses can be viewed/added/edited/deleted
- [ ] Per-unit cost is visible when qty provided
- [ ] P&L summary renders with category breakdown

**Risk:** medium (new UI surface area)

---

### Slice 6 — App + View Integration

**Goal:** Wire new Performance tab and data flow.

**Files:**
- `packages/web/src/components/ViewTabs.tsx`
- `packages/web/src/App.tsx`
- `packages/web/src/App.css`
- `packages/web/src/components/__tests__/ViewTabs.test.tsx`
- `packages/web/src/App.test.tsx`

**Acceptance criteria:**
- [ ] New Performance tab appears and loads data
- [ ] Filters + pagination work
- [ ] Mutations refresh table + summary

**Risk:** medium (App.tsx is already large)

---

### Slice 7 — Sale Modal Toggle Wiring (Per-Sale Optionality)

**Goal:** Make auto-deduct explicitly optional at sale time.

**Files:**
- `packages/web/src/components/RecordSaleModal.tsx`
- `packages/web/src/components/BulkSellModal.tsx`
- `packages/web/src/components/CardTable.tsx` (prop plumbing)
- related tests (`RecordSaleModal`, `BulkSellModal`, `CardTable`, `App`)

**Acceptance criteria:**
- [ ] Checkbox defaults from settings
- [ ] Payload includes `applyEstimatedExpenses`
- [ ] Works in both single and bulk sell flows

**Risk:** medium (touches existing tested sale UX)

---

## Test Plan

## Server (Vitest)

`packages/server/src/routes/__tests__/expenses.test.ts`
- create expense (manual)
- quantity/unit/unitCost handling
- list pagination/filter/search/date range
- patch/delete paths
- settings get/update validation
- performance summary math + category grouping
- revenue excludes cancelled sales

`packages/server/src/lib/expenses/__tests__/auto-estimates.test.ts`
- line-level fee calculation
- fixed-cost dedupe by order id
- fallback behavior when no order id

`packages/server/src/routes/__tests__/sales.test.ts` additions
- `applyEstimatedExpenses=true` path
- disabled/default path leaves expenses untouched

## Web (Vitest + RTL)

- `api/__tests__/client.test.ts` new expense/performance methods
- `components/__tests__/ExpenseFormModal.test.tsx`
- `components/__tests__/ExpenseTable.test.tsx`
- `components/__tests__/ExpenseSettingsCard.test.tsx`
- `components/__tests__/PerformanceSummaryCard.test.tsx`
- `components/__tests__/ViewTabs.test.tsx` (new tab)
- `App.test.tsx` integration for Performance view + sale payload flag

---

## Rollout & Validation Sequence

1. Apply migration + verify startup migrations pass.
2. Land expenses routes + tests.
3. Land auto-estimate helper + sales hook + tests.
4. Land frontend client contracts.
5. Land new performance components.
6. Wire tab/app integration.
7. Add sale modal checkbox wiring.
8. Run full suite:
   - `pnpm --filter server test`
   - `pnpm --filter web test`
   - `pnpm build`

---

## Practical Defaults (recommended for Dustin)

- `autoRecordSaleExpenses`: **off** initially (safer rollout)
- shipping estimate: `$0.99`
- supplies estimate: `$0.25`
- marketplace fee: `10.75%`
- transaction fee: `2.5% + $0.30`

Once validated with real order outcomes, enable auto-estimates globally and tune numbers.

---

## Known Limitations (explicitly acceptable for MVP)

- Auto fee math is estimated from sale subtotal; true TCGPlayer fees include additional order factors.
- If no `tcgplayerOrderId` is provided, fixed costs are applied per sale line.
- Inventory acquisition costs are tracked as cash expenses (not full per-card COGS accounting).

These are acceptable for a lightweight solo-seller profitability dashboard and can be refined later.

---

## Success Criteria (feature-level)

- [ ] Dustin can record expenses with category/date/amount/description/quantity/unit
- [ ] Per-unit cost is visible and stored when quantity is entered
- [ ] Dashboard shows revenue, expenses, net profit, margin, and category breakdown
- [ ] Sale flow can optionally auto-create estimated shipping/supplies/fees
- [ ] Entire feature is covered by route/client/component/integration tests
