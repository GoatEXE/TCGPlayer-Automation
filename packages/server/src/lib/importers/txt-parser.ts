import type { ImportResult, ImportedCard } from './types';

/**
 * Parse TCGPlayer mobile app TXT export format
 * 
 * Expected format: {quantity} {card name} [{set_code}] {number}/{total}
 * Example: 6 Chaos Rune [OGN] 166/298
 */

const SET_CODE_MAP: Record<string, string> = {
  'OGN': 'Origins',
};

const PRODUCT_LINE = 'Riftbound: League of Legends Trading Card Game';
const DEFAULT_CONDITION = 'Near Mint';

// Pattern: quantity cardName [setCode] number/total
const TXT_LINE_PATTERN = /^(\d+)\s+(.+?)\s+\[([A-Z]+)\]\s+(\d+\/\d+)$/;

export function parseTxt(content: string): ImportResult {
  const lines = content.trim().split('\n');

  if (lines.length === 0 || content.trim() === '') {
    return {
      source: 'txt',
      cards: [],
      errors: [],
      totalRows: 0,
    };
  }

  const cards: ImportedCard[] = [];
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const lineNumber = i + 1;

    const match = line.match(TXT_LINE_PATTERN);
    
    if (!match) {
      errors.push(`Line ${lineNumber}: Does not match expected format - "${line}"`);
      continue;
    }

    const [, quantityStr, cardName, setCode, number] = match;

    const setName = SET_CODE_MAP[setCode];
    
    if (!setName) {
      errors.push(`Line ${lineNumber}: Unknown set code "${setCode}"`);
      continue;
    }

    const card: ImportedCard = {
      tcgplayerId: null,
      tcgProductId: null,
      productLine: PRODUCT_LINE,
      setName,
      productName: cardName.trim(),
      title: null,
      number,
      rarity: null,
      condition: DEFAULT_CONDITION,
      quantity: parseInt(quantityStr, 10),
      snapshotMarketPrice: null,
      photoUrl: null,
    };

    cards.push(card);
  }

  return {
    source: 'txt',
    cards,
    errors,
    totalRows: lines.filter(line => line.trim()).length,
  };
}
