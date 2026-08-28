export interface CollectionCsvRow {
  rowNumber: number;
  tcgProductId: number | null;
  tcgplayerId: number | null;
  productLine: string;
  setName: string;
  productName: string;
  title: string | null;
  number: string | null;
  rarity: string | null;
  condition: string;
  printing: string | null;
  finish: 'Normal' | 'Foil';
  quantity: number;
  snapshotMarketPrice: number | null;
  photoUrl: string | null;
  warnings: string[];
}

export interface CollectionCsvParseResult {
  source: 'tcgplayer_collection_csv';
  totalRows: number;
  rows: CollectionCsvRow[];
  errors: string[];
  warnings: string[];
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseOptionalFloat(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalInt(value: string | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
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

function extractProductId(photoUrl: string | null): number | null {
  if (!photoUrl) {
    return null;
  }

  const match = photoUrl.match(/\/product\/(\d+)/);
  if (!match) {
    return null;
  }

  const productId = Number.parseInt(match[1], 10);
  return Number.isNaN(productId) ? null : productId;
}

function resolveQuantity(
  totalQuantity: string | undefined,
  addToQuantity: string | undefined,
  warnings: string[],
): number {
  const total = parseOptionalInt(totalQuantity);
  const add = parseOptionalInt(addToQuantity);

  if (total !== null) {
    if (add !== null && add !== total) {
      warnings.push(
        'Add to Quantity is present but ignored because collection imports use Total Quantity as the imported quantity',
      );
    }
    return total;
  }

  if (add !== null) {
    return add;
  }

  return 0;
}

function resolveFinish(printing: string | undefined): 'Normal' | 'Foil' {
  return /foil/i.test(printing || '') ? 'Foil' : 'Normal';
}

export function parseTcgplayerCollectionCsv(
  content: string,
): CollectionCsvParseResult {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return {
      source: 'tcgplayer_collection_csv',
      totalRows: 0,
      rows: [],
      errors: [],
      warnings: [],
    };
  }

  const lines = trimmedContent.split(/\r?\n/);
  const headerIndex = buildHeaderIndex(lines[0]);
  const dataLines = lines.slice(1);
  const rows: CollectionCsvRow[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (let index = 0; index < dataLines.length; index += 1) {
    const line = dataLines[index].trim();
    if (!line) {
      continue;
    }

    const rowNumber = index + 2;
    const rowWarnings: string[] = [];

    try {
      const cols = parseCsvLine(line);
      const productId = getColumnValue(cols, headerIndex, 'Product ID');
      const tcgplayerId = getColumnValue(cols, headerIndex, 'TCGplayer Id');
      const productLine = getColumnValue(cols, headerIndex, 'Product Line');
      const setName = getColumnValue(cols, headerIndex, 'Set Name');
      const productName = getColumnValue(cols, headerIndex, 'Product Name');
      const title = getColumnValue(cols, headerIndex, 'Title');
      const number = getColumnValue(cols, headerIndex, 'Number');
      const rarity = getColumnValue(cols, headerIndex, 'Rarity');
      const condition = getColumnValue(cols, headerIndex, 'Condition');
      const printing = getColumnValue(cols, headerIndex, 'Printing');
      const marketPrice = getColumnValue(cols, headerIndex, 'TCG Market Price');
      const totalQuantity = getColumnValue(cols, headerIndex, 'Total Quantity');
      const addToQuantity = getColumnValue(cols, headerIndex, 'Add to Quantity');
      const photoUrl = getColumnValue(cols, headerIndex, 'Photo URL');

      if (!productLine || !setName || !productName) {
        errors.push(
          `Row ${rowNumber}: Missing required fields (Product Line, Set Name, or Product Name)`,
        );
        continue;
      }

      const quantity = resolveQuantity(totalQuantity, addToQuantity, rowWarnings);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        errors.push(`Row ${rowNumber}: Total Quantity must be a positive integer`);
        continue;
      }

      const parsedPhotoUrl = photoUrl || null;
      const tcgProductId =
        parseOptionalInt(productId) ?? extractProductId(parsedPhotoUrl);

      if (!tcgProductId) {
        rowWarnings.push('Missing Product ID; catalog matching will use set/number when possible');
      }

      rows.push({
        rowNumber,
        tcgProductId,
        tcgplayerId: parseOptionalInt(tcgplayerId),
        productLine,
        setName,
        productName,
        title: title || null,
        number: number || null,
        rarity: rarity || null,
        condition: condition || 'Near Mint',
        printing: printing || null,
        finish: resolveFinish(printing),
        quantity,
        snapshotMarketPrice: parseOptionalFloat(marketPrice),
        photoUrl: parsedPhotoUrl,
        warnings: rowWarnings,
      });
      warnings.push(...rowWarnings.map((warning) => `Row ${rowNumber}: ${warning}`));
    } catch (error) {
      errors.push(
        `Row ${rowNumber}: Parse error - ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    source: 'tcgplayer_collection_csv',
    totalRows: dataLines.filter((line) => line.trim()).length,
    rows,
    errors,
    warnings,
  };
}
