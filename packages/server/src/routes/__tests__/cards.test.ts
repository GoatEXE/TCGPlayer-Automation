import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { cardsRoutes } from '../cards.js';
import multipart from '@fastify/multipart';

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
}));

import { db } from '../../db/index.js';
import { parseCsv, parseTxt } from '../../lib/importers/index.js';
import { calculatePrice } from '../../lib/pricing/index.js';

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
        productLine: 'Riftbound',
        setName: 'Origins',
        productName: 'Test Card',
        title: null,
        number: '1/298',
        rarity: 'Common',
        condition: 'Near Mint',
        quantity: 4,
        snapshotMarketPrice: 1.50,
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

    const csvContent = 'Quantity,TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Price,Add to Quantity,Photo,test\n4,12345,Riftbound,Origins,Test Card,,1/298,Common,Near Mint,1.50,1.40,1.45,1.40,5.60,4,https://example.com/card.jpg,';
    
    const form = new FormData();
    const blob = new Blob([csvContent], { type: 'text/csv' });
    form.append('file', blob, 'cards.csv');

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/import',
      payload: form,
      headers: form.getHeaders ? form.getHeaders() : {},
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('imported', 1);
    expect(body).toHaveProperty('errors');
    expect(body).toHaveProperty('cards');
    expect(body.cards).toHaveLength(1);
  });

  it('should import TXT file and return cards', async () => {
    const mockImportedCards = [
      {
        tcgplayerId: null,
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
      headers: form.getHeaders ? form.getHeaders() : {},
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('imported', 1);
  });

  it('should return 400 for invalid file type', async () => {
    const form = new FormData();
    const blob = new Blob(['invalid'], { type: 'application/json' });
    form.append('file', blob, 'cards.json');

    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/import',
      payload: form,
      headers: form.getHeaders ? form.getHeaders() : {},
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
        importedAt: new Date(),
      },
      {
        id: 2,
        productName: 'Card 2',
        quantity: 2,
        status: 'gift' as const,
        importedAt: new Date(),
      },
    ];

    // Create a mock chain that returns cards
    const mockOffset = vi.fn().mockResolvedValue(mockCards);
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit, offset: mockOffset });
    const mockFrom = vi.fn().mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit, offset: mockOffset });
    
    // Mock select to handle both count and card queries
    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation((...args: any[]) => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // First call is count query
        return {
          from: vi.fn().mockResolvedValue([{ count: 2 }]),
        } as any;
      }
      // Second call is cards query
      return { from: mockFrom } as any;
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
  });

  it('should filter cards by status', async () => {
    const mockCards = [
      {
        id: 1,
        productName: 'Gift Card',
        quantity: 1,
        status: 'gift' as const,
        importedAt: new Date(),
      },
    ];

    // Create mock chain with where clause
    const mockOffset = vi.fn().mockResolvedValue(mockCards);
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit, offset: mockOffset });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit, offset: mockOffset });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere, orderBy: mockOrderBy, limit: mockLimit, offset: mockOffset });

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation((...args: any[]) => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // First call is count query with where
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        } as any;
      }
      // Second call is cards query
      return { from: mockFrom } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/cards?status=gift',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.cards).toBeDefined();
  });

  it('should search cards by productName', async () => {
    const mockCards = [
      {
        id: 1,
        productName: 'Searched Card',
        quantity: 1,
        status: 'listed' as const,
        importedAt: new Date(),
      },
    ];

    // Create mock chain with where clause
    const mockOffset = vi.fn().mockResolvedValue(mockCards);
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit, offset: mockOffset });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit, offset: mockOffset });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere, orderBy: mockOrderBy, limit: mockLimit, offset: mockOffset });

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation((...args: any[]) => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // First call is count query with where
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        } as any;
      }
      // Second call is cards query
      return { from: mockFrom } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/cards?search=Searched',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.cards).toBeDefined();
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

  it('should reprice all cards with market price', async () => {
    const mockCards = [
      {
        id: 1,
        productName: 'Card 1',
        marketPrice: '1.50',
        listingPrice: '1.40',
        status: 'listed' as const,
      },
      {
        id: 2,
        productName: 'Card 2',
        marketPrice: '0.10',
        listingPrice: null,
        status: 'listed' as const,
      },
    ];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockCards),
      }),
    } as any);

    const mockPricingResult1 = {
      listingPrice: 1.47,
      status: 'listed' as const,
      reason: 'Priced at 98% of market',
    };

    const mockPricingResult2 = {
      listingPrice: null,
      status: 'gift' as const,
      reason: 'Market price below minimum threshold',
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
      url: '/api/cards/reprice-all',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.updated).toBe(2);
    expect(calculatePrice).toHaveBeenCalledTimes(2);
  });
});
