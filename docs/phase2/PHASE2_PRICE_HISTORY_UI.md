# Phase 2.3 — Price History & Adjustment Log Viewer

Date: 2026-03-31

## Summary
Implemented a per-card price history viewer end-to-end:
- backend endpoint to read `price_history`
- frontend 📈 row action in the card table
- modal UI showing change history (market/listing/drift/status)
- tests for backend route, API client, modal, and CardTable integration

## Backend

### Endpoint
`GET /api/cards/:id/price-history?limit=<optional>`

- Default `limit`: `50`
- Min `limit`: `1`
- Max `limit`: `200`
- Sort: `checkedAt DESC` (newest first)

### Response shape
```json
{
  "history": [
    {
      "id": 12,
      "cardId": 123,
      "source": "scheduled",
      "previousMarketPrice": "1.00",
      "newMarketPrice": "1.10",
      "previousListingPrice": "0.98",
      "newListingPrice": "1.08",
      "previousStatus": "listed",
      "newStatus": "listed",
      "driftPercent": "10.00",
      "notificationSent": true,
      "checkedAt": "2026-03-31T12:00:00.000Z"
    }
  ]
}
```

Notes:
- Returns an empty `history` array when no rows exist for that card.
- Route currently does not perform a separate card-existence check.

### Files
- `packages/server/src/routes/cards.ts`
- `packages/server/src/routes/__tests__/cards.test.ts`

## Frontend

### UI behavior
- Added a 📈 action button on each card row in `CardTable`.
- Clicking it opens `PriceHistoryModal` for that card.
- Modal states:
  - loading
  - error
  - empty
  - table with history rows
- Table columns:
  - Date
  - Source
  - Market (before → after)
  - Listing (before → after)
  - Drift
  - Status Change

### Type/runtime handling
- `driftPercent` is handled as `string | null` to match Postgres/Drizzle numeric serialization.
- UI parses drift safely before formatting.

### Files
- `packages/web/src/api/types.ts`
- `packages/web/src/api/client.ts`
- `packages/web/src/api/__tests__/client.test.ts`
- `packages/web/src/components/CardTable.tsx`
- `packages/web/src/components/__tests__/CardTable.test.tsx`
- `packages/web/src/components/PriceHistoryModal.tsx`
- `packages/web/src/components/__tests__/PriceHistoryModal.test.tsx`
- `packages/web/src/App.css`

## Validation
- Server tests: **92 passing**
- Web tests: **64 passing**
- Formatting: `pnpm format:check` passing

## Remaining Related Work
- Add "Last Checked" column on main listings table
- Optional richer history UX (filters, charting, export)
