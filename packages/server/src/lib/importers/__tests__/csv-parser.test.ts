import { describe, it, expect } from 'vitest';
import { parseCsv } from '../csv-parser';

describe('CSV Parser', () => {
  it('parses valid CSV with header row to correct ImportedCard array', () => {
    const csvContent = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL
8927752,Riftbound: League of Legends Trading Card Game,Origins,Targon's Peak,,289/298,Uncommon,Near Mint,0.18,,,,,1,,https://tcgplayer-cdn.tcgplayer.com/product/653083_in_400x400.jpg`;

    const result = parseCsv(csvContent);

    expect(result.source).toBe('csv');
    expect(result.totalRows).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.cards).toHaveLength(1);
    
    const card = result.cards[0];
    expect(card.tcgplayerId).toBe(8927752);
    expect(card.productLine).toBe('Riftbound: League of Legends Trading Card Game');
    expect(card.setName).toBe('Origins');
    expect(card.productName).toBe("Targon's Peak");
    expect(card.title).toBeNull();
    expect(card.number).toBe('289/298');
    expect(card.rarity).toBe('Uncommon');
    expect(card.condition).toBe('Near Mint');
    expect(card.quantity).toBe(1);
    expect(card.snapshotMarketPrice).toBe(0.18);
    expect(card.photoUrl).toBe('https://tcgplayer-cdn.tcgplayer.com/product/653083_in_400x400.jpg');
  });

  it('maps Add to Quantity to quantity field, not Total Quantity', () => {
    const csvContent = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL
8926802,Riftbound: League of Legends Trading Card Game,Origins,Chaos Rune,,166/298,Common,Near Mint,0.03167,,,,,6,,https://tcgplayer-cdn.tcgplayer.com/product/652954_in_400x400.jpg`;

    const result = parseCsv(csvContent);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].quantity).toBe(6);
  });

  it('handles empty optional fields (Title, price columns) as null', () => {
    const csvContent = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL
8927752,Riftbound: League of Legends Trading Card Game,Origins,Test Card,,289/298,Common,Near Mint,,,,,,1,,`;

    const result = parseCsv(csvContent);

    expect(result.cards).toHaveLength(1);
    const card = result.cards[0];
    expect(card.title).toBeNull();
    expect(card.snapshotMarketPrice).toBeNull();
    expect(card.photoUrl).toBeNull();
  });

  it('parses market price as number', () => {
    const csvContent = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL
8927072,Riftbound: League of Legends Trading Card Game,Origins,Rhasa the Sunderer,,195/298,Rare,Near Mint,3.01,,,,,1,,https://tcgplayer-cdn.tcgplayer.com/product/652985_in_400x400.jpg`;

    const result = parseCsv(csvContent);

    expect(result.cards[0].snapshotMarketPrice).toBe(3.01);
  });

  it('handles quantity of 1 and quantity > 1', () => {
    const csvContent = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL
8927752,Riftbound: League of Legends Trading Card Game,Origins,Card One,,001/298,Common,Near Mint,0.18,,,,,1,,
8926802,Riftbound: League of Legends Trading Card Game,Origins,Card Two,,002/298,Common,Near Mint,0.03,,,,,6,,
8925412,Riftbound: League of Legends Trading Card Game,Origins,Card Three,,003/298,Common,Near Mint,0.02,,,,,3,,`;

    const result = parseCsv(csvContent);

    expect(result.cards).toHaveLength(3);
    expect(result.cards[0].quantity).toBe(1);
    expect(result.cards[1].quantity).toBe(6);
    expect(result.cards[2].quantity).toBe(3);
  });

  it('handles rows with missing required fields and adds to errors', () => {
    const csvContent = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL
8927752,Riftbound: League of Legends Trading Card Game,Origins,Valid Card,,001/298,Common,Near Mint,0.18,,,,,1,,
,Riftbound: League of Legends Trading Card Game,Origins,,,002/298,Common,Near Mint,0.03,,,,,1,,
8927753,Riftbound: League of Legends Trading Card Game,Origins,Another Valid,,003/298,Common,Near Mint,0.05,,,,,2,,`;

    const result = parseCsv(csvContent);

    expect(result.totalRows).toBe(3);
    expect(result.cards).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Row 3'); // Row 3 in the file (header is row 1, valid card is row 2, bad card is row 3)
    expect(result.cards[0].productName).toBe('Valid Card');
    expect(result.cards[1].productName).toBe('Another Valid');
  });

  it('handles empty input', () => {
    const result = parseCsv('');

    expect(result.source).toBe('csv');
    expect(result.totalRows).toBe(0);
    expect(result.cards).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('handles CSV with only header row', () => {
    const csvContent = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL`;

    const result = parseCsv(csvContent);

    expect(result.source).toBe('csv');
    expect(result.totalRows).toBe(0);
    expect(result.cards).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('parses real sample data correctly', () => {
    const csvContent = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL
8927752,Riftbound: League of Legends Trading Card Game,Origins,Targon's Peak,,289/298,Uncommon,Near Mint,0.18,,,,,1,,https://tcgplayer-cdn.tcgplayer.com/product/653083_in_400x400.jpg
8926802,Riftbound: League of Legends Trading Card Game,Origins,Chaos Rune,,166/298,Common,Near Mint,0.03167,,,,,6,,https://tcgplayer-cdn.tcgplayer.com/product/652954_in_400x400.jpg
8925412,Riftbound: League of Legends Trading Card Game,Origins,Brazen Buccaneer,,002/298,Common,Near Mint,0.02,,,,,3,,https://tcgplayer-cdn.tcgplayer.com/product/652772_in_400x400.jpg`;

    const result = parseCsv(csvContent);

    expect(result.source).toBe('csv');
    expect(result.totalRows).toBe(3);
    expect(result.errors).toEqual([]);
    expect(result.cards).toHaveLength(3);

    // Verify first card
    expect(result.cards[0]).toEqual({
      tcgplayerId: 8927752,
      productLine: 'Riftbound: League of Legends Trading Card Game',
      setName: 'Origins',
      productName: "Targon's Peak",
      title: null,
      number: '289/298',
      rarity: 'Uncommon',
      condition: 'Near Mint',
      quantity: 1,
      snapshotMarketPrice: 0.18,
      photoUrl: 'https://tcgplayer-cdn.tcgplayer.com/product/653083_in_400x400.jpg',
    });

    // Verify second card has quantity 6
    expect(result.cards[1].quantity).toBe(6);
    expect(result.cards[1].productName).toBe('Chaos Rune');

    // Verify third card
    expect(result.cards[2].quantity).toBe(3);
    expect(result.cards[2].productName).toBe('Brazen Buccaneer');
  });
});
