# Phase 2.6 — Adjustment Logging + CSV Diff Generation

Date: 2026-04-01

## Summary
This slice adds two missing pieces in Phase 2 auto-adjustment tracking:

1. `price_history.adjustedToPrice` logging for local listed-price adjustments.
2. Deterministic CSV diff generation for each `runPriceCheck` cycle.

This is implemented as a **local-only** workflow because direct TCGPlayer inventory API updates are still externally blocked.

## What Was Implemented

### 1) `price_history.adjusted_to_price` schema support
Files:
- `packages/server/drizzle/0005_young_franklin_storm.sql`
- `packages/server/drizzle/meta/0005_snapshot.json`
- `packages/server/drizzle/meta/_journal.json`
- `packages/server/src/db/schema/price-history.ts`

Added nullable numeric column:
- `adjusted_to_price numeric(10,2)`

### 2) Adjustment-specific history logging
File:
- `packages/server/src/lib/price-check/run-price-check.ts`

`adjustedToPrice` is populated only when:
- card is `listed` before and after the check (`listed -> listed`),
- listing price changed,
- drift meets/exceeds configured threshold (`PRICE_DRIFT_THRESHOLD_PERCENT`).

For listed cards below threshold drift, the existing listing price is intentionally held (no listed-price adjustment is applied), and `adjustedToPrice` remains `null`.

### 3) CSV diff generation per cycle
Files:
- `packages/server/src/lib/price-check/csv-diff.ts`
- `packages/server/src/lib/price-check/run-price-check.ts`
- `packages/server/src/lib/price-check/index.ts`

`runPriceCheck` now generates a deterministic `csvDiff` artifact with:
- `rows` (structured)
- `csv` (header + rows)

#### Actions
- `add_listing`: non-listed card transitions into relist-ready `matched`
- `remove_listing`: previously listed card transitions out of `listed` (e.g., `gift`, `needs_attention`)
- `price_change`: listed card stays listed but requires threshold-level listing price change

#### CSV columns
- `action`
- `card_id`
- `product_name`
- `previous_status`
- `new_status`
- `previous_listing_price`
- `new_listing_price`
- `drift_percent`

Rows are sorted deterministically by action order, then `card_id`.

## Test Coverage
Updated/added tests:
- `packages/server/src/lib/price-check/__tests__/csv-diff.test.ts`
  - deterministic ordering
  - CSV escaping
  - header-only output for empty cycles
- `packages/server/src/lib/price-check/__tests__/run-price-check.test.ts`
  - `adjustedToPrice` populated for threshold listed->listed adjustments
  - `adjustedToPrice` stays null below threshold/non-adjustment transitions
  - CSV diff rows for add/remove/price_change categories

## Validation
- `pnpm --filter server test` ✅ 124 passing
- `pnpm --filter server exec tsc --noEmit -p tsconfig.json` ✅ passing
- `pnpm format:check` ✅ passing

## Constraints / Remaining Gap
- The external step “Call TCGPlayer inventory API to update price” remains blocked by API access availability.
- This implementation keeps local pricing state, adjustment auditability, and manual export readiness moving forward while that dependency is unresolved.
