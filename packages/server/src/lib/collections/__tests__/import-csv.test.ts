import { describe, expect, it } from 'vitest';
import { parseTcgplayerCollectionCsv } from '../import-csv.js';

const header = [
  'Product ID',
  'TCGplayer Id',
  'Product Line',
  'Set Name',
  'Product Name',
  'Title',
  'Number',
  'Rarity',
  'Condition',
  'Printing',
  'TCG Market Price',
  'TCG Direct Low',
  'TCG Low Price With Shipping',
  'TCG Low Price',
  'Total Quantity',
  'Add to Quantity',
  'TCG Marketplace Price',
  'Photo URL',
];

function csvRow(values: Record<string, string>) {
  return header.map((name) => values[name] ?? '').join(',');
}

function csv(...rows: Array<Record<string, string>>) {
  return [header.join(','), ...rows.map(csvRow)].join('\n');
}

const baseRow = {
  'Product ID': '685590',
  'TCGplayer Id': '9197684',
  'Product Line': 'Riftbound: League of Legends Trading Card Game',
  'Set Name': 'Unleashed',
  'Product Name': 'Voracious Gromp',
  Number: '100/219',
  Rarity: 'Common',
  Condition: 'Near Mint',
  Printing: 'Normal',
  'TCG Market Price': '0.07',
  'Total Quantity': '3',
  'Photo URL': 'https://tcgplayer-cdn.tcgplayer.com/product/685590_in_400x400.jpg',
};

describe('parseTcgplayerCollectionCsv', () => {
  it('parses TCGPlayer collection export headers and maps Total Quantity/Printing', () => {
    const result = parseTcgplayerCollectionCsv(
      csv(baseRow, {
        ...baseRow,
        'Product ID': '684523',
        'TCGplayer Id': '9191466',
        'Product Name': 'Poppy - Keeper of the Hammer',
        Number: '203/219',
        Rarity: 'Rare',
        Printing: 'Foil',
        'TCG Market Price': '0.16',
        'Total Quantity': '1',
        'Photo URL': 'https://tcgplayer-cdn.tcgplayer.com/product/684523_in_400x400.jpg',
      }),
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      tcgProductId: 685590,
      tcgplayerId: 9197684,
      productName: 'Voracious Gromp',
      condition: 'Near Mint',
      finish: 'Normal',
      quantity: 3,
      snapshotMarketPrice: 0.07,
    });
    expect(result.rows[1]).toMatchObject({
      productName: 'Poppy - Keeper of the Hammer',
      finish: 'Foil',
      quantity: 1,
    });
  });

  it('uses Total Quantity over Add to Quantity for snapshot collection exports', () => {
    const result = parseTcgplayerCollectionCsv(
      csv({ ...baseRow, 'Total Quantity': '3', 'Add to Quantity': '99' }),
    );

    expect(result.rows[0].quantity).toBe(3);
    expect(result.rows[0].warnings).toEqual([
      'Add to Quantity is present but ignored because collection imports use Total Quantity as the snapshot quantity',
    ]);
  });

  it('falls back to Add to Quantity only when Total Quantity is missing', () => {
    const result = parseTcgplayerCollectionCsv(
      csv({ ...baseRow, 'Total Quantity': '', 'Add to Quantity': '2' }),
    );

    expect(result.rows[0].quantity).toBe(2);
    expect(result.rows[0].warnings).toEqual([]);
  });

  it('extracts Product ID from Photo URL when Product ID column is blank', () => {
    const result = parseTcgplayerCollectionCsv(csv({ ...baseRow, 'Product ID': '' }));

    expect(result.rows[0].tcgProductId).toBe(685590);
  });
});
