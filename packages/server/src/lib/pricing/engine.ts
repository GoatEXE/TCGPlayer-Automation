import type { PricingInput, PricingResult } from './types.js';

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

/**
 * Builds the normal Ready-to-List recommendation. Every positive market price
 * is eligible; only unavailable, non-finite, zero, or negative values need
 * manual attention. The retired `gift` status is deliberately never emitted.
 */
export function calculatePrice(input: PricingInput): PricingResult {
  const { marketPrice, priceMultiplier = DEFAULT_PRICE_MULTIPLIER } = input;

  if (
    marketPrice === null ||
    !Number.isFinite(marketPrice) ||
    marketPrice <= 0
  ) {
    return {
      listingPrice: null,
      status: 'needs_attention',
      reason: 'No usable market price available',
    };
  }

  const calculatedPrice = marketPrice * priceMultiplier;
  const listingPrice = Math.round(calculatedPrice * 100) / 100;
  const multiplierPercent = Math.round(priceMultiplier * 100);

  return {
    listingPrice,
    status: 'matched',
    reason: `Priced at ${multiplierPercent}% of market — ready to list`,
  };
}
