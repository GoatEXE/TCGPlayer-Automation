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
  dbReturning,
  calculatePrice,
  applyFloorPriceCents,
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
  dbReturning: vi.fn(),
  calculatePrice: vi.fn(),
  applyFloorPriceCents: vi.fn(({ listingPrice, floorPriceCents }) => {
    if (listingPrice === null || floorPriceCents == null) {
      return listingPrice;
    }

    return Math.max(listingPrice, floorPriceCents / 100);
  }),
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
vi.mock('../../pricing/index.js', () => ({
  calculatePrice,
  applyFloorPriceCents,
}));
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
    dbValues.mockReturnValue({ returning: dbReturning });
    dbReturning.mockResolvedValue([{ id: 999 }]);

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

  it('marks cards as needs_attention when market price is missing', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 10,
        tcgProductId: 123,
        productName: 'No Market Card',
        condition: 'Near Mint',
        marketPrice: '1.25',
        listingPrice: '1.00',
        status: 'listed',
        notes: null,
      },
    ]);

    mockGetPricing.mockResolvedValueOnce({
      prices: {},
    });
    dbReturning.mockResolvedValueOnce([{ id: 501 }]);

    const result = await runPriceCheck({ source: 'scheduled' });

    expect(calculatePrice).not.toHaveBeenCalled();
    expect(dbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        marketPrice: null,
        listingPrice: null,
        status: 'needs_attention',
        updatedAt: expect.any(Date),
      }),
    );
    expect(dbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 10,
        source: 'scheduled',
        previousMarketPrice: '1.25',
        newMarketPrice: null,
        previousListingPrice: '1',
        newListingPrice: null,
        adjustedToPrice: null,
        previousStatus: 'listed',
        newStatus: 'needs_attention',
        driftPercent: null,
        checkedAt: expect.any(Date),
      }),
    );
    expect(dbReturning).toHaveBeenCalledWith({ id: expect.anything() });
    expect(result).toMatchObject({
      updated: 0,
      notFound: 1,
      drifted: 0,
      driftedCards: [],
      driftedHistoryIds: [],
      needsAttentionCards: [
        {
          cardId: 10,
          productName: 'No Market Card',
        },
      ],
      needsAttentionHistoryIds: [501],
      csvDiff: {
        rows: [
          expect.objectContaining({
            action: 'remove_listing',
            cardId: 10,
            previousStatus: 'listed',
            newStatus: 'needs_attention',
          }),
        ],
      },
      errors: [],
    });
  });

  it('does not add needs_attention alerts when a missing-price card is already in needs_attention', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 11,
        tcgProductId: 123,
        productName: 'Still Missing',
        condition: 'Near Mint',
        marketPrice: null,
        listingPrice: null,
        status: 'needs_attention',
        notes: null,
      },
    ]);

    mockGetPricing.mockResolvedValueOnce({
      prices: {},
    });
    dbReturning.mockResolvedValueOnce([{ id: 502 }]);

    const result = await runPriceCheck({ source: 'scheduled' });

    expect(result).toMatchObject({
      updated: 0,
      notFound: 1,
      driftedHistoryIds: [],
      needsAttentionCards: [],
      needsAttentionHistoryIds: [],
      csvDiff: {
        rows: [],
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
    dbReturning.mockResolvedValueOnce([{ id: 601 }]);

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
        adjustedToPrice: '0.8',
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
      driftedHistoryIds: [601],
      needsAttentionCards: [],
      needsAttentionHistoryIds: [],
      csvDiff: {
        rows: [
          expect.objectContaining({
            action: 'price_change',
            cardId: 1,
            previousStatus: 'listed',
            newStatus: 'listed',
            previousListingPrice: 1,
            newListingPrice: 0.8,
            driftPercent: -20,
          }),
        ],
      },
    });
  });

  it('leaves adjustedToPrice null when listed price change is below drift threshold', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 7,
        tcgProductId: 123,
        productName: 'Low Drift Card',
        condition: 'Near Mint',
        marketPrice: '1.00',
        listingPrice: '1.00',
        status: 'listed',
        notes: null,
      },
    ]);
    calculatePrice.mockReturnValue({
      listingPrice: 1.01,
      status: 'matched',
      reason: 'tiny increase',
    });
    dbReturning.mockResolvedValueOnce([{ id: 605 }]);

    const result = await runPriceCheck({ source: 'manual' });

    expect(dbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        listingPrice: '1',
        status: 'listed',
      }),
    );

    expect(dbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 7,
        adjustedToPrice: null,
        previousStatus: 'listed',
        newStatus: 'listed',
        driftPercent: '0',
      }),
    );

    expect(result).toMatchObject({
      drifted: 0,
      driftedHistoryIds: [],
      csvDiff: {
        rows: [],
      },
    });
  });

  it('applies a card floor price when calculated listing price remains non-null', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 2,
        tcgProductId: 123,
        productName: 'Vi',
        condition: 'Near Mint',
        marketPrice: '0.60',
        listingPrice: '0.55',
        floorPriceCents: 60,
        status: 'listed',
        notes: null,
      },
    ]);
    calculatePrice.mockReturnValue({
      listingPrice: 0.5,
      status: 'matched',
      reason: 'drop',
    });
    dbReturning.mockResolvedValueOnce([{ id: 602 }]);

    const result = await runPriceCheck({ source: 'manual' });

    expect(dbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        marketPrice: '0.51',
        listingPrice: '0.6',
        status: 'listed',
        isFoilPrice: false,
        notes: null,
        updatedAt: expect.any(Date),
      }),
    );
    expect(dbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 2,
        source: 'manual',
        previousListingPrice: '0.55',
        newListingPrice: '0.6',
        adjustedToPrice: '0.6',
        previousStatus: 'listed',
        newStatus: 'listed',
        driftPercent: '9.09',
        checkedAt: expect.any(Date),
      }),
    );
    expect(result).toMatchObject({
      updated: 1,
      notFound: 0,
      drifted: 1,
      driftedCards: [
        {
          cardId: 2,
          productName: 'Vi',
          previousListingPrice: 0.55,
          newListingPrice: 0.6,
          driftPercent: 9.09,
        },
      ],
      driftedHistoryIds: [602],
      needsAttentionCards: [],
      needsAttentionHistoryIds: [],
      csvDiff: {
        rows: [
          expect.objectContaining({
            action: 'price_change',
            cardId: 2,
            previousStatus: 'listed',
            newStatus: 'listed',
            previousListingPrice: 0.55,
            newListingPrice: 0.6,
            driftPercent: 9.09,
          }),
        ],
      },
    });
  });

  it('adds add_listing CSV diff rows when a non-listed card becomes matched', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 8,
        tcgProductId: 123,
        productName: 'Relist Me',
        condition: 'Near Mint',
        marketPrice: '0.02',
        listingPrice: null,
        status: 'gift',
        notes: null,
      },
    ]);
    calculatePrice.mockReturnValue({
      listingPrice: 0.5,
      status: 'matched',
      reason: 'price recovered',
    });
    dbReturning.mockResolvedValueOnce([{ id: 710 }]);

    const result = await runPriceCheck({ source: 'scheduled' });

    expect(dbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 8,
        previousStatus: 'gift',
        newStatus: 'matched',
        adjustedToPrice: null,
      }),
    );

    expect(result.csvDiff.rows).toEqual([
      expect.objectContaining({
        action: 'add_listing',
        cardId: 8,
        previousStatus: 'gift',
        newStatus: 'matched',
      }),
    ]);
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
      dbReturning.mockResolvedValueOnce([
        { id: nextStatus === 'needs_attention' ? 701 : 702 },
      ]);

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
          adjustedToPrice: null,
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
        driftedHistoryIds: [],
        needsAttentionCards:
          nextStatus === 'needs_attention'
            ? [
                {
                  cardId: 2,
                  productName: 'Yasuo',
                },
              ]
            : [],
        needsAttentionHistoryIds: nextStatus === 'needs_attention' ? [701] : [],
        csvDiff: {
          rows: [
            expect.objectContaining({
              action: 'remove_listing',
              cardId: 2,
              previousStatus: 'listed',
              newStatus: nextStatus,
            }),
          ],
        },
      });
    },
  );
});
