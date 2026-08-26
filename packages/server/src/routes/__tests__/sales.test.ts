import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { salesRoutes } from '../sales.js';

function buildExpenseSettings(overrides: Record<string, unknown> = {}) {
  return {
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
    defaultShippingCollectedCents: 149,
    createdAt: new Date('2026-04-18T00:00:00.000Z'),
    updatedAt: new Date('2026-04-18T00:00:00.000Z'),
    ...overrides,
  };
}

vi.mock('../../db/index.js', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    transaction: vi.fn(),
  },
}));

const mockCreateShipmentOnConfirm = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/shipments/index.js', () => ({
  createShipmentOnConfirm: (...args: any[]) =>
    mockCreateShipmentOnConfirm(...args),
}));

const mockSendSaleConfirmedAlert = vi.fn().mockResolvedValue(true);
vi.mock('../../lib/notifications/telegram.js', () => ({
  sendSaleConfirmedAlert: (...args: any[]) =>
    mockSendSaleConfirmedAlert(...args),
}));

const mockCreateSaleAutoEstimates = vi.fn().mockResolvedValue([]);
const mockGetOrCreateExpenseSettings = vi
  .fn()
  .mockResolvedValue(buildExpenseSettings());
vi.mock('../../lib/expenses/index.js', () => ({
  createSaleAutoEstimates: (...args: any[]) =>
    mockCreateSaleAutoEstimates(...args),
  getOrCreateExpenseSettings: (...args: any[]) =>
    mockGetOrCreateExpenseSettings(...args),
}));

import { db } from '../../db/index.js';

function mockSelectById(rows: any[]) {
  vi.mocked(db.select).mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi
        .fn()
        .mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }),
    }),
  } as any);
}

function mockOrderLineSelect(rows: any[]) {
  vi.mocked(db.select).mockReturnValueOnce({
    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(rows) }),
  } as any);
}

function mockOrderSaleRows(sale: any, lines: any[] = [sale]) {
  mockSelectById([sale]);
  if (sale?.tcgplayerOrderId) {
    mockOrderLineSelect(lines);
  }
}

function mockOrderRows(rows: any[]) {
  vi.mocked(db.select).mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        leftJoin: vi
          .fn()
          .mockReturnValue({ orderBy: vi.fn().mockResolvedValue(rows) }),
      }),
    }),
  } as any);
}

function orderLine(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-06-01T10:00:00.000Z');
  return {
    id: 10,
    cardId: 1,
    tcgplayerOrderId: 'ORDER-10',
    quantitySold: 1,
    lineItemType: 'sale',
    salePriceCents: 250,
    shippingCollectedCents: 149,
    buyerName: 'Buyer',
    orderStatus: 'confirmed',
    soldAt: now,
    notes: null,
    createdAt: now,
    updatedAt: now,
    cardProductName: 'Paid Card',
    cardSetName: 'Origins',
    cardCondition: 'Near Mint',
    shipmentId: null,
    shipmentSaleId: null,
    shipmentCarrier: null,
    shipmentTrackingNumber: null,
    shipmentShippedAt: null,
    shipmentDeliveredAt: null,
    shipmentNotes: null,
    ...overrides,
  };
}

// These names keep the established route tests readable while the helpers now
// model the order lookup that backs line-oriented legacy rows.
const mockCardSelectResult = mockSelectById;
const mockSaleSelectResult = mockSelectById;

describe('sales routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCreateShipmentOnConfirm.mockResolvedValue(undefined);
    mockSendSaleConfirmedAlert.mockResolvedValue(true);
    mockCreateSaleAutoEstimates.mockResolvedValue([]);
    mockGetOrCreateExpenseSettings.mockResolvedValue(buildExpenseSettings());
    vi.mocked((db as any).transaction).mockImplementation(
      async (callback: any) => callback(db as any),
    );
    app = Fastify();
    await app.register(salesRoutes, { prefix: '/api/sales' });
  });

  describe('POST /api/sales', () => {
    it('records a partial sale and keeps card listed', async () => {
      mockCardSelectResult([
        {
          id: 1,
          productName: 'Partial Sale Card',
          setName: 'Origins',
          status: 'listed',
          quantity: 3,
        },
      ]);

      const updateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      vi.mocked(db.update).mockReturnValue({ set: updateSet } as any);

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 10,
                cardId: 1,
                quantitySold: 1,
                salePriceCents: 125,
                orderStatus: 'pending',
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales',
        payload: {
          cardId: 1,
          quantitySold: 1,
          salePriceCents: 125,
          buyerName: 'Test Buyer',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 2,
          status: 'listed',
          updatedAt: expect.any(Date),
        }),
      );
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          id: 10,
          cardId: 1,
          quantitySold: 1,
          lineItemType: 'sale',
          salePriceCents: 125,
          cardProductName: 'Partial Sale Card',
          cardSetName: 'Origins',
        }),
      );
    });

    it('records a full sale and marks card as sold', async () => {
      mockCardSelectResult([
        {
          id: 2,
          status: 'listed',
          quantity: 1,
        },
      ]);

      const updateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      vi.mocked(db.update).mockReturnValue({ set: updateSet } as any);

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 11,
                cardId: 2,
                quantitySold: 1,
                salePriceCents: 500,
                orderStatus: 'pending',
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales',
        payload: {
          cardId: 2,
          quantitySold: 1,
          salePriceCents: 500,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 0,
          status: 'sold',
        }),
      );
    });

    it('defaults shippingCollectedCents from settings when tcgplayerOrderId is provided', async () => {
      mockCardSelectResult([
        {
          id: 12,
          status: 'listed',
          quantity: 2,
        },
      ]);

      mockGetOrCreateExpenseSettings.mockResolvedValueOnce(
        buildExpenseSettings({ defaultShippingCollectedCents: 149 }),
      );

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      const saleInsertValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 55,
            cardId: 12,
            quantitySold: 1,
            salePriceCents: 200,
            shippingCollectedCents: 149,
            orderStatus: 'pending',
            soldAt: new Date('2026-04-18T12:00:00.000Z'),
            tcgplayerOrderId: 'ORDER-55',
          },
        ]),
      });

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: saleInsertValues,
        } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales',
        payload: {
          cardId: 12,
          quantitySold: 1,
          salePriceCents: 200,
          tcgplayerOrderId: 'ORDER-55',
          applyEstimatedExpenses: true,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockGetOrCreateExpenseSettings).toHaveBeenCalledTimes(1);
      expect(saleInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          tcgplayerOrderId: 'ORDER-55',
          shippingCollectedCents: 149,
        }),
      );
      expect(mockCreateSaleAutoEstimates).not.toHaveBeenCalled();
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          shippingCollectedCents: 149,
        }),
      );
    });

    it('accepts an explicit shippingCollectedCents override', async () => {
      mockCardSelectResult([
        {
          id: 13,
          status: 'listed',
          quantity: 2,
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      const saleInsertValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 56,
            cardId: 13,
            quantitySold: 1,
            salePriceCents: 225,
            shippingCollectedCents: 199,
            orderStatus: 'pending',
            soldAt: new Date('2026-04-18T12:05:00.000Z'),
            tcgplayerOrderId: 'ORDER-56',
          },
        ]),
      });

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: saleInsertValues,
        } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales',
        payload: {
          cardId: 13,
          quantitySold: 1,
          salePriceCents: 225,
          tcgplayerOrderId: 'ORDER-56',
          shippingCollectedCents: 199,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockGetOrCreateExpenseSettings).not.toHaveBeenCalled();
      expect(saleInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          shippingCollectedCents: 199,
        }),
      );
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          shippingCollectedCents: 199,
        }),
      );
    });

    it('uses zero shippingCollectedCents for legacy single-sale requests without an order id', async () => {
      mockCardSelectResult([
        {
          id: 14,
          status: 'listed',
          quantity: 2,
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      const saleInsertValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 57,
            cardId: 14,
            quantitySold: 1,
            salePriceCents: 250,
            shippingCollectedCents: 0,
            orderStatus: 'pending',
            soldAt: new Date('2026-04-18T12:10:00.000Z'),
          },
        ]),
      });

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: saleInsertValues,
        } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales',
        payload: {
          cardId: 14,
          quantitySold: 1,
          salePriceCents: 250,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockGetOrCreateExpenseSettings).not.toHaveBeenCalled();
      expect(saleInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          shippingCollectedCents: 0,
        }),
      );
      expect(mockCreateSaleAutoEstimates).not.toHaveBeenCalled();
    });

    it('writes initial status history entry on sale creation', async () => {
      mockCardSelectResult([
        {
          id: 12,
          status: 'listed',
          quantity: 2,
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      const historyValues = vi.fn().mockResolvedValue(undefined);

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 55,
                cardId: 12,
                quantitySold: 1,
                salePriceCents: 200,
                orderStatus: 'confirmed',
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({
          values: historyValues,
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales',
        payload: {
          cardId: 12,
          quantitySold: 1,
          salePriceCents: 200,
          orderStatus: 'confirmed',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(historyValues).toHaveBeenCalledWith(
        expect.objectContaining({
          saleId: 55,
          previousStatus: null,
          newStatus: 'confirmed',
          source: 'manual',
        }),
      );
    });

    it('creates a shipment placeholder when initial status is confirmed', async () => {
      mockCardSelectResult([
        {
          id: 14,
          status: 'listed',
          quantity: 2,
          productName: 'Jinx',
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 60,
                cardId: 14,
                quantitySold: 1,
                salePriceCents: 200,
                orderStatus: 'confirmed',
                buyerName: 'Test Buyer',
                tcgplayerOrderId: 'ORDER-60',
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales',
        payload: {
          cardId: 14,
          quantitySold: 1,
          salePriceCents: 200,
          orderStatus: 'confirmed',
          buyerName: 'Test Buyer',
          tcgplayerOrderId: 'ORDER-60',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockCreateShipmentOnConfirm).toHaveBeenCalledWith(
        expect.anything(),
        60,
      );
      expect(mockSendSaleConfirmedAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          saleId: 60,
          cardId: 14,
          productName: 'Jinx',
          quantitySold: 1,
          salePriceCents: 200,
          buyerName: 'Test Buyer',
          tcgplayerOrderId: 'ORDER-60',
          orderLinkText: 'Lookup in TCGplayer seller portal',
        }),
      );
    });

    it('continues when sale confirmed notification sending fails', async () => {
      mockCardSelectResult([
        {
          id: 16,
          status: 'listed',
          quantity: 2,
          productName: 'Ahri',
        },
      ]);

      mockSendSaleConfirmedAlert.mockRejectedValueOnce(
        new Error('telegram down'),
      );

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 62,
                cardId: 16,
                quantitySold: 1,
                salePriceCents: 300,
                orderStatus: 'confirmed',
                buyerName: 'Buyer Fail Open',
                tcgplayerOrderId: 'ORDER-62',
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales',
        payload: {
          cardId: 16,
          quantitySold: 1,
          salePriceCents: 300,
          orderStatus: 'confirmed',
          buyerName: 'Buyer Fail Open',
          tcgplayerOrderId: 'ORDER-62',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockCreateShipmentOnConfirm).toHaveBeenCalledWith(
        expect.anything(),
        62,
      );
      expect(mockSendSaleConfirmedAlert).toHaveBeenCalledTimes(1);
    });

    it('does not create a shipment when initial status is pending', async () => {
      mockCardSelectResult([
        {
          id: 15,
          status: 'listed',
          quantity: 2,
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 61,
                cardId: 15,
                quantitySold: 1,
                salePriceCents: 200,
                orderStatus: 'pending',
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales',
        payload: {
          cardId: 15,
          quantitySold: 1,
          salePriceCents: 200,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockCreateShipmentOnConfirm).not.toHaveBeenCalled();
    });

    it('rejects sales for non-listed cards', async () => {
      mockCardSelectResult([
        {
          id: 3,
          status: 'gift',
          quantity: 2,
        },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales',
        payload: {
          cardId: 3,
          quantitySold: 1,
          salePriceCents: 100,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Only listed or listed-origin needs_attention cards can be sold',
      });
    });

    it('rejects overselling card quantity', async () => {
      mockCardSelectResult([
        {
          id: 4,
          status: 'listed',
          quantity: 1,
        },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales',
        payload: {
          cardId: 4,
          quantitySold: 2,
          salePriceCents: 100,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: 'quantitySold cannot exceed available card quantity',
      });
    });
  });

  describe('POST /api/sales/bulk', () => {
    it('records a confirmed order with a paid line and a gift line atomically', async () => {
      mockCardSelectResult([
        {
          id: 100,
          productName: 'Paid Card',
          status: 'listed',
          attentionReason: null,
          quantity: 2,
        },
      ]);
      mockCardSelectResult([
        {
          id: 101,
          productName: 'Gift Card',
          status: 'gift',
          attentionReason: null,
          quantity: 1,
        },
      ]);

      const updateCalls: any[] = [];
      vi.mocked(db.update).mockImplementation(
        () =>
          ({
            set: vi.fn().mockImplementation((args) => {
              updateCalls.push(args);
              return {
                where: vi.fn().mockResolvedValue(undefined),
              };
            }),
          }) as any,
      );

      const historyValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 200,
                cardId: 100,
                quantitySold: 1,
                lineItemType: 'sale',
                salePriceCents: 250,
                shippingCollectedCents: 149,
                buyerName: 'Buyer',
                tcgplayerOrderId: 'ORDER-BULK-1',
                orderStatus: 'confirmed',
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({ values: historyValues } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 201,
                cardId: 101,
                quantitySold: 1,
                lineItemType: 'gift',
                salePriceCents: 0,
                shippingCollectedCents: 149,
                buyerName: 'Buyer',
                tcgplayerOrderId: 'ORDER-BULK-1',
                orderStatus: 'confirmed',
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({ values: historyValues } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/bulk',
        payload: {
          tcgplayerOrderId: 'ORDER-BULK-1',
          buyerName: 'Buyer',
          applyEstimatedExpenses: true,
          lines: [
            {
              cardId: 100,
              quantitySold: 1,
              salePriceCents: 250,
              lineItemType: 'sale',
            },
            {
              cardId: 101,
              quantitySold: 1,
              salePriceCents: 0,
              lineItemType: 'gift',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(updateCalls).toEqual([
        expect.objectContaining({
          quantity: 1,
          status: 'listed',
          attentionReason: null,
          updatedAt: expect.any(Date),
        }),
        expect.objectContaining({
          quantity: 0,
          status: 'gifted',
          attentionReason: null,
          updatedAt: expect.any(Date),
        }),
      ]);
      expect(mockCreateShipmentOnConfirm).toHaveBeenCalledTimes(2);
      expect(mockGetOrCreateExpenseSettings).toHaveBeenCalledTimes(1);
      expect(mockCreateSaleAutoEstimates).not.toHaveBeenCalled();
      expect(mockSendSaleConfirmedAlert).toHaveBeenCalledTimes(1);
      expect(mockSendSaleConfirmedAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          saleId: 200,
          cardId: 100,
          productName: 'Paid Card',
          salePriceCents: 250,
          tcgplayerOrderId: 'ORDER-BULK-1',
        }),
      );
      expect(JSON.parse(response.body)).toEqual({
        sales: [
          expect.objectContaining({
            id: 200,
            lineItemType: 'sale',
            orderStatus: 'confirmed',
            shippingCollectedCents: 149,
            cardProductName: 'Paid Card',
            cardSetName: null,
          }),
          expect.objectContaining({
            id: 201,
            lineItemType: 'gift',
            salePriceCents: 0,
            orderStatus: 'confirmed',
            shippingCollectedCents: 149,
            cardProductName: 'Gift Card',
            cardSetName: null,
          }),
        ],
      });
    });

    it('records a gift-only order without default shipping', async () => {
      mockCardSelectResult([
        {
          id: 105,
          productName: 'Gift Card',
          status: 'gift',
          attentionReason: null,
          quantity: 1,
        },
      ]);
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      const saleInsertValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 205,
            cardId: 105,
            quantitySold: 1,
            lineItemType: 'gift',
            salePriceCents: 0,
            shippingCollectedCents: 0,
            buyerName: null,
            tcgplayerOrderId: 'ORDER-GIFT-ONLY',
            orderStatus: 'pending',
          },
        ]),
      });
      vi.mocked(db.insert)
        .mockReturnValueOnce({ values: saleInsertValues } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/bulk',
        payload: {
          tcgplayerOrderId: 'ORDER-GIFT-ONLY',
          orderStatus: 'pending',
          lines: [
            {
              cardId: 105,
              quantitySold: 1,
              salePriceCents: 0,
              lineItemType: 'gift',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockGetOrCreateExpenseSettings).not.toHaveBeenCalled();
      expect(saleInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({ shippingCollectedCents: 0 }),
      );
      expect(JSON.parse(response.body)).toEqual({
        sales: [
          expect.objectContaining({
            id: 205,
            lineItemType: 'gift',
            shippingCollectedCents: 0,
          }),
        ],
      });
    });

    it('marks a paid bulk line card as sold when the last quantity is consumed', async () => {
      mockCardSelectResult([
        {
          id: 125,
          productName: 'Sold Out Paid Card',
          status: 'needs_attention',
          attentionReason: 'listed_price_drift',
          quantity: 1,
        },
      ]);

      const updateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      vi.mocked(db.update).mockReturnValue({ set: updateSet } as any);

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 212,
                cardId: 125,
                quantitySold: 1,
                lineItemType: 'sale',
                salePriceCents: 250,
                shippingCollectedCents: 149,
                buyerName: null,
                tcgplayerOrderId: 'ORDER-BULK-SOLD',
                orderStatus: 'confirmed',
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/bulk',
        payload: {
          tcgplayerOrderId: 'ORDER-BULK-SOLD',
          lines: [
            {
              cardId: 125,
              quantitySold: 1,
              salePriceCents: 250,
              lineItemType: 'sale',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 0,
          status: 'sold',
          attentionReason: null,
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('accepts an explicit bulk shippingCollectedCents override', async () => {
      mockCardSelectResult([
        {
          id: 102,
          productName: 'Override Card',
          status: 'listed',
          attentionReason: null,
          quantity: 1,
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      const saleInsertValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 202,
            cardId: 102,
            quantitySold: 1,
            lineItemType: 'sale',
            salePriceCents: 275,
            shippingCollectedCents: 199,
            buyerName: null,
            tcgplayerOrderId: 'ORDER-BULK-OVERRIDE',
            orderStatus: 'confirmed',
          },
        ]),
      });

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: saleInsertValues,
        } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/bulk',
        payload: {
          tcgplayerOrderId: 'ORDER-BULK-OVERRIDE',
          shippingCollectedCents: 199,
          lines: [
            {
              cardId: 102,
              quantitySold: 1,
              salePriceCents: 275,
              lineItemType: 'sale',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockGetOrCreateExpenseSettings).not.toHaveBeenCalled();
      expect(saleInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          shippingCollectedCents: 199,
        }),
      );
      expect(JSON.parse(response.body)).toEqual({
        sales: [
          expect.objectContaining({
            id: 202,
            shippingCollectedCents: 199,
          }),
        ],
      });
    });

    it('accepts listed-origin needs_attention paid lines', async () => {
      mockCardSelectResult([
        {
          id: 110,
          productName: 'Attention Listing',
          status: 'needs_attention',
          attentionReason: 'listed_price_drift',
          quantity: 2,
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 210,
                cardId: 110,
                quantitySold: 1,
                lineItemType: 'sale',
                salePriceCents: 300,
                buyerName: null,
                tcgplayerOrderId: 'ORDER-BULK-2',
                orderStatus: 'confirmed',
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/bulk',
        payload: {
          tcgplayerOrderId: 'ORDER-BULK-2',
          lines: [
            {
              cardId: 110,
              quantitySold: 1,
              salePriceCents: 300,
              lineItemType: 'sale',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('rejects gift lines for non-gift cards', async () => {
      mockCardSelectResult([
        {
          id: 120,
          status: 'listed',
          attentionReason: null,
          quantity: 1,
        },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/bulk',
        payload: {
          tcgplayerOrderId: 'ORDER-BULK-3',
          lines: [
            {
              cardId: 120,
              quantitySold: 1,
              salePriceCents: 0,
              lineItemType: 'gift',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Gift lines require cards with status gift',
      });
    });

    it('rejects gift lines with positive price', async () => {
      mockCardSelectResult([
        {
          id: 121,
          status: 'gift',
          attentionReason: null,
          quantity: 1,
        },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/bulk',
        payload: {
          tcgplayerOrderId: 'ORDER-BULK-4',
          lines: [
            {
              cardId: 121,
              quantitySold: 1,
              salePriceCents: 1,
              lineItemType: 'gift',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Gift lines must have salePriceCents of 0',
      });
    });

    it('rejects paid lines for gift cards', async () => {
      mockCardSelectResult([
        {
          id: 122,
          status: 'gift',
          attentionReason: null,
          quantity: 1,
        },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/bulk',
        payload: {
          tcgplayerOrderId: 'ORDER-BULK-5',
          lines: [
            {
              cardId: 122,
              quantitySold: 1,
              salePriceCents: 100,
              lineItemType: 'sale',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error:
          'Paid lines require cards with status listed or listed-origin needs_attention',
      });
    });

    it('rejects paid lines with zero price', async () => {
      mockCardSelectResult([
        {
          id: 123,
          status: 'listed',
          attentionReason: null,
          quantity: 1,
        },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/bulk',
        payload: {
          tcgplayerOrderId: 'ORDER-BULK-6',
          lines: [
            {
              cardId: 123,
              quantitySold: 1,
              salePriceCents: 0,
              lineItemType: 'sale',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Paid lines must have salePriceCents greater than 0',
      });
    });

    it('keeps gift cards in gift status when quantity remains after a gift line', async () => {
      mockCardSelectResult([
        {
          id: 124,
          productName: 'Extra Gift Card',
          status: 'gift',
          attentionReason: null,
          quantity: 3,
        },
      ]);

      const updateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      vi.mocked(db.update).mockReturnValue({ set: updateSet } as any);

      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 211,
                cardId: 124,
                quantitySold: 1,
                lineItemType: 'gift',
                salePriceCents: 0,
                buyerName: null,
                tcgplayerOrderId: 'ORDER-BULK-7',
                orderStatus: 'confirmed',
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/bulk',
        payload: {
          tcgplayerOrderId: 'ORDER-BULK-7',
          lines: [
            {
              cardId: 124,
              quantitySold: 1,
              salePriceCents: 0,
              lineItemType: 'gift',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 2,
          status: 'gift',
          attentionReason: null,
        }),
      );
    });
  });

  describe('GET /api/sales', () => {
    it('returns paginated order rows while preserving paid and gift line items', async () => {
      mockOrderRows([
        orderLine({
          id: 20,
          salePriceCents: 325,
          cardProductName: 'Test Card',
        }),
        orderLine({
          id: 21,
          cardId: 2,
          lineItemType: 'gift',
          salePriceCents: 0,
          cardProductName: 'Gift Card',
        }),
        orderLine({
          id: 22,
          tcgplayerOrderId: null,
          soldAt: new Date('2026-05-30T10:00:00.000Z'),
        }),
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales?page=1&limit=1&search=gift',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total).toBe(1);
      expect(body.orders).toEqual([
        expect.objectContaining({
          orderKey: 'order:ORDER-10',
          representativeSaleId: 20,
          itemCount: 2,
          productSubtotalCents: 325,
          shippingCollectedCents: 149,
          totalCents: 474,
          lineItems: [
            expect.objectContaining({ id: 20, lineItemType: 'sale' }),
            expect.objectContaining({ id: 21, lineItemType: 'gift' }),
          ],
        }),
      ]);
    });
  });

  describe('GET /api/sales/stats', () => {
    it('counts real orders and charges persisted shipping once in dashboard summary stats', async () => {
      mockOrderRows([
        orderLine({ id: 1, tcgplayerOrderId: 'ORDER-1', salePriceCents: 300 }),
        orderLine({ id: 2, tcgplayerOrderId: 'ORDER-1', salePriceCents: 201 }),
        orderLine({
          id: 3,
          tcgplayerOrderId: null,
          salePriceCents: 300,
          shippingCollectedCents: 0,
        }),
      ]);
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ activeListingCount: 7 }]),
        }),
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/stats',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        totalSales: 2,
        totalRevenueCents: 1099,
        averageSaleCents: 550,
        activeListingCount: 7,
        totalListedCount: 7,
      });
    });

    it('returns zero defaults when there are no sales or listed quantities', async () => {
      mockOrderRows([]);
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ activeListingCount: 0 }]),
        }),
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/stats',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        totalSales: 0,
        totalRevenueCents: 0,
        averageSaleCents: 0,
        activeListingCount: 0,
        totalListedCount: 0,
      });
    });

    it('retains gift-only orders without inflating order revenue', async () => {
      mockOrderRows([
        orderLine({
          id: 10,
          tcgplayerOrderId: 'ORDER-10',
          salePriceCents: 200,
          shippingCollectedCents: 0,
        }),
        orderLine({
          id: 11,
          tcgplayerOrderId: 'GIFT-ONLY',
          lineItemType: 'gift',
          salePriceCents: 0,
          shippingCollectedCents: 0,
          orderStatus: 'pending',
        }),
      ]);
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ activeListingCount: 4 }]),
        }),
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/stats',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        totalSales: 2,
        totalRevenueCents: 349,
        averageSaleCents: 175,
        activeListingCount: 4,
        totalListedCount: 4,
      });
    });
  });

  describe('GET /api/sales/pipeline', () => {
    it('returns grouped pipeline counts and totals by order', async () => {
      mockOrderRows([
        orderLine({
          id: 1,
          tcgplayerOrderId: 'PENDING-1',
          orderStatus: 'pending',
          salePriceCents: 250,
        }),
        orderLine({
          id: 2,
          tcgplayerOrderId: 'PENDING-1',
          orderStatus: 'pending',
          salePriceCents: 100,
        }),
        orderLine({
          id: 3,
          tcgplayerOrderId: 'SHIPPED-1',
          orderStatus: 'shipped',
          salePriceCents: 400,
          shippingCollectedCents: 0,
        }),
        orderLine({
          id: 4,
          tcgplayerOrderId: 'GIFT-ONLY',
          orderStatus: 'pending',
          lineItemType: 'gift',
          salePriceCents: 0,
          shippingCollectedCents: 0,
        }),
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/pipeline',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        pipeline: [
          { status: 'pending', count: 2, totalCents: 499 },
          { status: 'shipped', count: 1, totalCents: 549 },
        ],
      });
    });
  });

  describe('GET /api/sales/:id/history', () => {
    it('returns status history entries from every line in the requested order', async () => {
      const paid = orderLine({ id: 10, orderStatus: 'confirmed' });
      const gift = orderLine({
        id: 11,
        cardId: 2,
        lineItemType: 'gift',
        salePriceCents: 0,
        orderStatus: 'confirmed',
      });
      mockOrderSaleRows(paid, [paid, gift]);
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: 1,
                saleId: 10,
                previousStatus: null,
                newStatus: 'pending',
                source: 'manual',
                note: null,
                changedAt: new Date('2026-04-01T10:00:00.000Z'),
              },
              {
                id: 2,
                saleId: 11,
                previousStatus: 'pending',
                newStatus: 'confirmed',
                source: 'manual',
                note: 'Payment cleared',
                changedAt: new Date('2026-04-01T11:00:00.000Z'),
              },
            ]),
          }),
        }),
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/10/history',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.history).toHaveLength(2);
      expect(body.history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ saleId: 10, newStatus: 'pending' }),
          expect.objectContaining({
            saleId: 11,
            newStatus: 'confirmed',
            note: 'Payment cleared',
          }),
        ]),
      );
    });

    it('returns 400 for invalid sale id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/not-a-number/history',
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Invalid sale id',
      });
    });
  });

  describe('PATCH /api/sales/batch-status', () => {
    it('updates multiple sales when transitions are valid', async () => {
      const paidOrderOne = orderLine({
        id: 1,
        cardId: 1,
        salePriceCents: 125,
        buyerName: 'Buyer One',
        tcgplayerOrderId: 'ORDER-1',
        orderStatus: 'pending',
      });
      const giftOrderOne = orderLine({
        id: 12,
        cardId: 12,
        salePriceCents: 0,
        lineItemType: 'gift',
        buyerName: 'Buyer One',
        tcgplayerOrderId: 'ORDER-1',
        orderStatus: 'pending',
      });
      const paidOrderTwo = orderLine({
        id: 2,
        cardId: 2,
        salePriceCents: 225,
        buyerName: 'Buyer Two',
        tcgplayerOrderId: 'ORDER-2',
        orderStatus: 'pending',
      });
      mockOrderSaleRows(paidOrderOne, [paidOrderOne, giftOrderOne]);
      mockOrderSaleRows(paidOrderTwo);
      mockCardSelectResult([{ id: 1, productName: 'Card One' }]);
      mockCardSelectResult([{ id: 2, productName: 'Card Two' }]);

      vi.mocked(db.update)
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                { id: 1, orderStatus: 'confirmed' },
                { id: 12, orderStatus: 'confirmed' },
              ]),
            }),
          }),
        } as any)
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: 2,
                  orderStatus: 'confirmed',
                },
              ]),
            }),
          }),
        } as any);

      const historyValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values: historyValues } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/batch-status',
        payload: {
          saleIds: [1, 2],
          newStatus: 'confirmed',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        updated: 2,
        skipped: [],
      });
      expect(historyValues).toHaveBeenCalledTimes(2);
    });

    it('returns mixed updated/skipped results for invalid and missing sales', async () => {
      mockOrderSaleRows(
        orderLine({
          id: 3,
          tcgplayerOrderId: null,
          cardId: 3,
          orderStatus: 'confirmed',
        }),
      );
      mockOrderSaleRows(
        orderLine({
          id: 4,
          tcgplayerOrderId: null,
          cardId: 4,
          orderStatus: 'cancelled',
        }),
      );
      mockOrderSaleRows(null as any, []);

      vi.mocked(db.update).mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 3,
                orderStatus: 'shipped',
              },
            ]),
          }),
        }),
      } as any);

      const historyValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values: historyValues } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/batch-status',
        payload: {
          saleIds: [3, 4, 999],
          newStatus: 'shipped',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.updated).toBe(1);
      expect(body.skipped).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 4 }),
          { id: 999, reason: 'Sale not found' },
        ]),
      );
      expect(historyValues).toHaveBeenCalledTimes(1);
    });

    it('rejects empty saleIds arrays', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/batch-status',
        payload: {
          saleIds: [],
          newStatus: 'confirmed',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: 'saleIds must be a non-empty array of positive integers',
      });
    });

    it('restores quantities for cancelled sales in batch', async () => {
      mockOrderSaleRows(
        orderLine({
          id: 20,
          cardId: 100,
          tcgplayerOrderId: null,
          quantitySold: 1,
          orderStatus: 'confirmed',
        }),
      );
      mockCardSelectResult([
        { id: 100, quantity: 0, status: 'sold', attentionReason: null },
      ]);
      mockOrderSaleRows(
        orderLine({
          id: 21,
          cardId: 101,
          tcgplayerOrderId: null,
          quantitySold: 2,
          orderStatus: 'shipped',
        }),
      );
      mockCardSelectResult([
        { id: 101, quantity: 3, status: 'listed', attentionReason: null },
      ]);

      const saleOneUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 20,
              orderStatus: 'cancelled',
            },
          ]),
        }),
      });

      const cardOneUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const saleTwoUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 21,
              orderStatus: 'cancelled',
            },
          ]),
        }),
      });

      const cardTwoUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      vi.mocked(db.update)
        .mockReturnValueOnce({ set: saleOneUpdateSet } as any)
        .mockReturnValueOnce({ set: cardOneUpdateSet } as any)
        .mockReturnValueOnce({ set: saleTwoUpdateSet } as any)
        .mockReturnValueOnce({ set: cardTwoUpdateSet } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/batch-status',
        payload: {
          saleIds: [20, 21],
          newStatus: 'cancelled',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        updated: 2,
        skipped: [],
      });

      expect(cardOneUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 1,
          status: 'listed',
          updatedAt: expect.any(Date),
        }),
      );

      expect(cardTwoUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 5,
          status: 'listed',
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('creates shipment placeholders when batch-updating to confirmed', async () => {
      const firstOrder = orderLine({
        id: 50,
        cardId: 50,
        salePriceCents: 250,
        buyerName: 'Batch Buyer One',
        tcgplayerOrderId: 'ORDER-50',
        orderStatus: 'pending',
      });
      const secondOrder = orderLine({
        id: 51,
        cardId: 51,
        salePriceCents: 350,
        buyerName: 'Batch Buyer Two',
        tcgplayerOrderId: 'ORDER-51',
        orderStatus: 'pending',
      });
      mockOrderSaleRows(firstOrder);
      mockOrderSaleRows(secondOrder);
      mockCardSelectResult([{ id: 50, productName: 'Batch Card One' }]);
      mockCardSelectResult([{ id: 51, productName: 'Batch Card Two' }]);

      vi.mocked(db.update)
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: 50,
                  orderStatus: 'confirmed',
                },
              ]),
            }),
          }),
        } as any)
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: 51,
                  orderStatus: 'confirmed',
                },
              ]),
            }),
          }),
        } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/batch-status',
        payload: {
          saleIds: [50, 51],
          newStatus: 'confirmed',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockCreateShipmentOnConfirm).toHaveBeenCalledTimes(2);
      expect(mockCreateShipmentOnConfirm).toHaveBeenCalledWith(
        expect.anything(),
        50,
      );
      expect(mockCreateShipmentOnConfirm).toHaveBeenCalledWith(
        expect.anything(),
        51,
      );
      expect(mockSendSaleConfirmedAlert).toHaveBeenCalledTimes(2);
      expect(mockSendSaleConfirmedAlert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          saleId: 50,
          cardId: 50,
          productName: 'Batch Card One',
          quantitySold: 1,
          salePriceCents: 250,
          buyerName: 'Batch Buyer One',
          tcgplayerOrderId: 'ORDER-50',
          orderLinkText: 'Lookup in TCGplayer seller portal',
        }),
      );
      expect(mockSendSaleConfirmedAlert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          saleId: 51,
          cardId: 51,
          productName: 'Batch Card Two',
          quantitySold: 1,
          salePriceCents: 350,
          buyerName: 'Batch Buyer Two',
          tcgplayerOrderId: 'ORDER-51',
          orderLinkText: 'Lookup in TCGplayer seller portal',
        }),
      );
    });

    it('writes one history row per updated sale and includes optional note', async () => {
      const firstOrder = orderLine({
        id: 30,
        cardId: 30,
        salePriceCents: 175,
        buyerName: 'Buyer Thirty',
        tcgplayerOrderId: 'ORDER-30',
        orderStatus: 'pending',
      });
      const secondOrder = orderLine({
        id: 31,
        cardId: 31,
        salePriceCents: 275,
        buyerName: 'Buyer Thirty One',
        tcgplayerOrderId: 'ORDER-31',
        orderStatus: 'pending',
      });
      mockOrderSaleRows(firstOrder);
      mockOrderSaleRows(secondOrder);
      mockCardSelectResult([{ id: 30, productName: 'Card Thirty' }]);
      mockCardSelectResult([{ id: 31, productName: 'Card Thirty One' }]);

      vi.mocked(db.update)
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: 30,
                  orderStatus: 'confirmed',
                },
              ]),
            }),
          }),
        } as any)
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: 31,
                  orderStatus: 'confirmed',
                },
              ]),
            }),
          }),
        } as any);

      const historyValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values: historyValues } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/batch-status',
        payload: {
          saleIds: [30, 31],
          newStatus: 'confirmed',
          note: 'Batch update',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(historyValues).toHaveBeenCalledTimes(2);
      expect(historyValues).toHaveBeenNthCalledWith(1, [
        expect.objectContaining({
          saleId: 30,
          previousStatus: 'pending',
          newStatus: 'confirmed',
          source: 'manual',
          note: 'Batch update',
        }),
      ]);
      expect(historyValues).toHaveBeenNthCalledWith(2, [
        expect.objectContaining({
          saleId: 31,
          previousStatus: 'pending',
          newStatus: 'confirmed',
          source: 'manual',
          note: 'Batch update',
        }),
      ]);
    });
  });

  describe('GET /api/sales/:id', () => {
    it('returns 404 when sale is not found', async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/999',
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({ error: 'Sale not found' });
    });
  });

  describe('PATCH /api/sales/:id', () => {
    it('updates sale metadata fields', async () => {
      const sale = orderLine({
        id: 1,
        cardId: 1,
        tcgplayerOrderId: null,
        orderStatus: 'confirmed',
      });
      mockOrderSaleRows(sale);
      mockOrderSaleRows(sale);
      mockCardSelectResult([
        { id: 1, productName: 'Updated Sale Card', setName: 'Origins' },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 1,
                orderStatus: 'confirmed',
                tcgplayerOrderId: 'ORDER-1',
              },
            ]),
          }),
        }),
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/1',
        payload: {
          tcgplayerOrderId: 'ORDER-1',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          id: 1,
          tcgplayerOrderId: 'ORDER-1',
          orderStatus: 'confirmed',
        }),
      );
      expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
    });

    it('returns 404 when updating unknown sale', async () => {
      mockSaleSelectResult([]);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/999',
        payload: { orderStatus: 'cancelled' },
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({ error: 'Sale not found' });
    });

    it('rejects invalid backward transitions', async () => {
      const sale = orderLine({
        id: 2,
        cardId: 2,
        tcgplayerOrderId: null,
        orderStatus: 'shipped',
      });
      mockOrderSaleRows(sale);
      mockOrderSaleRows(sale);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/2',
        payload: { orderStatus: 'pending' },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Invalid orderStatus transition'),
        }),
      );
    });

    it('rejects transitions from terminal statuses', async () => {
      const sale = orderLine({
        id: 3,
        cardId: 3,
        tcgplayerOrderId: null,
        orderStatus: 'delivered',
      });
      mockOrderSaleRows(sale);
      mockOrderSaleRows(sale);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/3',
        payload: { orderStatus: 'cancelled' },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Invalid orderStatus transition'),
        }),
      );
    });

    it('creates shipment placeholder when patching sale to confirmed', async () => {
      const sale = orderLine({
        id: 40,
        cardId: 40,
        salePriceCents: 425,
        buyerName: 'Patch Buyer',
        tcgplayerOrderId: 'ORDER-40',
        orderStatus: 'pending',
      });
      mockOrderSaleRows(sale);
      mockOrderSaleRows(sale);
      mockCardSelectResult([{ id: 40, productName: 'Patch Card' }]);
      mockCardSelectResult([
        { id: 40, productName: 'Patch Card', setName: 'Origins' },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 40,
                orderStatus: 'confirmed',
              },
            ]),
          }),
        }),
      } as any);

      const historyValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values: historyValues } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/40',
        payload: { orderStatus: 'confirmed' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockCreateShipmentOnConfirm).toHaveBeenCalledWith(
        expect.anything(),
        40,
      );
      expect(mockSendSaleConfirmedAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          saleId: 40,
          cardId: 40,
          productName: 'Patch Card',
          quantitySold: 1,
          salePriceCents: 425,
          buyerName: 'Patch Buyer',
          tcgplayerOrderId: 'ORDER-40',
          orderLinkText: 'Lookup in TCGplayer seller portal',
        }),
      );
    });

    it('does not create shipment when patching to shipped', async () => {
      const sale = orderLine({
        id: 41,
        cardId: 41,
        tcgplayerOrderId: null,
        orderStatus: 'confirmed',
      });
      mockOrderSaleRows(sale);
      mockOrderSaleRows(sale);
      mockCardSelectResult([
        { id: 41, productName: 'Ship Card', setName: 'Origins' },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 41,
                orderStatus: 'shipped',
              },
            ]),
          }),
        }),
      } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/41',
        payload: { orderStatus: 'shipped' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockCreateShipmentOnConfirm).not.toHaveBeenCalled();
    });

    it('writes status history row on valid status transitions', async () => {
      const sale = orderLine({
        id: 4,
        cardId: 4,
        tcgplayerOrderId: null,
        orderStatus: 'confirmed',
      });
      mockOrderSaleRows(sale);
      mockOrderSaleRows(sale);
      mockCardSelectResult([
        { id: 4, productName: 'History Card', setName: 'Origins' },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 4,
                orderStatus: 'shipped',
              },
            ]),
          }),
        }),
      } as any);

      const historyValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values: historyValues } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/4',
        payload: { orderStatus: 'shipped' },
      });

      expect(response.statusCode).toBe(200);
      expect(historyValues).toHaveBeenCalledWith([
        expect.objectContaining({
          saleId: 4,
          previousStatus: 'confirmed',
          newStatus: 'shipped',
          source: 'manual',
        }),
      ]);
    });

    it('restores quantity and relists card when cancelling a fully sold sale', async () => {
      const sale = orderLine({
        id: 5,
        cardId: 9,
        tcgplayerOrderId: null,
        quantitySold: 2,
        orderStatus: 'confirmed',
      });
      mockOrderSaleRows(sale);
      mockOrderSaleRows(sale);
      mockCardSelectResult([
        { id: 9, quantity: 0, status: 'sold', attentionReason: null },
      ]);
      mockCardSelectResult([
        { id: 9, productName: 'Cancelled Card', setName: 'Origins' },
      ]);

      const saleUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 5,
              orderStatus: 'cancelled',
            },
          ]),
        }),
      });

      const cardUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      vi.mocked(db.update)
        .mockReturnValueOnce({ set: saleUpdateSet } as any)
        .mockReturnValueOnce({ set: cardUpdateSet } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/5',
        payload: { orderStatus: 'cancelled' },
      });

      expect(response.statusCode).toBe(200);
      expect(cardUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 2,
          status: 'listed',
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('cancellation succeeds when sale has no linked card id', async () => {
      const sale = orderLine({
        id: 6,
        cardId: null,
        tcgplayerOrderId: null,
        orderStatus: 'confirmed',
      });
      mockOrderSaleRows(sale);
      mockOrderSaleRows(sale);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 6,
                orderStatus: 'cancelled',
              },
            ]),
          }),
        }),
      } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/6',
        payload: { orderStatus: 'cancelled' },
      });

      expect(response.statusCode).toBe(200);
      expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1);
    });

    it('cancellation succeeds when linked card is missing', async () => {
      const sale = orderLine({
        id: 7,
        cardId: 99,
        tcgplayerOrderId: null,
        orderStatus: 'confirmed',
      });
      mockOrderSaleRows(sale);
      mockOrderSaleRows(sale);
      mockCardSelectResult([]);
      mockCardSelectResult([]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 7,
                orderStatus: 'cancelled',
              },
            ]),
          }),
        }),
      } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/7',
        payload: { orderStatus: 'cancelled' },
      });

      expect(response.statusCode).toBe(200);
      expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1);
    });
  });
});
