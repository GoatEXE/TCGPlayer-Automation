export interface TCGTrackingSet {
  id: number;
  name: string;
  abbreviation: string;
  is_supplemental: boolean;
  published_on: string;
  modified_on: string;
  product_count: number;
  sku_count: number;
  products_modified: string | null;
  pricing_modified: string | null;
  skus_modified: string | null;
  api_url: string;
  pricing_url: string;
  skus_url: string;
}

export interface TCGTrackingSetsResponse {
  category_id: number;
  category_name: string;
  generated_at: string;
  sets: TCGTrackingSet[];
}

export interface TCGTrackingProduct {
  id?: number;
  product_id?: number;
  tcgplayer_id?: number;
  tcg_product_id?: number;
  name?: string;
  product_name?: string;
  title?: string | null;
  number?: string | null;
  collector_number?: string | null;
  card_number?: string | null;
  rarity?: string | null;
  image_url?: string | null;
  photo_url?: string | null;
  url?: string | null;
  [key: string]: unknown;
}

export type TCGTrackingProductCollection =
  | TCGTrackingProduct[]
  | Record<string, TCGTrackingProduct>;

export interface TCGTrackingProductsResponse {
  set_id?: number;
  updated?: string;
  products?: TCGTrackingProductCollection;
  data?: TCGTrackingProductCollection;
  results?: TCGTrackingProductCollection;
  cards?: TCGTrackingProductCollection;
}

export interface TCGTrackingConditionPrice {
  low?: number;
  market?: number;
}

export interface TCGTrackingProductPrice {
  tcg: {
    [condition: string]: TCGTrackingConditionPrice; // "Normal", "Foil", etc.
  };
}

export interface TCGTrackingPriceResponse {
  set_id: number;
  updated: string;
  prices: {
    [productId: string]: TCGTrackingProductPrice;
  };
}
