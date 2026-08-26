import { describe, expect, it } from 'vitest';
import { buildOrderSummaries } from '../orders.js';

describe('buildOrderSummaries', () => {
  it('groups a paid line and gift line by TCGplayer order while keeping null ids separate', () => {
    const orders = buildOrderSummaries([
      {
        id: 10,
        cardId: 100,
        tcgplayerOrderId: 'ORDER-100',
        quantitySold: 2,
        lineItemType: 'sale',
        salePriceCents: 250,
        shippingCollectedCents: 149,
        buyerName: 'Buyer',
        orderStatus: 'confirmed',
        soldAt: new Date('2026-06-01T10:00:00.000Z'),
        notes: null,
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        updatedAt: new Date('2026-06-01T10:00:00.000Z'),
        cardProductName: 'Paid Card',
        cardSetName: 'Origins',
        cardCondition: 'Near Mint',
        shipmentId: 7,
        shipmentSaleId: 10,
        shipmentCarrier: 'USPS',
        shipmentTrackingNumber: '9400',
        shipmentShippedAt: null,
        shipmentDeliveredAt: null,
        shipmentNotes: null,
      },
      {
        id: 11,
        cardId: 101,
        tcgplayerOrderId: 'ORDER-100',
        quantitySold: 1,
        lineItemType: 'gift',
        salePriceCents: 0,
        shippingCollectedCents: 149,
        buyerName: 'Buyer',
        orderStatus: 'confirmed',
        soldAt: new Date('2026-06-01T10:01:00.000Z'),
        notes: null,
        createdAt: new Date('2026-06-01T10:01:00.000Z'),
        updatedAt: new Date('2026-06-01T10:01:00.000Z'),
        cardProductName: 'Gift Card',
        cardSetName: 'Origins',
        cardCondition: 'Lightly Played',
        shipmentId: null,
        shipmentSaleId: null,
        shipmentCarrier: null,
        shipmentTrackingNumber: null,
        shipmentShippedAt: null,
        shipmentDeliveredAt: null,
        shipmentNotes: null,
      },
      {
        id: 12,
        cardId: 102,
        tcgplayerOrderId: null,
        quantitySold: 1,
        lineItemType: 'sale',
        salePriceCents: 500,
        shippingCollectedCents: 0,
        buyerName: null,
        orderStatus: 'pending',
        soldAt: new Date('2026-06-01T09:00:00.000Z'),
        notes: null,
        createdAt: new Date('2026-06-01T09:00:00.000Z'),
        updatedAt: new Date('2026-06-01T09:00:00.000Z'),
        cardProductName: 'Standalone Card',
        cardSetName: null,
        cardCondition: 'Near Mint',
        shipmentId: null,
        shipmentSaleId: null,
        shipmentCarrier: null,
        shipmentTrackingNumber: null,
        shipmentShippedAt: null,
        shipmentDeliveredAt: null,
        shipmentNotes: null,
      },
      {
        id: 13,
        cardId: 103,
        tcgplayerOrderId: null,
        quantitySold: 1,
        lineItemType: 'gift',
        salePriceCents: 0,
        shippingCollectedCents: 0,
        buyerName: null,
        orderStatus: 'pending',
        soldAt: new Date('2026-06-01T08:00:00.000Z'),
        notes: null,
        createdAt: new Date('2026-06-01T08:00:00.000Z'),
        updatedAt: new Date('2026-06-01T08:00:00.000Z'),
        cardProductName: 'Standalone Gift',
        cardSetName: null,
        cardCondition: 'Near Mint',
        shipmentId: null,
        shipmentSaleId: null,
        shipmentCarrier: null,
        shipmentTrackingNumber: null,
        shipmentShippedAt: null,
        shipmentDeliveredAt: null,
        shipmentNotes: null,
      },
    ]);

    expect(orders).toHaveLength(3);
    expect(orders[0]).toMatchObject({
      orderKey: 'order:ORDER-100',
      tcgplayerOrderId: 'ORDER-100',
      representativeSaleId: 10,
      itemCount: 3,
      productSubtotalCents: 250,
      shippingCollectedCents: 149,
      totalCents: 399,
      shipment: expect.objectContaining({ trackingNumber: '9400' }),
    });
    expect(orders[0].lineItems).toEqual([
      expect.objectContaining({ id: 10, lineItemType: 'sale' }),
      expect.objectContaining({ id: 11, lineItemType: 'gift' }),
    ]);
    expect(orders.slice(1).map((order) => order.orderKey)).toEqual([
      'sale:12',
      'sale:13',
    ]);
  });

  it('does not apply the configurable shipping fallback to gift-only orders', () => {
    const giftOnlyOrder = buildOrderSummaries(
      [
        {
          id: 1,
          cardId: 1,
          tcgplayerOrderId: 'GIFT-ONLY',
          quantitySold: 1,
          lineItemType: 'gift',
          salePriceCents: 0,
          shippingCollectedCents: 0,
          buyerName: null,
          orderStatus: 'pending',
          soldAt: new Date(),
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          cardProductName: 'Gift Card',
          cardSetName: null,
          cardCondition: 'Near Mint',
          shipmentId: null,
          shipmentSaleId: null,
          shipmentCarrier: null,
          shipmentTrackingNumber: null,
          shipmentShippedAt: null,
          shipmentDeliveredAt: null,
          shipmentNotes: null,
        },
      ],
      173,
    );

    expect(giftOnlyOrder[0]).toMatchObject({
      productSubtotalCents: 0,
      shippingCollectedCents: 0,
      totalCents: 0,
    });
  });

  it('uses the configurable shipping fallback only for zero-shipping paid orders below $5', () => {
    const baseLine = {
      id: 1,
      cardId: 1,
      tcgplayerOrderId: 'SMALL',
      quantitySold: 1,
      lineItemType: 'sale' as const,
      shippingCollectedCents: 0,
      buyerName: null,
      orderStatus: 'pending' as const,
      soldAt: new Date(),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      cardProductName: 'Card',
      cardSetName: null,
      cardCondition: 'Near Mint',
      shipmentId: null,
      shipmentSaleId: null,
      shipmentCarrier: null,
      shipmentTrackingNumber: null,
      shipmentShippedAt: null,
      shipmentDeliveredAt: null,
      shipmentNotes: null,
    };

    const orders = buildOrderSummaries(
      [
        { ...baseLine, salePriceCents: 499 },
        {
          ...baseLine,
          id: 2,
          tcgplayerOrderId: 'EXACT-FIVE',
          salePriceCents: 500,
        },
      ],
      173,
    );

    expect(orders[0]).toMatchObject({
      shippingCollectedCents: 173,
      totalCents: 672,
    });
    expect(orders[1]).toMatchObject({
      shippingCollectedCents: 0,
      totalCents: 500,
    });
  });
});
