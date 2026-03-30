export interface ImportedCard {
  tcgplayerId: number | null; // from CSV only (SKU ID)
  tcgProductId: number | null; // extracted from photo URL (product ID for price matching)
  productLine: string; // "Riftbound: League of Legends Trading Card Game"
  setName: string; // "Origins"
  productName: string; // card name
  title: string | null; // usually empty
  number: string | null; // "289/298"
  rarity: string | null; // "Uncommon", "Common", etc. (CSV only)
  condition: string; // "Near Mint" (default if not in source)
  quantity: number; // from Add to Quantity (CSV) or leading number (TXT)
  snapshotMarketPrice: number | null; // from CSV TCG Market Price (informational)
  photoUrl: string | null; // from CSV only
}

export type ImportSource = 'csv' | 'txt';

export interface ImportResult {
  source: ImportSource;
  cards: ImportedCard[];
  errors: string[]; // any rows that failed to parse
  totalRows: number; // total rows attempted
}
