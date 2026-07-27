import { describe, expect, it } from 'vitest';
import {
  normalizeCollectorNumber,
  normalizeSetCode,
  parseCatalogCode,
  parseCatalogCodeAttempts,
} from '../normalize.js';
import { mapTCGTrackingProductToCatalogCard } from '../tcgtracking-products.js';

describe('catalog scanner normalization', () => {
  it('normalizes set codes and collector numbers for lookup', () => {
    expect(normalizeSetCode(' unl ')).toBe('UNL');
    expect(normalizeCollectorNumber('002/219')).toBe('2/219');
    expect(normalizeCollectorNumber('# 010 A / 0219')).toBe('10A/219');
  });

  it('parses OCR-like set-code and number text', () => {
    expect(parseCatalogCode('UNL • 002/219')).toEqual({
      setCode: 'UNL',
      number: '002/219',
      normalizedNumber: '2/219',
    });
    expect(parseCatalogCode('UNL-002 / 219')).toEqual({
      setCode: 'UNL',
      number: '002/219',
      normalizedNumber: '2/219',
    });
    expect(parseCatalogCode('UNL 002/219')).toEqual({
      setCode: 'UNL',
      number: '002/219',
      normalizedNumber: '2/219',
    });
    expect(parseCatalogCode('UNL.002/219')).toEqual({
      setCode: 'UNL',
      number: '002/219',
      normalizedNumber: '2/219',
    });
    expect(parseCatalogCode('UNL©002/219')).toEqual({
      setCode: 'UNL',
      number: '002/219',
      normalizedNumber: '2/219',
    });
    expect(parseCatalogCode('UNL002/219')).toEqual({
      setCode: 'UNL',
      number: '002/219',
      normalizedNumber: '2/219',
    });
    expect(parseCatalogCode('002/219 UNL')).toEqual({
      setCode: 'UNL',
      number: '002/219',
      normalizedNumber: '2/219',
    });
    expect(parseCatalogCode('UNL\nOO2/2I9')).toEqual({
      setCode: 'UNL',
      number: '002/219',
      normalizedNumber: '2/219',
    });
    expect(parseCatalogCode('U\nN\nL\n0\n0\n2\n/\n2\n1\n9')).toEqual({
      setCode: 'UNL',
      number: '002/219',
      normalizedNumber: '2/219',
    });
    expect(parseCatalogCode('0\n0\n2\n/\n2\n1\n9\nU\nN\nL')).toEqual({
      setCode: 'UNL',
      number: '002/219',
      normalizedNumber: '2/219',
    });
    expect(parseCatalogCode('UNL - T07')).toEqual({
      setCode: 'UNL',
      number: 'T07',
      normalizedNumber: 'T07',
    });
    expect(parseCatalogCode('UNL T07 // T04')).toEqual({
      setCode: 'UNL',
      number: 'T07//T04',
      normalizedNumber: 'T07//T04',
    });
    expect(parseCatalogCode('UNL T07/T04')).toEqual({
      setCode: 'UNL',
      number: 'T07//T04',
      normalizedNumber: 'T07//T04',
    });
    expect(parseCatalogCode('UNL T07 - T04')).toEqual({
      setCode: 'UNL',
      number: 'T07//T04',
      normalizedNumber: 'T07//T04',
    });
    expect(parseCatalogCode('T07 // T04 UNL')).toEqual({
      setCode: 'UNL',
      number: 'T07//T04',
      normalizedNumber: 'T07//T04',
    });
    expect(parseCatalogCode('UNL - R02')).toEqual({
      setCode: 'UNL',
      number: 'R02',
      normalizedNumber: 'R02',
    });
    expect(parseCatalogCode('UNL R02a')).toEqual({
      setCode: 'UNL',
      number: 'R02A',
      normalizedNumber: 'R02A',
    });
    expect(parseCatalogCode('R02b UNL')).toEqual({
      setCode: 'UNL',
      number: 'R02B',
      normalizedNumber: 'R02B',
    });
    expect(parseCatalogCode('not a card id')).toBeNull();
  });

  it('extracts multiple plausible card-code attempts from noisy OCR text', () => {
    expect(
      parseCatalogCodeAttempts('B E J . UN. 209/219 S . 5S UN. 209/215'),
    ).toEqual([
      { setCode: 'UN', number: '209/219', normalizedNumber: '209/219' },
      { setCode: 'UN', number: '209/215', normalizedNumber: '209/215' },
    ]);
    expect(
      parseCatalogCodeAttempts('-1.T -JL 209/219 ... JNL 209/719'),
    ).toEqual([
      { setCode: 'JL', number: '209/219', normalizedNumber: '209/219' },
      { setCode: 'JNL', number: '209/719', normalizedNumber: '209/719' },
      { setCode: 'JNL', number: '209/219', normalizedNumber: '209/219' },
    ]);
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
