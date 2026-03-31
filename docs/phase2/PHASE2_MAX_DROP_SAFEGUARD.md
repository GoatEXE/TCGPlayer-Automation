# Phase 2.2 — Max Price Drop Safeguard

Date: 2026-03-31

## Summary
Implemented configurable cap on single-cycle listing price decreases to protect against API anomalies, data errors, or temporary market price glitches. Prevents catastrophic price drops while still allowing legitimate gradual price adjustments.

## Purpose
Without a safeguard, a temporary API error or data glitch could cause listing prices to plummet inappropriately. For example:
- TCGTracking API returns $0.01 instead of $10.00 due to a temporary bug
- Without cap: listing price drops from $9.80 to $0.01 (100% drop)
- With 20% cap: listing price only drops to $7.84 (20% drop), preserving most value

This protects seller revenue while still allowing legitimate market-driven price decreases to occur gradually over multiple price check cycles.

## Implementation

### Environment Variable
**`MAX_PRICE_DROP_PERCENT`** (default: 20)
- Percentage cap on single-cycle listing price decreases
- Applied only to downward listing price changes
- Does not affect upward price adjustments
- Does not affect status transitions (e.g., matched → gift, matched → needs_attention)

### Logic Flow
When calculating new listing price during price checks:

1. **Old listing price exists AND new listing price exists:**
   - Compare old vs. new
   - If new < old (downward adjustment):
     - Calculate max allowed drop: `oldPrice * (1 - MAX_PRICE_DROP_PERCENT / 100)`
     - Apply cap: `newPrice = max(calculatedPrice, maxAllowedDrop)`
   - If new >= old (upward adjustment or no change):
     - No cap applied, use calculated price as-is

2. **Old listing price exists BUT new listing price is NULL:**
   - Card transitioning to `gift` or `needs_attention` status
   - No cap applied (these are legitimate state changes, not price adjustments)

3. **No old listing price (first-time pricing):**
   - No cap applied (nothing to compare against)

### Helper Function
**`capDownwardListingPriceChange({ previousListingPrice, nextListingPrice, maxPriceDropPercent })`**

Location: `packages/server/src/lib/price-check/max-price-drop-safeguard.ts`

Returns capped price ensuring downward changes don't exceed the configured percentage.

### Integration Point
Applied in `runPriceCheck()` at:
- `packages/server/src/lib/price-check/run-price-check.ts`
- After pricing engine calculates new listing price
- Before updating card record in database
- Only when both old and new listing prices exist

## Example Scenarios

### Scenario 1: Legitimate Gradual Decline
- Current listing: $10.00
- New market price: $8.00 → calculated listing: $7.84 (98%)
- Drop: 21.6% (exceeds 20% cap)
- **Applied price: $8.00** (20% drop from $10.00)
- Next cycle: if market still at $8.00, can drop another 20% to $6.40
- Gradual adjustment over multiple cycles

### Scenario 2: Small Legitimate Drop
- Current listing: $5.00
- New market price: $4.80 → calculated listing: $4.70 (98%)
- Drop: 6% (within 20% cap)
- **Applied price: $4.70** (full calculated price)
- Cap does not interfere with normal market tracking

### Scenario 3: API Anomaly Blocked
- Current listing: $50.00
- TCGTracking API glitch returns $1.00 → calculated listing: $0.98
- Drop: 98% (far exceeds 20% cap)
- **Applied price: $40.00** (20% drop from $50.00)
- Protects seller from catastrophic loss
- Next cycle: if API corrects to $50.00, price recovers

### Scenario 4: Status Transition (Not Capped)
- Current listing: $1.00
- New market price: $0.03 → should transition to `gift` status
- New listing price: NULL (gift cards don't have listing prices)
- **Applied price: NULL** (status change, not a price drop)
- Cap does NOT block legitimate gift pool moves

## Test Coverage

### Unit Tests
`packages/server/src/lib/price-check/__tests__/max-price-drop-safeguard.test.ts`
- Cap applied when drop exceeds threshold
- No cap when drop within threshold
- No cap for upward adjustments
- Handles null/undefined inputs
- Edge cases (zero, negative, equal values)

### Integration Tests
`packages/server/src/lib/price-check/__tests__/run-price-check.test.ts`
- Cap applied during actual price check execution
- Status transitions unaffected
- First-time pricing unaffected
- Multiple cards with mixed scenarios

**Current test coverage:**
- Server tests: **103 passing** (↑ from 94)

## Configuration Recommendations

### Default: 20%
Good for most sellers. Allows significant single-cycle drops while still protecting against extreme anomalies.

### Conservative: 10%
Use if:
- High-value inventory (cards worth $50+)
- API data quality concerns
- Prefer slower, more cautious price tracking

### Aggressive: 30-50%
Use if:
- Low-value bulk inventory (most cards under $5)
- Market is highly volatile
- Prefer rapid price response over safeguarding

### No Cap: 100%
Effectively disables safeguard. Only use if:
- Manual review of all price changes
- High confidence in API data quality
- Willing to accept risk of catastrophic drops

## Future Enhancements
- [ ] Per-card override (high-value cards get stricter cap)
- [ ] Alert/notification when cap is applied (potential API issue)
- [ ] Configurable cap for upward adjustments (prevent manipulation)
- [ ] Historical cap application tracking in price_history table

## Related Files
- `packages/server/src/config/env.ts` (MAX_PRICE_DROP_PERCENT config)
- `packages/server/src/lib/price-check/max-price-drop-safeguard.ts` (helper function)
- `packages/server/src/lib/price-check/run-price-check.ts` (integration)
- `packages/server/src/lib/price-check/__tests__/max-price-drop-safeguard.test.ts` (unit tests)
- `packages/server/src/lib/price-check/__tests__/run-price-check.test.ts` (integration tests)
