import { describe, expect, it } from 'vitest';
import {
  normalizeCollectorNumber,
  normalizeSetCode,
} from '../normalize.js';
import { mapTCGTrackingProductToCatalogCard } from '../tcgtracking-products.js';

describe('catalog normalization', () => {
  it('normalizes set codes and collector numbers for lookup', () => {
    expect(normalizeSetCode(' unl ')).toBe('UNL');
    expect(normalizeCollectorNumber('002/219')).toBe('2/219');
    expect(normalizeCollectorNumber('# 010 A / 0219')).toBe('10A/219');
    expect(normalizeCollectorNumber('UNL - T07')).toBe('UNL-T07');
    expect(normalizeCollectorNumber('T07 / T04')).toBe('T07//T04');
    expect(normalizeCollectorNumber('R02a')).toBe('R02A');
  });

  it('maps flexible TCGTracking product fields to catalog rows', () => {
    const row = mapTCGTrackingProductToCatalogCard(7, {
      product_id: 123,
      product_name: 'Inferna',
      collector_number: '002/219',
      rarity: 'Champion',
      image_url: 'https://example.com/inferna.jpg',
    });

    expect(row).toMatchObject({
      catalogSetId: 7,
      tcgProductId: 123,
      productName: 'Inferna',
      collectorNumber: '002/219',
      normalizedNumber: '2/219',
      rarity: 'Champion',
      photoUrl: 'https://example.com/inferna.jpg',
    });
  });
});
