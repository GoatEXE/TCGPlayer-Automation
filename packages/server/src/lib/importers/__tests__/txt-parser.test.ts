import { describe, it, expect } from 'vitest';
import { parseTxt } from '../txt-parser';

describe('TXT Parser', () => {
  it('parses valid TXT lines to correct ImportedCard array', () => {
    const txtContent = `1 Targon's Peak [OGN] 289/298`;

    const result = parseTxt(txtContent);

    expect(result.source).toBe('txt');
    expect(result.totalRows).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.cards).toHaveLength(1);

    const card = result.cards[0];
    expect(card.quantity).toBe(1);
    expect(card.productName).toBe("Targon's Peak");
    expect(card.setName).toBe('Origins');
    expect(card.number).toBe('289/298');
  });

  it('extracts quantity, card name, set code, and number correctly', () => {
    const txtContent = `6 Chaos Rune [OGN] 166/298`;

    const result = parseTxt(txtContent);

    expect(result.cards).toHaveLength(1);
    const card = result.cards[0];
    expect(card.quantity).toBe(6);
    expect(card.productName).toBe('Chaos Rune');
    expect(card.setName).toBe('Origins');
    expect(card.number).toBe('166/298');
  });

  it('maps set code OGN to set name Origins', () => {
    const txtContent = `1 Test Card [OGN] 001/298`;

    const result = parseTxt(txtContent);

    expect(result.cards[0].setName).toBe('Origins');
  });

  it('handles quantity > 1', () => {
    const txtContent = `3 Brazen Buccaneer [OGN] 002/298
6 Fury Rune [OGN] 007/298
2 Fading Memories [OGN] 180/298`;

    const result = parseTxt(txtContent);

    expect(result.cards).toHaveLength(3);
    expect(result.cards[0].quantity).toBe(3);
    expect(result.cards[1].quantity).toBe(6);
    expect(result.cards[2].quantity).toBe(2);
  });

  it('handles lines that do not match pattern and adds to errors', () => {
    const txtContent = `1 Valid Card [OGN] 001/298
Invalid line without proper format
2 Another Valid [OGN] 002/298
Also invalid
3 Third Valid [OGN] 003/298`;

    const result = parseTxt(txtContent);

    expect(result.totalRows).toBe(5);
    expect(result.cards).toHaveLength(3);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain('Line 2');
    expect(result.errors[1]).toContain('Line 4');
  });

  it('handles empty input', () => {
    const result = parseTxt('');

    expect(result.source).toBe('txt');
    expect(result.totalRows).toBe(0);
    expect(result.cards).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('defaults condition to Near Mint', () => {
    const txtContent = `1 Test Card [OGN] 001/298`;

    const result = parseTxt(txtContent);

    expect(result.cards[0].condition).toBe('Near Mint');
  });

  it('defaults productLine to Riftbound TCG', () => {
    const txtContent = `1 Test Card [OGN] 001/298`;

    const result = parseTxt(txtContent);

    expect(result.cards[0].productLine).toBe(
      'Riftbound: League of Legends Trading Card Game',
    );
  });

  it('sets tcgplayerId, tcgProductId, rarity, photoUrl, and snapshotMarketPrice to null', () => {
    const txtContent = `1 Test Card [OGN] 001/298`;

    const result = parseTxt(txtContent);

    const card = result.cards[0];
    expect(card.tcgplayerId).toBeNull();
    expect(card.tcgProductId).toBeNull();
    expect(card.rarity).toBeNull();
    expect(card.photoUrl).toBeNull();
    expect(card.snapshotMarketPrice).toBeNull();
  });

  it('sets title to null', () => {
    const txtContent = `1 Test Card [OGN] 001/298`;

    const result = parseTxt(txtContent);

    expect(result.cards[0].title).toBeNull();
  });

  it('parses real sample data correctly', () => {
    const txtContent = `1 Targon's Peak [OGN] 289/298
6 Chaos Rune [OGN] 166/298
3 Brazen Buccaneer [OGN] 002/298`;

    const result = parseTxt(txtContent);

    expect(result.source).toBe('txt');
    expect(result.totalRows).toBe(3);
    expect(result.errors).toEqual([]);
    expect(result.cards).toHaveLength(3);

    // Verify first card
    expect(result.cards[0]).toEqual({
      tcgplayerId: null,
      tcgProductId: null,
      productLine: 'Riftbound: League of Legends Trading Card Game',
      setName: 'Origins',
      productName: "Targon's Peak",
      title: null,
      number: '289/298',
      rarity: null,
      condition: 'Near Mint',
      quantity: 1,
      snapshotMarketPrice: null,
      photoUrl: null,
    });

    // Verify second card has quantity 6
    expect(result.cards[1].quantity).toBe(6);
    expect(result.cards[1].productName).toBe('Chaos Rune');

    // Verify third card
    expect(result.cards[2].quantity).toBe(3);
    expect(result.cards[2].productName).toBe('Brazen Buccaneer');
  });

  it('handles card names with special characters', () => {
    const txtContent = `2 Get Excited! [OGN] 008/298
1 Jinx - Demolitionist [OGN] 030/298`;

    const result = parseTxt(txtContent);

    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].productName).toBe('Get Excited!');
    expect(result.cards[1].productName).toBe('Jinx - Demolitionist');
  });
});
