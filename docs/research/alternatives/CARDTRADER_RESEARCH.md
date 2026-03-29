# CardTrader Deep Research — Viability for US Individual Riftbound Seller

> **Date:** 2026-03-29  
> **Researcher:** AI Agent (cardtrader-research)  
> **Purpose:** Honest viability assessment for Dustin — a US-based individual selling Riftbound TCG duplicate cards  
> **Status:** COMPLETE — See [Bottom Line](#11-bottom-line-honest-assessment) for the verdict

---

## Table of Contents

1. [What Is CardTrader](#1-what-is-cardtrader)
2. [Market Share & Volume](#2-market-share--volume)
3. [Individual Seller Viability](#3-individual-seller-viability)
4. [Riftbound on CardTrader](#4-riftbound-on-cardtrader)
5. [Seller Fees Breakdown](#5-seller-fees-breakdown)
6. [Shipping for US Sellers](#6-shipping-for-us-sellers)
7. [Payout Process](#7-payout-process)
8. [Buyer Protection & Disputes](#8-buyer-protection--disputes)
9. [Real Seller Experiences](#9-real-seller-experiences)
10. [API Capabilities](#10-api-capabilities)
11. [Bottom Line: Honest Assessment](#11-bottom-line-honest-assessment)
12. [CardTrader vs TCGPlayer Comparison](#12-cardtrader-vs-tcgplayer-comparison)
13. [TCGPlayer Manual CSV Workflow Viability](#13-tcgplayer-manual-csv-workflow-viability)
14. [Recommendation for Our Architecture](#14-recommendation-for-our-architecture)

---

## 1. What Is CardTrader

CardTrader is an **Italian-founded** TCG marketplace (formerly "CardTrader.eu", previously known as "OldCardTrader"). It's a **European-centric** marketplace that has been expanding internationally. Headquartered in Italy (Padova region), their CardTrader Zero fulfillment hub is in Borgoricco, Italy.

### Key Stats (from their site)
- **130,000+ buyers** use CardTrader (self-reported on homepage)
- **3,000+ sellers** sell via CardTrader Zero (self-reported on homepage)
- **Trustpilot:** 4.4 / 5 rating — "Excellent"
- **Supported Games:** Magic: the Gathering, Pokémon, Yu-Gi-Oh!, Flesh and Blood, Digimon, One Piece, Dragon Ball Super, Cardfight!! Vanguard, Lorcana, Star Wars, Union Arena, **Riftbound**, Gundam, and others

### The CardTrader Zero Model
CardTrader's differentiator is **CardTrader Zero (CT0)** — a fulfillment hub model:
1. Buyers can purchase cards from **multiple sellers** but receive them in a **single shipment** from CardTrader's hub in Italy
2. Sellers ship all their week's sales to the CardTrader hub in **one weekly package**
3. CardTrader's hub quality-checks cards and consolidates shipments to buyers

This is essentially a managed marketplace/fulfillment model similar to Amazon FBA but for trading cards.

---

## 2. Market Share & Volume

### Honest Reality

| Metric | TCGPlayer | CardTrader |
|--------|-----------|------------|
| Primary Market | North America (dominant) | Europe (growing) |
| Monthly Visitors (est.) | 15-25M+ | ~1-3M (estimated) |
| Sellers | 10,000+ stores + individuals | ~3,000+ sellers (their claim) |
| Buyers | Millions | 130,000+ (their claim) |
| US Presence | **Dominant** — THE marketplace | Niche — growing but small |
| API Access | Closed to new sellers | Open to all sellers |
| Founded | 2011 (Wisconsin, US) | 2014-ish (Italy) |

### Where CardTrader Stands
- **Europe:** Strong #2 behind Cardmarket (which is by far the EU dominant player). Reddit sellers say _"Cardmarket is bigger (by far), but Cardtrader has overseas outreach, meaning even US customers can easily buy from you."_
- **North America:** Very small. The vast majority of US TCG buyers don't know CardTrader exists. TCGPlayer is where US buyers shop. Period.
- **Growing?** Yes — they've been adding games (Riftbound, Gundam, etc.) and expanding globally. The CT0 fulfillment model is clever. But growth from a small base is still small.
- **Riftbound specifically:** Even on TCGPlayer (which is much larger), Riftbound is a newer game. On CardTrader, the buyer pool for Riftbound is going to be significantly smaller.

### The Hard Truth About Volume
For a US seller listing sub-$3 commons/uncommons on CardTrader:
- You're on a European platform with a tiny fraction of TCGPlayer's US buyer base
- Riftbound isn't even Magic or Pokémon (the dominant games on CardTrader)
- Low-value cards have the thinnest margins — you need high volume to matter
- **Volume will be very low.** Cards will sit for weeks or months.

---

## 3. Individual Seller Viability

### Can an Individual (Not a Store) Sell?

**Yes, emphatically.** From their FAQ:

> _"Just enter an email and a password to start selling, you won't have to waste time doing any authentication procedure, nor have any special requirements."_

This is **massively better** than TCGPlayer, which requires:
- Business information / tax ID
- Seller application review
- Meeting sales thresholds for certain features

### Onboarding Process
1. Sign up with email + password
2. Start listing cards immediately
3. No identity verification required upfront
4. No minimum inventory requirements
5. No store/business registration needed

### API Access
CardTrader provides API tokens to **all** sellers through their profile settings page. No application process, no approval needed. This alone is a huge advantage over TCGPlayer (which closed new API access entirely).

---

## 4. Riftbound on CardTrader

### ✅ Confirmed: Riftbound IS on CardTrader

Verified by directly accessing `cardtrader.com/en/riftbound`. The game is listed as **"Riftbound | League of Legends"** with:

#### Expansions Available
| Expansion | Items Listed |
|-----------|-------------|
| Origins | 371 |
| Spiritforged | 331 |
| Unleashed | 245 |
| Nexus Night Promos | 64 |
| Organized Play | 60 |
| Promos | 66 |
| Championship Promo | 20 |
| Release Event Promos | 16 |
| Arcane | 9 |
| Origins Proving Grounds | 38 |
| Vendetta | 6 |
| Radiance | 2 |
| Judge Promos | 0 |

**Total Singles:** 1,099 blueprint items (unique card definitions)

#### Rarities
Common, Uncommon, Rare, Epic, Alternate Art, Promo, Token, Showcase, Ultimate

#### Additional Categories
- Box Sets & Displays (12)
- Booster Boxes (7)
- Boosters (13)
- Bundles (8)
- Starter Decks (17)
- Playmats (89)
- Albums (428)
- Sleeves (1,410)
- Deck Boxes (929)
- Complete Sets (2)

### But Are There Active Buyers?
Having items *listed* on CardTrader and having *active buyers looking to buy Riftbound on CardTrader* are very different things. The number of blueprint items (1,099) indicates the catalog exists, but we couldn't determine how many **actual product listings** (from sellers) or **recent sales** exist. Given CardTrader's smaller overall size and Riftbound's niche status, buyer activity is likely **very low** compared to TCGPlayer.

---

## 5. Seller Fees Breakdown

### From CardTrader's FAQ (confirmed directly on their site):

| Fee Type | Direct Sales | CardTrader Zero Sales |
|----------|-------------|----------------------|
| Seller Commission | **Starting from 5%** | **Starting from 7%** |
| Listing Fees | **FREE — unlimited listings** | **FREE — unlimited listings** |
| Payment Processing | Included in commission | Included in commission |
| Payout (Bank Transfer) | **FREE** | **FREE** |
| Payout Minimum | None stated | None stated |

### Important Notes
- The "starting from" language suggests commission tiers — likely lower rates for higher-volume sellers
- No listing fees is excellent — you can list 10,000 cards for $0
- Sellers list prices in their own currency; CardTrader handles conversion
- **Prices are in EUR internally** — this matters for a US seller

### TCGPlayer Fee Comparison

| Fee Type | TCGPlayer | CardTrader |
|----------|-----------|------------|
| Commission | ~10.25% (8.95% marketplace + 1.3% payment) | 5% (direct) / 7% (CT Zero) |
| Per-sale fee | $0.50 + 2.5% payment processing | Included in commission |
| Listing Fee | Free | Free |
| Payout Fee | Free (direct deposit) | Free (bank transfer) |

**CardTrader's fees are significantly lower than TCGPlayer's**, especially for low-value items where TCGPlayer's flat $0.50 per-sale fee is devastating.

### The Math on a $0.50 Card Sale

| | TCGPlayer | CardTrader (Direct) | CardTrader (CT0) |
|---|-----------|-------------------|------------------|
| Sale Price | $0.50 | $0.50 | $0.50 |
| Commission | ~$0.05 (10.25%) | $0.025 (5%) | $0.035 (7%) |
| Fixed Fee | $0.50 | $0.00 | $0.00 |
| **Net to Seller** | **-$0.05 (LOSS)** | **$0.475** | **$0.465** |

TCGPlayer is literally a loss on sub-$1 cards. CardTrader isn't. This is a genuine advantage.

---

## 6. Shipping for US Sellers

### This Is Where It Gets Complicated

CardTrader has **two selling modes**, and they differ dramatically for US sellers:

### Mode 1: Direct Shipping (Seller Ships to Buyer)
- Seller ships directly to the buyer
- Shipping methods are **pre-set by CardTrader's system** for non-professional sellers
- Professional sellers can customize shipping methods
- Standard (non-tracked) and tracked options available
- **For US sellers shipping internationally:** This gets expensive fast. International tracked shipping from the US is $15-30+ via USPS. Even a PWE international costs several dollars.
- **For US sellers shipping domestically (US buyer):** PWE with stamp ($0.73) is feasible for low-value orders, but CardTrader may require tracked shipping depending on order value.

### Mode 2: CardTrader Zero (Ship to CT Hub in Italy)
- All sales for the week are batched
- You ship **one package per week to Italy** (Borgoricco, Padova)
- You pay for this shipping yourself
- Must use **tracked shipping** to the hub
- Must follow **strict packaging guidelines**

#### CT Zero for US Sellers — Cost Reality
From a Reddit seller's research:

> _"Once a week you package everything (according to strict guidelines, sheesh) you sold and send it to Italy. You pay shipping for this (tracked). So that's going to be 5-10 EUR depending on where you are."_

That poster was European. **For a US seller shipping tracked to Italy weekly:**
- USPS First-Class Package International: **~$15-20** for a small package
- USPS Priority Mail International: **~$30-40**
- You'd need to sell **$200-400+ per week** just to break even on the weekly shipping cost to Italy

**CT Zero is essentially non-viable for a small US seller.** The shipping costs to Italy eat any possible profit on low-value cards.

### Can You Use PWE (Plain White Envelope)?
- For direct sales to US buyers: **Possibly**, but CardTrader's system presets shipping methods. It's unclear if PWE is an available option for non-professional US sellers.
- For CT Zero: **No.** Tracked shipping to Italy is required.

### Shipping Verdict for US Seller
- Direct sales to US buyers might work with low-cost shipping options
- Direct sales to international buyers: shipping costs make sub-$5 cards unviable
- CT Zero: **Not viable** for a US-based individual seller with low-value inventory

---

## 7. Payout Process

From CardTrader's FAQ:
> _"Money can be withdrawn via bank transfer completely free, at any time, without any limit, subject to the availability of your credit."_

### Key Details
- **Method:** Bank transfer (wire transfer)
- **Cost:** Free
- **Minimum:** No stated minimum
- **Timing:** Not specified, likely 1-5 business days
- **Currency:** Payments held centrally by CardTrader; likely paid in EUR
- **US Bank:** Would be receiving an international wire transfer — your bank may charge incoming wire fees ($10-25 per wire is common for US banks receiving international transfers)

### ⚠️ Hidden Cost for US Sellers
If payouts are in EUR via international wire transfer:
- Your US bank likely charges $15-25 per incoming international wire
- Currency conversion fees (typically 1-3%)
- This makes frequent small payouts impractical
- You'd want to accumulate a meaningful balance ($100+) before requesting payout

---

## 8. Buyer Protection & Disputes

From CardTrader's homepage and FAQ:

### Centralized Payment System
> _"Payments are centralized and held by us until transactions are completed. This procedure protects sellers from potential claims and chargebacks on direct payments, and buyers from the risk of not receiving goods or having problems."_

### CT Zero Quality Guarantee
- Cards pass through CardTrader's hub for quality inspection
- If a card fails QC, CardTrader replaces it at the same price
- 24/7 live chat support
- Buyers are "100% protected with the CTZero guarantee"

### Seller Protection
- **No chargebacks:** CardTrader holds funds centrally, so sellers don't face PayPal/credit card chargebacks
- **Mediated disputes:** CardTrader staff mediates between buyer and seller
- This is actually **better** than TCGPlayer for seller protection in many ways

---

## 9. Real Seller Experiences

### Reddit: r/mtgfinance

**"Selling on Cardtrader ZERO" (2024)**
> Post asking about CT Zero shipping logistics. Key concern: weekly shipping costs to Italy for the seller. No US seller experiences shared.

**"Experience as a Seller on CardTrader?" (2026)**
> A Canadian seller reported setting up a shop but their listings weren't appearing in search, even at lowest prices. Support was slow to respond. _"The struggle to get rid of bulk is real."_
> 
> **Takeaway:** Seller experience may have onboarding friction; support may be slow.

**"Looking for experience from EU sellers on Cardtrader ZERO" (2024)**
> Detailed breakdown:
> - _"Once a week you package everything (according to strict guidelines, sheesh) you sold and send it to Italy."_
> - _"Sellers do not pay fees on these items, the buyer does."_ (Note: the 5-7% commission is built in)
> - _"My shipping is not covered, so effectively I pay 10 EUR fees each week."_
> - _"Rough math tells me... it would take sales of 200 EUR per week for the cost of selling to be even."_
> - _"Does not take into account time needed to properly sort that one package into the OCD hell that Cardtrader requires."_
> 
> **Takeaway:** CT Zero has strict packaging requirements and the economics only work at decent volume.

**"[EU] Cardmarket vs Cardtrader" (2022)**
> _"Cardmarket is bigger (by far), but Cardtrader has overseas outreach, meaning even US customers can easily buy from you."_
> 
> **Takeaway:** CardTrader is #2 in Europe, used partly because it bridges to non-EU buyers.

### Trustpilot (4.4/5 — "Excellent")
The AI-generated summary of reviews:
> _"Customers consistently praise the service and product quality, especially with the CardTrader Zero system. Many appreciate the excellent customer service. However, some customers were not happy with the delivery service and order process. Several reviewers mentioned slow shipping times, unexpected additional shipping costs, and a lack of clear communication regarding order status."_

**Note:** Trustpilot reviews are overwhelmingly from **buyers**, not sellers. Buyer experience is good; seller experience data is sparse.

### Overall Seller Experience Summary
- **EU sellers:** Mixed reviews. CT Zero is convenient (one shipment per week) but the packaging requirements are onerous and you eat shipping costs.
- **US sellers:** Almost no data. Very few US sellers appear to be using CardTrader actively.
- **Support:** Generally praised by buyers; sellers report slower response times.
- **Visibility issues:** At least one seller reported listings not appearing in search results.

---

## 10. API Capabilities

### ✅ CardTrader Has an Excellent API for Our Use Case

This was the biggest surprise of the research. CardTrader provides a **full REST API** that is **freely available to all sellers**. This is a game-changer compared to TCGPlayer's closed API.

**Base URL:** `https://api.cardtrader.com/api/v2`  
**Auth:** Bearer token (obtained from profile settings page — no application needed)  
**Rate Limit:** 200 requests per 10 seconds  
**Documentation:** Full reference at `cardtrader.com/en/docs/api/full`  
**Postman Collection:** Available with pre-configured auth token

### API Capabilities Checklist

| Capability | Supported? | Details |
|------------|-----------|---------|
| Create listings (products) | ✅ Yes | `POST /products` — single item |
| Bulk create listings | ✅ Yes | `POST /products/bulk_create` — async batch |
| Update prices | ✅ Yes | `PUT /products/:id` |
| Bulk update prices | ✅ Yes | `POST /products/bulk_update` — async batch |
| Delete listings | ✅ Yes | `DELETE /products/:id` |
| Bulk delete | ✅ Yes | `POST /products/bulk_destroy` |
| Export your products | ✅ Yes | `GET /products/export` |
| CSV Import | ✅ Yes | `POST /product_imports` — replace or add |
| CSV Export | ✅ Yes | Available |
| List orders | ✅ Yes | `GET /orders` with pagination, filters |
| Order details | ✅ Yes | `GET /orders/:id` |
| Mark as shipped | ✅ Yes | `PUT /orders/:id/ship` |
| Set tracking code | ✅ Yes | `PUT /orders/:id/tracking_code` |
| Cancel orders | ✅ Yes | `PUT /orders/:id/request-cancellation` |
| Webhook notifications | ✅ Yes | Order create/update/destroy events |
| Webhook signature verification | ✅ Yes | HMAC SHA256 with shared_secret |
| List games | ✅ Yes | `GET /games` |
| List expansions | ✅ Yes | `GET /expansions` |
| List blueprints (catalog) | ✅ Yes | `GET /blueprints/export?expansion_id=X` |
| Image upload | ✅ Yes | `POST /products/:id/upload_image` |
| Quantity increment/decrement | ✅ Yes | `POST /products/:id/increment` |
| Job status tracking | ✅ Yes | `GET /jobs/:uuid` |

### API Features Especially Relevant to Our Use Case

#### 1. Automatic Listing Creation
```bash
curl -X POST https://api.cardtrader.com/api/v2/products \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{ "blueprint_id": 123, "price": 0.50, "quantity": 4 }'
```
- Just need `blueprint_id`, `price`, and `quantity`
- Properties (condition, language, foil) are optional with sensible defaults

#### 2. Bulk Operations (Async)
```bash
curl -X POST https://api.cardtrader.com/api/v2/products/bulk_create \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{ "products": [
    { "blueprint_id": 13, "price": 3.5, "quantity": 4 },
    { "blueprint_id": 14, "price": 2.5, "quantity": 2 }
  ]}'
```
Returns a job UUID; poll `GET /jobs/:uuid` for status.

#### 3. CSV Import via API
```bash
curl https://api.cardtrader.com/api/v2/product_imports \
  -H "Authorization: Bearer [TOKEN]" \
  -F csv=inventory.csv \
  -F game_id=RIFTBOUND_ID \
  -F replace_stock_or_add_to_stock=replace_stock \
  -F column_names=tcgplayer_id|quantity|condition|price_cents
```
- Can identify cards by `tcgplayer_id`! (Cross-platform ID mapping)
- Can replace entire stock or add to existing
- Supports custom column layouts

#### 4. Webhooks
```json
{
  "cause": "order.create",
  "object_class": "Order",
  "object_id": 733733,
  "mode": "live",
  "data": { /* full order object */ }
}
```
- Real-time notifications when orders are created, updated, or destroyed
- Signed with HMAC SHA256 for verification
- **Problem for our setup:** Webhooks require a publicly accessible HTTPS endpoint. Our server is local network only. Would need a tunnel (ngrok, Cloudflare Tunnel) or polling.

#### 5. Blueprint Cross-References
Each CardTrader blueprint includes:
- `tcg_player_id` — TCGPlayer product ID
- `card_market_ids` — Cardmarket IDs
- `scryfall_id` — Scryfall ID (for Magic, but principle applies)

This means we can **map between platforms** — a TCGPlayer SKU can be mapped to a CardTrader blueprint_id.

#### 6. `user_data_field`
Every product has an optional `user_data_field` — a private text field only visible via API. Perfect for storing our internal card ID, shelf location, or cross-platform reference.

### What the API Does NOT Have
- **No market price data endpoint.** You can't query "what's the current market price for card X on CardTrader." You'd need to scrape or use external price data.
- **No search endpoint for other sellers' prices.** You can only manage your own products.
- **No built-in repricing tool.** You'd need to build your own price monitoring logic.

---

## 11. Bottom Line: Honest Assessment

### For Dustin's Specific Use Case

**Use case:** US-based individual selling Riftbound duplicate cards, mostly commons/uncommons worth $0.02-$3.00.

### The Verdict: CardTrader Is NOT Viable as a Primary Sales Channel

Here's why:

#### ❌ Buyer Pool Problem
- CardTrader has ~130K buyers total (vs TCGPlayer's millions)
- Most are European
- Riftbound is a niche game even on major platforms
- The intersection of "CardTrader users" + "looking for Riftbound" + "commons/uncommons" is probably **dozens of people, not thousands**
- Cards will sit for weeks or months without selling

#### ❌ Shipping Economics for US → International
- Most CardTrader buyers are in Europe
- Shipping a $0.50 card from the US to Italy or Germany makes zero economic sense
- Even domestic US buyers on CardTrader are rare enough to make this impractical
- CT Zero requires tracked weekly shipping to Italy (~$15-20 from US)

#### ❌ Currency & Payout Friction
- Prices are EUR-based internally
- Payouts via international wire transfer
- US bank incoming wire fees ($15-25) eat small balances
- Currency conversion adds 1-3% cost

#### ❌ Low-Value Card Economics
- Even with lower fees (5% vs 10.25%+$0.50), you need buyers to exist
- No buyers = no sales = fees don't matter

### But Wait — There IS a Silver Lining

#### ✅ The API Is Genuinely Excellent
CardTrader's API is **exactly what we wanted from TCGPlayer** — and it's free and open to all sellers:
- Full CRUD for products (listings)
- Bulk operations
- CSV import via API
- Webhooks for order notifications
- Cross-platform ID mapping (TCGPlayer IDs in blueprint data!)
- No approval process, no waiting

#### ✅ The API Makes CardTrader Viable as a SECONDARY Channel
If we build our automation system, adding CardTrader as a second output channel is **cheap incremental work**:
1. Our system already manages inventory and pricing
2. We just add a CardTrader API adapter alongside the TCGPlayer CSV export
3. Listings are free — no cost to having cards listed there
4. If something sells, great; if not, no harm done

#### ✅ For Higher-Value Cards ($5+), It Might Actually Work
- CardTrader's lower fees are meaningful on $5+ cards
- International buyers are more willing to pay shipping on valuable cards
- The cross-platform pricing data helps

---

## 12. CardTrader vs TCGPlayer Comparison

| Factor | TCGPlayer | CardTrader | Winner |
|--------|-----------|------------|--------|
| US Buyer Pool | Massive | Tiny | **TCGPlayer** |
| API Access | Closed (blocked) | Open to all | **CardTrader** |
| Seller Fees | ~10.25% + $0.50/sale | 5-7%, no per-sale fee | **CardTrader** |
| Riftbound Catalog | ✅ Full (298+ cards in Origins) | ✅ Full (1099 blueprints across sets) | Tie |
| Listing Cost | Free | Free | Tie |
| Shipping (US Domestic) | Easy, PWE works | Uncertain, may be limited | **TCGPlayer** |
| Individual Seller Signup | Application required | Email + password | **CardTrader** |
| Low-Value Card Viability | Possible with volume | Unlikely — no buyers | **TCGPlayer** |
| Automation Potential | CSV upload only (manual) | Full API automation | **CardTrader** |
| Payout for US Seller | Direct deposit (free) | Intl wire (potential fees) | **TCGPlayer** |
| Buyer Trust/Recognition | High (US standard) | Low (unknown in US) | **TCGPlayer** |

---

## 13. TCGPlayer Manual CSV Workflow Viability

Since TCGPlayer's API is closed but the seller portal still supports CSV bulk upload, here's a realistic assessment of that workflow:

### How It Works
1. Our system generates a CSV file with the right columns
2. Dustin logs into `seller.tcgplayer.com`
3. Navigates to bulk upload
4. Uploads the CSV
5. Reviews and confirms
6. **Manual process — maybe 5-10 minutes per upload**

### How Often Would Uploads Need to Happen?
- **Initial inventory load:** Once, when setting up
- **New card additions:** When new duplicates are identified (after opening packs, etc.)
- **Price updates:** Once or twice daily if following market prices
- **Post-sale quantity updates:** After sales, to keep quantities accurate

### Pain Points
- **Price updates are the main friction.** If we want competitive pricing (98% of market), and market prices change daily, that's 1-2 manual uploads per day.
- **Quantity sync after sales.** TCGPlayer decrements quantity on sale, but our internal system needs to be updated too. Without API access, we'd need to manually export from TCGPlayer to sync back.
- **No webhook/notification for sales.** We can't programmatically know when something sold — have to check the seller portal manually or export orders.

### Making It Workable
With good tooling, we can minimize the pain:
1. **Automated CSV generation** — Our system watches inventory DB and generates upload-ready CSVs
2. **Telegram notification** — "Hey Dustin, new price update CSV is ready. Upload to TCGPlayer."
3. **One-click download** — Dashboard has a "Download TCGPlayer CSV" button
4. **Diff-based exports** — Only export rows that changed since last upload
5. **Order reconciliation** — Script to compare TCGPlayer order export with our inventory

### Realistic Assessment
- **For initial listing:** CSV workflow is totally fine. Generate CSV, upload once, done.
- **For price monitoring:** If prices only change slowly (Riftbound commons are stable), once-daily CSV update is manageable.
- **For order management:** Checking the seller portal 1-2 times per day and manually exporting orders is ~5 minutes.
- **Total daily time commitment:** 10-15 minutes of manual CSV work, IF we build good tooling around it.

**This is the most viable path for TCGPlayer.** It's not sexy, but it works.

---

## 14. Recommendation for Our Architecture

### Primary Channel: TCGPlayer via CSV Workflow
- **Why:** That's where the buyers are. No amount of API elegance matters if nobody's buying.
- **How:** Our system generates CSVs → Dustin uploads manually → Telegram notifications for workflow triggers
- **Effort:** The tooling we're building (inventory management, pricing engine, CSV generation) is 90% of the value regardless of the sales channel

### Secondary Channel: CardTrader via API (Phase 2+)
- **Why:** Free listings, zero marginal cost, full API automation, and it's additive
- **How:** Add a CardTrader API adapter to our system. Same inventory, same pricing logic, different output channel.
- **When:** After TCGPlayer workflow is stable. This is a "set it and forget it" addition.
- **Expected outcome:** Occasional sales from international buyers. Nice to have, not essential.

### Architecture Implications

```
┌─────────────────┐     ┌──────────────────┐
│  Card Inventory  │────▶│  Pricing Engine   │
│  (PostgreSQL)    │     │  (Market data)    │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         ▼                       ▼
┌────────────────────────────────────────┐
│         Listing Manager               │
│  (unified inventory + price state)     │
└──────┬─────────────────┬──────────────┘
       │                 │
       ▼                 ▼
┌──────────────┐  ┌───────────────────┐
│  TCGPlayer   │  │   CardTrader      │
│  CSV Export   │  │   API Adapter     │
│  (Phase 1)   │  │   (Phase 2+)      │
└──────────────┘  └───────────────────┘
       │                 │
       ▼                 ▼
  Manual Upload     Automatic via API
  + Telegram        + Webhooks
  notification
```

### Key CardTrader API Integration Points (for when we get there)

1. **Inventory sync:** `POST /products/bulk_create` to push new listings
2. **Price updates:** `POST /products/bulk_update` to update prices
3. **CSV import shortcut:** `POST /product_imports` with `tcgplayer_id` mapping
4. **Order monitoring:** Webhooks (needs tunnel) OR poll `GET /orders` periodically
5. **ID mapping:** CardTrader blueprints include `tcg_player_id` — free cross-platform mapping
6. **Custom metadata:** `user_data_field` for storing our internal IDs

### CardTrader API Integration Would Be Straightforward
Given our existing architecture with Fastify server + Drizzle ORM + PostgreSQL:
- Add `cardtrader_blueprint_id` column to our cards table
- Build a `CardTraderService` class wrapping the API
- One-time catalog sync to map TCGPlayer IDs → CardTrader blueprint IDs
- Reuse the same pricing logic, just output to different API
- **Estimated effort:** 1-2 days of development once the core system is stable

---

## Appendix A: CardTrader API Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/info` | GET | Test auth |
| `/games` | GET | List games |
| `/expansions` | GET | List expansions |
| `/categories` | GET | List categories |
| `/blueprints/export?expansion_id=X` | GET | Get card catalog |
| `/products/export` | GET | List your products |
| `/products` | POST | Create single product |
| `/products/:id` | PUT | Update product |
| `/products/:id` | DELETE | Delete product |
| `/products/:id/increment` | POST | Change quantity |
| `/products/:id/upload_image` | POST | Upload image |
| `/products/bulk_create` | POST | Bulk create (async) |
| `/products/bulk_update` | POST | Bulk update (async) |
| `/products/bulk_destroy` | POST | Bulk delete (async) |
| `/product_imports` | POST | CSV import |
| `/product_imports/:id` | GET | CSV import status |
| `/orders` | GET | List orders |
| `/orders/:id` | GET | Order details |
| `/orders/:id/ship` | PUT | Mark shipped |
| `/orders/:id/tracking_code` | PUT | Set tracking |
| `/jobs/:uuid` | GET | Check job status |

**Rate Limits:** 200 req/10 sec (general), 1 req/sec (jobs)

## Appendix B: Key CardTrader CSV Import Columns

Cards can be identified by any of:
- `name` + `expansion_code`
- `name` + `expansion_name`
- `collector_number` + `expansion_code`
- `mkm_id`
- `tcgplayer_id` ← This is gold for us
- `scryfall_id`
- `blueprint_id`

---

*Research compiled 2026-03-29. Sources: CardTrader.com (homepage, API docs), Reddit r/mtgfinance, Trustpilot, direct site verification.*
