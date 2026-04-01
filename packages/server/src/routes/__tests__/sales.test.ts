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

describe('sales routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
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

      vi.mocked(db.insert).mockReturnValue({
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

      vi.mocked(db.insert).mockReturnValue({
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
    it('updates sale fields', async () => {
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 1,
                orderStatus: 'shipped',
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
          orderStatus: 'shipped',
          tcgplayerOrderId: 'ORDER-1',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          id: 1,
          orderStatus: 'shipped',
        }),
      );
    });

    it('returns 404 when updating unknown sale', async () => {
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/sales/999',
        payload: { orderStatus: 'cancelled' },
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({ error: 'Sale not found' });
    });
  });
});
