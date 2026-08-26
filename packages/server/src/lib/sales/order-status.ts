import { and, eq, inArray } from 'drizzle-orm';
import { cards } from '../../db/schema/cards.js';
import { saleStatusHistory } from '../../db/schema/sale-status-history.js';
import { sales } from '../../db/schema/sales.js';
import { createShipmentOnConfirm } from '../shipments/index.js';
import { isValidTransition, type OrderStatus } from './status-machine.js';

export interface OrderSaleRow {
  id: number;
  cardId: number | null;
  tcgplayerOrderId: string | null;
  quantitySold: number;
  lineItemType: 'sale' | 'gift' | null;
  salePriceCents: number;
  buyerName: string | null;
  orderStatus: OrderStatus;
}

export class OrderTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderTransitionError';
  }
}

/** Get every line in a real order; null order ids intentionally stand alone. */
export async function getOrderSaleRows(
  database: any,
  representativeSaleId: number,
): Promise<OrderSaleRow[]> {
  const [sale] = await database
    .select()
    .from(sales)
    .where(eq(sales.id, representativeSaleId))
    .limit(1);

  if (!sale) {
    return [];
  }

  if (!sale.tcgplayerOrderId) {
    return [sale];
  }

  return database
    .select()
    .from(sales)
    .where(eq(sales.tcgplayerOrderId, sale.tcgplayerOrderId));
}

function getRestoredCardState(lineItemType: 'sale' | 'gift', card: any) {
  if (lineItemType === 'gift') {
    return { status: 'gift', attentionReason: null };
  }

  if (card.status === 'sold') {
    return { status: 'listed', attentionReason: null };
  }

  return {
    status: card.status,
    attentionReason: card.attentionReason,
  };
}

/**
 * Apply a status transition to all line items in an order. Callers must invoke
 * this inside their database transaction. It validates the complete order
 * before writing so a gift line, cancellation restoration, or history row can
 * never be left partially updated.
 */
export async function transitionOrderStatus(
  database: any,
  orderLines: OrderSaleRow[],
  newStatus: OrderStatus,
  note?: string | null,
) {
  if (orderLines.length === 0) {
    throw new OrderTransitionError('Sale not found');
  }

  const currentStatus = orderLines[0].orderStatus;
  if (orderLines.some((line) => line.orderStatus !== currentStatus)) {
    throw new OrderTransitionError('Order lines have inconsistent statuses');
  }

  if (!isValidTransition(currentStatus, newStatus)) {
    throw new OrderTransitionError(
      `Invalid orderStatus transition from ${currentStatus} to ${newStatus}`,
    );
  }

  const lineIds = orderLines.map((line) => line.id);
  const now = new Date();
  const statusUpdate = database
    .update(sales)
    .set({ orderStatus: newStatus, updatedAt: now })
    .where(
      and(inArray(sales.id, lineIds), eq(sales.orderStatus, currentStatus)),
    );
  // The conditional write protects cancellation restoration from a second
  // concurrent request that read the pre-terminal status. Test doubles may not
  // implement `returning`, while Postgres does and lets us verify all rows.
  const updatedLines =
    typeof statusUpdate?.returning === 'function'
      ? await statusUpdate.returning({ id: sales.id })
      : undefined;
  if (updatedLines && updatedLines.length !== lineIds.length) {
    throw new OrderTransitionError('Order was changed by another request');
  }

  await database.insert(saleStatusHistory).values(
    orderLines.map((line) => ({
      saleId: line.id,
      previousStatus: line.orderStatus,
      newStatus,
      source: 'manual' as const,
      note: note ?? null,
    })),
  );

  if (newStatus === 'confirmed') {
    for (const line of orderLines) {
      await createShipmentOnConfirm(database, line.id);
    }
  }

  if (newStatus === 'cancelled') {
    const restoredByCard = new Map<
      number,
      { quantity: number; lineItemType: 'sale' | 'gift' }
    >();

    for (const line of orderLines) {
      if (line.cardId === null) {
        continue;
      }

      const existing = restoredByCard.get(line.cardId);
      restoredByCard.set(line.cardId, {
        quantity: (existing?.quantity ?? 0) + line.quantitySold,
        // A mixed legacy order cannot normally occur; paid restoration is the
        // safer state if it does, because it preserves resale eligibility.
        lineItemType:
          existing?.lineItemType === 'sale' || line.lineItemType !== 'gift'
            ? 'sale'
            : 'gift',
      });
    }

    for (const [cardId, restored] of restoredByCard) {
      const [card] = await database
        .select()
        .from(cards)
        .where(eq(cards.id, cardId))
        .limit(1);

      if (!card) {
        continue;
      }

      const restoredState = getRestoredCardState(restored.lineItemType, card);
      await database
        .update(cards)
        .set({
          quantity: card.quantity + restored.quantity,
          status: restoredState.status,
          attentionReason: restoredState.attentionReason,
          updatedAt: now,
        })
        .where(eq(cards.id, card.id));
    }
  }

  return { previousStatus: currentStatus, lineIds };
}
