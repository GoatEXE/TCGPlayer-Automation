export interface PricingInput {
  marketPrice: number | null;
  priceMultiplier?: number; // default: 0.98 (from env LISTING_PRICE_MULTIPLIER)
}

export interface PricingResult {
  listingPrice: number | null; // null when there is no usable market price
  status: 'matched' | 'needs_attention';
  reason: string; // human-readable explanation
}
