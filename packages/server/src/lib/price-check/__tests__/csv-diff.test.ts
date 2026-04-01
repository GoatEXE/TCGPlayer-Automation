import { describe, expect, it } from 'vitest';
import {
  buildPriceCheckCsvDiff,
  type PriceCheckCsvDiffRow,
} from '../csv-diff.js';

describe('buildPriceCheckCsvDiff', () => {
  it('sorts rows deterministically and renders CSV with expected columns', () => {
    const rows: PriceCheckCsvDiffRow[] = [
      {
        action: 'price_change',
        cardId: 9,
        productName: 'Zed',
        previousStatus: 'listed',
        newStatus: 'listed',
        previousListingPrice: 1,
        newListingPrice: 1.5,
        driftPercent: 50,
      },
      {
        action: 'add_listing',
        cardId: 12,
        productName: 'Ahri',
        previousStatus: 'gift',
        newStatus: 'matched',
        previousListingPrice: null,
        newListingPrice: 0.1,
        driftPercent: null,
      },
      {
        action: 'remove_listing',
        cardId: 3,
        productName: 'Lux',
        previousStatus: 'listed',
        newStatus: 'gift',
        previousListingPrice: 0.2,
        newListingPrice: null,
        driftPercent: null,
      },
      {
        action: 'add_listing',
        cardId: 2,
        productName: 'Annie',
        previousStatus: 'needs_attention',
        newStatus: 'matched',
        previousListingPrice: null,
        newListingPrice: 0.6,
        driftPercent: null,
      },
    ];

    const result = buildPriceCheckCsvDiff(rows);

    expect(result.rows.map((row) => `${row.action}:${row.cardId}`)).toEqual([
      'add_listing:2',
      'add_listing:12',
      'remove_listing:3',
      'price_change:9',
    ]);

    expect(result.csv).toContain(
      'action,card_id,product_name,previous_status,new_status,previous_listing_price,new_listing_price,drift_percent',
    );
    expect(result.csv).toContain(
      'add_listing,2,Annie,needs_attention,matched,,0.60,',
    );
    expect(result.csv).toContain('remove_listing,3,Lux,listed,gift,0.20,,');
    expect(result.csv).toContain(
      'price_change,9,Zed,listed,listed,1.00,1.50,50.00',
    );
  });

  it('escapes product names containing commas and quotes', () => {
    const result = buildPriceCheckCsvDiff([
      {
        action: 'add_listing',
        cardId: 7,
        productName: 'Jinx, "Pow-Pow"',
        previousStatus: 'gift',
        newStatus: 'matched',
        previousListingPrice: null,
        newListingPrice: 0.15,
        driftPercent: null,
      },
    ]);

    const lines = result.csv.split('\n');
    expect(lines[1]).toContain('"Jinx, ""Pow-Pow"""');
  });

  it('returns header-only CSV when no rows are provided', () => {
    const result = buildPriceCheckCsvDiff([]);

    expect(result.rows).toEqual([]);
    expect(result.csv).toBe(
      'action,card_id,product_name,previous_status,new_status,previous_listing_price,new_listing_price,drift_percent',
    );
  });
});
