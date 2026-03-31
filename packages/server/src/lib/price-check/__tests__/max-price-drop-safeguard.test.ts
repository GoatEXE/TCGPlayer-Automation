import { describe, expect, it } from 'vitest';
import { capDownwardListingPriceChange } from '../max-price-drop-safeguard.js';

describe('capDownwardListingPriceChange', () => {
  it('returns the proposed price when there is no previous listing price', () => {
    expect(
      capDownwardListingPriceChange({
        previousListingPrice: null,
        nextListingPrice: 0.5,
        maxPriceDropPercent: 20,
      }),
    ).toBe(0.5);
  });

  it('returns the proposed price for upward changes', () => {
    expect(
      capDownwardListingPriceChange({
        previousListingPrice: 1,
        nextListingPrice: 1.1,
        maxPriceDropPercent: 20,
      }),
    ).toBe(1.1);
  });

  it('returns the proposed price for flat changes', () => {
    expect(
      capDownwardListingPriceChange({
        previousListingPrice: 1,
        nextListingPrice: 1,
        maxPriceDropPercent: 20,
      }),
    ).toBe(1);
  });

  it('returns the proposed price when the drop is within the allowed percent', () => {
    expect(
      capDownwardListingPriceChange({
        previousListingPrice: 1,
        nextListingPrice: 0.85,
        maxPriceDropPercent: 20,
      }),
    ).toBe(0.85);
  });

  it('caps a larger downward change at the configured percent rounded up to the nearest cent', () => {
    expect(
      capDownwardListingPriceChange({
        previousListingPrice: 0.99,
        nextListingPrice: 0.75,
        maxPriceDropPercent: 20,
      }),
    ).toBe(0.8);
  });

  it('preserves null next prices for gift or needs-attention transitions', () => {
    expect(
      capDownwardListingPriceChange({
        previousListingPrice: 1,
        nextListingPrice: null,
        maxPriceDropPercent: 20,
      }),
    ).toBeNull();
  });
});
