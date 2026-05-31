import type { ImportResult, ImportedCard } from './types';

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseOptionalFloat(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function buildHeaderIndex(headerLine: string): Map<string, number> {
  const headers = parseCsvLine(headerLine);
  return new Map(headers.map((header, index) => [normalizeHeader(header), index]));
}

function getColumnValue(
  cols: string[],
  headerIndex: Map<string, number>,
  ...headerNames: string[]
): string | undefined {
  for (const headerName of headerNames) {
    const index = headerIndex.get(normalizeHeader(headerName));
    if (index !== undefined) {
      return cols[index]?.trim();
    }
  }

  return undefined;
}

function resolveQuantity(addToQuantity: string | undefined, totalQuantity: string | undefined): number {
  const addQuantity = parseOptionalInt(addToQuantity);
  if (addQuantity !== null) {
    return addQuantity;
  }

  const total = parseOptionalInt(totalQuantity);
  return total ?? 0;
}

function resolveCondition(
  condition: string | undefined,
  printing: string | undefined,
): string {
  const baseCondition = condition || 'Near Mint';

  if (printing && /foil/i.test(printing) && !/foil/i.test(baseCondition)) {
    return `${baseCondition} Foil`;
  }

  return baseCondition;
}

/**
 * Parse TCGPlayer collection/mobile-app CSV export formats.
 *
 * Supported headers include both the older 16-column export and newer 18-column
 * collection export with Product ID + Printing columns.
 */
export function parseCsv(content: string): ImportResult {
  const trimmedContent = content.trim();

  if (trimmedContent === '') {
    return {
      source: 'csv',
      cards: [],
      errors: [],
      totalRows: 0,
    };
  }

  const lines = trimmedContent.split(/\r?\n/);
  if (lines.length === 0) {
    return {
      source: 'csv',
      cards: [],
      errors: [],
      totalRows: 0,
    };
  }

  const headerIndex = buildHeaderIndex(lines[0]);
  const dataLines = lines.slice(1);

  const cards: ImportedCard[] = [];
  const errors: string[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i].trim();
    if (!line) continue;

    const rowNumber = i + 2;

    try {
      const cols = parseCsvLine(line);

      const tcgProductIdStr = getColumnValue(cols, headerIndex, 'Product ID');
      const tcgplayerIdStr = getColumnValue(cols, headerIndex, 'TCGplayer Id');
      const productLine = getColumnValue(cols, headerIndex, 'Product Line');
      const setName = getColumnValue(cols, headerIndex, 'Set Name');
      const productName = getColumnValue(cols, headerIndex, 'Product Name');
      const title = getColumnValue(cols, headerIndex, 'Title');
      const number = getColumnValue(cols, headerIndex, 'Number');
      const printing = getColumnValue(cols, headerIndex, 'Printing');
      const rarity = getColumnValue(cols, headerIndex, 'Rarity');
      const condition = getColumnValue(cols, headerIndex, 'Condition');
      const marketPriceStr = getColumnValue(cols, headerIndex, 'TCG Market Price');
      const totalQuantityStr = getColumnValue(cols, headerIndex, 'Total Quantity');
      const addToQuantityStr = getColumnValue(cols, headerIndex, 'Add to Quantity');
      const photoUrl = getColumnValue(cols, headerIndex, 'Photo URL');

      if (!productLine || !setName || !productName) {
        errors.push(
          `Row ${rowNumber}: Missing required fields (Product Line, Set Name, or Product Name)`,
        );
        continue;
      }

      const parsedProductId = parseOptionalInt(tcgProductIdStr);
      const parsedPhotoUrl = photoUrl || null;

      const card: ImportedCard = {
        tcgplayerId: parseOptionalInt(tcgplayerIdStr),
        tcgProductId: parsedProductId ?? extractProductId(parsedPhotoUrl),
        productLine,
        setName,
        productName,
        title: title || null,
        number: number || null,
        rarity: rarity || null,
        condition: resolveCondition(condition, printing),
        quantity: resolveQuantity(addToQuantityStr, totalQuantityStr),
        snapshotMarketPrice: parseOptionalFloat(marketPriceStr),
        photoUrl: parsedPhotoUrl,
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
  if (!match) return null;

  const productId = Number.parseInt(match[1], 10);
  return Number.isNaN(productId) ? null : productId;
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
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
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

  result.push(current);

  return result;
}
