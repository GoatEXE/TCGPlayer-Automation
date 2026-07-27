import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { catalogRoutes } from '../catalog.js';

vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

const tcgtrackingMocks = vi.hoisted(() => ({
  getSets: vi.fn(),
  getProducts: vi.fn(),
}));

vi.mock('../../lib/tcgtracking/client.js', () => ({
  TCGTrackingClient: class {
    getSets = tcgtrackingMocks.getSets;
    getProducts = tcgtrackingMocks.getProducts;
  },
}));

import { db } from '../../db/index.js';

function queryRows(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
    then: vi.fn((resolve, reject) =>
      Promise.resolve(rows).then(resolve, reject),
    ),
  };
}

function mockLookupRows(rows: unknown[]) {
  vi.mocked(db.select).mockReturnValue(queryRows(rows) as any);
}

function mockInsert() {
  const query = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(db.insert).mockReturnValue(query as any);
  return query;
}

describe('catalog routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    tcgtrackingMocks.getSets.mockResolvedValue([]);
    tcgtrackingMocks.getProducts.mockResolvedValue([]);
    mockInsert();
    app = Fastify();
    await app.register(catalogRoutes, { prefix: '/api/catalog' });
  });

  it('resolves lookup by set code and normalized collector number', async () => {
    mockLookupRows([
      {
        id: 1,
        tcgProductId: 123,
        productName: 'Inferna',
        title: null,
        collectorNumber: '002/219',
        normalizedNumber: '2/219',
        rarity: 'Champion',
        photoUrl: null,
        set: { id: 10, setCode: 'UNL', name: 'Riftbound Origins' },
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/catalog/lookup?setCode=unl&number=002%2F219',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      status: 'resolved',
      query: { setCode: 'UNL', normalizedNumber: '2/219' },
      candidates: [{ productName: 'Inferna' }],
    });
  });

  it('returns ambiguous when multiple catalog cards match a set and number', async () => {
    mockLookupRows([
      {
        id: 1,
        productName: 'Promo A',
        set: { id: 10, setCode: 'UNL', name: 'Riftbound Origins' },
      },
      {
        id: 2,
        productName: 'Promo B',
        set: { id: 10, setCode: 'UNL', name: 'Riftbound Origins' },
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/catalog/lookup?setCode=UNL&number=2%2F219',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ambiguous');
    expect(body.candidates).toHaveLength(2);
  });

  it('returns unresolved without syncing when sync=false', async () => {
    mockLookupRows([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/catalog/lookup?setCode=UNL&number=999%2F219&sync=false',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('unresolved');
    expect(body.candidates).toEqual([]);
  });

  it('reports catalog status counts for scanner readiness', async () => {
    const lastSyncedAt = new Date('2026-07-26T03:30:00.000Z');
    vi.mocked(db.select)
      .mockReturnValueOnce(
        queryRows([
          { count: 2, lastSyncedAt: new Date('2026-07-26T03:00:00.000Z') },
        ]) as any,
      )
      .mockReturnValueOnce(queryRows([{ count: 321, lastSyncedAt }]) as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/catalog/status',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      catalog: {
        sets: 2,
        cards: 321,
        lastSyncedAt: lastSyncedAt.toISOString(),
        ready: true,
      },
    });
  });

  it('syncs all cached Riftbound sets after refreshing the TCGTracking set list', async () => {
    tcgtrackingMocks.getSets.mockResolvedValue([
      {
        id: 24560,
        abbreviation: 'UNL',
        name: 'Unleashed',
        is_supplemental: false,
        published_on: '2025-01-01',
        products_modified: '2026-07-26T00:00:00Z',
      },
      {
        id: 24561,
        abbreviation: 'ABC',
        name: 'Future Set',
        is_supplemental: false,
        published_on: '2025-02-01',
        products_modified: '2026-07-26T00:00:00Z',
      },
    ]);
    tcgtrackingMocks.getProducts
      .mockResolvedValueOnce([
        { id: 696616, name: 'Calm Rune', number: 'R02' },
        { id: 696622, name: 'Sprite // Buff', number: 'T07 // T04' },
      ])
      .mockResolvedValueOnce([
        { id: 700001, name: 'Future Card', number: '001/200' },
      ]);
    vi.mocked(db.select).mockReturnValueOnce(
      queryRows([
        {
          id: 10,
          tcgtrackingSetId: 24560,
          setCode: 'UNL',
          name: 'Unleashed',
        },
        {
          id: 11,
          tcgtrackingSetId: 24561,
          setCode: 'ABC',
          name: 'Future Set',
        },
      ]) as any,
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/catalog/sync',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      status: 'synced',
      syncedSets: 2,
      attemptedSets: 2,
      syncedCards: 3,
      failedSets: 0,
      results: [
        { setCode: 'UNL', syncedCards: 2, status: 'synced' },
        { setCode: 'ABC', syncedCards: 1, status: 'synced' },
      ],
    });
    expect(tcgtrackingMocks.getSets).toHaveBeenCalledTimes(1);
    expect(tcgtrackingMocks.getProducts).toHaveBeenCalledWith(24560);
    expect(tcgtrackingMocks.getProducts).toHaveBeenCalledWith(24561);
  });

  it('continues with cached sets when sync-all set-list refresh fails', async () => {
    tcgtrackingMocks.getSets.mockRejectedValueOnce(
      new Error('set list unavailable'),
    );
    tcgtrackingMocks.getProducts.mockResolvedValueOnce([
      { id: 696616, name: 'Calm Rune', number: 'R02' },
    ]);
    vi.mocked(db.select).mockReturnValueOnce(
      queryRows([
        {
          id: 10,
          tcgtrackingSetId: 24560,
          setCode: 'UNL',
          name: 'Unleashed',
        },
      ]) as any,
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/catalog/sync',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      status: 'partial',
      syncedSets: 0,
      attemptedSets: 1,
      syncedCards: 1,
      failedSets: 0,
      setListError: 'set list unavailable',
      results: [{ setCode: 'UNL', syncedCards: 1, status: 'synced' }],
    });
  });

  it('reports per-set failures while keeping successful sync-all results', async () => {
    tcgtrackingMocks.getSets.mockResolvedValue([
      {
        id: 24560,
        abbreviation: 'UNL',
        name: 'Unleashed',
        is_supplemental: false,
      },
      {
        id: 24561,
        abbreviation: 'BAD',
        name: 'Broken Set',
        is_supplemental: false,
      },
    ]);
    tcgtrackingMocks.getProducts
      .mockResolvedValueOnce([{ id: 696616, name: 'Calm Rune', number: 'R02' }])
      .mockRejectedValueOnce(new Error('TCGTracking unavailable'));
    vi.mocked(db.select).mockReturnValueOnce(
      queryRows([
        {
          id: 10,
          tcgtrackingSetId: 24560,
          setCode: 'UNL',
          name: 'Unleashed',
        },
        {
          id: 11,
          tcgtrackingSetId: 24561,
          setCode: 'BAD',
          name: 'Broken Set',
        },
      ]) as any,
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/catalog/sync',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      status: 'partial',
      syncedSets: 2,
      attemptedSets: 2,
      syncedCards: 1,
      failedSets: 1,
      results: [
        { setCode: 'UNL', syncedCards: 1, status: 'synced' },
        {
          setCode: 'BAD',
          syncedCards: 0,
          status: 'failed',
          error: 'TCGTracking unavailable',
        },
      ],
    });
  });

  it('preserves single-set catalog sync behavior', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      queryRows([
        {
          id: 10,
          tcgtrackingSetId: 24560,
          setCode: 'UNL',
          name: 'Unleashed',
        },
      ]) as any,
    );
    tcgtrackingMocks.getProducts.mockResolvedValueOnce([
      { id: 696616, name: 'Calm Rune', number: 'R02' },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/catalog/sync',
      payload: { setCode: 'unl' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      status: 'synced',
      syncedSets: 0,
      attemptedSets: 1,
      syncedCards: 1,
    });
    expect(tcgtrackingMocks.getSets).not.toHaveBeenCalled();
    expect(tcgtrackingMocks.getProducts).toHaveBeenCalledWith(24560);
  });
});
