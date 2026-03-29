export interface TCGTrackingSet {
  name: string;
  slug: string;
  productCount: number;
}

export interface TCGTrackingPrice {
  productId: number;
  name: string;
  marketPrice: number | null; // may be null for some cards
  lowPrice: number | null;
  midPrice: number | null;
}

export interface TCGTrackingPriceResponse {
  prices: TCGTrackingPrice[];
}
