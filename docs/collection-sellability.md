# Collection Sellability Backend Contract

Scanner intake uses collection tables only. None of these endpoints create or update `/api/cards` selling/listing inventory.

## Card classification

`catalog_cards.card_kind` can explicitly override sellability classification with one of:
`normal`, `legend`, `battlefield`, `rune`, `token`, `unknown`.

If no explicit kind is present, sellability infers what is safe from catalog/source metadata:

- structured raw fields such as `Card Type`, `card_type`, `kind`, or `classification` when a source provides them;
- a curated generated TCGCSV map keyed by TCGPlayer product ID and set+collector number for non-normal sellability kinds (`legend`, `battlefield`, `rune`, `token`);
- token/rune collector prefixes (`T##`, token pairs, `R##`/`R##a`) and token/rune names only when there is no normal set-number form;
- other numbered singles as `normal`.

Metadata override still wins. Hyphenated names alone do **not** classify a card as a legend. Battlefield classification no longer relies on broad contiguous ranges; TCGCSV `extendedData.Card Type` identified exact battlefield products/numbers across currently available groups (`OGN`, `OGS`, `OPP`, `PR`, `SFD`, `UNL`, `VEN`; `JDG` currently has none, `RWB` currently has no products). Anything that does not match those signals is returned as `unknown`, kept safe, and flagged with `needsClassification: true`.

Evidence: local TCGTracking product/catalog raw data checked for Inferna, Dusk Rose Lab, Calm Rune, Sprite // Buff, and Kha'Zix - Voidreaver exposes id/name/number/rarity/image URLs and CardTrader marketplace fields, but no explicit legend/battlefield type line. TCGTracking pricing/price-update data (`/tcgapi/v1/89/sets/{setId}/pricing`) was also checked for UNL and OGN; it returns only `set_id`, `updated`, and `prices` keyed by product ID with finish prices (`tcg.Normal`/`tcg.Foil` low/market), so it does not expose card type either. TCGCSV for the same category does expose `extendedData` with `Card Type` (`Legend`, `Battlefield`, `Rune`, `Token`, etc.), so `packages/server/src/lib/collections/riftbound-card-kinds.ts` is generated from that source for reliable current-set inference.

## Android scan preview

`POST /api/collections/scan-preview`

Request:

```json
{
  "items": [
    {
      "catalogCardId": 123,
      "quantity": 1,
      "finish": "Normal",
      "condition": "Near Mint",
      "language": "EN"
    }
  ]
}
```

Response groups sell recommendations first:

```json
{
  "behavior": {
    "unknownKind": "keep_all_needs_classification",
    "tokenRune": "excluded_from_sellability_kept_in_owned",
    "finishPreference": "keep_normal_first_sell_foil_first"
  },
  "summary": { "sellQuantity": 1, "keepQuantity": 2, "excludedQuantity": 0 },
  "groups": { "sell": [], "keep": [], "excluded": [] },
  "items": []
}
```

Each item includes card identity, `kind`, `cardKindSource` (`metadata`, `inferred`, or `unknown`), quantities/count context, `action`, `targetCollectionName`, `reasons`, `reasonCodes`, `primaryReasonCode`, `opportunityType`, and `keepTargetSatisfiedByNormal`. Foil swaps are marked with `primaryReasonCode: "foil_preference"`, `opportunityType: "foil_swap"`, and `keepTargetSatisfiedByNormal: true`.

## Android split commit

`POST /api/collections/split-scan`

Pass reviewed `allocations` from preview, or pass `items` and the server recomputes the split. `sell` allocations are bulk-added to the `To Be Sold` collection; `keep` and `excluded` allocations are bulk-added to `Default` owned collection. Finish, condition, and language are preserved.

## Owned collection CSV import

TCGPlayer collection exports import into collection tables only; they do not use the legacy `/api/cards/import` selling inventory path.

Preview:

```bash
curl -F "file=@collection.csv" http://localhost:3000/api/collections/1/import/preview
```

Import:

```bash
curl -F "file=@collection.csv" -F "mode=merge" http://localhost:3000/api/collections/1/import
```

- `mode=merge` (default): add imported quantities to existing matching collection rows.
- `mode=set`: set quantities for imported merge keys to the CSV quantity; it does not delete collection rows absent from the CSV.
- Quantity uses `Total Quantity` as the snapshot value when present. `Add to Quantity` is ignored when `Total Quantity` is present; if Total is blank, Add is supported as a fallback (the provided export uses this shape).
- `Printing=Foil` maps to finish `Foil`; all other printing values map to `Normal`.
- Catalog matching prefers `Product ID`/`tcgProductId`. If the catalog card is missing and CSV has enough product/set/number data, import creates a local catalog snapshot first. Unknown sets or rows without enough identity data are returned as unresolved instead of silently dropped.

Response shape:

```json
{
  "collection": { "id": 1, "name": "Default" },
  "mode": "merge",
  "source": "tcgplayer_collection_csv",
  "summary": {
    "totalRows": 1,
    "parsedRows": 1,
    "matchedCatalogRows": 1,
    "createdCatalogRows": 0,
    "unresolvedRows": 0,
    "totalQuantity": 3,
    "normalQuantity": 3,
    "foilQuantity": 0,
    "warnings": []
  },
  "rows": [
    {
      "rowNumber": 2,
      "status": "matched",
      "catalogCardId": 100,
      "tcgProductId": 685590,
      "productName": "Voracious Gromp",
      "setName": "Unleashed",
      "number": "100/219",
      "condition": "Near Mint",
      "finish": "Normal",
      "quantity": 3,
      "warnings": []
    }
  ],
  "errors": []
}
```

The import endpoint also returns `inserted`, `updated`, and written `items`.

## Transfer collection rows to selling inventory

Transfers are explicit user actions from a collection row into the existing selling inventory table (`cards`). They do not list externally on TCGPlayer and they do not merge into `listed` inventory rows.

Preview:

```bash
curl -X POST http://localhost:3000/api/collections/2/transfer-to-inventory/preview \
  -H "Content-Type: application/json" \
  -d '{"items":[{"collectionItemId":21,"quantity":1}]}'
```

Commit:

```bash
curl -X POST http://localhost:3000/api/collections/2/transfer-to-inventory \
  -H "Content-Type: application/json" \
  -d '{"items":[{"collectionItemId":21,"quantity":1}]}'
```

Response shape:

```json
{
  "collection": { "id": 2, "name": "To Be Sold" },
  "summary": {
    "requestedItems": 1,
    "transferableItems": 1,
    "blockedItems": 0,
    "transferQuantity": 1,
    "createRows": 1,
    "updateRows": 0,
    "warnings": [],
    "blockers": []
  },
  "items": [
    {
      "collectionItemId": 21,
      "catalogCardId": 101,
      "quantity": 1,
      "availableQuantity": 2,
      "finish": "Foil",
      "condition": "Near Mint",
      "inventoryCondition": "Near Mint Foil",
      "action": "create",
      "targetCardId": null,
      "status": "matched",
      "marketPrice": 1,
      "listingPrice": 0.98,
      "blockers": [],
      "warnings": [],
      "card": { "productName": "Poppy - Keeper of the Hammer" }
    }
  ]
}
```

Commit returns the same preview data plus `transferredCards`. `summary.warnings` and `summary.blockers` are object arrays shaped as `{ collectionItemId, warning }` and `{ collectionItemId, blocker }` so the UI can attach messages to selected rows. For each transferable row, the source `collection_items.quantity` is decremented by the transferred quantity; if the remaining quantity is 0, the source collection item row is deleted. If the target selling inventory already has a non-listed staging row (`matched`, `needs_attention`, or `gift`) with the same product/condition, that row is incremented. If a `listed` row exists, it is intentionally ignored and a new staging row is created to avoid TCGPlayer marketplace quantity drift.

Status/pricing uses the existing `calculatePrice` rules. Transfer pricing now resolves market price in this order: existing non-listed staging inventory market price, catalog/import snapshot market price, then TCGTracking set pricing by `catalog_sets.tcgtrackingSetId` + `catalog_cards.tcgProductId`. Normal transfers use Normal market pricing, with the same Normal→Foil fallback used by price checks when Normal is absent; Foil transfers use Foil market pricing. Valid prices create `matched`, below-threshold prices create `gift`, and truly missing prices create `needs_attention` with `missing_market_price_creates_needs_attention`. `finish=Foil` maps to inventory condition `Near Mint Foil` (or preserves an existing foil condition) and sets `isFoilPrice=true`. Token/rune collection rows are blocked from transfer by default. If an older transfer row was created with null market price before this fix, single-card Re-price now fetches TCGTracking pricing by product ID before recalculating, so it can repair the row without re-transferring or duplicating inventory.

## Web sellability view

`GET /api/collections/:id/sellability` returns grouped collection rows with normal/foil quantities, keep targets, keep/sell allocations, exclusion/classification flags, and foil-swap opportunity fields.

Each row also includes transfer-ready source details:

- `sourceItems`: all contributing collection rows for that catalog card, each with `{ collectionItemId, finish, finishKind, condition, language, quantity, recommendedSellQuantity }`.
- `transferItems`: the subset of `sourceItems` where `recommendedSellQuantity > 0`; the transfer UI can send these directly as `{ collectionItemId, quantity: recommendedSellQuantity }` to `/api/collections/:id/transfer-to-inventory/preview` or commit.

For foil-swap recommendations, `transferItems` points at the foil collection item(s). For normal duplicate recommendations, `transferItems` points at the normal source item(s) carrying the recommended sell quantity.
