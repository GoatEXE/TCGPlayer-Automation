# Phase 2.4 — Per-Card Floor Price Support

Date: 2026-03-31

## Summary
Implemented optional per-card floor price support end-to-end. Cards can now have an individual `floorPriceCents` value that acts as a minimum listing price, applied after the 98% market price calculation but before the max-drop safeguard.

Scope includes backend/API enforcement plus dashboard UI controls for inline set/clear in the card table.

## Files Changed
### Backend
- `packages/server/drizzle/0004_brainy_blazing_skull.sql` (new migration)
- `packages/server/drizzle/meta/0004_snapshot.json` (new snapshot)
- `packages/server/drizzle/meta/_journal.json` (updated)
- `packages/server/src/db/schema/cards.ts`
- `packages/server/src/lib/pricing/engine.ts`
- `packages/server/src/lib/price-check/run-price-check.ts`
- `packages/server/src/routes/cards.ts`
- `packages/server/src/lib/price-check/__tests__/run-price-check.test.ts`
- `packages/server/src/routes/__tests__/cards.test.ts`

### Frontend
- `packages/web/src/api/types.ts`
- `packages/web/src/App.tsx`
- `packages/web/src/App.css`
- `packages/web/src/components/CardTable.tsx`
- `packages/web/src/components/__tests__/CardTable.test.tsx`
- `packages/web/src/components/__tests__/ReviewListModal.test.tsx`

## Migration
**File:** `packages/server/drizzle/0004_brainy_blazing_skull.sql`

```sql
ALTER TABLE "cards" ADD COLUMN "floor_price_cents" integer;
```

Adds a nullable `floor_price_cents` column to the `cards` table. No default value; existing cards have `null` (no floor).

## Schema Changes
**File:** `packages/server/src/db/schema/cards.ts`

Added:
```typescript
floorPriceCents: integer('floor_price_cents'),
```

## Pricing Engine
**File:** `packages/server/src/lib/pricing/engine.ts`

New function `applyFloorPriceCents`:
```typescript
export function applyFloorPriceCents({
  listingPrice,
  floorPriceCents,
}: {
  listingPrice: number | null;
  floorPriceCents: number | null | undefined;
}): number | null {
  if (listingPrice === null || floorPriceCents == null) {
    return listingPrice;
  }

  return Math.max(listingPrice, floorPriceCents / 100);
}
```

**Behavior:**
- If `listingPrice` is `null` (e.g., card is gift/needs_attention), floor is not applied.
- If `floorPriceCents` is `null` or `undefined`, floor is not applied.
- Otherwise, returns the greater of `listingPrice` and `floorPriceCents / 100`.

This function is called **after** the base pricing calculation (`calculatePrice`) but **before** the max-drop safeguard (`capDownwardListingPriceChange`).

## Price Check Integration
**File:** `packages/server/src/lib/price-check/run-price-check.ts`

During scheduled/manual price checks:
1. `calculatePrice` runs and produces a `listingPrice` (or `null` for gift/needs_attention).
2. `applyFloorPriceCents` is called with `card.floorPriceCents`.
3. The floored price is then passed to `capDownwardListingPriceChange`.

This ensures:
- Gift/needs_attention status transitions are **not** affected by floor (floor only applies when `listingPrice` is non-null).
- Floor enforcement happens before the max-drop safeguard, so a floor can prevent a price from dropping below a certain threshold.

## API Changes
**File:** `packages/server/src/routes/cards.ts`

### PATCH /api/cards/:id
Accepts optional `floorPriceCents` in the request body:
```typescript
interface UpdateCardBody {
  status?: 'pending' | 'matched' | 'listed' | 'needs_attention' | 'gift' | 'error';
  quantity?: number;
  listingPrice?: number;
  floorPriceCents?: number | null;  // NEW
  notes?: string;
  condition?: string;
}
```

Validation rules:
- `floorPriceCents: null` ✅ allowed (clears floor)
- `floorPriceCents: <non-negative integer>` ✅ allowed
- negative or non-integer values ❌ rejected with `400`

### GET /api/cards
Response includes `floorPriceCents` field for each card.

### POST /api/cards/:id/reprice
Single-card repricing applies the card's `floorPriceCents` if set.

### POST /api/cards/reprice-all
Batch repricing also applies each card's `floorPriceCents` before persisting listing prices.

## Testing
**Files:**
- `packages/server/src/lib/price-check/__tests__/run-price-check.test.ts`
- `packages/server/src/routes/__tests__/cards.test.ts`

Test coverage includes:
- `applyFloorPriceCents` mock in price check tests verifies floor logic is invoked.
- Card API tests verify `floorPriceCents` can be set via PATCH and persists correctly.
- Null/undefined floor values are handled gracefully.

## Verification
Run migrations:
```bash
# Migrations auto-run on server startup
docker compose up app
```

Check schema:
```bash
pnpm --filter server db:studio
# Verify cards table has floor_price_cents column
```

Set a floor via API:
```bash
curl -X PATCH http://localhost:3000/api/cards/1 \
  -H "Content-Type: application/json" \
  -d '{"floorPriceCents": 50}'
```

Trigger reprice:
```bash
curl -X POST http://localhost:3000/api/cards/1/reprice
# Listing price should not drop below $0.50 if market price is lower
```

## Frontend UI Behavior
- Card table includes a **Floor** column.
- Clicking a floor cell opens an inline editor.
- Enter a dollar amount (for example `0.50`) to set floor (`50` cents).
- Leave input blank and confirm to clear floor (`null`).
- Escape cancels editing without update.

## Not Included in This Phase
- **Bulk floor operations** (e.g., set floor for all cards in a set).
- **Floor price history tracking** (floor changes are not logged in `price_history`).

## Future Enhancements
- Bulk floor assignment (e.g., "set floor to $0.25 for all commons").
- Floor price audit log (track when floors are changed and by whom).
- Export floor prices in CSV format.
