import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createShipmentOnConfirm } from '../create-on-confirm.js';

function makeMockDb() {
  // Tracks all chained calls for assertions
  const state = {
    insertValues: null as any,
    onConflictCalled: false,
    returningResult: [] as any[],
    selectResult: [] as any[],
  };

  const returning = vi.fn(() => Promise.resolve(state.returningResult));
  const onConflictDoNothing = vi.fn(() => {
    state.onConflictCalled = true;
    return { returning };
  });
  const values = vi.fn((v: any) => {
    state.insertValues = v;
    return { onConflictDoNothing };
  });
  const insertFn = vi.fn(() => ({ values }));

  const limit = vi.fn(() => Promise.resolve(state.selectResult));
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const selectFn = vi.fn(() => ({ from }));

  const db = { insert: insertFn, select: selectFn } as any;

  return {
    db,
    state,
    mocks: {
      insertFn,
      values,
      onConflictDoNothing,
      returning,
      selectFn,
      from,
      where,
      limit,
    },
  };
}

describe('createShipmentOnConfirm', () => {
  it('inserts a shipment placeholder for the given saleId', async () => {
    const { db, state, mocks } = makeMockDb();
    const shipmentRow = {
      id: 1,
      saleId: 42,
      carrier: null,
      trackingNumber: null,
      shippedAt: null,
      deliveredAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    state.returningResult = [shipmentRow];

    const result = await createShipmentOnConfirm(db, 42);

    expect(result).toEqual(shipmentRow);
    expect(mocks.values).toHaveBeenCalledWith({ saleId: 42 });
    expect(mocks.onConflictDoNothing).toHaveBeenCalled();
  });

  it('returns existing shipment when insert is a no-op (duplicate)', async () => {
    const { db, state, mocks } = makeMockDb();
    const existingRow = {
      id: 5,
      saleId: 42,
      carrier: 'USPS',
      trackingNumber: '123',
      shippedAt: null,
      deliveredAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Insert returns empty (conflict — no-op)
    state.returningResult = [];
    // Select returns existing row
    state.selectResult = [existingRow];

    const result = await createShipmentOnConfirm(db, 42);

    expect(result).toEqual(existingRow);
    // Insert was attempted
    expect(mocks.onConflictDoNothing).toHaveBeenCalled();
    // Fell back to select
    expect(mocks.selectFn).toHaveBeenCalled();
  });

  it('does not query existing row when insert succeeds', async () => {
    const { db, state, mocks } = makeMockDb();
    state.returningResult = [{ id: 10, saleId: 99 }];

    await createShipmentOnConfirm(db, 99);

    // select should NOT have been called
    expect(mocks.selectFn).not.toHaveBeenCalled();
  });
});
