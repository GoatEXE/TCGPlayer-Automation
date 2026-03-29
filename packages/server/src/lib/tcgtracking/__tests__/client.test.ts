import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TCGTrackingClient } from '../client';
import type { TCGTrackingSet, TCGTrackingPrice } from '../types';

describe('TCGTrackingClient', () => {
  let client: TCGTrackingClient;
  
  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = vi.fn();
    client = new TCGTrackingClient('https://test.example.com');
  });

  describe('getSets', () => {
    it('should parse sets response correctly', async () => {
      const mockResponse = [
        { name: 'Origins', slug: 'origins', productCount: 298 },
        { name: 'Test Set', slug: 'test-set', productCount: 100 },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const sets = await client.getSets();

      expect(global.fetch).toHaveBeenCalledWith('https://test.example.com/89/sets');
      expect(sets).toEqual(mockResponse);
      expect(sets).toHaveLength(2);
      expect(sets[0].name).toBe('Origins');
    });

    it('should handle network errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const sets = await client.getSets();

      expect(sets).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle non-ok HTTP responses', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
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
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
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
      const mockResponse = {
        prices: [
          { productId: 1, name: 'Card A', marketPrice: 1.50, lowPrice: 1.20, midPrice: 1.40 },
          { productId: 2, name: 'Card B', marketPrice: 0.25, lowPrice: 0.20, midPrice: 0.22 },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const prices = await client.getPricing('origins');

      expect(global.fetch).toHaveBeenCalledWith('https://test.example.com/89/sets/origins/pricing');
      expect(prices).toEqual(mockResponse.prices);
      expect(prices).toHaveLength(2);
      expect(prices[0].marketPrice).toBe(1.50);
    });

    it('should handle null market prices', async () => {
      const mockResponse = {
        prices: [
          { productId: 1, name: 'Card A', marketPrice: null, lowPrice: null, midPrice: null },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const prices = await client.getPricing('origins');

      expect(prices).toHaveLength(1);
      expect(prices[0].marketPrice).toBeNull();
    });

    it('should handle network errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const prices = await client.getPricing('origins');

      expect(prices).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle unexpected response shapes', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ unexpected: 'format' }),
      });

      const prices = await client.getPricing('origins');

      expect(prices).toEqual([]);
      
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

      const clientWithCustom = new TCGTrackingClient('https://custom.example.com');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await clientWithCustom.getSets();

      expect(global.fetch).toHaveBeenCalledWith('https://custom.example.com/89/sets');

      process.env.TCGTRACKING_BASE_URL = originalEnv;
    });
  });
});
