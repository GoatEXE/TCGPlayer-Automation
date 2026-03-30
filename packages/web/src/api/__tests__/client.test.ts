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

      await api.getCards({ status: 'listed', page: 2, limit: 25, search: 'test' });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards?status=listed&page=2&limit=25&search=test',
        expect.any(Object)
      );
    });

    it('omits undefined params from query string', async () => {
      const mockResponse = { cards: [], total: 0, page: 1, limit: 50 };
      mockFetch(mockResponse);

      await api.getCards({ status: 'listed' });

      expect(global.fetch).toHaveBeenCalledWith('/api/cards?status=listed', expect.any(Object));
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
        })
      );
      expect(result).toEqual(mockResult);
    });

    it('throws error on failed import', async () => {
      mockFetch({ error: 'Invalid file format' }, false, 400);

      const file = new File(['test'], 'cards.csv', { type: 'text/csv' });

      await expect(api.importCards(file)).rejects.toThrow('Invalid file format');
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
        })
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
        })
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('repriceCard', () => {
    it('sends POST request to reprice endpoint', async () => {
      const mockCard: Partial<Card> = { id: 1, marketPrice: '5.99', listingPrice: '5.87' };
      mockFetch(mockCard);

      await api.repriceCard(1);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards/1/reprice',
        expect.objectContaining({
          method: 'POST',
          headers: {},
        })
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
        })
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
