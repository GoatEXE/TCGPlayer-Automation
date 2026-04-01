# Phase 3.1 — Summary Stats Cards

Date: 2026-04-01

## Objective
Add dashboard summary cards for:
- total listed
- total sales revenue
- active listing count
- average sale price

## Backend
Added `GET /api/sales/stats` in `packages/server/src/routes/sales.ts`.

Response fields:
- `totalSales` — total number of sales rows
- `totalRevenueCents` — sum of `sale_price_cents`
- `averageSaleCents` — rounded average of `sale_price_cents`
- `activeListingCount` — sum of `cards.quantity` where card status is `listed`
- `totalListedCount` — currently same quantity semantics as `activeListingCount`

Tests:
- `packages/server/src/routes/__tests__/sales.test.ts`
  - populated aggregate response
  - zero/default aggregate response

## Frontend
Added API contract support:
- `packages/web/src/api/types.ts` (`SalesStats`)
- `packages/web/src/api/client.ts` (`getSalesStats()`)
- `packages/web/src/api/__tests__/client.test.ts` (`getSalesStats` request test)

Added UI:
- `packages/web/src/components/SalesStatsBar.tsx`
- `packages/web/src/components/__tests__/SalesStatsBar.test.tsx`
- Integrated into Sales History view in `packages/web/src/App.tsx`
- Added app test assertion for sales stats fetch in `packages/web/src/App.test.tsx`

## Validation
- `pnpm --filter server test` ✅ 134 passing
- `pnpm --filter server exec tsc --noEmit -p tsconfig.json` ✅ passing
- `pnpm --filter web test` ✅ 112 passing
- `pnpm --filter web build` ✅ passing
- `pnpm format:check` ✅ passing
