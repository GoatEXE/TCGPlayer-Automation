# TCGPlayer Seller Fee Analysis & Profitability Research

**Last Updated:** March 29, 2026  
**Context:** Individual seller listing duplicate Riftbound TCG cards (mostly commons/uncommons, $0.02–$3.00)

---

## ⚠️ Research Limitation Notice

This analysis is based on TCGPlayer's official help center documentation as of March 2026.
**CRITICAL**: Verify current fees directly at:
- TCGPlayer Seller Portal: https://store.tcgplayer.com/
- TCGPlayer Fee Reference: https://help.tcgplayer.com/hc/en-us/articles/201357836-TCGplayer-Fees
- Fee Calculation Examples: https://help.tcgplayer.com/hc/en-us/articles/360047732673-Fee-Calculation-Examples

Fee structures can change. **Do not rely on this document alone for business decisions.**

---

## 1. TCGPlayer Fee Structure (Official, 2025–2026)

TCGPlayer uses a **flat commission + transaction fee model** for standard (Level 1–4) sellers.
There is **no tiered commission ladder** — all standard sellers pay the same rate.

### Fee Components

| Fee Type | Amount | Applies To |
|----------|--------|-----------|
| **Marketplace Commission** | **10.75%** of order subtotal | All standard sellers (Level 1–4) |
| **Transaction Fee** | **2.5% + $0.30** per order | All orders |
| **Listing Fee** | $0 | Free to list |
| **Monthly Fee** | $0 | No subscription |
| **Payment Processing** | Included | Built into fees above |

### Combined Effective Rate

**~13.25% + $0.30 per order**

- Marketplace Commission: order subtotal × 10.75% (capped at $75 per product)
- Transaction Fee: (order total [items + shipping + tax] × 2.5%) + $0.30 flat

### Key Details
- The **$0.30 flat fee** is per ORDER, not per card — order consolidation amortizes this
- Marketplace commission is capped at **$75 per individual product** sold
- A "transaction" = any number of items purchased by the same buyer from the same seller at checkout using the same shipping method
- International (non-US) sellers on PayPal: additional 2% processing fee (capped at $20)

### Other Fee Tiers (Not Applicable to Dustin)

| Seller Type | Marketplace Commission | Pro Fee | Direct SRC | Sync Fee | Transaction Fee |
|-------------|----------------------|---------|------------|----------|----------------|
| **Level 1-4 (Standard)** ← us | **10.75%** | N/A | N/A | N/A | 2.5% + $0.30 |
| Pro (Non-Direct) | 9.25% | 2.5% | N/A | N/A | 2.5% + $0.30 |
| Direct (Non-Pro, Non-Sync) | 9.25% | N/A | Variable | N/A | 2.5% + $0.30 |
| Direct + Pro | 7.75% | 2.5% | Variable | N/A | 2.5% + $0.30 |

---

## 2. Profitability Analysis

### Assumptions

- **Seller Level:** Standard (Level 1–4) — 10.75% commission + 2.5% + $0.30 transaction fee
- **Pricing Strategy:** 98% of market price
- **Shipping Cost:** Not included in fee analysis (seller handles separately)

### Single Card Orders (Worst Case)

When a buyer purchases only one card from you, the $0.30 flat fee hits hardest.

| Card Price | Commission (10.75%) | Transaction (2.5% + $0.30) | Total Fees | Net | Margin |
|-----------|-------------------|-------------------------|-----------|-----|--------|
| $0.25 | $0.03 | $0.31 | $0.34 | -$0.09 | **LOSS** |
| $0.50 | $0.05 | $0.31 | $0.37 | $0.13 | 26% |
| $1.00 | $0.11 | $0.33 | $0.43 | $0.57 | 57% |
| $2.00 | $0.22 | $0.35 | $0.57 | $1.43 | 72% |
| $3.00 | $0.32 | $0.38 | $0.70 | $2.30 | 77% |

**Finding:** Single-card orders below $0.50 are a **loss**. At $0.50, margin is thin (26%).

### Consolidated 5-Card Orders (Realistic Case)

When a buyer purchases multiple cards, the $0.30 flat fee is amortized.

| Order Total | Commission (10.75%) | Transaction (2.5% + $0.30) | Total Fees | Net/Card | Margin |
|------------|-------------------|-------------------------|-----------|---------|--------|
| $2.50 (5 × $0.50) | $0.27 | $0.36 | $0.63 | $0.37 | 75% |
| $5.00 (5 × $1.00) | $0.54 | $0.43 | $0.96 | $0.81 | 81% |

**Finding:** Consolidation dramatically improves margins. Even $0.50 cards become 75% margin at 5 cards/order.

### Breakeven Analysis

| Scenario | Minimum Price to Break Even |
|---------|---------------------------|
| Single card order | ~$0.35 (barely — $0.50 for usable margin) |
| 3-card order | ~$0.15 per card |
| 5-card order | ~$0.10 per card |

---

## 3. Gift Card Strategy & Listing Threshold

### Recommendation: **$0.05 minimum listing price + gift pool for cards below**

Rather than leaving ultra-cheap cards unlisted, we use them strategically as **freebies** to encourage positive seller reviews.

### Implementation

**Environment Variable:** `MIN_LISTING_PRICE_CENTS` (default: `5`)

```
IF market_price_cents < MIN_LISTING_PRICE_CENTS:
  SKIP listing
  Set card status → "gift"
  Add to gift pool for inclusion in shipments
  
ELSE:
  List at market_price × 0.98 (rounded to nearest penny)
```

### Gift Card Strategy

Cards with market prices under $0.05 (literally pennies) are set aside as **freebies** to include in shipments:

- **Why it works:** Including an unexpected free card in a shipment creates goodwill and encourages positive reviews
- **Cost:** Effectively zero — these cards have negligible market value and would lose money to list
- **Implementation:** When preparing shipments, automatically include 1-2 cards from the gift pool
- **Seller rating boost:** Positive reviews improve TCGPlayer seller metrics and cart ranking

### Profitability Tiers

| Market Price | Action | Reasoning |
|-------------|--------|-----------|
| < $0.05 | 🎁 **Gift Pool** — `gift` status | Literally pennies — use as freebies for positive reviews |
| $0.05 – $0.49 | ✅ **List** (low margin) | Profitable with consolidation — makes you a cart optimizer target |
| $0.50 – $2.99 | ✅ **List** | Strong margins on consolidated orders |
| $3.00+ | ✅✅ **Priority** | Strong margins even solo |

### Why List Everything $0.05+?

**Having a large inventory of cheap cards ($0.05-$0.50) is a feature, not a bug** — it makes you a consolidation target in TCGPlayer's cart optimizer:

- Buyers searching for commons/uncommons see you have multiple cards they need
- TCGPlayer's optimizer favors sellers with broader inventory
- The $0.30 fixed fee is amortized across the entire order
- A 10-card order averaging $0.30/card is profitable, even though single cards wouldn't be

---

## 4. Listing Management Logic (Price-Based)

The minimum threshold ($0.05) isn't just a one-time gate — it needs to be evaluated **continuously** during price check cycles.

### Threshold Enforcement During Price Checks

Each price check cycle should evaluate **both directions**:

1. **Cards currently listed but now below threshold:**
   - Market price has dropped below $0.05
   - → Flag for delisting, set status to `gift`
   - → Send Telegram notification: "Card X market price dropped to $Y — moved to gift pool"

2. **Cards currently in `gift` status but now above threshold:**
   - Market price has risen above $0.05
   - → Flag for relisting at 98% of new market price
   - → Set status back to `matched` (enters listing pipeline)
   - → Send Telegram notification: "Card X market price rose to $Y — queued for listing"

### CSV Diff Output

Price check cycles should produce an actionable diff:
- **New listings to add** — `below_threshold` → above threshold
- **Listings to remove** — active listing → below threshold
- **Price changes** — existing listings that need price adjustment (>2% drift)

---

## 5. Order Consolidation (Key to Low-Price Profitability)

### How It Works

When a buyer purchases multiple cards from you:
- It's treated as **ONE ORDER** / one transaction
- The $0.30 flat fee is paid **once**, not per card
- You ship all cards together

### TCGPlayer Cart Optimizer

TCGPlayer's cart optimizer actively encourages consolidation:
- Shows buyers total cost across seller combinations
- Factors in per-seller shipping costs
- Favors sellers with more inventory matching the buyer's want list

**Strategic Implication:** Having a large inventory of cards in the $0.50–$2.00 range attracts consolidated orders where margins are strong.

### Consolidation Math

| Cards/Order | Avg $0.50/card | Avg $1.00/card |
|------------|----------------|----------------|
| 1 card | 26% margin | 57% margin |
| 3 cards | 65% margin | 75% margin |
| 5 cards | 75% margin | 81% margin |
| 10 cards | 81% margin | 86% margin |

---

## 6. Shipping Economics

### Standard (Non-Direct) Shipping

| Method | Cost | Tracking | When to Use |
|--------|------|----------|-------------|
| **PWE (Plain White Envelope)** | ~$0.73–$0.90 | No | Orders under $20 |
| **Bubble Mailer + Tracking** | $4.50–$5.50 | Yes | Orders $20+ |

**TCGPlayer Requirements:**
- Orders under $50: Tracking optional (PWE allowed)
- Orders $50+: Tracking **required**
- Must ship within 2 business days

### TCGPlayer Direct Program

| Aspect | Detail |
|--------|--------|
| Additional Fee | Reduces commission to 9.25% but adds variable SRC |
| Best For | High-volume sellers, cards $5+ |
| **Recommendation** | Skip for now — standard selling is simpler for low-value inventory |

---

## 7. Strategies for Low-Value Card Profitability

### Strategy 1: Minimum Price Floor (Implemented)
Set `MIN_LISTING_PRICE_CENTS=50` and don't list cards below that threshold.

### Strategy 2: Large Inventory → Consolidation
List everything $0.50+ to maximize chances buyers find multiple cards from you.

### Strategy 3: Playset Bundling (Future)
List 4× copies as a single item at a slight discount — reduces per-card handling.

### Strategy 4: Local Sales for Sub-$0.50
Sell bulk lots of commons locally (LGS, Facebook Marketplace) where there are no platform fees.

---

## 8. Expected Inventory Distribution

For a typical Riftbound duplicate collection:
- **60–70%** of cards will be sub-$0.50 (commons) → **won't be listed**
- **20–30%** will be $0.50–$2.99 (uncommons, bulk rares) → **primary listings**
- **5–10%** will be $3.00+ (playable rares, foils) → **priority listings**

### Conservative Revenue Estimate

- 100 duplicate cards total
- ~30 cards worth listing ($0.50+)
- Average list price: $1.50
- 50% sell within 6 months (15 cards sold)
- Average order: 3 cards (5 orders)

**Revenue:** 15 × $1.50 = $22.50  
**Fees:** 5 orders × (10.75% × ~$4.50 + 2.5% × ~$4.50 + $0.30) = 5 × ($0.48 + $0.11 + $0.30) = **$4.45**  
**Shipping:** 5 × $0.80 = **$4.00**  
**Net Profit:** $22.50 − $8.45 = **$14.05**

With automation handling listing grunt work, time investment drops to minutes.

---

## 9. Items to Verify with Seller Portal Access

- [ ] Confirm 10.75% commission rate is current
- [ ] Confirm 2.5% + $0.30 transaction fee structure
- [ ] Check seller level advancement criteria
- [ ] Verify shipping label pricing through TCGPlayer
- [ ] Confirm Riftbound TCG category and bulk upload CSV format
- [ ] Check API rate limits and inventory update frequency caps
- [ ] Check minimum payout threshold

---

## References

- [TCGPlayer Fees](https://help.tcgplayer.com/hc/en-us/articles/201357836-TCGplayer-Fees)
- [Fee Calculation Examples](https://help.tcgplayer.com/hc/en-us/articles/360047732673-Fee-Calculation-Examples)
- Local extracted summary: [`docs/research/tcgplayer-fees/tcgplayer-fees-summary.md`](research/tcgplayer-fees/tcgplayer-fees-summary.md)

---

_Document created by automation research agent. Last updated: 2026-03-29._
