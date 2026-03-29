import { describe, it, expect } from 'vitest';
import { calculatePrice } from '../engine';
import type { PricingInput, PricingResult } from '../types';

describe('calculatePrice', () => {
  it('should return needs_attention for null market price', () => {
    const input: PricingInput = {
      marketPrice: null,
    };

    const result = calculatePrice(input);

    expect(result.status).toBe('needs_attention');
    expect(result.listingPrice).toBeNull();
    expect(result.reason).toBe('No market price available');
  });

  it('should return gift status for price below minimum threshold ($0.03 < $0.05)', () => {
    const input: PricingInput = {
      marketPrice: 0.03,
      minListingPriceCents: 5,
    };

    const result = calculatePrice(input);

    expect(result.status).toBe('gift');
    expect(result.listingPrice).toBeNull();
    expect(result.reason).toBe('Market price below minimum threshold');
  });

  it('should list price at exactly the threshold ($0.05)', () => {
    const input: PricingInput = {
      marketPrice: 0.05,
      minListingPriceCents: 5,
      priceMultiplier: 0.98,
    };

    const result = calculatePrice(input);

    expect(result.status).toBe('listed');
    expect(result.listingPrice).toBe(0.05); // 0.05 * 0.98 = 0.049, rounds to 0.05
    expect(result.reason).toContain('98%');
  });

  it('should calculate listing price for $1.00 market price', () => {
    const input: PricingInput = {
      marketPrice: 1.0,
      priceMultiplier: 0.98,
    };

    const result = calculatePrice(input);

    expect(result.status).toBe('listed');
    expect(result.listingPrice).toBe(0.98);
    expect(result.reason).toContain('98%');
  });

  it('should round to nearest cent for $0.49 market price', () => {
    const input: PricingInput = {
      marketPrice: 0.49,
      priceMultiplier: 0.98,
    };

    const result = calculatePrice(input);

    expect(result.status).toBe('listed');
    expect(result.listingPrice).toBe(0.48); // 0.49 * 0.98 = 0.4802, rounds to 0.48
    expect(result.reason).toContain('98%');
  });

  it('should calculate listing price for $2.99 market price', () => {
    const input: PricingInput = {
      marketPrice: 2.99,
      priceMultiplier: 0.98,
    };

    const result = calculatePrice(input);

    expect(result.status).toBe('listed');
    expect(result.listingPrice).toBe(2.93); // 2.99 * 0.98 = 2.9302, rounds to 2.93
    expect(result.reason).toContain('98%');
  });

  it('should use custom multiplier (0.95)', () => {
    const input: PricingInput = {
      marketPrice: 1.0,
      priceMultiplier: 0.95,
    };

    const result = calculatePrice(input);

    expect(result.status).toBe('listed');
    expect(result.listingPrice).toBe(0.95);
    expect(result.reason).toContain('95%');
  });

  it('should use custom minimum threshold (50 cents)', () => {
    const input: PricingInput = {
      marketPrice: 0.49,
      minListingPriceCents: 50,
    };

    const result = calculatePrice(input);

    expect(result.status).toBe('gift');
    expect(result.listingPrice).toBeNull();
    expect(result.reason).toBe('Market price below minimum threshold');
  });

  it('should return gift status for zero market price', () => {
    const input: PricingInput = {
      marketPrice: 0,
      minListingPriceCents: 5,
    };

    const result = calculatePrice(input);

    expect(result.status).toBe('gift');
    expect(result.listingPrice).toBeNull();
    expect(result.reason).toBe('Market price below minimum threshold');
  });

  it('should calculate listing price for very high price ($100)', () => {
    const input: PricingInput = {
      marketPrice: 100.0,
      priceMultiplier: 0.98,
    };

    const result = calculatePrice(input);

    expect(result.status).toBe('listed');
    expect(result.listingPrice).toBe(98.0);
    expect(result.reason).toContain('98%');
  });

  it('should use default values when not provided', () => {
    const input: PricingInput = {
      marketPrice: 1.0,
    };

    const result = calculatePrice(input);

    expect(result.status).toBe('listed');
    expect(result.listingPrice).toBe(0.98); // default 0.98 multiplier
  });
});
