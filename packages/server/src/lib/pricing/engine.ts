import type { PricingInput, PricingResult } from './types';

const DEFAULT_MIN_LISTING_PRICE_CENTS = 5;
const DEFAULT_PRICE_MULTIPLIER = 0.98;

export function applyFloorPriceCents({
  listingPrice,
  floorPriceCents,
}: {
  listingPrice: number | null;
  floorPriceCents: number | null | undefined;
}): number | null {
  if (listingPrice === null || floorPriceCents == null) {
    return listingPrice;
  }

  return Math.max(listingPrice, floorPriceCents / 100);
}

export function calculatePrice(input: PricingInput): PricingResult {
  const {
    marketPrice,
    minListingPriceCents = DEFAULT_MIN_LISTING_PRICE_CENTS,
    priceMultiplier = DEFAULT_PRICE_MULTIPLIER,
  } = input;

  // Handle null market price
  if (marketPrice === null) {
    return {
      listingPrice: null,
      status: 'needs_attention',
      reason: 'No market price available',
    };
  }

  // Convert minimum threshold from cents to dollars
  const minThreshold = minListingPriceCents / 100;

  // Check if below minimum threshold
  if (marketPrice < minThreshold) {
    return {
      listingPrice: null,
      status: 'gift',
      reason: 'Market price below minimum threshold',
    };
  }

  // Calculate listing price and round to nearest cent
  const calculatedPrice = marketPrice * priceMultiplier;
  const listingPrice = Math.round(calculatedPrice * 100) / 100;

  const multiplierPercent = Math.round(priceMultiplier * 100);

  return {
    listingPrice,
    status: 'matched',
    reason: `Priced at ${multiplierPercent}% of market — ready to list`,
  };
}
