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
  status:
    | 'pending'
    | 'matched'
    | 'listed'
    | 'needs_attention'
    | 'gift'
    | 'error';
  marketPrice: string | null;
  listingPrice: string | null;
  isFoilPrice: boolean;
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
  updated: number;
  errors: string[];
  cards: Card[];
}

export interface RepriceAllResult {
  updated: number;
}

export interface FetchPricesResult {
  updated: number;
  notFound: number;
  errors: string[];
}

export interface MarkListedResult {
  updated: number;
  errors: string[];
}

export interface ApiError {
  error: string;
  message: string;
}
