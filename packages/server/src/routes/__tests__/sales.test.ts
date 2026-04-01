import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { salesRoutes } from '../sales.js';

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
  },
}));

const mockCreateShipmentOnConfirm = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/shipments/index.js', () => ({
  createShipmentOnConfirm: (...args: any[]) =>
    mockCreateShipmentOnConfirm(...args),
}));

import { db } from '../../db/index.js';

function mockCardSelectResult(cardRows: any[]) {
  vi.mocked(db.select).mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(cardRows),
      }),
    }),
  } as any);
}

function mockSaleSelectResult(saleRows: any[]) {
  vi.mocked(db.select).mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(saleRows),
      }),
    }),
  } as any);
}

describe('sales routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCreateShipmentOnConfirm.mockResolvedValue(undefined);
    app = Fastify();
    await app.register(salesRoutes, { prefix: '/api/sales' });
  });

  describe('POST /api/sales', () => {
    it('records a partial sale and keeps card listed', async () => {
      mockCardSelectResult([
        {
          id: 1,
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
          salePriceCents: 125,
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
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockCreateShipmentOnConfirm).toHaveBeenCalledWith(
        expect.anything(),
        60,
      );
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
        error: 'Only listed cards can be sold',
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

  describe('GET /api/sales', () => {
    it('returns paginated sales list', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([
                    {
                      id: 20,
                      cardId: 1,
                      quantitySold: 1,
                      salePriceCents: 325,
                      buyerName: 'Buyer',
                      orderStatus: 'confirmed',
                      soldAt: new Date(),
                      cardProductName: 'Test Card',
                      cardSetName: 'Origins',
                    },
                  ]),
                }),
              }),
            }),
          }),
        } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales?page=1&limit=50',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total).toBe(1);
      expect(body.sales).toHaveLength(1);
      expect(body.sales[0]).toEqual(
        expect.objectContaining({
          id: 20,
          cardProductName: 'Test Card',
          orderStatus: 'confirmed',
        }),
      );
    });
  });

  describe('GET /api/sales/stats', () => {
    it('returns dashboard summary stats and mirrors totalListedCount to active listed quantity for now', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockResolvedValue([
            {
              totalSales: 3,
              totalRevenueCents: 950,
              averageSaleCents: 317,
            },
          ]),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                activeListingCount: 7,
              },
            ]),
          }),
        } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/stats',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        totalSales: 3,
        totalRevenueCents: 950,
        averageSaleCents: 317,
        activeListingCount: 7,
        totalListedCount: 7,
      });
    });

    it('returns zero defaults when there are no sales or listed quantities', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockResolvedValue([
            {
              totalSales: 0,
              totalRevenueCents: 0,
              averageSaleCents: 0,
            },
          ]),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                activeListingCount: 0,
              },
            ]),
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
  });

  describe('GET /api/sales/pipeline', () => {
    it('returns grouped pipeline counts and totals', async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([
            {
              status: 'pending',
              count: 2,
              totalCents: 725,
            },
            {
              status: 'shipped',
              count: 1,
              totalCents: 400,
            },
          ]),
        }),
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/pipeline',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        pipeline: [
          {
            status: 'pending',
            count: 2,
            totalCents: 725,
          },
          {
            status: 'shipped',
            count: 1,
            totalCents: 400,
          },
        ],
      });
    });
  });

  describe('GET /api/sales/:id/history', () => {
    it('returns status history entries', async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: 1,
                previousStatus: null,
                newStatus: 'pending',
                source: 'manual',
                note: null,
                changedAt: new Date('2026-04-01T10:00:00.000Z'),
              },
              {
                id: 2,
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
      expect(body.history[0]).toEqual(
        expect.objectContaining({
          id: 1,
          previousStatus: null,
          newStatus: 'pending',
        }),
      );
      expect(body.history[1]).toEqual(
        expect.objectContaining({
          id: 2,
          previousStatus: 'pending',
          newStatus: 'confirmed',
          note: 'Payment cleared',
        }),
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
      mockSaleSelectResult([
        {
          id: 1,
          cardId: 1,
          quantitySold: 1,
          orderStatus: 'pending',
        },
      ]);
      mockSaleSelectResult([
        {
          id: 2,
          cardId: 2,
          quantitySold: 1,
          orderStatus: 'pending',
        },
      ]);

      vi.mocked(db.update)
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: 1,
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
      mockSaleSelectResult([
        {
          id: 3,
          cardId: 3,
          quantitySold: 1,
          orderStatus: 'confirmed',
        },
      ]);
      mockSaleSelectResult([
        {
          id: 4,
          cardId: 4,
          quantitySold: 1,
          orderStatus: 'cancelled',
        },
      ]);
      mockSaleSelectResult([]);

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
      mockSaleSelectResult([
        {
          id: 20,
          cardId: 100,
          quantitySold: 1,
          orderStatus: 'confirmed',
        },
      ]);
      mockCardSelectResult([
        {
          id: 100,
          quantity: 0,
          status: 'sold',
        },
      ]);
      mockSaleSelectResult([
        {
          id: 21,
          cardId: 101,
          quantitySold: 2,
          orderStatus: 'shipped',
        },
      ]);
      mockCardSelectResult([
        {
          id: 101,
          quantity: 3,
          status: 'listed',
        },
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
      mockSaleSelectResult([
        {
          id: 50,
          cardId: 50,
          quantitySold: 1,
          orderStatus: 'pending',
        },
      ]);
      mockSaleSelectResult([
        {
          id: 51,
          cardId: 51,
          quantitySold: 1,
          orderStatus: 'pending',
        },
      ]);

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
    });

    it('writes one history row per updated sale and includes optional note', async () => {
      mockSaleSelectResult([
        {
          id: 30,
          cardId: 30,
          quantitySold: 1,
          orderStatus: 'pending',
        },
      ]);
      mockSaleSelectResult([
        {
          id: 31,
          cardId: 31,
          quantitySold: 1,
          orderStatus: 'pending',
        },
      ]);

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
      expect(historyValues).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          saleId: 30,
          previousStatus: 'pending',
          newStatus: 'confirmed',
          source: 'manual',
          note: 'Batch update',
        }),
      );
      expect(historyValues).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          saleId: 31,
          previousStatus: 'pending',
          newStatus: 'confirmed',
          source: 'manual',
          note: 'Batch update',
        }),
      );
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
      mockSaleSelectResult([
        {
          id: 1,
          cardId: 1,
          quantitySold: 1,
          orderStatus: 'confirmed',
        },
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
      mockSaleSelectResult([
        {
          id: 2,
          cardId: 2,
          quantitySold: 1,
          orderStatus: 'shipped',
        },
      ]);

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
      mockSaleSelectResult([
        {
          id: 3,
          cardId: 3,
          quantitySold: 1,
          orderStatus: 'delivered',
        },
      ]);

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
      mockSaleSelectResult([
        {
          id: 40,
          cardId: 40,
          quantitySold: 1,
          orderStatus: 'pending',
        },
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
    });

    it('does not create shipment when patching to shipped', async () => {
      mockSaleSelectResult([
        {
          id: 41,
          cardId: 41,
          quantitySold: 1,
          orderStatus: 'confirmed',
        },
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
      mockSaleSelectResult([
        {
          id: 4,
          cardId: 4,
          quantitySold: 1,
          orderStatus: 'confirmed',
        },
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
      expect(historyValues).toHaveBeenCalledWith(
        expect.objectContaining({
          saleId: 4,
          previousStatus: 'confirmed',
          newStatus: 'shipped',
          source: 'manual',
        }),
      );
    });

    it('restores quantity and relists card when cancelling a fully sold sale', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 5,
                  cardId: 9,
                  quantitySold: 2,
                  orderStatus: 'confirmed',
                },
              ]),
            }),
          }),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 9,
                  quantity: 0,
                  status: 'sold',
                },
              ]),
            }),
          }),
        } as any);

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
      mockSaleSelectResult([
        {
          id: 6,
          cardId: null,
          quantitySold: 1,
          orderStatus: 'confirmed',
        },
      ]);

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
      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 7,
                  cardId: 99,
                  quantitySold: 1,
                  orderStatus: 'confirmed',
                },
              ]),
            }),
          }),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        } as any);

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
