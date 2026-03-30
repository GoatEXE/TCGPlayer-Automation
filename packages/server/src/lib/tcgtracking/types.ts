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
