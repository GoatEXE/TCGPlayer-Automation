import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../client';
import type { Card, CardStats, ImportResult } from '../types';

// Mock fetch globally
global.fetch = vi.fn();

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockFetch = (data: any, ok = true, status = 200) => {
    (global.fetch as any).mockResolvedValueOnce({
      ok,
      status,
      json: async () => data,
    });
  };

  describe('getCards', () => {
    it('fetches cards with no params', async () => {
      const mockResponse = { cards: [], total: 0, page: 1, limit: 50 };
      mockFetch(mockResponse);

      const result = await api.getCards();

      expect(global.fetch).toHaveBeenCalledWith('/api/cards', {
        headers: {},
      });
      expect(result).toEqual(mockResponse);
    });

    it('fetches cards with query params', async () => {
      const mockResponse = { cards: [], total: 0, page: 2, limit: 25 };
      mockFetch(mockResponse);

      await api.getCards({
        status: 'listed',
        page: 2,
        limit: 25,
        search: 'test',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards?status=listed&page=2&limit=25&search=test',
        expect.any(Object),
      );
    });

    it('omits undefined params from query string', async () => {
      const mockResponse = { cards: [], total: 0, page: 1, limit: 50 };
      mockFetch(mockResponse);

      await api.getCards({ status: 'listed' });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards?status=listed',
        expect.any(Object),
      );
    });
  });

  describe('getStats', () => {
    it('fetches card statistics', async () => {
      const mockStats: CardStats = {
        total: 100,
        pending: 10,
        listed: 70,
        gift: 15,
        needs_attention: 3,
        error: 2,
      };
      mockFetch(mockStats);

      const result = await api.getStats();

      expect(global.fetch).toHaveBeenCalledWith('/api/cards/stats', {
        headers: {},
      });
      expect(result).toEqual(mockStats);
    });
  });

  describe('importCards', () => {
    it('uploads file as multipart form data', async () => {
      const mockResult: ImportResult = {
        imported: 10,
        errors: [],
        cards: [],
      };
      mockFetch(mockResult);

      const file = new File(['test'], 'cards.csv', { type: 'text/csv' });
      const result = await api.importCards(file);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards/import',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );
      expect(result).toEqual(mockResult);
    });

    it('throws error on failed import', async () => {
      mockFetch({ error: 'Invalid file format' }, false, 400);

      const file = new File(['test'], 'cards.csv', { type: 'text/csv' });

      await expect(api.importCards(file)).rejects.toThrow(
        'Invalid file format',
      );
    });
  });

  describe('updateCard', () => {
    it('sends PATCH request with partial card data', async () => {
      const mockCard: Partial<Card> = { id: 1, quantity: 5, notes: 'Updated' };
      mockFetch(mockCard);

      await api.updateCard(1, { quantity: 5, notes: 'Updated' });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ quantity: 5, notes: 'Updated' }),
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
  });

  describe('deleteCard', () => {
    it('sends DELETE request', async () => {
      mockFetch({ success: true });

      const result = await api.deleteCard(1);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards/1',
        expect.objectContaining({
          method: 'DELETE',
          headers: {},
        }),
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('repriceCard', () => {
    it('sends POST request to reprice endpoint', async () => {
      const mockCard: Partial<Card> = {
        id: 1,
        marketPrice: '5.99',
        listingPrice: '5.87',
      };
      mockFetch(mockCard);

      await api.repriceCard(1);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards/1/reprice',
        expect.objectContaining({
          method: 'POST',
          headers: {},
        }),
      );
    });
  });

  describe('repriceAll', () => {
    it('sends POST request to reprice all endpoint', async () => {
      mockFetch({ updated: 42 });

      const result = await api.repriceAll();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards/reprice-all',
        expect.objectContaining({
          method: 'POST',
          headers: {},
        }),
      );
      expect(result).toEqual({ updated: 42 });
    });
  });

  describe('healthCheck', () => {
    it('fetches health status', async () => {
      const mockHealth = { status: 'ok', timestamp: '2026-03-29T00:00:00Z' };
      mockFetch(mockHealth);

      const result = await api.healthCheck();

      expect(global.fetch).toHaveBeenCalledWith('/api/health', {
        headers: {},
      });
      expect(result).toEqual(mockHealth);
    });
  });

  describe('getCardPriceHistory', () => {
    it('fetches price history for a card with default limit', async () => {
      const mockResponse = {
        history: [
          {
            id: 1,
            cardId: 42,
            checkedAt: '2026-03-30T14:30:00Z',
            source: 'scheduled',
            previousMarketPrice: '0.25',
            newMarketPrice: '0.30',
            previousListingPrice: '0.25',
            newListingPrice: '0.29',
            driftPercent: '20.00',
            previousStatus: 'listed',
            newStatus: 'listed',
          },
        ],
      };
      mockFetch(mockResponse);

      const result = await api.getCardPriceHistory(42, 50);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards/42/price-history?limit=50',
        expect.any(Object),
      );
      expect(result).toEqual(mockResponse);
    });

    it('fetches price history without limit', async () => {
      mockFetch({ history: [] });

      await api.getCardPriceHistory(42);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards/42/price-history',
        expect.any(Object),
      );
    });
  });

  describe('updatePriceCheckSettings', () => {
    it('sends POST with intervalHours and returns updated status', async () => {
      const mockResponse = {
        enabled: true,
        intervalHours: 12,
        thresholdPercent: 10,
        running: false,
        lastRun: null,
      };
      mockFetch(mockResponse);

      const result = await api.updatePriceCheckSettings({ intervalHours: 12 });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards/price-check-settings',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ intervalHours: 12 }),
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('throws on server validation error', async () => {
      mockFetch(
        { error: 'intervalHours must be an integer between 1 and 168' },
        false,
        400,
      );

      await expect(
        api.updatePriceCheckSettings({ intervalHours: 0 }),
      ).rejects.toThrow('intervalHours must be an integer between 1 and 168');
    });
  });

  describe('getSalesStats', () => {
    it('fetches sales stats', async () => {
      const mockStats = {
        totalSales: 5,
        totalRevenueCents: 2500,
        averageSaleCents: 500,
        activeListingCount: 12,
        totalListedCount: 12,
      };
      mockFetch(mockStats);

      const result = await api.getSalesStats();

      expect(global.fetch).toHaveBeenCalledWith('/api/sales/stats', {
        headers: {},
      });
      expect(result).toEqual(mockStats);
    });
  });

  describe('getSales', () => {
    it('fetches sales with no params', async () => {
      const mockResponse = { sales: [], total: 0, page: 1, limit: 50 };
      mockFetch(mockResponse);

      const result = await api.getSales();

      expect(global.fetch).toHaveBeenCalledWith('/api/sales', {
        headers: {},
      });
      expect(result).toEqual(mockResponse);
    });

    it('fetches sales with query params', async () => {
      const mockResponse = { sales: [], total: 0, page: 2, limit: 25 };
      mockFetch(mockResponse);

      await api.getSales({
        page: 2,
        limit: 25,
        orderStatus: 'shipped',
        search: 'buyer',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sales?page=2&limit=25&orderStatus=shipped&search=buyer',
        expect.any(Object),
      );
    });
  });

  describe('error handling', () => {
    it('throws error with message from API', async () => {
      mockFetch({ error: 'Card not found' }, false, 404);

      await expect(api.getStats()).rejects.toThrow('Card not found');
    });

    it('throws error with HTTP status when no error message', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(api.getStats()).rejects.toThrow('Request failed');
    });
  });
});
