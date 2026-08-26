import type { OrderStatus } from './status-machine.js';

export type SaleLineItemType = 'sale' | 'gift';

export interface OrderLineRow {
  id: number;
  cardId: number | null;
  tcgplayerOrderId: string | null;
  quantitySold: number;
  lineItemType: SaleLineItemType | null;
  salePriceCents: number;
  shippingCollectedCents: number | null;
  buyerName: string | null;
  orderStatus: OrderStatus;
  soldAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  cardProductName: string | null;
  cardSetName: string | null;
  cardCondition: string | null;
  shipmentId: number | null;
  shipmentSaleId: number | null;
  shipmentCarrier: string | null;
  shipmentTrackingNumber: string | null;
  shipmentShippedAt: Date | null;
  shipmentDeliveredAt: Date | null;
  shipmentNotes: string | null;
}

export interface OrderLineItem {
  id: number;
  cardId: number | null;
  quantitySold: number;
  lineItemType: SaleLineItemType;
  salePriceCents: number;
  cardProductName: string | null;
  cardSetName: string | null;
  cardCondition: string | null;
}

export interface OrderShipment {
  id: number;
  saleId: number;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  notes: string | null;
}

export interface OrderSummary {
  /** Stable display/API key; null TCGplayer ids are intentionally one order per sale. */
  orderKey: string;
  tcgplayerOrderId: string | null;
  representativeSaleId: number;
  buyerName: string | null;
  orderStatus: OrderStatus;
  soldAt: Date;
  notes: string | null;
  itemCount: number;
  productSubtotalCents: number;
  shippingCollectedCents: number;
  totalCents: number;
  shipment: OrderShipment | null;
  lineItems: OrderLineItem[];
}

function orderKeyForRow(row: Pick<OrderLineRow, 'id' | 'tcgplayerOrderId'>) {
  return row.tcgplayerOrderId
    ? `order:${row.tcgplayerOrderId}`
    : `sale:${row.id}`;
}

function shipmentFromRow(row: OrderLineRow): OrderShipment | null {
  if (row.shipmentId === null || row.shipmentSaleId === null) {
    return null;
  }

  return {
    id: row.shipmentId,
    saleId: row.shipmentSaleId,
    carrier: row.shipmentCarrier,
    trackingNumber: row.shipmentTrackingNumber,
    shippedAt: row.shipmentShippedAt,
    deliveredAt: row.shipmentDeliveredAt,
    notes: row.shipmentNotes,
  };
}

function hasShipmentDetails(shipment: OrderShipment) {
  return Boolean(
    shipment.carrier ||
    shipment.trackingNumber ||
    shipment.shippedAt ||
    shipment.deliveredAt ||
    shipment.notes,
  );
}

/**
 * Build the read-only order facade from legacy line-item rows. The underlying
 * schema remains line-oriented, so this preserves all paid and gift lines while
 * giving the history UI one row per real TCGplayer order. Null order ids cannot
 * be safely grouped and deliberately remain distinct synthetic orders.
 */
export function buildOrderSummaries(
  rows: OrderLineRow[],
  defaultShippingCollectedCents = 0,
): OrderSummary[] {
  const grouped = new Map<string, OrderSummary>();

  for (const row of rows) {
    const orderKey = orderKeyForRow(row);
    const lineItem: OrderLineItem = {
      id: row.id,
      cardId: row.cardId,
      quantitySold: row.quantitySold,
      lineItemType: row.lineItemType ?? 'sale',
      salePriceCents: row.salePriceCents,
      cardProductName: row.cardProductName,
      cardSetName: row.cardSetName,
      cardCondition: row.cardCondition,
    };
    const rowShipment = shipmentFromRow(row);
    const existing = grouped.get(orderKey);

    if (!existing) {
      grouped.set(orderKey, {
        orderKey,
        tcgplayerOrderId: row.tcgplayerOrderId,
        representativeSaleId: row.id,
        buyerName: row.buyerName,
        orderStatus: row.orderStatus,
        soldAt: row.soldAt,
        notes: row.notes,
        itemCount: row.quantitySold,
        productSubtotalCents:
          lineItem.lineItemType === 'sale' ? row.salePriceCents : 0,
        shippingCollectedCents: Math.max(0, row.shippingCollectedCents ?? 0),
        totalCents: 0,
        shipment: rowShipment,
        lineItems: [lineItem],
      });
      continue;
    }

    existing.itemCount += row.quantitySold;
    existing.productSubtotalCents +=
      lineItem.lineItemType === 'sale' ? row.salePriceCents : 0;
    existing.shippingCollectedCents = Math.max(
      existing.shippingCollectedCents,
      row.shippingCollectedCents ?? 0,
    );
    existing.lineItems.push(lineItem);

    // Newer lines are a better representative for order-level metadata in
    // legacy data that was not always inserted atomically.
    if (row.soldAt > existing.soldAt) {
      existing.soldAt = row.soldAt;
      existing.buyerName = row.buyerName ?? existing.buyerName;
      existing.notes = row.notes ?? existing.notes;
    }

    if (
      rowShipment &&
      (!existing.shipment || hasShipmentDetails(rowShipment))
    ) {
      existing.shipment = rowShipment;
    }
  }

  return [...grouped.values()].map((order) => {
    const hasPaidLineItem = order.lineItems.some(
      (lineItem) => lineItem.lineItemType === 'sale',
    );
    const shippingCollectedCents = hasPaidLineItem
      ? order.shippingCollectedCents === 0 && order.productSubtotalCents < 500
        ? defaultShippingCollectedCents
        : order.shippingCollectedCents
      : 0;

    return {
      ...order,
      shippingCollectedCents,
      totalCents: order.productSubtotalCents + shippingCollectedCents,
    };
  });
}
