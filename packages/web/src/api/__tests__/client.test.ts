import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../client';
import type {
  Card,
  CardStats,
  ImportResult,
  Sale,
  CreateSaleRequest,
  CreateBulkOrderRequest,
  Expense,
  CreateExpenseRequest,
  UpdateExpenseRequest,
  GetExpensesResponse,
  PerformanceSummaryResponse,
  ExpenseSettings,
  UpdateExpenseSettingsRequest,
} from '../types';

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
        sortField: 'productName',
        sortDirection: 'asc',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards?status=listed&page=2&limit=25&search=test&sortField=productName&sortDirection=asc',
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
        listedPriceAttentionThresholdPercent: 12,
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

    it('sends POST with listedPriceAttentionThresholdPercent and returns updated status', async () => {
      const mockResponse = {
        enabled: true,
        intervalHours: 12,
        thresholdPercent: 10,
        listedPriceAttentionThresholdPercent: 15,
        running: false,
        lastRun: null,
      };
      mockFetch(mockResponse);

      const result = await api.updatePriceCheckSettings({
        listedPriceAttentionThresholdPercent: 15,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cards/price-check-settings',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ listedPriceAttentionThresholdPercent: 15 }),
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

  describe('updateSale', () => {
    it('sends PATCH request with sale update data', async () => {
      const mockSale = { id: 3, orderStatus: 'shipped' };
      mockFetch(mockSale);

      await api.updateSale(3, { orderStatus: 'shipped' });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sales/3',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ orderStatus: 'shipped' }),
          headers: { 'Content-Type': 'application/json' },
        }),
      );
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

  describe('getSaleStatusHistory', () => {
    it('fetches status history for a sale', async () => {
      const mockResponse = {
        history: [
          {
            id: 1,
            previousStatus: 'pending',
            newStatus: 'confirmed',
            source: 'manual',
            note: null,
            changedAt: '2026-03-30T14:00:00.000Z',
          },
        ],
      };
      mockFetch(mockResponse);

      const result = await api.getSaleStatusHistory(5);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sales/5/history',
        expect.objectContaining({ headers: {} }),
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('batchUpdateSaleStatus', () => {
    it('sends PATCH with saleIds, newStatus, and optional note', async () => {
      const mockResponse = { updated: 2, skipped: [] };
      mockFetch(mockResponse);

      const result = await api.batchUpdateSaleStatus({
        saleIds: [1, 2],
        newStatus: 'shipped',
        note: 'Shipped via USPS',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sales/batch-status',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            saleIds: [1, 2],
            newStatus: 'shipped',
            note: 'Shipped via USPS',
          }),
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getSalesPipeline', () => {
    it('fetches sales pipeline summary', async () => {
      const mockResponse = {
        pipeline: [
          { status: 'pending', count: 3, totalCents: 1500 },
          { status: 'confirmed', count: 5, totalCents: 2500 },
        ],
      };
      mockFetch(mockResponse);

      const result = await api.getSalesPipeline();

      expect(global.fetch).toHaveBeenCalledWith('/api/sales/pipeline', {
        headers: {},
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('createShipment', () => {
    it('sends POST to /sales/:id/ship with shipment data', async () => {
      const mockShipment = { id: 1, saleId: 5, carrier: 'USPS' };
      mockFetch(mockShipment);

      const result = await api.createShipment(5, {
        carrier: 'USPS',
        trackingNumber: '9400111899223',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sales/5/ship',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            carrier: 'USPS',
            trackingNumber: '9400111899223',
          }),
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(result).toEqual(mockShipment);
    });
  });

  describe('getShipment', () => {
    it('fetches shipment by sale id', async () => {
      const mockShipment = { id: 1, saleId: 5, carrier: 'USPS' };
      mockFetch(mockShipment);

      const result = await api.getShipment(5);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sales/5/shipment',
        expect.objectContaining({ headers: {} }),
      );
      expect(result).toEqual(mockShipment);
    });
  });

  describe('updateShipment', () => {
    it('sends PATCH to /shipments/:id with update data', async () => {
      const mockShipment = { id: 3, saleId: 5, carrier: 'UPS' };
      mockFetch(mockShipment);

      const result = await api.updateShipment(3, {
        carrier: 'UPS',
        deliveredAt: '2026-04-01T12:00:00Z',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shipments/3',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            carrier: 'UPS',
            deliveredAt: '2026-04-01T12:00:00Z',
          }),
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(result).toEqual(mockShipment);
    });
  });

  describe('getNotificationEvents', () => {
    it('fetches notification events with default limit', async () => {
      const mockResponse = {
        events: [
          {
            id: 1,
            channel: 'telegram',
            eventType: 'sale_confirmed',
            message: 'Sale confirmed for Card A',
            success: true,
            error: null,
            saleId: 5,
            cardId: null,
            tcgplayerOrderId: 'ORD-123',
            createdAt: '2026-04-01T12:00:00.000Z',
          },
        ],
        limit: 50,
      };
      mockFetch(mockResponse);

      const result = await api.getNotificationEvents();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/notifications',
        expect.objectContaining({ headers: {} }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('fetches notification events with custom limit', async () => {
      mockFetch({ events: [], limit: 10 });

      await api.getNotificationEvents(10);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/notifications?limit=10',
        expect.any(Object),
      );
    });
  });

  describe('getExpenses', () => {
    it('fetches expenses with no params', async () => {
      const mockResponse: GetExpensesResponse = {
        expenses: [],
        total: 0,
        page: 1,
        limit: 50,
      };
      mockFetch(mockResponse);

      const result = await api.getExpenses();

      expect(global.fetch).toHaveBeenCalledWith('/api/expenses', {
        headers: {},
      });
      expect(result).toEqual(mockResponse);
    });

    it('fetches expenses with query params', async () => {
      mockFetch({ expenses: [], total: 0, page: 2, limit: 25 });

      await api.getExpenses({
        page: 2,
        limit: 25,
        category: 'shipping',
        source: 'manual',
        search: 'mailer',
        dateFrom: '2026-04-01T00:00:00.000Z',
        dateTo: '2026-04-30T23:59:59.999Z',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/expenses?page=2&limit=25&category=shipping&source=manual&search=mailer&dateFrom=2026-04-01T00%3A00%3A00.000Z&dateTo=2026-04-30T23%3A59%3A59.999Z',
        expect.any(Object),
      );
    });

    it('throws on API error', async () => {
      mockFetch({ error: 'Invalid category' }, false, 400);

      await expect(api.getExpenses({ category: 'shipping' })).rejects.toThrow(
        'Invalid category',
      );
    });
  });

  describe('createExpense', () => {
    it('sends POST to /api/expenses with the expense payload', async () => {
      const mockExpense: Expense = {
        id: 10,
        occurredAt: '2026-04-18T12:00:00.000Z',
        amountCents: 499,
        category: 'shipping',
        subcategory: null,
        description: 'Postage',
        quantity: 1,
        unit: 'order',
        unitCostCents: 499,
        source: 'manual',
        isEstimate: false,
        autoKind: null,
        saleId: null,
        tcgplayerOrderId: 'ORDER-10',
        createdAt: '2026-04-18T12:00:00.000Z',
        updatedAt: '2026-04-18T12:00:00.000Z',
      };
      mockFetch(mockExpense);

      const request: CreateExpenseRequest = {
        amountCents: 499,
        category: 'shipping',
        description: 'Postage',
        quantity: 1,
        unit: 'order',
      };

      const result = await api.createExpense(request);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/expenses',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(result).toEqual(mockExpense);
    });

    it('throws on API error', async () => {
      mockFetch(
        { error: 'amountCents must be a positive integer' },
        false,
        400,
      );

      await expect(
        api.createExpense({ amountCents: 0, category: 'shipping' }),
      ).rejects.toThrow('amountCents must be a positive integer');
    });
  });

  describe('updateExpense', () => {
    it('sends PATCH to /api/expenses/:id with update payload', async () => {
      const mockExpense: Expense = {
        id: 8,
        occurredAt: '2026-04-10T10:00:00.000Z',
        amountCents: 625,
        category: 'supplies',
        subcategory: 'mailers',
        description: 'Updated mailers',
        quantity: 5,
        unit: 'mailer',
        unitCostCents: 125,
        source: 'manual',
        isEstimate: false,
        autoKind: null,
        saleId: null,
        tcgplayerOrderId: null,
        createdAt: '2026-04-10T10:00:00.000Z',
        updatedAt: '2026-04-11T10:00:00.000Z',
      };
      mockFetch(mockExpense);

      const request: UpdateExpenseRequest = {
        amountCents: 625,
        quantity: 5,
        description: 'Updated mailers',
      };

      const result = await api.updateExpense(8, request);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/expenses/8',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(request),
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(result).toEqual(mockExpense);
    });

    it('throws on API error', async () => {
      mockFetch({ error: 'Expense not found' }, false, 404);

      await expect(api.updateExpense(999, { description: 'Nope' })).rejects.toThrow(
        'Expense not found',
      );
    });
  });

  describe('deleteExpense', () => {
    it('sends DELETE to /api/expenses/:id and resolves void', async () => {
      mockFetch({ success: true });

      const result = await api.deleteExpense(9);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/expenses/9',
        expect.objectContaining({
          method: 'DELETE',
          headers: {},
        }),
      );
      expect(result).toBeUndefined();
    });

    it('throws on API error', async () => {
      mockFetch({ error: 'Expense not found' }, false, 404);

      await expect(api.deleteExpense(999)).rejects.toThrow('Expense not found');
    });
  });

  describe('getPerformanceSummary', () => {
    it('fetches performance summary with no params', async () => {
      const mockResponse: PerformanceSummaryResponse = {
        revenueCents: 1500,
        expensesCents: 430,
        netProfitCents: 1070,
        marginPercent: 71.33,
        salesCount: 3,
        expenseCount: 4,
        estimatedExpensesCents: 130,
        actualExpensesCents: 300,
        byCategory: [
          { category: 'shipping', totalCents: 130, count: 2 },
          { category: 'supplies', totalCents: 300, count: 2 },
        ],
      };
      mockFetch(mockResponse);

      const result = await api.getPerformanceSummary();

      expect(global.fetch).toHaveBeenCalledWith('/api/expenses/performance', {
        headers: {},
      });
      expect(result).toEqual(mockResponse);
    });

    it('fetches performance summary with date range params', async () => {
      mockFetch({
        revenueCents: 0,
        expensesCents: 0,
        netProfitCents: 0,
        marginPercent: null,
        salesCount: 0,
        expenseCount: 0,
        estimatedExpensesCents: 0,
        actualExpensesCents: 0,
        byCategory: [],
      });

      await api.getPerformanceSummary({
        dateFrom: '2026-04-01T00:00:00.000Z',
        dateTo: '2026-04-30T23:59:59.999Z',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/expenses/performance?dateFrom=2026-04-01T00%3A00%3A00.000Z&dateTo=2026-04-30T23%3A59%3A59.999Z',
        expect.any(Object),
      );
    });

    it('throws on API error', async () => {
      mockFetch({ error: 'Invalid dateFrom' }, false, 400);

      await expect(
        api.getPerformanceSummary({ dateFrom: 'not-a-date' }),
      ).rejects.toThrow('Invalid dateFrom');
    });
  });

  describe('getExpenseSettings', () => {
    it('fetches expense settings', async () => {
      const mockSettings: ExpenseSettings = {
        id: 1,
        autoRecordSaleExpenses: false,
        autoRecordShipping: true,
        shippingCostCents: 99,
        autoRecordSupplies: true,
        suppliesCostCents: 25,
        autoRecordTcgplayerFees: true,
        marketplaceFeeBps: 1075,
        transactionFeeBps: 250,
        transactionFlatFeeCents: 30,
        createdAt: '2026-04-18T12:00:00.000Z',
        updatedAt: '2026-04-18T12:00:00.000Z',
      };
      mockFetch(mockSettings);

      const result = await api.getExpenseSettings();

      expect(global.fetch).toHaveBeenCalledWith('/api/expenses/settings', {
        headers: {},
      });
      expect(result).toEqual(mockSettings);
    });

    it('throws on API error', async () => {
      mockFetch({ error: 'Failed to fetch expense settings' }, false, 500);

      await expect(api.getExpenseSettings()).rejects.toThrow(
        'Failed to fetch expense settings',
      );
    });
  });

  describe('updateExpenseSettings', () => {
    it('sends POST to /api/expenses/settings with settings payload', async () => {
      const mockSettings: ExpenseSettings = {
        id: 1,
        autoRecordSaleExpenses: true,
        autoRecordShipping: true,
        shippingCostCents: 149,
        autoRecordSupplies: true,
        suppliesCostCents: 35,
        autoRecordTcgplayerFees: true,
        marketplaceFeeBps: 900,
        transactionFeeBps: 275,
        transactionFlatFeeCents: 35,
        createdAt: '2026-04-18T12:00:00.000Z',
        updatedAt: '2026-04-18T13:00:00.000Z',
      };
      mockFetch(mockSettings);

      const request: UpdateExpenseSettingsRequest = {
        autoRecordSaleExpenses: true,
        shippingCostCents: 149,
        suppliesCostCents: 35,
        marketplaceFeeBps: 900,
        transactionFeeBps: 275,
        transactionFlatFeeCents: 35,
      };

      const result = await api.updateExpenseSettings(request);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/expenses/settings',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(result).toEqual(mockSettings);
    });

    it('throws on API error', async () => {
      mockFetch(
        { error: 'shippingCostCents must be a non-negative integer' },
        false,
        400,
      );

      await expect(
        api.updateExpenseSettings({ shippingCostCents: -1 }),
      ).rejects.toThrow('shippingCostCents must be a non-negative integer');
    });
  });

  describe('createSale', () => {
    it('sends POST to /api/sales with correct JSON body', async () => {
      const mockSale: Sale = {
        id: 1,
        cardId: 42,
        tcgplayerOrderId: 'ORD-100',
        quantitySold: 2,
        salePriceCents: 499,
        buyerName: 'Jane Doe',
        orderStatus: 'pending',
        soldAt: '2026-04-08T12:00:00.000Z',
        notes: null,
        createdAt: '2026-04-08T12:00:00.000Z',
        updatedAt: '2026-04-08T12:00:00.000Z',
        cardProductName: 'Riftbound Dragon',
        cardSetName: 'Origins',
      };
      mockFetch(mockSale);

      const request: CreateSaleRequest = {
        cardId: 42,
        quantitySold: 2,
        salePriceCents: 499,
        buyerName: 'Jane Doe',
        tcgplayerOrderId: 'ORD-100',
        applyEstimatedExpenses: true,
      };
      const result = await api.createSale(request);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sales',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(result).toEqual(mockSale);
    });

    it('returns typed Sale object on success', async () => {
      const mockSale: Sale = {
        id: 2,
        cardId: 10,
        tcgplayerOrderId: null,
        quantitySold: 1,
        salePriceCents: 150,
        buyerName: null,
        orderStatus: 'pending',
        soldAt: '2026-04-08T14:00:00.000Z',
        notes: 'Test note',
        createdAt: '2026-04-08T14:00:00.000Z',
        updatedAt: '2026-04-08T14:00:00.000Z',
        cardProductName: 'Storm Elemental',
        cardSetName: 'Origins',
      };
      mockFetch(mockSale);

      const result = await api.createSale({
        cardId: 10,
        quantitySold: 1,
        salePriceCents: 150,
        notes: 'Test note',
      });

      expect(result.id).toBe(2);
      expect(result.cardId).toBe(10);
      expect(result.orderStatus).toBe('pending');
      expect(result.notes).toBe('Test note');
    });

    it('throws on error response', async () => {
      mockFetch({ error: 'Card not found' }, false, 404);

      await expect(
        api.createSale({ cardId: 999, quantitySold: 1, salePriceCents: 100 }),
      ).rejects.toThrow('Card not found');
    });
  });

  describe('createBulkOrder', () => {
    it('sends POST to /api/sales/bulk with paid and gift lines', async () => {
      const mockResponse = { sales: [] };
      mockFetch(mockResponse);

      const request: CreateBulkOrderRequest = {
        tcgplayerOrderId: 'ORD-100',
        orderStatus: 'confirmed',
        buyerName: 'Jane Doe',
        applyEstimatedExpenses: true,
        lines: [
          { cardId: 1, quantitySold: 1, salePriceCents: 245, lineItemType: 'sale' },
          { cardId: 2, quantitySold: 1, salePriceCents: 0, lineItemType: 'gift' },
        ],
      };

      const result = await api.createBulkOrder(request);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sales/bulk',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(result).toEqual(mockResponse);
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
