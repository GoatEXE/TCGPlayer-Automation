export interface Card {
  id: number;
  tcgplayerId: number | null;
  productLine: string;
  setName: string | null;
  productName: string;
  title: string | null;
  number: string | null;
  rarity: string | null;
  condition: string;
  quantity: number;
  status: 'pending' | 'matched' | 'listed' | 'needs_attention' | 'gift' | 'error';
  marketPrice: string | null;
  listingPrice: string | null;
  photoUrl: string | null;
  notes: string | null;
  importedAt: string;
  updatedAt: string;
}

export interface CardStats {
  total: number;
  pending: number;
  matched: number;
  listed: number;
  gift: number;
  needs_attention: number;
  error: number;
}

export interface GetCardsParams {
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
}

export interface GetCardsResponse {
  cards: Card[];
  total: number;
  page: number;
  limit: number;
}

export interface ImportResult {
  imported: number;
  errors: string[];
  cards: Card[];
}

export interface RepriceAllResult {
  updated: number;
}

export interface ApiError {
  error: string;
  message: string;
}
