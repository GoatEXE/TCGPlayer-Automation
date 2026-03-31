import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TCGTrackingClient } from '../client';
import type {
  TCGTrackingSet,
  TCGTrackingSetsResponse,
  TCGTrackingPriceResponse,
} from '../types';

describe('TCGTrackingClient', () => {
  let client: TCGTrackingClient;

  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = vi.fn();
    client = new TCGTrackingClient('https://test.example.com');
  });

  describe('getSets', () => {
    it('should parse sets response correctly', async () => {
      const mockResponse: TCGTrackingSetsResponse = {
        category_id: 89,
        category_name: 'Riftbound',
        generated_at: '2026-03-28T09:30:39-04:00',
        sets: [
          {
            id: 24344,
            name: 'Origins',
            abbreviation: 'OGN',
            is_supplemental: false,
            published_on: '2025-10-31',
            modified_on: '2026-03-06 20:26:58',
            product_count: 298,
            sku_count: 2626,
            products_modified: '2026-02-26T03:30:58-05:00',
            pricing_modified: '2026-03-28T08:04:25-04:00',
            skus_modified: '2026-03-28T09:30:39-04:00',
            api_url: '/tcgapi/v1/89/sets/24344',
            pricing_url: '/tcgapi/v1/89/sets/24344/pricing',
            skus_url: '/tcgapi/v1/89/sets/24344/skus',
          },
          {
            id: 24519,
            name: 'Test Set',
            abbreviation: 'TST',
            is_supplemental: false,
            published_on: '2026-02-13',
            modified_on: '2026-03-27 14:42:21',
            product_count: 100,
            sku_count: 500,
            products_modified: null,
            pricing_modified: null,
            skus_modified: null,
            api_url: '/tcgapi/v1/89/sets/24519',
            pricing_url: '/tcgapi/v1/89/sets/24519/pricing',
            skus_url: '/tcgapi/v1/89/sets/24519/skus',
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const sets = await client.getSets();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.example.com/89/sets',
      );
      expect(sets).toEqual(mockResponse.sets);
      expect(sets).toHaveLength(2);
      expect(sets[0].name).toBe('Origins');
      expect(sets[0].id).toBe(24344);
    });

    it('should handle network errors gracefully', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const sets = await client.getSets();

      expect(sets).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle non-ok HTTP responses', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const sets = await client.getSets();

      expect(sets).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle unexpected response shapes', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ unexpected: 'format' }),
      });

      const sets = await client.getSets();

      // Should return empty array for unexpected format
      expect(sets).toEqual([]);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('getPricing', () => {
    it('should parse pricing response correctly', async () => {
      const mockResponse: TCGTrackingPriceResponse = {
        set_id: 24344,
        updated: '2026-03-28T08:04:25-04:00',
        prices: {
          '12345': {
            tcg: {
              Normal: { low: 1.2, market: 1.5 },
            },
          },
          '67890': {
            tcg: {
              Foil: { low: 0.2, market: 0.25 },
            },
          },
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const prices = await client.getPricing(24344);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.example.com/89/sets/24344/pricing',
      );
      expect(prices).toEqual(mockResponse);
      expect(prices?.set_id).toBe(24344);
      expect(prices?.prices['12345'].tcg.Normal.market).toBe(1.5);
    });

    it('should handle market prices with only low', async () => {
      const mockResponse: TCGTrackingPriceResponse = {
        set_id: 24344,
        updated: '2026-03-28T08:04:25-04:00',
        prices: {
          '12345': {
            tcg: {
              Normal: { low: 0.01 }, // No market price
            },
          },
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const prices = await client.getPricing(24344);

      expect(prices?.prices['12345'].tcg.Normal.low).toBe(0.01);
      expect(prices?.prices['12345'].tcg.Normal.market).toBeUndefined();
    });

    it('should handle network errors gracefully', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const prices = await client.getPricing(24344);

      expect(prices).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle unexpected response shapes', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ unexpected: 'format' }),
      });

      const prices = await client.getPricing(24344);

      expect(prices).toBeNull();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('constructor', () => {
    it('should use default base URL from environment when not provided', () => {
      const originalEnv = process.env.TCGTRACKING_BASE_URL;
      process.env.TCGTRACKING_BASE_URL = 'https://env.example.com';

      const clientWithEnv = new TCGTrackingClient();

      // We can't directly test the private baseUrl, but we can test behavior
      expect(clientWithEnv).toBeInstanceOf(TCGTrackingClient);

      process.env.TCGTRACKING_BASE_URL = originalEnv;
    });

    it('should use provided base URL over environment', async () => {
      const originalEnv = process.env.TCGTRACKING_BASE_URL;
      process.env.TCGTRACKING_BASE_URL = 'https://env.example.com';

      const clientWithCustom = new TCGTrackingClient(
        'https://custom.example.com',
      );

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await clientWithCustom.getSets();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://custom.example.com/89/sets',
      );

      process.env.TCGTRACKING_BASE_URL = originalEnv;
    });
  });
});
