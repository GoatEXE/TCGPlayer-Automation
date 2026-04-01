# Phase 3.1 — Active Listings View Preset

Date: 2026-04-01

## Summary
Implemented the first Phase 3.1 dashboard slice by adding a dedicated **Active Listings** view preset in the web app.

This reuses the existing sortable/filterable inventory table and applies a listed-only workflow entry point.

## What Was Implemented

Files:
- `packages/web/src/components/ViewTabs.tsx` (new)
- `packages/web/src/components/__tests__/ViewTabs.test.tsx` (new)
- `packages/web/src/App.test.tsx` (new)
- `packages/web/src/App.tsx`
- `packages/web/src/App.css`

Behavior:
- Added top-level view tabs:
  - `📦 Inventory`
  - `🏷️ Active Listings`
- Selecting **Active Listings** now:
  - forces `statusFilter = 'listed'`
  - resets search query
  - resets pagination to page 1
  - updates section heading to `Active Listings`
  - hides status pills (to keep the view focused)
- Selecting **Inventory** returns to the full inventory workflow with existing status pills.

## Why This Completes the Plan Item
The underlying table already had required capabilities (sorting/filtering + current/market/listing/qty/status columns). This slice adds the missing dedicated active-listings-oriented entry point without reworking data models or APIs.

## Test Coverage
- `ViewTabs` component tests verify:
  - both tabs render
  - aria-selected states
  - click handlers emit correct view mode
- `App` view-mode test verifies:
  - switching to Active Listings issues card fetch with `status='listed'`
  - Active Listings heading/filter behavior toggles as expected

## Validation
- `pnpm --filter web test` ✅ 92 passing
- `pnpm --filter web build` ✅ passing
- `pnpm format:check` ✅ passing

## Notes
- No backend changes were required.
- Existing inventory behavior was preserved.
