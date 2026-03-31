export interface CapDownwardListingPriceChangeInput {
  previousListingPrice: number | null;
  nextListingPrice: number | null;
  maxPriceDropPercent: number;
}

export function capDownwardListingPriceChange(
  input: CapDownwardListingPriceChangeInput,
): number | null {
  const { previousListingPrice, nextListingPrice, maxPriceDropPercent } = input;

  if (previousListingPrice === null || nextListingPrice === null) {
    return nextListingPrice;
  }

  if (previousListingPrice <= 0 || nextListingPrice >= previousListingPrice) {
    return nextListingPrice;
  }

  const normalizedMaxDropPercent = Math.min(
    Math.max(maxPriceDropPercent, 0),
    100,
  );

  const previousListingPriceCents = Math.round(previousListingPrice * 100);
  const nextListingPriceCents = Math.round(nextListingPrice * 100);
  const minimumAllowedPriceCents = Math.ceil(
    previousListingPriceCents * (1 - normalizedMaxDropPercent / 100),
  );

  if (nextListingPriceCents >= minimumAllowedPriceCents) {
    return nextListingPrice;
  }

  return minimumAllowedPriceCents / 100;
}
