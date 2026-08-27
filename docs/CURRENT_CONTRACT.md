# Current inventory and order contract

This document describes the active product contract. Historical phase and research documents may describe superseded behavior.

## Inventory statuses and pricing

- Active pre-listing inventory uses `pending`, `matched`, `listed`, `needs_attention`, or `error`.
- `matched` means **Ready to List**. Every positive, finite market price receives the normal `LISTING_PRICE_MULTIPLIER` recommendation, then the optional per-card floor is applied. There is no minimum-listing-price configuration or gift pool.
- Missing, non-finite, zero, and negative market prices remain `needs_attention`.
- `gifted` and `sold` are terminal history statuses and are excluded from the default active-inventory query. The Gifted filter remains available.
- The PostgreSQL `card_status` enum still contains `gift` exclusively so historical `price_history` rows remain valid. It is not an active card status: `GET /api/cards?status=gift` and `PATCH /api/cards/:id` with `status: "gift"` are rejected.
- The migration `0016_remove_active_gift_status.sql` changes existing live `gift` rows to `matched` when their market price is positive and finite, using the normal recommendation/floor calculation. Otherwise it changes them to `needs_attention`. It restores obsolete `listed_below_threshold` rows to `listed` without changing their persisted listing price. It does not rewrite price history.

## Collection transfer

Collection-to-selling transfer creates or updates Ready-to-List (`matched`) staging rows for every positive finite price. It never creates an active `gift` row and does not merge into an existing `listed` marketplace row.

## Orders, gifts, and history

- Inventory's **Attach to Order** modal lets each selected `listed` or listed-origin `needs_attention` card line be marked **Paid** or **Gift/freebie**.
- A gift/freebie line is persisted as `sales.sale_line_type = 'gift'` with zero product price. A gift-only order always uses zero shipping collected.
- A partial gift retains the card's resale-eligible state; complete gift depletion changes the card to terminal `gifted`. Cancelling an order restores resale eligibility.
- Gift sales remain visible in grouped orders, invoices, and packing slips but are excluded from sales revenue and performance totals. Historical gift line items and their rendering are retained.
