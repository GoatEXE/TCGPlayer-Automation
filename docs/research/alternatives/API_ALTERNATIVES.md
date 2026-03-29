# TCGPlayer API Alternatives Research

> **Date:** 2026-03-29  
> **Status:** CRITICAL DECISION POINT  
> **Impact:** Phase 1 architecture must pivot from TCGPlayer API to alternative approach

---

## Table of Contents

1. [TCGPlayer API Closure Details](#1-tcgplayer-api-closure-details)
2. [TCGPlayer Seller Portal Capabilities](#2-tcgplayer-seller-portal-capabilities)
3. [TCGPlayer Pro / Seller Tools](#3-tcgplayer-pro--seller-tools)
4. [Browser Automation Feasibility](#4-browser-automation-feasibility)
5. [Third-Party Tools & Services](#5-third-party-tools--services)
6. [Alternative Marketplaces with API Access](#6-alternative-marketplaces-with-api-access)
7. [Price Data Sources](#7-price-data-sources)
8. [Community Workarounds](#8-community-workarounds)
9. [Riftbound-Specific Data](#9-riftbound-specific-data)
10. [Recommendation](#10-recommendation)

---

## 1. TCGPlayer API Closure Details

### Confirmed: No New API Access

From the [official docs](https://docs.tcgplayer.com/docs/getting-started):

> _"We are no longer granting new API access at this time. Existing users must adhere to the terms of service that govern the use of our API, including, but not limited to important restrictions and attributions required by you."_

### Key Facts

- **API Version:** v1.39.0 (last known version, no updates in ~2 years)
- **When closed:** Likely late 2022 / early 2023 based on Reddit posts from Feb 2023 noting the closure
- **No replacement announced:** No v2 API, no partner program, no waitlist
- **Existing keys still work:** Sellers who already have API keys can continue using them
- **No way to obtain new keys:** Developer portal registration is closed
- **API endpoints still functional:** `https://api.tcgplayer.com/token` and catalog endpoints still respond
- **Docs still hosted:** Full API reference remains at docs.tcgplayer.com but is effectively archived

### Implications for Our Project

**This is a hard blocker for the original Phase 1 plan.** We cannot obtain API credentials to programmatically list, price, or manage inventory on TCGPlayer. We need an alternative path.

---

## 2. TCGPlayer Seller Portal Capabilities

The TCGPlayer seller portal at `seller.tcgplayer.com` provides web-based inventory management. Based on help articles and community knowledge:

### Known Features
- **Manual single-card listing** — Search catalog, set price/condition/quantity
- **Bulk Upload Tool** — CSV-based inventory upload (details below)
- **Inventory export** — Download current inventory as CSV
- **Price management** — Bulk price editing through the portal UI
- **Order management** — View/process/ship orders

### CSV Bulk Upload
TCGPlayer supports CSV bulk upload for inventory. The CSV format uses the same columns as the export format we already have:
- `TCGplayer Id` (SKU), `Product Line`, `Set Name`, `Product Name`, `Title`, `Number`, `Rarity`, `Condition`, `TCG Market Price`, `TCG Direct Low`, `TCG Low Price With Shipping`, `TCG Low Price`, `Total Quantity`, `Add to Quantity`, `TCG Marketplace Price`, `Photo URL`

### Key Limitation
The bulk upload is a **manual web process** — there's no API or programmatic endpoint. You upload a CSV file through the browser UI. This is still useful but requires either:
1. Manual CSV upload workflow (our system generates CSV → human uploads)
2. Browser automation to submit the CSV (see Section 4)

---

## 3. TCGPlayer Pro / Seller Tools

### BinderPOS (TCGPlayer's POS System)
- TCGPlayer acquired BinderPOS (Point of Sale system for game stores)
- Available at `binderpos.com` — appears to redirect to TCGPlayer seller tools
- Designed for **brick-and-mortar game stores** with in-store POS + online listing
- Likely has privileged API access to TCGPlayer (being a first-party tool)
- **Not available for individual sellers** — aimed at store-level accounts
- Monthly subscription fee (pricing not publicly available)

### TCGPlayer Pro
- TCGPlayer offers tiered seller accounts
- Higher-tier accounts may have access to additional tools
- No evidence of a "Pro API" tier for individual sellers

### Summary
There is no publicly available programmatic tool from TCGPlayer for individual sellers. BinderPOS serves stores but isn't an option for our use case.

---

## 4. Browser Automation Feasibility

### Approach
Use Playwright or Puppeteer to automate the TCGPlayer seller portal:
- Login → Navigate to bulk upload → Submit CSV → Confirm
- Or: Login → Navigate to individual listings → Set prices

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Terms of Service violation** | HIGH | TCGPlayer ToS likely prohibits automated access to their web portal. Account ban risk. |
| **CAPTCHA/bot detection** | MEDIUM | TCGPlayer uses Cloudflare or similar protection. Login and upload flows may trigger challenges. |
| **Rate limiting** | MEDIUM | Aggressive automation could trigger IP-level blocks. |
| **UI changes break automation** | MEDIUM | Any portal redesign breaks selectors. Maintenance burden. |
| **Account termination** | HIGH | If detected, seller account could be permanently banned. |
| **Session management** | LOW | Cookies/tokens expire; need re-auth handling. |

### Community Evidence
- No widely-known open-source Playwright/Puppeteer tools for TCGPlayer selling
- Some sellers report using browser automation for price checking (reading, not writing)
- The writing/listing side is much riskier — financial transactions involved
- Several Reddit posts mention people attempting to scrape pricing data but not seller automation

### Verdict: **HIGH RISK, NOT RECOMMENDED as primary strategy**
Could be useful as a last-resort fallback for uploading CSVs, but shouldn't be the core architecture. A hybrid approach (generate CSV programmatically → manually upload occasionally) is safer.

---

## 5. Third-Party Tools & Services

### CrystalCommerce ⭐ Most Promising for TCGPlayer Integration

**Website:** crystalcommerce.com  
**What it is:** E-commerce platform for game/hobby stores  

**Key Features:**
- **Multi-channel selling:** eBay, Amazon, **TCGPlayer**, CardTrader, Mana Pool, Price Charting
- **2M+ product catalog** with all TCGs, board games, comics, etc.
- **API access** for technology partners — they explicitly invite developers to build integrations
- **Live inventory sync** across all connected marketplaces
- **CSV import** from their catalog
- **700+ local stores** on the network

**How they integrate with TCGPlayer:**
- CrystalCommerce has an **existing integration** with TCGPlayer's seller systems
- They appear to have privileged/grandfathered API access
- Sellers using CrystalCommerce can list on TCGPlayer through their platform

**Pricing:** Not publicly listed. Likely monthly subscription. Call 866-213-4611 for info.  
**Daily Zoom calls:** 11 AM and 3 PM PT for support/demos

**Consideration:** If we use CrystalCommerce as our inventory management backend, we get TCGPlayer listing as a feature. Our automation system would feed into CrystalCommerce (which has its own API) rather than directly into TCGPlayer.

### BinderPOS
- Acquired by TCGPlayer
- POS + inventory management for physical game stores
- Has TCGPlayer integration (first-party)
- **Not suitable for individual sellers** — designed for store-level accounts

### TCGFish / MoxAlpha / Other Price Trackers
- Price tracking tools, not selling tools
- Some have API access for price data (likely grandfathered)
- Not useful for listing/inventory management

---

## 6. Alternative Marketplaces with API Access

### CardTrader ⭐⭐ STRONGEST ALTERNATIVE

**Website:** cardtrader.com  
**API Docs:** cardtrader.com/docs/api/full  
**API Base URL:** `https://api.cardtrader.com/api/v2`

**API is OPEN and FREE to all sellers. Just sign up with an email.**

**Full API Capabilities:**
- ✅ **Bulk create products** — `POST /products/bulk_create`
- ✅ **Bulk update products** — `POST /products/bulk_update` (price, quantity, condition)
- ✅ **Bulk delete products** — `POST /products/bulk_destroy`
- ✅ **CSV import** — `POST /product_imports` (supports `tcgplayer_id` as column!)
- ✅ **Order management** — List, ship, cancel orders
- ✅ **Webhooks** — Real-time order notifications
- ✅ **Blueprint catalog** — Full product database with cross-references
- ✅ **Rate limits** — Generous: 200 requests per 10 seconds
- ✅ **Asynchronous job system** — Bulk operations return job UUIDs, poll for status

**Product identification supports:**
- `tcgplayer_id` ← Our CSV data has this!
- `scryfall_id`
- `mkm_id` (CardMarket)
- `name + expansion_code`
- `collector_number + expansion_code`
- `blueprint_id` (CardTrader internal)

**Fees:**
- 5% commission on direct sales
- 7% commission on CardTrader Zero (consolidated shipping) sales
- Free payouts via wire transfer

**CardTrader Zero (Unique Feature):**
- Sellers ship once per week to CardTrader hub
- CardTrader handles individual buyer shipments
- Quality control on all items
- Huge buyer base in Europe (130K+ buyers)
- Greatly reduces shipping burden

**Seller onboarding:** Email + password. No application process. Start selling immediately.

**Multi-game support:** Magic, Pokemon, Yu-Gi-Oh, Flesh & Blood, Digimon, One Piece, Lorcana, and more. **Need to verify if Riftbound is on CardTrader.**

### Mana Pool

**Website:** manapool.com  
**API Docs:** manapool.com/api/docs/v1  

**Key Features:**
- **Open API** for sellers (documentation available)
- **Magic-focused** marketplace (MTG only currently)
- Supports CrystalCommerce, Shopify/BinderPOS backend integration
- CSV/spreadsheet listing for small sellers
- Low fees, fast payouts

**Limitation:** Currently Magic-only. **Riftbound is NOT supported on Mana Pool.**

### eBay

**Website:** developer.ebay.com  
**API:** Fully open, well-documented REST APIs  

**Capabilities:**
- Full selling API (Inventory API, Listing API, Fulfillment API)
- Bulk listing via Trading API
- No restrictions on new developer accounts
- Massive buyer base

**Considerations for TCG cards:**
- Higher fees than TCGPlayer (~13% total)
- No built-in TCG catalog/pricing — more work to create listings
- Buyers don't search eBay for TCG singles as commonly as TCGPlayer
- Good for higher-value cards, not great for bulk commons

### CardMarket (EU-focused)

**Website:** cardmarket.com  
**API:** Has developer access (EU marketplace, primarily)

- Largest European TCG marketplace
- API available but focused on EU sellers
- **Riftbound may be listed** (need to verify)
- Different fee structure, EU shipping requirements

---

## 7. Price Data Sources

### TCGTracking Open API ⭐⭐ EXCELLENT for Pricing

**Website:** tcgtracking.com/tcgapi  
**API Base:** `https://tcgtracking.com/tcgapi/v1`  
**Cost:** FREE, open to anyone  
**Auth:** None required  

**Endpoints:**
| Endpoint | Description | Cache TTL |
|----------|-------------|-----------|
| `/v1/meta` | API status | 5 min |
| `/v1/categories` | All 55 game categories | 7 days |
| `/v1/{cat}/sets` | All sets for a game | 7 days |
| `/v1/{cat}/sets/{set}` | Product data (names, IDs, images) | 7 days |
| `/v1/{cat}/sets/{set}/pricing` | TCGPlayer + Manapool pricing | 1 day |
| `/v1/{cat}/sets/{set}/skus` | SKU-level pricing (condition/variant/language) | 1 day |

**Riftbound data confirmed:**
- Category ID: **89** ("Riftbound: League of Legends Trading Card Game")
- **1,082 products** across **7 sets**
- Sets: Origins (364 products), Spiritforged (315), Unleashed (264), Proving Grounds (30), OP Promos (119), Judge Promos (1), Regular Promos (15)
- **Full pricing data available** with TCGPlayer market + low prices
- **SKU-level data** with condition/variant/language breakdowns
- Pricing updated **daily** (last update: 2026-03-28)

**Cross-references in product data:**
- TCGPlayer Product IDs
- Scryfall IDs (for MTG)
- CardMarket IDs
- CardTrader IDs
- Images, URLs, collector numbers

**This solves our pricing problem entirely** — no need for TCGPlayer API just to get market prices. TCGTracking mirrors TCGPlayer's pricing data with daily updates.

### Scryfall (MTG only)
- Comprehensive MTG data with TCGPlayer price integration
- Not useful for Riftbound

---

## 8. Community Workarounds

Based on Reddit threads in r/mtgfinance and r/flipping:

### Common Approaches Without API Access

1. **Manual CSV workflow** — Use TCGPlayer's built-in export → modify in spreadsheet → re-upload
2. **CrystalCommerce as middleware** — Sign up for CrystalCommerce, use their API, they push to TCGPlayer
3. **TCGTracking for price data** — Free API for pricing, no need for TCGPlayer API just for prices
4. **Multi-marketplace strategy** — List on CardTrader, eBay, etc. where APIs are open
5. **Browser extension/automation** — Some sellers use custom browser extensions (risky)
6. **BinderPOS** — Game stores use BinderPOS for privileged TCGPlayer access
7. **Scraping TCGPlayer for prices** — Against ToS but common for read-only price tracking

### Key Insight from Community
Most automation-focused sellers have either:
- Grandfathered API keys from before the closure
- Moved to CrystalCommerce or BinderPOS for TCGPlayer integration
- Diversified to other marketplaces (CardTrader, eBay)
- Built manual CSV-based workflows

---

## 9. Riftbound-Specific Data

### TCGPlayer (via TCGTracking API)
- ✅ **Full catalog available** — 1,082 products, 7 sets
- ✅ **Pricing data** — Market + Low prices for all products, daily updates
- ✅ **SKU-level detail** — 7,408 total SKUs with condition/variant/language pricing
- ✅ **Product IDs** — Can map to TCGPlayer product pages

### CardTrader
- ⚠️ **Needs verification** — CardTrader supports many TCGs but Riftbound support needs to be confirmed
- CardTrader's product data includes `tcgplayer_id` field, suggesting cross-platform awareness
- If supported, our CSV's `TCGplayer Id` column maps directly to CardTrader's `tcgplayer_id` column in CSV imports

### eBay
- ✅ Riftbound cards are sold on eBay (individual listings)
- No structured catalog — would need to create listings from scratch
- Good for high-value cards only

---

## 10. Recommendation

### Recommended Architecture: **Hybrid Multi-Platform Strategy**

```
┌─────────────────────────────────────────────────────┐
│                Our Automation System                 │
│                                                      │
│  CSV Import → Card DB → Price Engine → Listing Engine │
│                                                      │
└───────┬──────────┬──────────┬───────────┬───────────┘
        │          │          │           │
        ▼          ▼          ▼           ▼
  ┌──────────┐ ┌────────┐ ┌──────┐ ┌───────────┐
  │TCGPlayer │ │Card    │ │eBay  │ │TCGTracking│
  │(CSV Gen) │ │Trader  │ │(API) │ │(Price API)│
  │          │ │(API)   │ │      │ │           │
  │Manual    │ │Auto    │ │Auto  │ │Auto       │
  │Upload    │ │List    │ │List  │ │Price Feed │
  └──────────┘ └────────┘ └──────┘ └───────────┘
```

### Phase 1 (Revised): MVP with CardTrader + TCGPlayer CSV

| Component | Approach | Effort |
|-----------|----------|--------|
| **Price Data** | TCGTracking API (free, no auth, daily updates) | LOW |
| **CardTrader Listing** | CardTrader Full API (open, free signup, full automation) | MEDIUM |
| **TCGPlayer Listing** | Generate CSV files → manual upload by Dustin | LOW |
| **Inventory Management** | Internal DB with card data from CSV imports | MEDIUM |

### Phase 2: Expand & Optimize

| Component | Approach | Effort |
|-----------|----------|--------|
| **eBay Listing** | eBay REST APIs for high-value cards | MEDIUM |
| **TCGPlayer Semi-Automation** | Evaluate CrystalCommerce for programmatic TCGPlayer access | MEDIUM |
| **Price Monitoring** | TCGTracking API polling (1-2x daily) + Telegram alerts | LOW |
| **Multi-platform price optimization** | Price differently per marketplace based on fees | MEDIUM |

### Why This Works

1. **TCGTracking API** gives us all the pricing data we need — FREE, no auth required, Riftbound fully supported
2. **CardTrader API** gives us full programmatic selling — open API, CSV import supports `tcgplayer_id`, bulk operations
3. **TCGPlayer CSV generation** keeps us on the largest marketplace with minimal effort — our system generates the CSV, Dustin uploads it
4. **No ToS violations** — no scraping, no browser automation, all legitimate APIs
5. **Incremental complexity** — start with CSV + CardTrader, add eBay and CrystalCommerce later

### Immediate Action Items

1. **Verify Riftbound on CardTrader** — Check if CardTrader has Riftbound in their catalog
2. **Sign up for CardTrader seller account** — Free, just needs email
3. **Test TCGTracking API** — Hit Riftbound endpoints, validate data matches our CSV
4. **Update Phase 1 architecture** — Pivot from "TCGPlayer API" to "multi-platform" approach
5. **Evaluate CrystalCommerce** — Schedule a demo call (daily Zoom at 11 AM / 3 PM PT) to understand pricing and TCGPlayer integration capabilities

### Cost Comparison

| Service | Seller Fees | API Cost | Listing Cost |
|---------|-------------|----------|--------------|
| TCGPlayer (via CSV) | ~11-15% | N/A | Free |
| CardTrader (direct) | 5% | Free | Free |
| CardTrader Zero | 7% | Free | Free |
| eBay | ~13% | Free | Free (up to limit) |
| CrystalCommerce | TCGPlayer fees + subscription | Included | Monthly sub |
| TCGTracking (prices only) | N/A | Free | N/A |

---

## Appendix: Key URLs

- TCGPlayer API Docs (archived): https://docs.tcgplayer.com/docs/getting-started
- TCGTracking Open API: https://tcgtracking.com/tcgapi/
- TCGTracking Riftbound sets: https://tcgtracking.com/tcgapi/v1/89/sets
- CardTrader API Docs: https://www.cardtrader.com/docs/api/full
- CardTrader Homepage: https://www.cardtrader.com/en
- CrystalCommerce: https://www.crystalcommerce.com/
- Mana Pool (MTG only): https://manapool.com/seller-info
- eBay Developer Program: https://developer.ebay.com/develop/apis
