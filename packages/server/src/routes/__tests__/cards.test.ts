import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { cardsRoutes } from '../cards.js';
import multipart from '@fastify/multipart';

const getFormHeaders = (form: FormData): Record<string, string> => {
  if ('getHeaders' in form) {
    return (
      form as FormData & { getHeaders: () => Record<string, string> }
    ).getHeaders();
  }

  return {};
};

// Mock the database
vi.mock('../../db/index.js', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}));

// Mock the importers
vi.mock('../../lib/importers/index.js', () => ({
  parseCsv: vi.fn(),
  parseTxt: vi.fn(),
}));

// Mock the pricing engine
vi.mock('../../lib/pricing/index.js', () => ({
  calculatePrice: vi.fn(),
  applyFloorPriceCents: vi.fn(({ listingPrice, floorPriceCents }) => {
    if (listingPrice === null || floorPriceCents == null) {
      return listingPrice;
    }

    return Math.max(listingPrice, floorPriceCents / 100);
  }),
}));

// Mock the TCGTracking client
const mockGetSets = vi.fn();
const mockGetPricing = vi.fn();
vi.mock('../../lib/tcgtracking/client.js', () => {
  return {
    TCGTrackingClient: class {
      getSets = mockGetSets;
      getPricing = mockGetPricing;
    },
  };
});

import { db } from '../../db/index.js';
import { parseCsv, parseTxt } from '../../lib/importers/index.js';
import {
  applyFloorPriceCents,
  calculatePrice,
} from '../../lib/pricing/index.js';
import { TCGTrackingClient } from '../../lib/tcgtracking/client.js';

describe('POST /api/cards/import', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(multipart);
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should import CSV file and return cards with pricing', async () => {
    const mockImportedCards = [
      {
        tcgplayerId: 12345,
        tcgProductId: 12345,
        productLine: 'Riftbound',
        setName: 'Origins',
        productName: 'Test Card',
        title: null,
        number: '1/298',
        rarity: 'Common',
        condition: 'Near Mint',
        quantity: 4,
        snapshotMarketPrice: 1.5,
        photoUrl: 'https://example.com/card.jpg',
      },
    ];

    const mockPricingResult = {
      listingPrice: 1.47,
      status: 'matched' as const,
      reason: 'Priced at 98% of market — ready to list',
    };

    const mockInsertedCard = {
      id: 1,
      tcgplayerId: 12345,
      productLine: 'Riftbound',
      setName: 'Origins',
      productName: 'Test Card',
      title: null,
      number: '1/298',
      rarity: 'Common',
      condition: 'Near Mint',
      quantity: 4,
      status: 'matched' as const,
      marketPrice: '1.50',
      listingPrice: '1.47',
      photoUrl: 'https://example.com/card.jpg',
      notes: null,
      importedAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(parseCsv).mockReturnValue({
      source: 'csv',
      cards: mockImportedCards,
      errors: [],
      totalRows: 1,
    });

    vi.mocked(calculatePrice).mockReturnValue(mockPricingResult);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockInsertedCard]),
      }),
    } as any);

    const csvContent =
      'Quantity,TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Price,Add to Quantity,Photo,test\n4,12345,Riftbound,Origins,Test Card,,1/298,Common,Near Mint,1.50,1.40,1.45,1.40,5.60,4,https://example.com/card.jpg,';

    const form = new FormData();
    const blob = new Blob([csvContent], { type: 'text/csv' });
    form.append('file', blob, 'cards.csv');

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/import',
      payload: form,
      headers: getFormHeaders(form),
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('imported', 1);
    expect(body).toHaveProperty('updated', 0);
    expect(body).toHaveProperty('errors');
    expect(body).toHaveProperty('cards');
    expect(body.cards).toHaveLength(1);
  });

  it('should import TXT file and return cards', async () => {
    const mockImportedCards = [
      {
        tcgplayerId: null,
        tcgProductId: null,
        productLine: 'Riftbound',
        setName: 'Origins',
        productName: 'Another Card',
        title: null,
        number: null,
        rarity: null,
        condition: 'Near Mint',
        quantity: 2,
        snapshotMarketPrice: null,
        photoUrl: null,
      },
    ];

    const mockPricingResult = {
      listingPrice: null,
      status: 'needs_attention' as const,
      reason: 'No market price available',
    };

    const mockInsertedCard = {
      id: 2,
      tcgplayerId: null,
      productLine: 'Riftbound',
      setName: 'Origins',
      productName: 'Another Card',
      title: null,
      number: null,
      rarity: null,
      condition: 'Near Mint',
      quantity: 2,
      status: 'needs_attention' as const,
      marketPrice: null,
      listingPrice: null,
      photoUrl: null,
      notes: null,
      importedAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(parseTxt).mockReturnValue({
      source: 'txt',
      cards: mockImportedCards,
      errors: [],
      totalRows: 1,
    });

    vi.mocked(calculatePrice).mockReturnValue(mockPricingResult);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockInsertedCard]),
      }),
    } as any);

    const txtContent = '2 Another Card [Origins]';

    const form = new FormData();
    const blob = new Blob([txtContent], { type: 'text/plain' });
    form.append('file', blob, 'cards.txt');

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/import',
      payload: form,
      headers: getFormHeaders(form),
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('imported', 1);
    expect(body).toHaveProperty('updated', 0);
  });

  it('should return 400 for invalid file type', async () => {
    const form = new FormData();
    const blob = new Blob(['invalid'], { type: 'application/json' });
    form.append('file', blob, 'cards.json');

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/import',
      payload: form,
      headers: getFormHeaders(form),
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
  });
});

describe('GET /api/cards', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should return paginated cards', async () => {
    const mockCards = [
      {
        id: 1,
        productName: 'Card 1',
        quantity: 1,
        status: 'listed' as const,
        floorPriceCents: 150,
        importedAt: new Date('2026-03-30T10:00:00.000Z'),
        lastCheckedAt: new Date('2026-03-31T09:00:00.000Z'),
      },
      {
        id: 2,
        productName: 'Card 2',
        quantity: 2,
        status: 'gift' as const,
        floorPriceCents: null,
        importedAt: new Date('2026-03-29T10:00:00.000Z'),
        lastCheckedAt: null,
      },
    ];

    const mockOffset = vi.fn().mockResolvedValue(mockCards);
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockResolvedValue([{ count: 2 }]),
        } as any;
      }

      return {
        from: vi.fn().mockReturnValue({
          orderBy: mockOrderBy,
        }),
      } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/cards',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('cards');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('page');
    expect(body).toHaveProperty('limit');
    expect(body.cards[0]).toHaveProperty('lastCheckedAt');
    expect(body.cards[0].lastCheckedAt).toBe('2026-03-31T09:00:00.000Z');
    expect(body.cards[0].floorPriceCents).toBe(150);
    expect(body.cards[1].lastCheckedAt).toBeNull();
    expect(body.cards[1].floorPriceCents).toBeNull();
  });

  it('should filter cards by status', async () => {
    const mockCards = [
      {
        id: 1,
        productName: 'Gift Card',
        quantity: 1,
        status: 'gift' as const,
        importedAt: new Date(),
        lastCheckedAt: null,
      },
    ];

    const mockOffset = vi.fn().mockResolvedValue(mockCards);
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({
      orderBy: mockOrderBy,
    });

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        } as any;
      }

      return {
        from: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/cards?status=gift',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.cards).toBeDefined();
    expect(body.cards[0].lastCheckedAt).toBeNull();
  });

  it('should search cards by productName', async () => {
    const mockCards = [
      {
        id: 1,
        productName: 'Searched Card',
        quantity: 1,
        status: 'listed' as const,
        importedAt: new Date(),
        lastCheckedAt: new Date('2026-03-29T11:00:00.000Z'),
      },
    ];

    const mockOffset = vi.fn().mockResolvedValue(mockCards);
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({
      orderBy: mockOrderBy,
    });

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        } as any;
      }

      return {
        from: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/cards?search=Searched',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.cards).toBeDefined();
    expect(body.cards[0]).toHaveProperty('lastCheckedAt');
  });
});

describe('GET /api/cards/stats', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should return status counts', async () => {
    const mockStats = [
      { status: null, count: 10 },
      { status: 'listed', count: 5 },
      { status: 'gift', count: 3 },
      { status: 'needs_attention', count: 2 },
    ];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        groupBy: vi.fn().mockResolvedValue(mockStats),
      }),
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/cards/stats',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('pending');
    expect(body).toHaveProperty('listed');
    expect(body).toHaveProperty('gift');
    expect(body).toHaveProperty('needs_attention');
    expect(body).toHaveProperty('error');
  });
});

describe('PATCH /api/cards/:id', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should persist floorPriceCents when set', async () => {
    const mockUpdatedCard = {
      id: 1,
      productName: 'Floor Card',
      floorPriceCents: 125,
      importedAt: new Date(),
      updatedAt: new Date(),
    };

    let updateArgs: any = null;
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockImplementation((args) => {
        updateArgs = args;
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdatedCard]),
          }),
        };
      }),
    } as any);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/cards/1',
      payload: {
        floorPriceCents: 125,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(updateArgs).toEqual(
      expect.objectContaining({
        floorPriceCents: 125,
        updatedAt: expect.any(Date),
      }),
    );
    expect(JSON.parse(response.body)).toMatchObject({
      id: 1,
      floorPriceCents: 125,
    });
  });

  it('should persist floorPriceCents when cleared', async () => {
    const mockUpdatedCard = {
      id: 1,
      productName: 'Floor Card',
      floorPriceCents: null,
      importedAt: new Date(),
      updatedAt: new Date(),
    };

    let updateArgs: any = null;
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockImplementation((args) => {
        updateArgs = args;
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdatedCard]),
          }),
        };
      }),
    } as any);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/cards/1',
      payload: {
        floorPriceCents: null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(updateArgs).toEqual(
      expect.objectContaining({
        floorPriceCents: null,
        updatedAt: expect.any(Date),
      }),
    );
    expect(JSON.parse(response.body)).toMatchObject({
      id: 1,
      floorPriceCents: null,
    });
  });

  it('should return 400 for negative floorPriceCents', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/cards/1',
      payload: {
        floorPriceCents: -1,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        error: 'floorPriceCents must be a non-negative integer or null',
      }),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it('should return 400 for non-integer floorPriceCents', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/cards/1',
      payload: {
        floorPriceCents: 12.5,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        error: 'floorPriceCents must be a non-negative integer or null',
      }),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it('should update and return card', async () => {
    const mockUpdatedCard = {
      id: 1,
      productName: 'Updated Card',
      quantity: 5,
      status: 'listed' as const,
      listingPrice: '2.00',
      notes: 'Updated notes',
      condition: 'Lightly Played',
      importedAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockUpdatedCard]),
        }),
      }),
    } as any);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/cards/1',
      payload: {
        quantity: 5,
        notes: 'Updated notes',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe(1);
    expect(body.quantity).toBe(5);
  });

  it('should return 404 for non-existent card', async () => {
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/cards/999',
      payload: {
        quantity: 5,
      },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /api/cards/:id', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should delete card and return success', async () => {
    vi.mocked(db.delete).mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    } as any);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/cards/1',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('should return 404 for non-existent card', async () => {
    vi.mocked(db.delete).mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/cards/999',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('POST /api/cards/:id/reprice', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should reprice card and return updated card', async () => {
    const mockCard = {
      id: 1,
      productName: 'Card to Reprice',
      marketPrice: '2.00',
      listingPrice: '1.80',
      status: 'listed' as const,
      importedAt: new Date(),
      updatedAt: new Date(),
    };

    const mockPricingResult = {
      listingPrice: 1.96,
      status: 'matched' as const,
      reason: 'Priced at 98% of market — ready to list',
    };

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([mockCard]),
      }),
    } as any);

    vi.mocked(calculatePrice).mockReturnValue(mockPricingResult);

    const mockUpdatedCard = {
      ...mockCard,
      listingPrice: '1.96',
      updatedAt: new Date(),
    };

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockUpdatedCard]),
        }),
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/1/reprice',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe(1);
    expect(calculatePrice).toHaveBeenCalledWith({ marketPrice: 2.0 });
  });

  it('should apply floorPriceCents during repricing when a listing price exists', async () => {
    const mockCard = {
      id: 1,
      productName: 'Card to Reprice',
      marketPrice: '2.00',
      listingPrice: '1.80',
      floorPriceCents: 250,
      status: 'listed' as const,
      importedAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([mockCard]),
      }),
    } as any);

    vi.mocked(calculatePrice).mockReturnValue({
      listingPrice: 1.96,
      status: 'matched' as const,
      reason: 'Priced at 98% of market — ready to list',
    });

    let updateArgs: any = null;
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockImplementation((args) => {
        updateArgs = args;
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                ...mockCard,
                listingPrice: '2.5',
                updatedAt: new Date(),
              },
            ]),
          }),
        };
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/1/reprice',
    });

    expect(response.statusCode).toBe(200);
    expect(updateArgs).toEqual(
      expect.objectContaining({
        listingPrice: '2.5',
        status: 'listed',
        updatedAt: expect.any(Date),
      }),
    );
    expect(JSON.parse(response.body)).toMatchObject({
      id: 1,
      listingPrice: '2.5',
    });
  });

  it('should return 404 for non-existent card', async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/999/reprice',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('POST /api/cards/reprice-all', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should apply floorPriceCents and preserve listed status when repricing all cards', async () => {
    const mockCards = [
      {
        id: 1,
        productName: 'Card 1',
        marketPrice: '1.50',
        listingPrice: '1.40',
        floorPriceCents: 200,
        status: 'listed' as const,
      },
      {
        id: 2,
        productName: 'Card 2',
        marketPrice: '0.10',
        listingPrice: '0.09',
        floorPriceCents: 50,
        status: 'listed' as const,
      },
    ];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockCards),
      }),
    } as any);

    vi.mocked(calculatePrice)
      .mockReturnValueOnce({
        listingPrice: 1.47,
        status: 'matched' as const,
        reason: 'Priced at 98% of market',
      })
      .mockReturnValueOnce({
        listingPrice: null,
        status: 'gift' as const,
        reason: 'Market price below minimum threshold',
      });

    const updateCalls: any[] = [];
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockImplementation((args) => {
        updateCalls.push(args);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/reprice-all',
    });

    expect(response.statusCode).toBe(200);
    expect(calculatePrice).toHaveBeenCalledTimes(2);
    expect(applyFloorPriceCents).toHaveBeenNthCalledWith(1, {
      listingPrice: 1.47,
      floorPriceCents: 200,
    });
    expect(applyFloorPriceCents).toHaveBeenNthCalledWith(2, {
      listingPrice: null,
      floorPriceCents: 50,
    });
    expect(updateCalls).toEqual([
      expect.objectContaining({
        listingPrice: '2',
        status: 'listed',
        updatedAt: expect.any(Date),
      }),
      expect.objectContaining({
        listingPrice: null,
        status: 'gift',
        updatedAt: expect.any(Date),
      }),
    ]);

    const body = JSON.parse(response.body);
    expect(body.updated).toBe(2);
  });
});

describe('POST /api/cards/import - Duplicate Handling', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(multipart);
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should increment quantity when importing duplicate card with same tcgplayerId and condition', async () => {
    const mockImportedCards = [
      {
        tcgplayerId: 12345,
        tcgProductId: 12345,
        productLine: 'Riftbound',
        setName: 'Origins',
        productName: 'Duplicate Card',
        title: null,
        number: '1/298',
        rarity: 'Common',
        condition: 'Near Mint',
        quantity: 2,
        snapshotMarketPrice: 1.5,
        photoUrl: null,
      },
    ];

    const existingCard = {
      id: 1,
      tcgplayerId: 12345,
      productLine: 'Riftbound',
      setName: 'Origins',
      productName: 'Duplicate Card',
      title: null,
      number: '1/298',
      rarity: 'Common',
      condition: 'Near Mint',
      quantity: 3,
      status: 'listed' as const,
      marketPrice: '1.50',
      listingPrice: '1.47',
      photoUrl: null,
      notes: null,
      importedAt: new Date(),
      updatedAt: new Date(),
    };

    const mockPricingResult = {
      listingPrice: 1.47,
      status: 'matched' as const,
      reason: 'Priced at 98% of market',
    };

    vi.mocked(parseCsv).mockReturnValue({
      source: 'csv',
      cards: mockImportedCards,
      errors: [],
      totalRows: 1,
    });

    vi.mocked(calculatePrice).mockReturnValue(mockPricingResult);

    // Mock select to find existing card
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([existingCard]),
      }),
    } as any);

    // Mock update to increment quantity
    const updatedCard = { ...existingCard, quantity: 5, updatedAt: new Date() };
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedCard]),
        }),
      }),
    } as any);

    const csvContent =
      '2,12345,Riftbound,Origins,Duplicate Card,,1/298,Common,Near Mint,1.50,1.40,1.45,1.40,3.00,2,';
    const form = new FormData();
    const blob = new Blob([csvContent], { type: 'text/csv' });
    form.append('file', blob, 'cards.csv');

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/import',
      payload: form,
      headers: getFormHeaders(form),
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.imported).toBe(0);
    expect(body.updated).toBe(1);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0].quantity).toBe(5); // 3 + 2 = 5
  });

  it('should insert new card when no duplicate exists', async () => {
    const mockImportedCards = [
      {
        tcgplayerId: 99999,
        tcgProductId: 99999,
        productLine: 'Riftbound',
        setName: 'Origins',
        productName: 'New Card',
        title: null,
        number: '99/298',
        rarity: 'Rare',
        condition: 'Near Mint',
        quantity: 1,
        snapshotMarketPrice: 5.0,
        photoUrl: null,
      },
    ];

    const mockPricingResult = {
      listingPrice: 4.9,
      status: 'matched' as const,
      reason: 'Priced at 98% of market',
    };

    const mockInsertedCard = {
      id: 2,
      tcgplayerId: 99999,
      productLine: 'Riftbound',
      setName: 'Origins',
      productName: 'New Card',
      title: null,
      number: '99/298',
      rarity: 'Rare',
      condition: 'Near Mint',
      quantity: 1,
      status: 'matched' as const,
      marketPrice: '5.00',
      listingPrice: '4.90',
      photoUrl: null,
      notes: null,
      importedAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(parseCsv).mockReturnValue({
      source: 'csv',
      cards: mockImportedCards,
      errors: [],
      totalRows: 1,
    });

    vi.mocked(calculatePrice).mockReturnValue(mockPricingResult);

    // Mock select to find no existing card
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    // Mock insert for new card
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockInsertedCard]),
      }),
    } as any);

    const csvContent =
      '1,99999,Riftbound,Origins,New Card,,99/298,Rare,Near Mint,5.00,4.80,4.85,4.80,5.00,1,';
    const form = new FormData();
    const blob = new Blob([csvContent], { type: 'text/csv' });
    form.append('file', blob, 'cards.csv');

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/import',
      payload: form,
      headers: getFormHeaders(form),
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.imported).toBe(1);
    expect(body.updated).toBe(0);
    expect(body.cards).toHaveLength(1);
  });

  it('should handle mix of new and duplicate cards', async () => {
    const mockImportedCards = [
      {
        tcgplayerId: 12345,
        tcgProductId: 12345,
        productLine: 'Riftbound',
        setName: 'Origins',
        productName: 'Duplicate Card',
        title: null,
        number: '1/298',
        rarity: 'Common',
        condition: 'Near Mint',
        quantity: 2,
        snapshotMarketPrice: 1.5,
        photoUrl: null,
      },
      {
        tcgplayerId: 99999,
        tcgProductId: 99999,
        productLine: 'Riftbound',
        setName: 'Origins',
        productName: 'New Card',
        title: null,
        number: '99/298',
        rarity: 'Rare',
        condition: 'Near Mint',
        quantity: 1,
        snapshotMarketPrice: 5.0,
        photoUrl: null,
      },
    ];

    const existingCard = {
      id: 1,
      tcgplayerId: 12345,
      condition: 'Near Mint',
      quantity: 3,
      updatedAt: new Date(),
    };

    const mockPricingResult = {
      listingPrice: 1.47,
      status: 'matched' as const,
      reason: 'Priced at 98% of market',
    };

    vi.mocked(parseCsv).mockReturnValue({
      source: 'csv',
      cards: mockImportedCards,
      errors: [],
      totalRows: 2,
    });

    vi.mocked(calculatePrice).mockReturnValue(mockPricingResult);

    // First select call finds existing card, second finds nothing
    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existingCard]),
          }),
        } as any;
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any;
    });

    const updatedCard = { ...existingCard, quantity: 5 };
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedCard]),
        }),
      }),
    } as any);

    const newCard = {
      id: 2,
      tcgplayerId: 99999,
      quantity: 1,
      importedAt: new Date(),
    };
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([newCard]),
      }),
    } as any);

    const csvContent =
      '2,12345,Riftbound,Origins,Duplicate Card,,1/298,Common,Near Mint,1.50,1.40,1.45,1.40,3.00,2,\n1,99999,Riftbound,Origins,New Card,,99/298,Rare,Near Mint,5.00,4.80,4.85,4.80,5.00,1,';
    const form = new FormData();
    const blob = new Blob([csvContent], { type: 'text/csv' });
    form.append('file', blob, 'cards.csv');

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/import',
      payload: form,
      headers: getFormHeaders(form),
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.imported).toBe(1);
    expect(body.updated).toBe(1);
    expect(body.cards).toHaveLength(2);
  });

  it('should match TXT imports on productName+setName+number+condition when no tcgplayerId', async () => {
    const mockImportedCards = [
      {
        tcgplayerId: null,
        tcgProductId: null,
        productLine: 'Riftbound',
        setName: 'Origins',
        productName: 'TXT Card',
        title: null,
        number: null,
        rarity: null,
        condition: 'Near Mint',
        quantity: 2,
        snapshotMarketPrice: null,
        photoUrl: null,
      },
    ];

    const existingCard = {
      id: 3,
      tcgplayerId: null,
      productName: 'TXT Card',
      setName: 'Origins',
      number: null,
      condition: 'Near Mint',
      quantity: 1,
      updatedAt: new Date(),
    };

    const mockPricingResult = {
      listingPrice: null,
      status: 'needs_attention' as const,
      reason: 'No market price',
    };

    vi.mocked(parseTxt).mockReturnValue({
      source: 'txt',
      cards: mockImportedCards,
      errors: [],
      totalRows: 1,
    });

    vi.mocked(calculatePrice).mockReturnValue(mockPricingResult);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([existingCard]),
      }),
    } as any);

    const updatedCard = { ...existingCard, quantity: 3 };
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedCard]),
        }),
      }),
    } as any);

    const txtContent = '2 TXT Card [Origins]';
    const form = new FormData();
    const blob = new Blob([txtContent], { type: 'text/plain' });
    form.append('file', blob, 'cards.txt');

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/import',
      payload: form,
      headers: getFormHeaders(form),
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.imported).toBe(0);
    expect(body.updated).toBe(1);
    expect(body.cards[0].quantity).toBe(3);
  });
});

describe('POST /api/cards/fetch-prices', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSets.mockClear();
    mockGetPricing.mockClear();
    app = Fastify();
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should fetch prices from TCGTracking and update matching cards', async () => {
    const mockSets = [
      {
        id: 24344,
        name: 'Origins',
        abbreviation: 'OGN',
        is_supplemental: false,
        published_on: '2025-10-31',
        modified_on: '2026-03-06 20:26:58',
        product_count: 364,
        sku_count: 2626,
        products_modified: '2026-02-26T03:30:58-05:00',
        pricing_modified: '2026-03-28T08:04:25-04:00',
        skus_modified: '2026-03-28T09:30:39-04:00',
        api_url: '/tcgapi/v1/89/sets/24344',
        pricing_url: '/tcgapi/v1/89/sets/24344/pricing',
        skus_url: '/tcgapi/v1/89/sets/24344/skus',
      },
    ];

    const mockPricing = {
      set_id: 24344,
      updated: '2026-03-28T08:04:25-04:00',
      prices: {
        '12345': {
          tcg: {
            Normal: { low: 1.4, market: 1.5 },
          },
        },
        '67890': {
          tcg: {
            Normal: { low: 5.0, market: 5.5 },
          },
        },
      },
    };

    const mockCards = [
      {
        id: 1,
        tcgplayerId: 8926802,
        tcgProductId: 12345,
        productName: 'Card 1',
        condition: 'Near Mint',
        marketPrice: '1.00',
        listingPrice: '0.98',
        status: 'listed' as const,
      },
      {
        id: 2,
        tcgplayerId: 8927752,
        tcgProductId: 67890,
        productName: 'Card 2',
        condition: 'Near Mint',
        marketPrice: '4.00',
        listingPrice: '3.92',
        status: 'listed' as const,
      },
      {
        id: 3,
        tcgplayerId: 8925412,
        tcgProductId: 99999,
        productName: 'Card 3',
        condition: 'Near Mint',
        marketPrice: null,
        listingPrice: null,
        status: 'needs_attention' as const,
      },
    ];

    mockGetSets.mockResolvedValue(mockSets);
    mockGetPricing.mockResolvedValue(mockPricing);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue(mockCards),
    } as any);

    const mockPricingResult1 = {
      listingPrice: 1.47,
      status: 'matched' as const,
      reason: 'Priced at 98% of market',
    };

    const mockPricingResult2 = {
      listingPrice: 5.39,
      status: 'matched' as const,
      reason: 'Priced at 98% of market',
    };

    vi.mocked(calculatePrice)
      .mockReturnValueOnce(mockPricingResult1)
      .mockReturnValueOnce(mockPricingResult2);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/fetch-prices',
    });

    if (response.statusCode !== 200) {
      console.error('Response body:', response.body);
    }
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.updated).toBe(2);
    expect(body.notFound).toBe(1);
    expect(body.errors).toEqual([]);
  });

  it('should count drifted cards and write price history rows', async () => {
    const mockSets = [
      {
        id: 24344,
        name: 'Origins',
        abbreviation: 'OGN',
        is_supplemental: false,
        published_on: '2025-10-31',
        modified_on: '2026-03-06 20:26:58',
        product_count: 364,
        sku_count: 2626,
        products_modified: '2026-02-26T03:30:58-05:00',
        pricing_modified: '2026-03-28T08:04:25-04:00',
        skus_modified: '2026-03-28T09:30:39-04:00',
        api_url: '/tcgapi/v1/89/sets/24344',
        pricing_url: '/tcgapi/v1/89/sets/24344/pricing',
        skus_url: '/tcgapi/v1/89/sets/24344/skus',
      },
    ];

    const mockPricing = {
      set_id: 24344,
      updated: '2026-03-28T08:04:25-04:00',
      prices: {
        '12345': {
          tcg: {
            Normal: { low: 1.4, market: 1.5 },
          },
        },
      },
    };

    const mockCards = [
      {
        id: 1,
        tcgplayerId: 8926802,
        tcgProductId: 12345,
        productName: 'Card 1',
        condition: 'Near Mint',
        marketPrice: '1.00',
        listingPrice: '1.00',
        status: 'listed' as const,
        isFoilPrice: false,
        notes: null,
      },
    ];

    mockGetSets.mockResolvedValue(mockSets);
    mockGetPricing.mockResolvedValue(mockPricing);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue(mockCards),
    } as any);

    vi.mocked(calculatePrice).mockReturnValue({
      listingPrice: 1.1,
      status: 'matched' as const,
      reason: 'Priced at 98% of market',
    });

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as any);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/fetch-prices',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.updated).toBe(1);
    expect(body.drifted).toBe(1); // 1.00 -> 1.10 is 10% drift
    expect(body.notFound).toBe(0);
    expect(db.insert).toHaveBeenCalled();
  });

  it('should handle cards not found in TCGTracking pricing', async () => {
    const mockSets = [
      {
        id: 24344,
        name: 'Origins',
        abbreviation: 'OGN',
        is_supplemental: false,
        published_on: '2025-10-31',
        modified_on: '2026-03-06 20:26:58',
        product_count: 364,
        sku_count: 2626,
        products_modified: '2026-02-26T03:30:58-05:00',
        pricing_modified: '2026-03-28T08:04:25-04:00',
        skus_modified: '2026-03-28T09:30:39-04:00',
        api_url: '/tcgapi/v1/89/sets/24344',
        pricing_url: '/tcgapi/v1/89/sets/24344/pricing',
        skus_url: '/tcgapi/v1/89/sets/24344/skus',
      },
    ];

    const mockPricing = {
      set_id: 24344,
      updated: '2026-03-28T08:04:25-04:00',
      prices: {},
    };

    const mockCards = [
      {
        id: 1,
        tcgplayerId: 8926802,
        tcgProductId: 12345,
        productName: 'Card 1',
        condition: 'Near Mint',
        marketPrice: '1.00',
        listingPrice: '0.98',
        status: 'listed' as const,
      },
    ];

    mockGetSets.mockResolvedValue(mockSets);
    mockGetPricing.mockResolvedValue(mockPricing);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue(mockCards),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/fetch-prices',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.updated).toBe(0);
    expect(body.notFound).toBe(1);
  });

  it('should fall back to Foil pricing when Normal pricing is not available', async () => {
    const mockSets = [
      {
        id: 24344,
        name: 'Origins',
        abbreviation: 'OGN',
        is_supplemental: false,
        published_on: '2025-10-31',
        modified_on: '2026-03-06 20:26:58',
        product_count: 364,
        sku_count: 2626,
        products_modified: '2026-02-26T03:30:58-05:00',
        pricing_modified: '2026-03-28T08:04:25-04:00',
        skus_modified: '2026-03-28T09:30:39-04:00',
        api_url: '/tcgapi/v1/89/sets/24344',
        pricing_url: '/tcgapi/v1/89/sets/24344/pricing',
        skus_url: '/tcgapi/v1/89/sets/24344/skus',
      },
    ];

    const mockPricing = {
      set_id: 24344,
      updated: '2026-03-28T08:04:25-04:00',
      prices: {
        '652802': {
          tcg: {
            Foil: { low: 0.1, market: 0.24 },
          },
        },
      },
    };

    const mockCards = [
      {
        id: 1,
        tcgplayerId: 8926802,
        tcgProductId: 652802,
        productName: 'Jinx - Demolitionist',
        condition: 'Near Mint',
        marketPrice: null,
        listingPrice: null,
        isFoilPrice: false,
        notes: null,
        status: 'needs_attention' as const,
      },
    ];

    mockGetSets.mockResolvedValue(mockSets);
    mockGetPricing.mockResolvedValue(mockPricing);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue(mockCards),
    } as any);

    const mockPricingResult = {
      listingPrice: 0.24,
      status: 'matched' as const,
      reason: 'Priced at 98% of market',
    };

    vi.mocked(calculatePrice).mockReturnValue(mockPricingResult);

    let updateCallArgs: any = null;
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockImplementation((args) => {
        updateCallArgs = args;
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/fetch-prices',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.updated).toBe(1);
    expect(body.notFound).toBe(0);
    expect(calculatePrice).toHaveBeenCalledWith({ marketPrice: 0.24 });
    expect(updateCallArgs.isFoilPrice).toBe(true);
    expect(updateCallArgs.notes).toContain(
      'Price from Foil (no Normal pricing available)',
    );
  });

  it('should prefer Normal pricing over Foil when both are available', async () => {
    const mockSets = [
      {
        id: 24344,
        name: 'Origins',
        abbreviation: 'OGN',
        is_supplemental: false,
        published_on: '2025-10-31',
        modified_on: '2026-03-06 20:26:58',
        product_count: 364,
        sku_count: 2626,
        products_modified: '2026-02-26T03:30:58-05:00',
        pricing_modified: '2026-03-28T08:04:25-04:00',
        skus_modified: '2026-03-28T09:30:39-04:00',
        api_url: '/tcgapi/v1/89/sets/24344',
        pricing_url: '/tcgapi/v1/89/sets/24344/pricing',
        skus_url: '/tcgapi/v1/89/sets/24344/skus',
      },
    ];

    const mockPricing = {
      set_id: 24344,
      updated: '2026-03-28T08:04:25-04:00',
      prices: {
        '652954': {
          tcg: {
            Foil: { low: 0.55, market: 9.13 },
            Normal: { low: 0.05, market: 0.2 },
          },
        },
      },
    };

    const mockCards = [
      {
        id: 1,
        tcgplayerId: 8927752,
        tcgProductId: 652954,
        productName: 'Card with Both Pricing',
        condition: 'Near Mint',
        marketPrice: null,
        listingPrice: null,
        isFoilPrice: false,
        notes: null,
        status: 'needs_attention' as const,
      },
    ];

    mockGetSets.mockResolvedValue(mockSets);
    mockGetPricing.mockResolvedValue(mockPricing);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue(mockCards),
    } as any);

    const mockPricingResult = {
      listingPrice: 0.2,
      status: 'matched' as const,
      reason: 'Priced at 98% of market',
    };

    vi.mocked(calculatePrice).mockReturnValue(mockPricingResult);

    let updateCallArgs: any = null;
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockImplementation((args) => {
        updateCallArgs = args;
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/fetch-prices',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.updated).toBe(1);
    expect(calculatePrice).toHaveBeenCalledWith({ marketPrice: 0.2 }); // Should use Normal price
    expect(updateCallArgs.isFoilPrice).toBe(false);
    expect(
      updateCallArgs.notes === null ||
        !updateCallArgs.notes.includes('Price from Foil'),
    ).toBe(true);
  });

  it('should clear foil fallback flag when Normal pricing becomes available', async () => {
    const mockSets = [
      {
        id: 24344,
        name: 'Origins',
        abbreviation: 'OGN',
        is_supplemental: false,
        published_on: '2025-10-31',
        modified_on: '2026-03-06 20:26:58',
        product_count: 364,
        sku_count: 2626,
        products_modified: '2026-02-26T03:30:58-05:00',
        pricing_modified: '2026-03-28T08:04:25-04:00',
        skus_modified: '2026-03-28T09:30:39-04:00',
        api_url: '/tcgapi/v1/89/sets/24344',
        pricing_url: '/tcgapi/v1/89/sets/24344/pricing',
        skus_url: '/tcgapi/v1/89/sets/24344/skus',
      },
    ];

    const mockPricing = {
      set_id: 24344,
      updated: '2026-03-28T08:04:25-04:00',
      prices: {
        '652802': {
          tcg: {
            Normal: { low: 0.15, market: 0.25 },
          },
        },
      },
    };

    const mockCards = [
      {
        id: 1,
        tcgplayerId: 8926802,
        tcgProductId: 652802,
        productName: 'Previously Foil Priced Card',
        condition: 'Near Mint',
        marketPrice: '0.24',
        listingPrice: '0.24',
        isFoilPrice: true,
        notes: 'Price from Foil (no Normal pricing available)',
        status: 'matched' as const,
      },
    ];

    mockGetSets.mockResolvedValue(mockSets);
    mockGetPricing.mockResolvedValue(mockPricing);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue(mockCards),
    } as any);

    const mockPricingResult = {
      listingPrice: 0.25,
      status: 'matched' as const,
      reason: 'Priced at 98% of market',
    };

    vi.mocked(calculatePrice).mockReturnValue(mockPricingResult);

    let updateCallArgs: any = null;
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockImplementation((args) => {
        updateCallArgs = args;
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/fetch-prices',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.updated).toBe(1);
    expect(calculatePrice).toHaveBeenCalledWith({ marketPrice: 0.25 });
    expect(updateCallArgs.isFoilPrice).toBe(false);
    expect(updateCallArgs.notes).toBe(null); // Foil note should be removed (returns null when empty)
  });

  it('should update cards that drop below $0.05 to gift status', async () => {
    const mockSets = [
      {
        id: 24344,
        name: 'Origins',
        abbreviation: 'OGN',
        is_supplemental: false,
        published_on: '2025-10-31',
        modified_on: '2026-03-06 20:26:58',
        product_count: 364,
        sku_count: 2626,
        products_modified: '2026-02-26T03:30:58-05:00',
        pricing_modified: '2026-03-28T08:04:25-04:00',
        skus_modified: '2026-03-28T09:30:39-04:00',
        api_url: '/tcgapi/v1/89/sets/24344',
        pricing_url: '/tcgapi/v1/89/sets/24344/pricing',
        skus_url: '/tcgapi/v1/89/sets/24344/skus',
      },
    ];

    const mockPricing = {
      set_id: 24344,
      updated: '2026-03-28T08:04:25-04:00',
      prices: {
        '12345': {
          tcg: {
            Normal: { low: 0.01, market: 0.03 },
          },
        },
      },
    };

    const mockCards = [
      {
        id: 1,
        tcgplayerId: 8926802,
        tcgProductId: 12345,
        productName: 'Cheap Card',
        condition: 'Near Mint',
        marketPrice: '0.10',
        listingPrice: '0.10',
        status: 'listed' as const,
      },
    ];

    mockGetSets.mockResolvedValue(mockSets);
    mockGetPricing.mockResolvedValue(mockPricing);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue(mockCards),
    } as any);

    const mockPricingResult = {
      listingPrice: null,
      status: 'gift' as const,
      reason: 'Market price below minimum threshold',
    };

    vi.mocked(calculatePrice).mockReturnValue(mockPricingResult);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/fetch-prices',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.updated).toBe(1);
    expect(calculatePrice).toHaveBeenCalledWith({ marketPrice: 0.03 });
  });
});

describe('GET /api/cards/price-check-status', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should return scheduler status payload', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/cards/price-check-status',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body).toHaveProperty('enabled');
    expect(body).toHaveProperty('intervalHours');
    expect(body).toHaveProperty('thresholdPercent');
    expect(body).toHaveProperty('running');
    expect(body).toHaveProperty('lastRun');
  });
});

describe('GET /api/cards/:id/price-history', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should return price history for a card ordered by checkedAt descending', async () => {
    const mockHistory = [
      {
        id: 2,
        cardId: 123,
        source: 'scheduled' as const,
        previousMarketPrice: '1.00',
        newMarketPrice: '1.10',
        previousListingPrice: '0.98',
        newListingPrice: '1.08',
        previousStatus: 'listed' as const,
        newStatus: 'listed' as const,
        driftPercent: '10.00',
        notificationSent: true,
        checkedAt: new Date('2026-03-31T12:00:00.000Z'),
      },
      {
        id: 1,
        cardId: 123,
        source: 'manual' as const,
        previousMarketPrice: '0.90',
        newMarketPrice: '1.00',
        previousListingPrice: '0.88',
        newListingPrice: '0.98',
        previousStatus: 'matched' as const,
        newStatus: 'listed' as const,
        driftPercent: '11.11',
        notificationSent: false,
        checkedAt: new Date('2026-03-30T12:00:00.000Z'),
      },
    ];

    const limit = vi.fn().mockResolvedValue(mockHistory);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({ where }),
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/cards/123/price-history',
    });

    expect(response.statusCode).toBe(200);
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(50);
    expect(JSON.parse(response.body)).toEqual({
      history: mockHistory.map((entry) => ({
        ...entry,
        checkedAt: entry.checkedAt.toISOString(),
      })),
    });
  });

  it('should parse the limit query and cap it at 200', async () => {
    const limit = vi.fn().mockResolvedValue([]);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({ limit }),
        }),
      }),
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/cards/123/price-history?limit=500',
    });

    expect(response.statusCode).toBe(200);
    expect(limit).toHaveBeenCalledWith(200);
    expect(JSON.parse(response.body)).toEqual({ history: [] });
  });

  it('should return an empty history array when no price history exists', async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/cards/999/price-history',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ history: [] });
  });

  it('should return 400 for a malformed card id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/cards/not-a-number/price-history',
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: 'Invalid card id' });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('should return 400 for a non-positive card id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/cards/0/price-history',
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: 'Invalid card id' });
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('POST /api/cards/mark-listed', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should mark matched cards as listed', async () => {
    const mockCards = [
      {
        id: 1,
        productName: 'Card 1',
        status: 'matched' as const,
        updatedAt: new Date(),
      },
      {
        id: 2,
        productName: 'Card 2',
        status: 'matched' as const,
        updatedAt: new Date(),
      },
    ];

    // Mock select to return cards with matched status
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockCards),
      }),
    } as any);

    // Mock update to change status to listed
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/mark-listed',
      payload: { cardIds: [1, 2] },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.updated).toBe(2);
    expect(body.errors).toEqual([]);
  });

  it('should skip non-matched cards with error messages', async () => {
    const mockCards = [
      {
        id: 1,
        productName: 'Gift Card',
        status: 'gift' as const,
        updatedAt: new Date(),
      },
      {
        id: 2,
        productName: 'Listed Card',
        status: 'listed' as const,
        updatedAt: new Date(),
      },
    ];

    // Mock select to return cards with non-matched status
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockCards),
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/mark-listed',
      payload: { cardIds: [1, 2] },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.updated).toBe(0);
    expect(body.errors).toHaveLength(2);
    expect(body.errors[0]).toContain('Gift Card');
    expect(body.errors[0]).toContain('gift');
    expect(body.errors[1]).toContain('Listed Card');
    expect(body.errors[1]).toContain('listed');
  });

  it('should handle mix of matched and non-matched cards', async () => {
    const mockCards = [
      {
        id: 1,
        productName: 'Matched Card',
        status: 'matched' as const,
        updatedAt: new Date(),
      },
      {
        id: 2,
        productName: 'Pending Card',
        status: 'pending' as const,
        updatedAt: new Date(),
      },
      {
        id: 3,
        productName: 'Another Matched',
        status: 'matched' as const,
        updatedAt: new Date(),
      },
    ];

    // Mock select to return all cards
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockCards),
      }),
    } as any);

    // Mock update to change status to listed (only for matched cards)
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/mark-listed',
      payload: { cardIds: [1, 2, 3] },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.updated).toBe(2);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toContain('Pending Card');
  });

  it('should return 400 for empty cardIds array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/mark-listed',
      payload: { cardIds: [] },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
  });

  it('should return 400 for missing cardIds', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/mark-listed',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/cards/:id/unlist', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cardsRoutes, { prefix: '/api/cards' });
  });

  it('should unlist a listed card and reprice it', async () => {
    const mockCard = {
      id: 1,
      productName: 'Listed Card',
      status: 'listed' as const,
      marketPrice: '2.00',
      listingPrice: '1.96',
      floorPriceCents: null,
      updatedAt: new Date(),
    };

    // Mock select to find the card
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([mockCard]),
      }),
    } as any);

    const mockPricingResult = {
      listingPrice: 1.96,
      status: 'matched' as const,
      reason: 'Priced at 98% of market',
    };

    vi.mocked(calculatePrice).mockReturnValue(mockPricingResult);

    const updatedCard = {
      ...mockCard,
      status: 'matched' as const,
      updatedAt: new Date(),
    };

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedCard]),
        }),
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/1/unlist',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe(1);
    expect(body.status).toBe('matched');
    expect(calculatePrice).toHaveBeenCalledWith({ marketPrice: 2.0 });
  });

  it('should apply floorPriceCents when unlisting and recalculating listing price', async () => {
    const mockCard = {
      id: 1,
      productName: 'Listed Card',
      status: 'listed' as const,
      marketPrice: '2.00',
      listingPrice: '1.96',
      floorPriceCents: 250,
      updatedAt: new Date(),
    };

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([mockCard]),
      }),
    } as any);

    vi.mocked(calculatePrice).mockReturnValue({
      listingPrice: 1.96,
      status: 'matched' as const,
      reason: 'Priced at 98% of market',
    });

    let updateArgs: any = null;
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockImplementation((args) => {
        updateArgs = args;
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                ...mockCard,
                status: 'matched' as const,
                listingPrice: '2.5',
                updatedAt: new Date(),
              },
            ]),
          }),
        };
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/1/unlist',
    });

    expect(response.statusCode).toBe(200);
    expect(applyFloorPriceCents).toHaveBeenCalledWith({
      listingPrice: 1.96,
      floorPriceCents: 250,
    });
    expect(updateArgs).toEqual(
      expect.objectContaining({
        status: 'matched',
        listingPrice: '2.5',
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('should return 400 for non-listed card', async () => {
    const mockCard = {
      id: 1,
      productName: 'Matched Card',
      status: 'matched' as const,
      updatedAt: new Date(),
    };

    // Mock select to find the card
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([mockCard]),
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/1/unlist',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Only listed cards can be unlisted');
  });

  it('should return 404 for non-existent card', async () => {
    // Mock select to find no card
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/999/unlist',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Card not found');
  });
});
