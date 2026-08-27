import { describe, it, expect } from 'vitest';
import { calculatePrice } from '../engine';
import type { PricingInput, PricingResult } from '../types';

describe('calculatePrice', () => {
  it('returns needs_attention for null market price', () => {
    const input: PricingInput = { marketPrice: null };

    const result = calculatePrice(input);

    expect(result.status).toBe('needs_attention');
    expect(result.listingPrice).toBeNull();
    expect(result.reason).toBe('No usable market price available');
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0,
    -0.01,
  ])('returns needs_attention for unusable market price %s', (marketPrice) => {
    const result = calculatePrice({ marketPrice });

    expect(result).toMatchObject({
      status: 'needs_attention',
      listingPrice: null,
      reason: 'No usable market price available',
    });
  });

  it('keeps every positive price ready to list, including the former gift threshold range', () => {
    const result = calculatePrice({ marketPrice: 0.03 });

    expect(result).toEqual({
      status: 'matched',
      listingPrice: 0.03,
      reason: 'Priced at 98% of market — ready to list',
    });
  });

  it('calculates a rounded recommendation for a valid market price', () => {
    const result = calculatePrice({ marketPrice: 2.99, priceMultiplier: 0.98 });

    expect(result.status).toBe('matched');
    expect(result.listingPrice).toBe(2.93);
    expect(result.reason).toContain('98%');
  });

  it('uses a custom multiplier without a minimum-listing-price setting', () => {
    const result = calculatePrice({ marketPrice: 1, priceMultiplier: 0.95 });

    expect(result.status).toBe('matched');
    expect(result.listingPrice).toBe(0.95);
    expect(result.reason).toContain('95%');
  });

  it('uses the normal default multiplier when not provided', () => {
    const input: PricingInput = { marketPrice: 1 };
    const result: PricingResult = calculatePrice(input);

    expect(result).toMatchObject({ status: 'matched', listingPrice: 0.98 });
  });
});
