import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaleAutoEstimates } from '../auto-estimates.js';

const defaultSettings = {
  id: 1,
  autoRecordSaleExpenses: false,
  autoRecordShipping: true,
  shippingCostCents: 99,
  autoRecordSupplies: true,
  suppliesCostCents: 25,
  autoRecordTcgplayerFees: true,
  marketplaceFeeBps: 1075,
  transactionFeeBps: 250,
  transactionFlatFeeCents: 30,
  createdAt: new Date('2026-04-18T00:00:00.000Z'),
  updatedAt: new Date('2026-04-18T00:00:00.000Z'),
};

function makeMockDb() {
  const state = {
    settingsRows: [defaultSettings] as any[],
    insertCalls: [] as Array<{
      values: any;
      onConflict?: any;
    }>,
  };

  const selectFn = vi.fn(() => ({
    from: vi.fn(() => ({
      limit: vi.fn(() => Promise.resolve(state.settingsRows)),
    })),
  }));

  const insertFn = vi.fn(() => {
    const call: {
      values: any;
      onConflict?: any;
    } = {
      values: undefined,
    };

    const returning = vi.fn(() => {
      state.insertCalls.push(call);
      const values = Array.isArray(call.values) ? call.values : [call.values];
      return Promise.resolve(
        values.map((value, index) => ({
          id: index + 1,
          ...value,
        })),
      );
    });

    const onConflictDoNothing = vi.fn((config: any) => {
      call.onConflict = config;
      return { returning };
    });

    const values = vi.fn((nextValues: any) => {
      call.values = nextValues;
      return { returning, onConflictDoNothing };
    });

    return { values };
  });

  return {
    db: {
      select: selectFn,
      insert: insertFn,
    } as any,
    state,
  };
}

function flattenInsertValues(insertCalls: Array<{ values: any }>) {
  return insertCalls.flatMap((call) =>
    Array.isArray(call.values) ? call.values : [call.values],
  );
}

describe('createSaleAutoEstimates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates line-level fee estimates with rounded cents and expected metadata', async () => {
    const { db, state } = makeMockDb();
    const soldAt = new Date('2026-04-18T12:34:56.000Z');

    await createSaleAutoEstimates(db, {
      saleId: 42,
      salePriceCents: 1234,
      soldAt,
      tcgplayerOrderId: 'ORDER-42',
      settings: defaultSettings,
    });

    const inserted = flattenInsertValues(state.insertCalls);

    expect(inserted).toHaveLength(5);
    expect(inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          saleId: 42,
          amountCents: 99,
          category: 'shipping',
          source: 'sale_auto_estimate',
          isEstimate: true,
          autoKind: 'shipping_order',
          tcgplayerOrderId: 'ORDER-42',
          occurredAt: soldAt,
        }),
        expect.objectContaining({
          saleId: 42,
          amountCents: 25,
          category: 'supplies',
          source: 'sale_auto_estimate',
          isEstimate: true,
          autoKind: 'supplies_order',
          tcgplayerOrderId: 'ORDER-42',
          occurredAt: soldAt,
        }),
        expect.objectContaining({
          saleId: 42,
          amountCents: 30,
          category: 'tcgplayer_fees',
          source: 'sale_auto_estimate',
          isEstimate: true,
          autoKind: 'transaction_flat_order',
          tcgplayerOrderId: 'ORDER-42',
          occurredAt: soldAt,
        }),
        expect.objectContaining({
          saleId: 42,
          amountCents: 133,
          category: 'tcgplayer_fees',
          source: 'sale_auto_estimate',
          isEstimate: true,
          autoKind: 'marketplace_percent_line',
          tcgplayerOrderId: 'ORDER-42',
          occurredAt: soldAt,
        }),
        expect.objectContaining({
          saleId: 42,
          amountCents: 31,
          category: 'tcgplayer_fees',
          source: 'sale_auto_estimate',
          isEstimate: true,
          autoKind: 'transaction_percent_line',
          tcgplayerOrderId: 'ORDER-42',
          occurredAt: soldAt,
        }),
      ]),
    );
  });

  it('dedupes order-level fixed costs by tcgplayerOrderId using onConflictDoNothing', async () => {
    const { db, state } = makeMockDb();

    await createSaleAutoEstimates(db, {
      saleId: 77,
      salePriceCents: 500,
      soldAt: new Date('2026-04-18T13:00:00.000Z'),
      tcgplayerOrderId: 'ORDER-77',
      settings: defaultSettings,
    });

    const fixedKinds = new Set([
      'shipping_order',
      'supplies_order',
      'transaction_flat_order',
    ]);

    const fixedCalls = state.insertCalls.filter((call) =>
      flattenInsertValues([call]).some((value) => fixedKinds.has(value.autoKind)),
    );

    expect(
      flattenInsertValues(fixedCalls).map((value) => value.autoKind).sort(),
    ).toEqual([
      'shipping_order',
      'supplies_order',
      'transaction_flat_order',
    ]);

    expect(fixedCalls).not.toHaveLength(0);
    for (const call of fixedCalls) {
      expect(call.onConflict).toEqual(
        expect.objectContaining({
          target: expect.any(Array),
          where: expect.anything(),
        }),
      );
    }
  });

  it('falls back to per-sale-line fixed costs when no tcgplayerOrderId is provided', async () => {
    const { db, state } = makeMockDb();

    await createSaleAutoEstimates(db, {
      saleId: 88,
      salePriceCents: 500,
      soldAt: new Date('2026-04-18T14:00:00.000Z'),
      tcgplayerOrderId: null,
      settings: defaultSettings,
    });

    const fixedKinds = new Set([
      'shipping_order',
      'supplies_order',
      'transaction_flat_order',
    ]);

    const fixedCalls = state.insertCalls.filter((call) =>
      flattenInsertValues([call]).some((value) => fixedKinds.has(value.autoKind)),
    );
    const fixedValues = flattenInsertValues(fixedCalls);

    expect(fixedValues).toHaveLength(3);
    expect(fixedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          autoKind: 'shipping_order',
          amountCents: 99,
          tcgplayerOrderId: null,
        }),
        expect.objectContaining({
          autoKind: 'supplies_order',
          amountCents: 25,
          tcgplayerOrderId: null,
        }),
        expect.objectContaining({
          autoKind: 'transaction_flat_order',
          amountCents: 30,
          tcgplayerOrderId: null,
        }),
      ]),
    );

    for (const call of fixedCalls) {
      expect(call.onConflict).toBeUndefined();
    }
  });
});
