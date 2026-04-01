import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { shipmentsRoutes } from '../shipments.js';

vi.mock('../../db/index.js', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

import { db } from '../../db/index.js';

function mockSelectResult(rows: any[]) {
  vi.mocked(db.select).mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  } as any);
}

describe('shipment routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(shipmentsRoutes, { prefix: '/api' });
  });

  describe('POST /api/sales/:id/ship', () => {
    it('creates shipment for a shipped sale and returns 201', async () => {
      mockSelectResult([
        {
          id: 10,
          orderStatus: 'shipped',
        },
      ]);
      mockSelectResult([]);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 1,
              saleId: 10,
              carrier: 'USPS',
              trackingNumber: '9400',
            },
          ]),
        }),
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/10/ship',
        payload: {
          carrier: 'USPS',
          trackingNumber: '9400',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          id: 1,
          saleId: 10,
          carrier: 'USPS',
          trackingNumber: '9400',
        }),
      );
      expect(db.update).not.toHaveBeenCalled();
    });

    it('auto-advances confirmed sale to shipped and writes status history', async () => {
      mockSelectResult([
        {
          id: 20,
          orderStatus: 'confirmed',
        },
      ]);
      mockSelectResult([]);

      const historyValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 2,
                saleId: 20,
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({
          values: historyValues,
        } as any);

      const updateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 20,
              orderStatus: 'shipped',
            },
          ]),
        }),
      });
      vi.mocked(db.update).mockReturnValue({ set: updateSet } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/20/ship',
        payload: {
          carrier: 'UPS',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          orderStatus: 'shipped',
          updatedAt: expect.any(Date),
        }),
      );
      expect(historyValues).toHaveBeenCalledWith(
        expect.objectContaining({
          saleId: 20,
          previousStatus: 'confirmed',
          newStatus: 'shipped',
          source: 'manual',
        }),
      );
    });

    it('rejects invalid sale status', async () => {
      mockSelectResult([
        {
          id: 30,
          orderStatus: 'pending',
        },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/30/ship',
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Sale must be confirmed or shipped before recording shipment',
      });
    });

    it('rejects duplicate shipment with 409', async () => {
      mockSelectResult([
        {
          id: 40,
          orderStatus: 'shipped',
        },
      ]);
      mockSelectResult([
        {
          id: 99,
          saleId: 40,
        },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/40/ship',
      });

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Shipment already exists for this sale',
      });
    });

    it('returns 404 when sale does not exist', async () => {
      mockSelectResult([]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sales/777/ship',
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({ error: 'Sale not found' });
    });
  });

  describe('GET /api/sales/:id/shipment', () => {
    it('returns shipment for sale', async () => {
      mockSelectResult([
        {
          id: 1,
          saleId: 10,
          carrier: 'USPS',
          trackingNumber: '9400',
        },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/10/shipment',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          id: 1,
          saleId: 10,
        }),
      );
    });

    it('returns 404 when shipment is missing', async () => {
      mockSelectResult([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/10/shipment',
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Shipment not found',
      });
    });
  });

  describe('PATCH /api/shipments/:id', () => {
    it('updates shipment carrier and tracking number', async () => {
      mockSelectResult([
        {
          id: 1,
          saleId: 10,
        },
      ]);

      const updateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 1,
              saleId: 10,
              carrier: 'FedEx',
              trackingNumber: '12345',
            },
          ]),
        }),
      });
      vi.mocked(db.update).mockReturnValue({ set: updateSet } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/shipments/1',
        payload: {
          carrier: 'FedEx',
          trackingNumber: '12345',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          id: 1,
          carrier: 'FedEx',
          trackingNumber: '12345',
        }),
      );
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          carrier: 'FedEx',
          trackingNumber: '12345',
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('setting deliveredAt auto-advances shipped sale to delivered', async () => {
      mockSelectResult([
        {
          id: 2,
          saleId: 20,
        },
      ]);
      mockSelectResult([
        {
          id: 20,
          orderStatus: 'shipped',
        },
      ]);

      const updateShipmentSet = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 2,
              saleId: 20,
              deliveredAt: new Date('2026-04-01T12:00:00.000Z'),
            },
          ]),
        }),
      });
      const updateSaleSet = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 20,
              orderStatus: 'delivered',
            },
          ]),
        }),
      });
      vi.mocked(db.update)
        .mockReturnValueOnce({ set: updateShipmentSet } as any)
        .mockReturnValueOnce({ set: updateSaleSet } as any);

      const historyValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values: historyValues } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/shipments/2',
        payload: {
          deliveredAt: '2026-04-01T12:00:00.000Z',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(updateSaleSet).toHaveBeenCalledWith(
        expect.objectContaining({
          orderStatus: 'delivered',
          updatedAt: expect.any(Date),
        }),
      );
      expect(historyValues).toHaveBeenCalledWith(
        expect.objectContaining({
          saleId: 20,
          previousStatus: 'shipped',
          newStatus: 'delivered',
          source: 'manual',
        }),
      );
    });

    it('returns 404 when shipment does not exist', async () => {
      mockSelectResult([]);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/shipments/999',
        payload: {
          carrier: 'USPS',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Shipment not found',
      });
    });

    it('returns 400 when no valid update fields are provided', async () => {
      mockSelectResult([
        {
          id: 3,
          saleId: 30,
        },
      ]);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/shipments/3',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: 'No valid fields to update',
      });
    });
  });
});
