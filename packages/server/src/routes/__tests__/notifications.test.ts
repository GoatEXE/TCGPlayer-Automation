import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { notificationsRoutes } from '../notifications.js';

vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  },
}));

import { db } from '../../db/index.js';

describe('GET /api/notifications', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(notificationsRoutes, { prefix: '/api/notifications' });
  });

  it('returns recent notification events newest-first with default limit', async () => {
    const limitMock = vi.fn().mockResolvedValue([
      {
        id: 2,
        channel: 'telegram',
        eventType: 'order_shipped',
        message: 'shipped',
        success: true,
        error: null,
        saleId: 22,
        cardId: 11,
        tcgplayerOrderId: 'ORDER-22',
        createdAt: new Date('2026-04-02T12:00:00.000Z'),
      },
      {
        id: 1,
        channel: 'telegram',
        eventType: 'sale_confirmed',
        message: 'confirmed',
        success: false,
        error: 'telegram down',
        saleId: 21,
        cardId: 10,
        tcgplayerOrderId: 'ORDER-21',
        createdAt: new Date('2026-04-02T11:00:00.000Z'),
      },
    ]);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: limitMock,
        }),
      }),
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications',
    });

    expect(response.statusCode).toBe(200);
    expect(limitMock).toHaveBeenCalledWith(50);
    expect(JSON.parse(response.body)).toEqual({
      events: [
        expect.objectContaining({
          id: 2,
          eventType: 'order_shipped',
          success: true,
        }),
        expect.objectContaining({
          id: 1,
          eventType: 'sale_confirmed',
          success: false,
          error: 'telegram down',
        }),
      ],
      limit: 50,
    });
  });

  it('clamps requested limit to the supported range', async () => {
    const limitMock = vi.fn().mockResolvedValue([]);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: limitMock,
        }),
      }),
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications?limit=999',
    });

    expect(response.statusCode).toBe(200);
    expect(limitMock).toHaveBeenCalledWith(200);
    expect(JSON.parse(response.body)).toEqual({
      events: [],
      limit: 200,
    });
  });
});
