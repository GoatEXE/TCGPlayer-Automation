# Phase 3.1 — Sales History View

Date: 2026-04-01

## Summary
Implemented an end-to-end Sales History slice with backend sales APIs and a new dashboard view for browsing completed sales.

## What Was Implemented

### Backend
- Added `sales` table and `order_status` enum.
- Extended `card_status` enum with `sold`.
- Added routes under `/api/sales`:
  - `POST /api/sales` — record sale, decrement card quantity, set `sold` when quantity reaches 0.
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
