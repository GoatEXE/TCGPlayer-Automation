# Phase 3.1 — Sales History View

Date: 2026-04-01

## Current behavior
Sales History is sales-focused only. Notification history is no longer fetched or rendered here; it lives in the Notifications tab. Bulk order recording is initiated from Inventory and uses `POST /api/sales/bulk` when an order contains multiple paid or gift lines. Order revenue includes product totals plus shipping collected once per order; gift lines remain zero-revenue history rows.

## Summary
Implemented an end-to-end Sales History slice with backend sales APIs and a new dashboard view for browsing completed sales.

## What Was Implemented

### Backend
- Added `sales` table and `order_status` enum.
- Extended `card_status` enum with `sold`.
- Added routes under `/api/sales`:
  - `POST /api/sales` — record a single paid sale, decrement card quantity, set `sold` when quantity reaches 0, and return `lineItemType: 'sale'`.
  - `POST /api/sales/bulk` — record a TCGPlayer order with paid and gift lines; gift lines decrement gift-pool inventory and move depleted cards to `gifted`.
  - `GET /api/sales` — paginated sales list with filters and card display fields.
  - `GET /api/sales/:id` — sale detail.
  - `PATCH /api/sales/:id` — update sale metadata/status.
- Registered sales routes in global route registration.
- Added server route tests for creation, validation, listing, detail, and update paths.

### Frontend
- Added sales API types and client method (`getSales`).
- Extended view tabs with `💰 Sales History` mode.
- Added `SalesTable` component with columns:
  - date, card, set, qty, price, buyer, order ID, status.
- Wired sales-history mode in `App.tsx`:
  - dedicated fetch cycle (`api.getSales`)
  - sales search + pagination
  - loading and empty states
- Added sales status badge styles for order states.
- Added/updated tests:
  - API client tests for `getSales`
  - `SalesTable` component tests
  - `ViewTabs` tests for sales-history tab
  - app-level test that sales-history tab triggers sales fetch

## Validation
- `pnpm --filter server test` ✅ 132 passing
- `pnpm --filter server exec tsc --noEmit -p tsconfig.json` ✅ passing
- `pnpm --filter web test` ✅ 104 passing
- `pnpm --filter web build` ✅ passing
- `pnpm format:check` ✅ passing

## Notes
- This slice is manual-entry compatible and API-sync-ready.
- TCGPlayer order-sync automation remains a separate future task.
