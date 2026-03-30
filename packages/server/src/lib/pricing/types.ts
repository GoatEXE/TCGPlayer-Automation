export interface PricingInput {
  marketPrice: number | null;
  minListingPriceCents?: number; // default: 5 (from env MIN_LISTING_PRICE_CENTS)
  priceMultiplier?: number; // default: 0.98 (from env LISTING_PRICE_MULTIPLIER)
}

export interface PricingResult {
  listingPrice: number | null; // null if can't price
  status: 'matched' | 'gift' | 'needs_attention';
  reason: string; // human-readable explanation
}
