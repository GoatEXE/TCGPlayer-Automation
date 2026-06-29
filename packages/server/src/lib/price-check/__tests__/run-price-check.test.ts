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
    LISTED_PRICE_ATTENTION_THRESHOLD_PERCENT: 5,
    LISTED_PRICE_ATTENTION_MIN_DIFF_CENTS: 5,
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
    env.LISTED_PRICE_ATTENTION_THRESHOLD_PERCENT = 5;
    env.LISTED_PRICE_ATTENTION_MIN_DIFF_CENTS = 5;

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
        listingPrice: '1.00',
        status: 'needs_attention',
        attentionReason: 'listed_missing_price',
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
        newListingPrice: '1',
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
          historyId: 501,
          source: 'scheduled',
          displayName: 'No Market Card',
          productName: 'No Market Card',
          setName: undefined,
          condition: 'Near Mint',
          attentionReason: 'listed_missing_price',
          previousStatus: 'listed',
          newStatus: 'needs_attention',
          previousMarketPrice: 1.25,
          newMarketPrice: null,
          currentListingPrice: 1,
          recommendedListingPrice: null,
          driftPercent: null,
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
            newListingPrice: 1,
          }),
        ],
      },
      errors: [],
    });
  });

  it('includes a missing-price card in needs_attention alerts even when it is already in needs_attention', async () => {
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
      needsAttentionCards: [
        {
          cardId: 11,
          historyId: 502,
          source: 'scheduled',
          displayName: 'Still Missing',
          productName: 'Still Missing',
          attentionReason: null,
          previousStatus: 'needs_attention',
          newStatus: 'needs_attention',
          previousMarketPrice: null,
          newMarketPrice: null,
          currentListingPrice: null,
          recommendedListingPrice: null,
          driftPercent: null,
        },
      ],
      needsAttentionHistoryIds: [502],
      csvDiff: {
        rows: [],
      },
    });
  });

  it('repairs only explicit legacy misaligned collection rows by treating tcgplayerId as product id', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 12,
        tcgplayerId: 123,
        tcgProductId: null,
        productLine: '9197759',
        setName: 'Riftbound: League of Legends Trading Card Game',
        productName: 'Unleashed',
        title: 'Backfill Me',
        number: null,
        rarity: '215/219',
        photoUrl: '2',
        condition: 'Normal',
        marketPrice: '1.25',
        listingPrice: '1.00',
        status: 'listed',
        notes: null,
        floorPriceCents: null,
      },
    ]);
    calculatePrice.mockReturnValue({
      listingPrice: 0.5,
      status: 'matched',
      reason: 'drop',
    });
    dbReturning.mockResolvedValueOnce([{ id: 503 }]);

    const result = await runPriceCheck({ source: 'manual' });

    expect(dbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        tcgProductId: 123,
        marketPrice: '0.51',
        listingPrice: '1.00',
        status: 'needs_attention',
        attentionReason: 'listed_price_drift',
      }),
    );
    expect(result).toMatchObject({
      updated: 1,
      notFound: 0,
      drifted: 1,
      needsAttentionCards: [
        {
          cardId: 12,
          historyId: 503,
          source: 'manual',
          displayName: 'Backfill Me',
          productName: 'Unleashed',
          title: 'Backfill Me',
          setName: 'Riftbound: League of Legends Trading Card Game',
          condition: 'Normal',
          attentionReason: 'listed_price_drift',
          previousStatus: 'listed',
          newStatus: 'needs_attention',
          previousMarketPrice: 1.25,
          newMarketPrice: 0.51,
          currentListingPrice: 1,
          recommendedListingPrice: 0.5,
          driftPercent: -50,
        },
      ],
    });
  });

  it('does not treat arbitrary tcgplayerId values as product ids without the legacy misalignment signature', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 13,
        tcgplayerId: 123,
        tcgProductId: null,
        productLine: 'Riftbound: League of Legends Trading Card Game',
        setName: 'Origins',
        productName: 'Legit Row',
        title: null,
        number: '1/298',
        rarity: 'Common',
        photoUrl: null,
        condition: 'Near Mint',
        marketPrice: '1.25',
        listingPrice: '1.00',
        status: 'listed',
        notes: null,
        floorPriceCents: null,
      },
    ]);

    const result = await runPriceCheck({ source: 'manual' });

    expect(calculatePrice).not.toHaveBeenCalled();
    expect(dbSet).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      updated: 0,
      notFound: 0,
    });
  });

  it('marks listed cards as needs_attention when listing price drift exceeds threshold', async () => {
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
        listingPrice: '1.00',
        status: 'needs_attention',
        attentionReason: 'listed_price_drift',
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
        newListingPrice: '1',
        adjustedToPrice: '0.5',
        previousStatus: 'listed',
        newStatus: 'needs_attention',
        driftPercent: '-50',
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
          newListingPrice: 0.5,
          driftPercent: -50,
        },
      ],
      driftedHistoryIds: [601],
      needsAttentionCards: [
        {
          cardId: 1,
          historyId: 601,
          source: 'manual',
          displayName: 'Jinx',
          productName: 'Jinx',
          attentionReason: 'listed_price_drift',
          previousStatus: 'listed',
          newStatus: 'needs_attention',
          previousMarketPrice: 1.25,
          newMarketPrice: 0.51,
          currentListingPrice: 1,
          recommendedListingPrice: 0.5,
          driftPercent: -50,
        },
      ],
      needsAttentionHistoryIds: [601],
      csvDiff: {
        rows: [
          expect.objectContaining({
            action: 'remove_listing',
            cardId: 1,
            previousStatus: 'listed',
            newStatus: 'needs_attention',
            previousListingPrice: 1,
            newListingPrice: 1,
            driftPercent: -50,
          }),
        ],
      },
    });
  });

  it('keeps listed cards listed when listing price drift stays below threshold', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 7,
        tcgProductId: 123,
        productName: 'Low Drift Card',
        condition: 'Near Mint',
        marketPrice: '1.00',
        listingPrice: '1.00',
        status: 'listed',
        attentionReason: null,
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
        listingPrice: '1.00',
        status: 'listed',
        attentionReason: null,
      }),
    );

    expect(dbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 7,
        adjustedToPrice: null,
        previousStatus: 'listed',
        newStatus: 'listed',
        newListingPrice: '1',
        driftPercent: '1',
      }),
    );

    expect(result).toMatchObject({
      drifted: 0,
      driftedHistoryIds: [],
      needsAttentionCards: [],
      csvDiff: {
        rows: [],
      },
    });
  });

  it('keeps listed cards listed when percent drift meets threshold but absolute diff stays below the minimum', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 16,
        tcgProductId: 123,
        productName: 'Tiny Diff Card',
        condition: 'Near Mint',
        marketPrice: '0.20',
        listingPrice: '0.20',
        status: 'listed',
        attentionReason: null,
        notes: null,
      },
    ]);
    calculatePrice.mockReturnValue({
      listingPrice: 0.19,
      status: 'matched',
      reason: 'small cent-level drift',
    });
    dbReturning.mockResolvedValueOnce([{ id: 608 }]);

    const result = await runPriceCheck({ source: 'manual' });

    expect(dbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        listingPrice: '0.20',
        status: 'listed',
        attentionReason: null,
      }),
    );
    expect(dbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 16,
        adjustedToPrice: null,
        previousStatus: 'listed',
        newStatus: 'listed',
        newListingPrice: '0.2',
        driftPercent: '-5',
      }),
    );
    expect(result).toMatchObject({
      updated: 1,
      drifted: 0,
      driftedCards: [],
      driftedHistoryIds: [],
      needsAttentionCards: [],
      needsAttentionHistoryIds: [],
    });
  });

  it('marks listed cards as needs_attention when percent drift and absolute diff both meet threshold', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 17,
        tcgProductId: 123,
        productName: 'Big Diff Card',
        condition: 'Near Mint',
        marketPrice: '0.20',
        listingPrice: '0.20',
        status: 'listed',
        attentionReason: null,
        notes: null,
      },
    ]);
    calculatePrice.mockReturnValue({
      listingPrice: 0.15,
      status: 'matched',
      reason: 'big enough drift',
    });
    dbReturning.mockResolvedValueOnce([{ id: 609 }]);

    const result = await runPriceCheck({ source: 'manual' });

    expect(dbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        listingPrice: '0.20',
        status: 'needs_attention',
        attentionReason: 'listed_price_drift',
      }),
    );
    expect(dbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 17,
        adjustedToPrice: '0.15',
        previousStatus: 'listed',
        newStatus: 'needs_attention',
        newListingPrice: '0.2',
        driftPercent: '-25',
      }),
    );
    expect(result).toMatchObject({
      updated: 1,
      drifted: 1,
      driftedCards: [
        {
          cardId: 17,
          productName: 'Big Diff Card',
          previousListingPrice: 0.2,
          newListingPrice: 0.15,
          driftPercent: -25,
        },
      ],
      driftedHistoryIds: [609],
      needsAttentionCards: [
        expect.objectContaining({
          cardId: 17,
          historyId: 609,
          attentionReason: 'listed_price_drift',
          previousStatus: 'listed',
          newStatus: 'needs_attention',
          currentListingPrice: 0.2,
          recommendedListingPrice: 0.15,
          driftPercent: -25,
        }),
      ],
      needsAttentionHistoryIds: [609],
    });
  });

  it('restores listed-origin needs_attention cards back to listed when drift is resolved', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 14,
        tcgProductId: 123,
        productName: 'Recovered Card',
        condition: 'Near Mint',
        marketPrice: '1.00',
        listingPrice: '1.00',
        status: 'needs_attention',
        attentionReason: 'listed_price_drift',
        notes: null,
      },
    ]);
    calculatePrice.mockReturnValue({
      listingPrice: 1.01,
      status: 'matched',
      reason: 'aligned again',
    });
    dbReturning.mockResolvedValueOnce([{ id: 606 }]);

    const result = await runPriceCheck({ source: 'scheduled' });

    expect(dbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        marketPrice: '0.51',
        listingPrice: '1.00',
        status: 'listed',
        attentionReason: null,
      }),
    );
    expect(dbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 14,
        previousStatus: 'needs_attention',
        newStatus: 'listed',
        newListingPrice: '1',
        adjustedToPrice: null,
      }),
    );
    expect(result).toMatchObject({
      updated: 1,
      drifted: 0,
      needsAttentionCards: [],
      csvDiff: {
        rows: [],
      },
    });
  });

  it('keeps listed-origin needs_attention cards in needs_attention and includes them in alert payloads when drift remains unresolved', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 15,
        tcgProductId: 123,
        productName: 'Still Drifted',
        condition: 'Near Mint',
        marketPrice: '1.00',
        listingPrice: '1.00',
        status: 'needs_attention',
        attentionReason: 'listed_price_drift',
        notes: null,
      },
    ]);
    calculatePrice.mockReturnValue({
      listingPrice: 0.5,
      status: 'matched',
      reason: 'still drifted',
    });
    dbReturning.mockResolvedValueOnce([{ id: 607 }]);

    const result = await runPriceCheck({ source: 'scheduled' });

    expect(dbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        marketPrice: '0.51',
        listingPrice: '1.00',
        status: 'needs_attention',
        attentionReason: 'listed_price_drift',
      }),
    );
    expect(dbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 15,
        previousStatus: 'needs_attention',
        newStatus: 'needs_attention',
        newListingPrice: '1',
        adjustedToPrice: '0.5',
        driftPercent: '-50',
      }),
    );
    expect(result).toMatchObject({
      updated: 1,
      drifted: 1,
      needsAttentionCards: [
        {
          cardId: 15,
          historyId: 607,
          source: 'scheduled',
          displayName: 'Still Drifted',
          productName: 'Still Drifted',
          attentionReason: 'listed_price_drift',
          previousStatus: 'needs_attention',
          newStatus: 'needs_attention',
          previousMarketPrice: 1,
          newMarketPrice: 0.51,
          currentListingPrice: 1,
          recommendedListingPrice: 0.5,
          driftPercent: -50,
        },
      ],
      needsAttentionHistoryIds: [607],
    });
  });

  it('does not auto-restore generic needs_attention cards to listed when pricing is healthy', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 16,
        tcgProductId: 123,
        productName: 'Generic Attention Card',
        condition: 'Near Mint',
        marketPrice: '1.00',
        listingPrice: null,
        status: 'needs_attention',
        attentionReason: null,
        notes: null,
      },
    ]);
    calculatePrice.mockReturnValue({
      listingPrice: 0.5,
      status: 'matched',
      reason: 'healthy for unlisted flow',
    });
    dbReturning.mockResolvedValueOnce([{ id: 608 }]);

    const result = await runPriceCheck({ source: 'scheduled' });

    expect(dbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        marketPrice: '0.51',
        listingPrice: '0.5',
        status: 'matched',
        attentionReason: null,
      }),
    );
    expect(dbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 16,
        previousStatus: 'needs_attention',
        newStatus: 'matched',
      }),
    );
    expect(result.csvDiff.rows).toEqual([
      expect.objectContaining({
        action: 'add_listing',
        cardId: 16,
        previousStatus: 'needs_attention',
        newStatus: 'matched',
      }),
    ]);
  });

  it('uses foil pricing on the next price check when condition includes foil', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 17,
        tcgProductId: 123,
        productName: 'Foil Correction Card',
        condition: 'Near Mint Foil',
        marketPrice: '0.60',
        listingPrice: '0.55',
        floorPriceCents: null,
        status: 'matched',
        attentionReason: null,
        notes: null,
      },
    ]);
    mockGetPricing.mockResolvedValueOnce({
      prices: {
        '123': {
          tcg: {
            Normal: { market: 0.51 },
            Foil: { market: 1.25 },
          },
        },
      },
    });
    calculatePrice.mockReturnValue({
      listingPrice: 1.23,
      status: 'matched',
      reason: 'foil pricing',
    });
    dbReturning.mockResolvedValueOnce([{ id: 602 }]);

    await runPriceCheck({ source: 'manual' });

    expect(calculatePrice).toHaveBeenCalledWith({ marketPrice: 1.25 });
    expect(dbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        marketPrice: '1.25',
        listingPrice: '1.23',
        status: 'matched',
      }),
    );
  });

  it('applies a card floor price for non-listed cards when calculated listing price remains non-null', async () => {
    dbFrom.mockResolvedValueOnce([
      {
        id: 2,
        tcgProductId: 123,
        productName: 'Vi',
        condition: 'Near Mint',
        marketPrice: '0.60',
        listingPrice: '0.55',
        floorPriceCents: 60,
        status: 'matched',
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
        status: 'matched',
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
        adjustedToPrice: null,
        previousStatus: 'matched',
        newStatus: 'matched',
        driftPercent: '9.09',
        checkedAt: expect.any(Date),
      }),
    );
    expect(result).toMatchObject({
      updated: 1,
      notFound: 0,
      drifted: 0,
      driftedCards: [],
      driftedHistoryIds: [],
      needsAttentionCards: [],
      needsAttentionHistoryIds: [],
      csvDiff: {
        rows: [],
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

  it('marks listed cards as needs_attention when current recommendation falls below the gift threshold', async () => {
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
      status: 'gift',
      reason: 'no listing price',
    });
    dbReturning.mockResolvedValueOnce([{ id: 702 }]);

    const result = await runPriceCheck({ source: 'scheduled' });

    expect(dbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        marketPrice: '0.51',
        listingPrice: '1.00',
        status: 'needs_attention',
        attentionReason: 'listed_below_threshold',
      }),
    );
    expect(dbValues).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 2,
        source: 'scheduled',
        newListingPrice: '1',
        adjustedToPrice: null,
        previousStatus: 'listed',
        newStatus: 'needs_attention',
        driftPercent: null,
      }),
    );
    expect(result).toMatchObject({
      updated: 1,
      notFound: 0,
      drifted: 0,
      driftedCards: [],
      driftedHistoryIds: [],
      needsAttentionCards: [
        {
          cardId: 2,
          historyId: 702,
          source: 'scheduled',
          displayName: 'Yasuo',
          productName: 'Yasuo',
          attentionReason: 'listed_below_threshold',
          previousStatus: 'listed',
          newStatus: 'needs_attention',
          previousMarketPrice: 1.25,
          newMarketPrice: 0.51,
          currentListingPrice: 1,
          recommendedListingPrice: null,
          driftPercent: null,
        },
      ],
      needsAttentionHistoryIds: [702],
      csvDiff: {
        rows: [
          expect.objectContaining({
            action: 'remove_listing',
            cardId: 2,
            previousStatus: 'listed',
            newStatus: 'needs_attention',
            newListingPrice: 1,
          }),
        ],
      },
    });
  });
});
