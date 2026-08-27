import { describe, expect, it, vi } from 'vitest';
import {
  OrderTransitionError,
  transitionOrderStatus,
  type OrderSaleRow,
} from '../order-status.js';

function makeSale(overrides: Partial<OrderSaleRow> = {}): OrderSaleRow {
  return {
    id: 10,
    cardId: 100,
    quantitySold: 1,
    lineItemType: 'sale',
    salePriceCents: 250,
    buyerName: 'Buyer',
    tcgplayerOrderId: 'ORDER-10',
    orderStatus: 'confirmed',
    ...overrides,
  };
}

describe('transitionOrderStatus', () => {
  it('updates every paid and gift line and writes one history entry per line in one transaction scope', async () => {
    const saleUpdate = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const historyValues = vi.fn().mockResolvedValue(undefined);
    const database = {
      update: vi.fn().mockReturnValue({ set: saleUpdate }),
      insert: vi.fn().mockReturnValue({ values: historyValues }),
      select: vi.fn(),
    };

    await transitionOrderStatus(
      database,
      [makeSale(), makeSale({ id: 11, cardId: 101, lineItemType: 'gift' })],
      'shipped',
    );

    expect(saleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        orderStatus: 'shipped',
        updatedAt: expect.any(Date),
      }),
    );
    expect(historyValues).toHaveBeenCalledWith([
      expect.objectContaining({
        saleId: 10,
        previousStatus: 'confirmed',
        newStatus: 'shipped',
      }),
      expect.objectContaining({
        saleId: 11,
        previousStatus: 'confirmed',
        newStatus: 'shipped',
      }),
    ]);
  });

  it('rejects an order with an invalid or inconsistent transition before any line is updated', async () => {
    const database = {
      update: vi.fn(),
      insert: vi.fn(),
      select: vi.fn(),
    };

    await expect(
      transitionOrderStatus(
        database,
        [makeSale(), makeSale({ id: 11, orderStatus: 'shipped' })],
        'shipped',
      ),
    ).rejects.toEqual(
      new OrderTransitionError('Order lines have inconsistent statuses'),
    );
    expect(database.update).not.toHaveBeenCalled();
  });

  it('does not restore or write history when a concurrent transition changed part of the order', async () => {
    const statusUpdate = {
      returning: vi.fn().mockResolvedValue([{ id: 10 }]),
    };
    const database = {
      update: vi.fn().mockReturnValue({
        set: vi
          .fn()
          .mockReturnValue({ where: vi.fn().mockReturnValue(statusUpdate) }),
      }),
      insert: vi.fn(),
      select: vi.fn(),
    };

    await expect(
      transitionOrderStatus(
        database,
        [makeSale(), makeSale({ id: 11 })],
        'cancelled',
      ),
    ).rejects.toEqual(
      new OrderTransitionError('Order was changed by another request'),
    );
    expect(database.insert).not.toHaveBeenCalled();
  });

  it('restores a cancelled fully gifted card to a resale-eligible listed state', async () => {
    const saleUpdate = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const cardUpdate = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const database = {
      update: vi
        .fn()
        .mockReturnValueOnce({ set: saleUpdate })
        .mockReturnValueOnce({ set: cardUpdate }),
      insert: vi
        .fn()
        .mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 101,
                quantity: 0,
                status: 'gifted',
                attentionReason: null,
              },
            ]),
          }),
        }),
      }),
    };

    await transitionOrderStatus(
      database,
      [makeSale({ cardId: 101, lineItemType: 'gift' })],
      'cancelled',
    );

    expect(cardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 1,
        status: 'listed',
        attentionReason: null,
      }),
    );
  });

  it('restores each linked card once when cancelling an order with duplicate card lines', async () => {
    const saleUpdate = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const cardUpdate = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const select = vi.fn().mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([
              { id: 100, quantity: 0, status: 'sold', attentionReason: null },
            ]),
        }),
      }),
    });
    const database = {
      update: vi
        .fn()
        .mockReturnValueOnce({ set: saleUpdate })
        .mockReturnValueOnce({ set: cardUpdate }),
      insert: vi
        .fn()
        .mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      select,
    };

    await transitionOrderStatus(
      database,
      [makeSale({ quantitySold: 1 }), makeSale({ id: 11, quantitySold: 2 })],
      'cancelled',
    );

    expect(cardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 3, status: 'listed' }),
    );
    expect(database.update).toHaveBeenCalledTimes(2);
  });
});
