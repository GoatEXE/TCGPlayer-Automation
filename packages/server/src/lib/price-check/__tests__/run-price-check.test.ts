import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  env,
  dbSelect,
  dbFrom,
  dbUpdate,
  dbSet,
  dbWhere,
  dbInsert,
  dbValues,
  calculatePrice,
  mockGetSets,
  mockGetPricing,
} = vi.hoisted(() => ({
  env: {
    MAX_PRICE_DROP_PERCENT: 20,
    PRICE_DRIFT_THRESHOLD_PERCENT: 2,
  },
  dbSelect: vi.fn(),
  dbFrom: vi.fn(),
  dbUpdate: vi.fn(),
  dbSet: vi.fn(),
  dbWhere: vi.fn(),
  dbInsert: vi.fn(),
  dbValues: vi.fn(),
  calculatePrice: vi.fn(),
  mockGetSets: vi.fn(),
  mockGetPricing: vi.fn(),
}));

vi.mock('../../../config/env.js', () => ({ env }));
vi.mock('../../../db/index.js', () => ({
  db: {
    select: dbSelect,
    update: dbUpdate,
    insert: dbInsert,
  },
}));
vi.mock('../../pricing/index.js', () => ({ calculatePrice }));
vi.mock('../../tcgtracking/client.js', () => ({
  TCGTrackingClient: class {
    getSets = mockGetSets;
    getPricing = mockGetPricing;
  },
}));

import { runPriceCheck } from '../run-price-check.js';

describe('runPriceCheck max single-cycle listing-price drop safeguard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    env.MAX_PRICE_DROP_PERCENT = 20;
    env.PRICE_DRIFT_THRESHOLD_PERCENT = 2;

    dbSelect.mockReturnValue({ from: dbFrom });
    dbFrom.mockResolvedValue([]);

    dbUpdate.mockReturnValue({ set: dbSet });
    dbSet.mockReturnValue({ where: dbWhere });
    dbWhere.mockResolvedValue(undefined);

    dbInsert.mockReturnValue({ values: dbValues });
    dbValues.mockResolvedValue(undefined);

    mockGetSets.mockResolvedValue([{ id: 1, name: 'Origins' }]);
    mockGetPricing.mockResolvedValue({
      prices: {
        '123': {
          tcg: {
            Normal: { market: 0.51 },
          },
        },
      },
    });
  });

  it('caps a listed card downward reprice to the configured max drop percent', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 1,
        tcgProductId: 123,
        productName: 'Jinx',
        condition: 'Near Mint',
        marketPrice: '1.25',
        listingPrice: '1.00',
        status: 'listed',
        notes: null,
      },
    ]);
    calculatePrice.mockReturnValue({
      listingPrice: 0.5,
      status: 'matched',
      reason: 'drop',
    });

    const result = await runPriceCheck({ source: 'manual' });

    expect(dbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        marketPrice: '0.51',
        listingPrice: '0.8',
        status: 'listed',
        isFoilPrice: false,
        notes: null,
        updatedAt: expect.any(Date),
      }),
    );
    expect(dbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 1,
        source: 'manual',
        previousListingPrice: '1',
        newListingPrice: '0.8',
        previousStatus: 'listed',
        newStatus: 'listed',
        driftPercent: '-20',
        checkedAt: expect.any(Date),
      }),
    );
    expect(result).toMatchObject({
      updated: 1,
      notFound: 0,
      drifted: 1,
      driftedCards: [
        {
          cardId: 1,
          productName: 'Jinx',
          previousListingPrice: 1,
          newListingPrice: 0.8,
          driftPercent: -20,
        },
      ],
    });
  });

  it.each(['gift', 'needs_attention'] as const)(
    'does not block %s transitions when pricing logic returns no listing price',
    async (nextStatus) => {
      dbFrom.mockResolvedValueOnce([
        {
          id: 2,
          tcgProductId: 123,
          productName: 'Yasuo',
          condition: 'Near Mint',
          marketPrice: '1.25',
          listingPrice: '1.00',
          status: 'listed',
          notes: null,
        },
      ]);
      calculatePrice.mockReturnValue({
        listingPrice: null,
        status: nextStatus,
        reason: 'no listing price',
      });

      const result = await runPriceCheck({ source: 'scheduled' });

      expect(dbSet).toHaveBeenCalledWith(
        expect.objectContaining({
          marketPrice: '0.51',
          listingPrice: null,
          status: nextStatus,
        }),
      );
      expect(dbValues).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: 2,
          source: 'scheduled',
          newListingPrice: null,
          previousStatus: 'listed',
          newStatus: nextStatus,
          driftPercent: null,
        }),
      );
      expect(result).toMatchObject({
        updated: 1,
        notFound: 0,
        drifted: 0,
        driftedCards: [],
      });
    },
  );
});
