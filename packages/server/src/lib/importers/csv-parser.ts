import type { ImportResult, ImportedCard } from './types';

/**
 * Parse TCGPlayer mobile app CSV export format
 *
 * Expected columns:
 * TCGplayer Id, Product Line, Set Name, Product Name, Title, Number, Rarity,
 * Condition, TCG Market Price, TCG Direct Low, TCG Low Price With Shipping,
 * TCG Low Price, Total Quantity, Add to Quantity, TCG Marketplace Price, Photo URL
 */
export function parseCsv(content: string): ImportResult {
  const lines = content.trim().split('\n');

  if (lines.length === 0 || content.trim() === '') {
    return {
      source: 'csv',
      cards: [],
      errors: [],
      totalRows: 0,
    };
  }

  // Skip header row
  const dataLines = lines.slice(1);

  const cards: ImportedCard[] = [];
  const errors: string[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i].trim();
    if (!line) continue;

    const rowNumber = i + 2; // +2 because we skip header (1) and arrays are 0-indexed

    try {
      const cols = parseCsvLine(line);

      // Column indices (0-based)
      const tcgplayerIdStr = cols[0]?.trim();
      const productLine = cols[1]?.trim();
      const setName = cols[2]?.trim();
      const productName = cols[3]?.trim();
      const title = cols[4]?.trim();
      const number = cols[5]?.trim();
      const rarity = cols[6]?.trim();
      const condition = cols[7]?.trim() || 'Near Mint';
      const marketPriceStr = cols[8]?.trim();
      const addToQuantityStr = cols[13]?.trim(); // "Add to Quantity" column
      const photoUrl = cols[15]?.trim();

      // Validation: required fields
      if (!tcgplayerIdStr || !productLine || !setName || !productName) {
        errors.push(
          `Row ${rowNumber}: Missing required fields (TCGplayer Id, Product Line, Set Name, or Product Name)`,
        );
        continue;
      }

      const card: ImportedCard = {
        tcgplayerId: parseInt(tcgplayerIdStr, 10),
        tcgProductId: extractProductId(photoUrl || null),
        productLine,
        setName,
        productName,
        title: title || null,
        number: number || null,
        rarity: rarity || null,
        condition,
        quantity: addToQuantityStr ? parseInt(addToQuantityStr, 10) : 0,
        snapshotMarketPrice: marketPriceStr ? parseFloat(marketPriceStr) : null,
        photoUrl: photoUrl || null,
      };

      cards.push(card);
    } catch (error) {
      errors.push(
        `Row ${rowNumber}: Parse error - ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    source: 'csv',
    cards,
    errors,
    totalRows: dataLines.filter((line) => line.trim()).length,
  };
}

/**
 * Extract TCGPlayer product ID from photo URL
 * Example: https://tcgplayer-cdn.tcgplayer.com/product/652954_in_400x400.jpg -> 652954
 */
function extractProductId(photoUrl: string | null): number | null {
  if (!photoUrl) return null;
  const match = photoUrl.match(/\/product\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Handle escaped quotes (double quotes)
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Push the last field
  result.push(current);

  return result;
}
