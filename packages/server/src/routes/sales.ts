import { asc, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  cards,
  isListedOriginAttentionReason,
  type Card,
} from '../db/schema/cards.js';
import { saleStatusHistory } from '../db/schema/sale-status-history.js';
import { sales } from '../db/schema/sales.js';
import { shipments } from '../db/schema/shipments.js';
import { getOrCreateExpenseSettings } from '../lib/expenses/index.js';
import { sendSaleConfirmedAlert } from '../lib/notifications/telegram.js';
import {
  OrderTransitionError,
  getOrderSaleRows,
  transitionOrderStatus,
} from '../lib/sales/order-status.js';
import { buildOrderSummaries, type OrderLineRow } from '../lib/sales/orders.js';
import { createShipmentOnConfirm } from '../lib/shipments/index.js';

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

type SaleLineItemType = 'sale' | 'gift';

interface RecordSaleBody {
  cardId: number;
  quantitySold: number;
  salePriceCents: number;
  shippingCollectedCents?: number;
  buyerName?: string | null;
  tcgplayerOrderId?: string | null;
  orderStatus?: OrderStatus;
  soldAt?: string;
  notes?: string | null;
  applyEstimatedExpenses?: boolean;
}

interface BulkSaleLineBody {
  cardId: number;
  quantitySold: number;
  salePriceCents: number;
  lineItemType: SaleLineItemType;
}

interface BulkRecordSaleBody {
  tcgplayerOrderId: string;
  lines: BulkSaleLineBody[];
  shippingCollectedCents?: number;
  buyerName?: string | null;
  orderStatus?: OrderStatus;
  soldAt?: string;
  notes?: string | null;
  applyEstimatedExpenses?: boolean;
}

interface UpdateSaleBody {
  buyerName?: string | null;
  tcgplayerOrderId?: string | null;
  orderStatus?: OrderStatus;
  soldAt?: string;
  notes?: string | null;
  shippingCollectedCents?: number;
}

interface BatchUpdateStatusBody {
  saleIds: number[];
  newStatus: OrderStatus;
  note?: string | null;
}

const validOrderStatuses: OrderStatus[] = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
];

const validSaleLineItemTypes: SaleLineItemType[] = ['sale', 'gift'];

class SalesRouteError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isSaleLineItemType(value: unknown): value is SaleLineItemType {
  return validSaleLineItemTypes.includes(value as SaleLineItemType);
}

function isNonNegativeInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0;
}

function normalizeOptionalOrderId(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function canRecordPaidSaleForCard(card: {
  status: string;
  attentionReason: string | null;
}) {
  return (
    card.status === 'listed' ||
    (card.status === 'needs_attention' &&
      isListedOriginAttentionReason(card.attentionReason))
  );
}

function getNextPaidCardStatus(card: {
  status: Card['status'];
  quantity: number;
  attentionReason: Card['attentionReason'];
}): {
  status: Card['status'];
  attentionReason: Card['attentionReason'];
} {
  if (card.quantity === 0) {
    return { status: 'sold', attentionReason: null };
  }

  if (
    card.status === 'needs_attention' &&
    isListedOriginAttentionReason(card.attentionReason)
  ) {
    return { status: 'needs_attention', attentionReason: card.attentionReason };
  }

  return { status: 'listed', attentionReason: null };
}

function getNextGiftCardStatus(remainingQuantity: number) {
  return remainingQuantity === 0 ? 'gifted' : 'gift';
}

export async function salesRoutes(fastify: FastifyInstance) {
  async function getCardById(cardId: number | null | undefined) {
    if (cardId === null || cardId === undefined) {
      return null;
    }

    const [card] = await db
      .select()
      .from(cards)
      .where(eq(cards.id, cardId))
      .limit(1);

    return card ?? null;
  }

  async function getCardProductName(cardId: number | null | undefined) {
    const card = await getCardById(cardId);
    return card?.productName ?? null;
  }

  async function getDefaultShippingCollectedCents() {
    const settings = await getOrCreateExpenseSettings(db);
    return settings.defaultShippingCollectedCents;
  }

  async function getOrderSummaries() {
    const rows = (await db
      .select({
        ...getTableColumns(sales),
        cardProductName: cards.productName,
        cardSetName: cards.setName,
        cardCondition: cards.condition,
        shipmentId: shipments.id,
        shipmentSaleId: shipments.saleId,
        shipmentCarrier: shipments.carrier,
        shipmentTrackingNumber: shipments.trackingNumber,
        shipmentShippedAt: shipments.shippedAt,
        shipmentDeliveredAt: shipments.deliveredAt,
        shipmentNotes: shipments.notes,
      })
      .from(sales)
      .leftJoin(cards, eq(sales.cardId, cards.id))
      .leftJoin(shipments, eq(shipments.saleId, sales.id))
      .orderBy(desc(sales.soldAt), desc(sales.id))) as OrderLineRow[];

    const unpricedOrders = buildOrderSummaries(rows);
    const needsShippingFallback = unpricedOrders.some(
      (order) =>
        order.lineItems.some((lineItem) => lineItem.lineItemType === 'sale') &&
        order.shippingCollectedCents === 0 &&
        order.productSubtotalCents < 500,
    );
    const defaultShippingCollectedCents = needsShippingFallback
      ? await getDefaultShippingCollectedCents()
      : 0;

    return buildOrderSummaries(rows, defaultShippingCollectedCents);
  }

  function serializeSaleResponse(
    sale: {
      id: number;
      cardId: number | null;
      tcgplayerOrderId: string | null;
      quantitySold: number;
      lineItemType?: SaleLineItemType | null;
      salePriceCents: number;
      shippingCollectedCents?: number | null;
      buyerName: string | null;
      orderStatus: OrderStatus;
      soldAt: Date;
      notes: string | null;
      createdAt?: Date;
      updatedAt: Date;
    },
    card: Pick<Card, 'productName' | 'setName'> | null,
  ) {
    return {
      ...sale,
      lineItemType: sale.lineItemType ?? 'sale',
      shippingCollectedCents: sale.shippingCollectedCents ?? 0,
      cardProductName: card?.productName ?? null,
      cardSetName: card?.setName ?? null,
    };
  }

  function buildOrderLinkText(tcgplayerOrderId: string | null) {
    if (!tcgplayerOrderId) {
      return undefined;
    }

    return 'Lookup in TCGplayer seller portal';
  }

  async function sendSaleConfirmedAlertBestEffort(
    sale: {
      id: number;
      cardId: number | null;
      quantitySold: number;
      salePriceCents: number;
      buyerName: string | null;
      tcgplayerOrderId: string | null;
    },
    productName?: string | null,
  ) {
    try {
      await sendSaleConfirmedAlert({
        saleId: sale.id,
        cardId: sale.cardId,
        productName,
        quantitySold: sale.quantitySold,
        salePriceCents: sale.salePriceCents,
        buyerName: sale.buyerName,
        tcgplayerOrderId: sale.tcgplayerOrderId,
        orderLinkText: buildOrderLinkText(sale.tcgplayerOrderId),
      });
    } catch (error) {
      fastify.log.error(
        `[sales] sale confirmed telegram notification failed for saleId=${sale.id}: ${error}`,
      );
    }
  }

  // POST /bulk - Record a multi-line TCGplayer order atomically
  fastify.post<{ Body: BulkRecordSaleBody }>(
    '/bulk',
    async (request, reply) => {
      const {
        tcgplayerOrderId,
        lines,
        shippingCollectedCents,
        buyerName,
        orderStatus = 'confirmed',
        soldAt,
        notes,
        applyEstimatedExpenses,
      } = request.body;

      const normalizedOrderId = normalizeOptionalOrderId(tcgplayerOrderId);
      if (!normalizedOrderId) {
        return reply.code(400).send({
          error: 'tcgplayerOrderId is required for bulk order recording',
        });
      }

      if (!Array.isArray(lines) || lines.length === 0) {
        return reply.code(400).send({
          error: 'lines must be a non-empty array',
        });
      }

      if (!validOrderStatuses.includes(orderStatus)) {
        return reply.code(400).send({ error: 'Invalid orderStatus' });
      }

      if (
        applyEstimatedExpenses !== undefined &&
        typeof applyEstimatedExpenses !== 'boolean'
      ) {
        return reply
          .code(400)
          .send({ error: 'applyEstimatedExpenses must be a boolean' });
      }

      if (
        shippingCollectedCents !== undefined &&
        !isNonNegativeInteger(shippingCollectedCents)
      ) {
        return reply.code(400).send({
          error: 'shippingCollectedCents must be a non-negative integer',
        });
      }

      const soldAtDate = soldAt ? parseDate(soldAt) : new Date();
      if (!soldAtDate) {
        return reply.code(400).send({ error: 'Invalid soldAt date' });
      }

      try {
        const hasPaidLine = lines.some((line) => line?.lineItemType === 'sale');
        const resolvedShippingCollectedCents = hasPaidLine
          ? (shippingCollectedCents ??
            (await getDefaultShippingCollectedCents()))
          : 0;
        const insertedSales: Array<{
          id: number;
          cardId: number | null;
          tcgplayerOrderId: string | null;
          quantitySold: number;
          lineItemType: SaleLineItemType;
          salePriceCents: number;
          shippingCollectedCents: number;
          buyerName: string | null;
          orderStatus: OrderStatus;
          soldAt: Date;
          notes: string | null;
          createdAt?: Date;
          updatedAt: Date;
          cardProductName: string | null;
          cardSetName: string | null;
        }> = [];

        await db.transaction(async (tx) => {
          for (const line of lines) {
            if (!isSaleLineItemType(line?.lineItemType)) {
              throw new SalesRouteError(
                400,
                'lineItemType must be either "sale" or "gift"',
              );
            }

            if (!Number.isInteger(line.cardId) || line.cardId <= 0) {
              throw new SalesRouteError(
                400,
                'cardId must be a positive integer',
              );
            }

            if (
              !Number.isInteger(line.quantitySold) ||
              line.quantitySold <= 0
            ) {
              throw new SalesRouteError(
                400,
                'quantitySold must be a positive integer',
              );
            }

            if (
              !Number.isInteger(line.salePriceCents) ||
              line.salePriceCents < 0
            ) {
              throw new SalesRouteError(
                400,
                'salePriceCents must be a non-negative integer',
              );
            }

            const [card] = await tx
              .select()
              .from(cards)
              .where(eq(cards.id, line.cardId))
              .limit(1);

            if (!card) {
              throw new SalesRouteError(404, `Card ${line.cardId} not found`);
            }

            if (line.quantitySold > card.quantity) {
              throw new SalesRouteError(
                400,
                'quantitySold cannot exceed available card quantity',
              );
            }

            if (line.lineItemType === 'gift') {
              if (card.status !== 'gift') {
                throw new SalesRouteError(
                  400,
                  'Gift lines require cards with status gift',
                );
              }

              if (line.salePriceCents !== 0) {
                throw new SalesRouteError(
                  400,
                  'Gift lines must have salePriceCents of 0',
                );
              }
            }

            if (line.lineItemType === 'sale') {
              if (!canRecordPaidSaleForCard(card)) {
                throw new SalesRouteError(
                  400,
                  'Paid lines require cards with status listed or listed-origin needs_attention',
                );
              }

              if (line.salePriceCents <= 0) {
                throw new SalesRouteError(
                  400,
                  'Paid lines must have salePriceCents greater than 0',
                );
              }
            }

            const remainingQuantity = card.quantity - line.quantitySold;
            const nextCardState =
              line.lineItemType === 'gift'
                ? {
                    status: getNextGiftCardStatus(remainingQuantity),
                    attentionReason: null,
                  }
                : getNextPaidCardStatus({
                    status: card.status,
                    quantity: remainingQuantity,
                    attentionReason: card.attentionReason,
                  });

            await tx
              .update(cards)
              .set({
                quantity: remainingQuantity,
                status: nextCardState.status as any,
                attentionReason: nextCardState.attentionReason,
                updatedAt: new Date(),
              })
              .where(eq(cards.id, card.id));

            const [sale] = await tx
              .insert(sales)
              .values({
                cardId: line.cardId,
                quantitySold: line.quantitySold,
                lineItemType: line.lineItemType,
                salePriceCents: line.salePriceCents,
                shippingCollectedCents: resolvedShippingCollectedCents,
                buyerName: buyerName ?? null,
                tcgplayerOrderId: normalizedOrderId,
                orderStatus,
                soldAt: soldAtDate,
                notes: notes ?? null,
                updatedAt: new Date(),
              })
              .returning();

            await tx.insert(saleStatusHistory).values({
              saleId: sale.id,
              previousStatus: null,
              newStatus: orderStatus,
              source: 'manual',
            });

            if (orderStatus === 'confirmed') {
              await createShipmentOnConfirm(tx as any, sale.id);
            }

            insertedSales.push(
              serializeSaleResponse(
                {
                  ...sale,
                  orderStatus,
                  lineItemType: line.lineItemType,
                  soldAt: soldAtDate,
                },
                card,
              ),
            );
          }
        });

        if (orderStatus === 'confirmed') {
          for (const sale of insertedSales) {
            if (sale.lineItemType !== 'sale') {
              continue;
            }

            await sendSaleConfirmedAlertBestEffort(
              {
                id: sale.id,
                cardId: sale.cardId,
                quantitySold: sale.quantitySold,
                salePriceCents: sale.salePriceCents,
                buyerName: sale.buyerName,
                tcgplayerOrderId: sale.tcgplayerOrderId,
              },
              sale.cardProductName,
            );
          }
        }

        return reply.code(201).send({ sales: insertedSales });
      } catch (error) {
        if (error instanceof SalesRouteError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }

        fastify.log.error(error);
        return reply
          .code(500)
          .send({ error: 'Failed to record bulk sale order' });
      }
    },
  );

  // POST / - Record a sale
  fastify.post<{ Body: RecordSaleBody }>('/', async (request, reply) => {
    const {
      cardId,
      quantitySold,
      salePriceCents,
      shippingCollectedCents,
      buyerName,
      tcgplayerOrderId,
      orderStatus = 'pending',
      soldAt,
      notes,
      applyEstimatedExpenses,
    } = request.body;

    if (!Number.isInteger(cardId) || cardId <= 0) {
      return reply
        .code(400)
        .send({ error: 'cardId must be a positive integer' });
    }

    if (!Number.isInteger(quantitySold) || quantitySold <= 0) {
      return reply
        .code(400)
        .send({ error: 'quantitySold must be a positive integer' });
    }

    if (!Number.isInteger(salePriceCents) || salePriceCents <= 0) {
      return reply
        .code(400)
        .send({ error: 'salePriceCents must be a positive integer' });
    }

    if (!validOrderStatuses.includes(orderStatus)) {
      return reply.code(400).send({ error: 'Invalid orderStatus' });
    }

    if (
      applyEstimatedExpenses !== undefined &&
      typeof applyEstimatedExpenses !== 'boolean'
    ) {
      return reply
        .code(400)
        .send({ error: 'applyEstimatedExpenses must be a boolean' });
    }

    if (
      shippingCollectedCents !== undefined &&
      !isNonNegativeInteger(shippingCollectedCents)
    ) {
      return reply.code(400).send({
        error: 'shippingCollectedCents must be a non-negative integer',
      });
    }

    const soldAtDate = soldAt ? parseDate(soldAt) : new Date();
    if (!soldAtDate) {
      return reply.code(400).send({ error: 'Invalid soldAt date' });
    }

    try {
      const normalizedOrderId = normalizeOptionalOrderId(tcgplayerOrderId);
      const resolvedShippingCollectedCents =
        shippingCollectedCents ??
        (normalizedOrderId ? await getDefaultShippingCollectedCents() : 0);

      const [card] = await db
        .select()
        .from(cards)
        .where(eq(cards.id, cardId))
        .limit(1);

      if (!card) {
        return reply.code(404).send({ error: 'Card not found' });
      }

      if (!canRecordPaidSaleForCard(card)) {
        return reply.code(400).send({
          error:
            'Only listed or listed-origin needs_attention cards can be sold',
        });
      }

      if (quantitySold > card.quantity) {
        return reply.code(400).send({
          error: 'quantitySold cannot exceed available card quantity',
        });
      }

      const remainingQuantity = card.quantity - quantitySold;
      const nextCardState = getNextPaidCardStatus({
        status: card.status,
        quantity: remainingQuantity,
        attentionReason: card.attentionReason,
      });

      await db
        .update(cards)
        .set({
          quantity: remainingQuantity,
          status: nextCardState.status as any,
          attentionReason: nextCardState.attentionReason,
          updatedAt: new Date(),
        })
        .where(eq(cards.id, card.id));

      const [sale] = await db
        .insert(sales)
        .values({
          cardId,
          quantitySold,
          lineItemType: 'sale',
          salePriceCents,
          shippingCollectedCents: resolvedShippingCollectedCents,
          buyerName: buyerName ?? null,
          tcgplayerOrderId: normalizedOrderId,
          orderStatus,
          soldAt: soldAtDate,
          notes: notes ?? null,
          updatedAt: new Date(),
        })
        .returning();

      await db.insert(saleStatusHistory).values({
        saleId: sale.id,
        previousStatus: null,
        newStatus: orderStatus,
        source: 'manual',
      });

      if (orderStatus === 'confirmed') {
        await createShipmentOnConfirm(db, sale.id);
        await sendSaleConfirmedAlertBestEffort(
          {
            id: sale.id,
            cardId: sale.cardId,
            quantitySold: sale.quantitySold,
            salePriceCents: sale.salePriceCents,
            buyerName: sale.buyerName,
            tcgplayerOrderId: sale.tcgplayerOrderId,
          },
          card.productName,
        );
      }

      return reply.code(201).send(serializeSaleResponse(sale, card));
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to record sale' });
    }
  });

  // GET / - List an order-facing facade backed by the legacy sale-line table.
  fastify.get<{
    Querystring: {
      page?: string;
      limit?: string;
      orderStatus?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    };
  }>('/', async (request, reply) => {
    const {
      page = '1',
      limit = '50',
      orderStatus,
      search,
      dateFrom,
      dateTo,
    } = request.query;
    const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
    const limitNum = Math.min(
      Math.max(Number.parseInt(limit, 10) || 50, 1),
      200,
    );

    if (
      orderStatus &&
      !validOrderStatuses.includes(orderStatus as OrderStatus)
    ) {
      return reply.code(400).send({ error: 'Invalid orderStatus' });
    }

    const fromDate = dateFrom ? parseDate(dateFrom) : null;
    if (dateFrom && !fromDate) {
      return reply.code(400).send({ error: 'Invalid dateFrom' });
    }
    const toDate = dateTo ? parseDate(dateTo) : null;
    if (dateTo && !toDate) {
      return reply.code(400).send({ error: 'Invalid dateTo' });
    }

    try {
      const normalizedSearch = search?.trim().toLocaleLowerCase();
      const orders = (await getOrderSummaries())
        .filter((order) => {
          if (orderStatus && order.orderStatus !== orderStatus) return false;
          if (fromDate && order.soldAt < fromDate) return false;
          if (toDate && order.soldAt > toDate) return false;
          if (!normalizedSearch) return true;

          return [
            order.tcgplayerOrderId,
            order.buyerName,
            ...order.lineItems.flatMap((line) => [
              line.cardProductName,
              line.cardSetName,
            ]),
          ].some((value) =>
            value?.toLocaleLowerCase().includes(normalizedSearch),
          );
        })
        .sort((left, right) => right.soldAt.getTime() - left.soldAt.getTime());
      const total = orders.length;
      const pagedOrders = orders.slice(
        (pageNum - 1) * limitNum,
        pageNum * limitNum,
      );

      return reply.send({
        orders: pagedOrders,
        total,
        page: pageNum,
        limit: limitNum,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch sales' });
    }
  });

  // GET /stats - dashboard figures use one shipping amount per order, not line.
  fastify.get('/stats', async (_request, reply) => {
    try {
      const orderSummaries = await getOrderSummaries();
      const totalSales = orderSummaries.length;
      const totalRevenueCents = orderSummaries.reduce(
        (sum, order) => sum + order.totalCents,
        0,
      );
      const averageSaleCents =
        totalSales > 0 ? Math.round(totalRevenueCents / totalSales) : 0;

      const [listedSummary] = await db
        .select({
          activeListingCount: sql<number>`coalesce(sum(${cards.quantity}), 0)::int`,
        })
        .from(cards)
        .where(eq(cards.status, 'listed'));
      const activeListingCount = listedSummary?.activeListingCount ?? 0;

      return reply.send({
        totalSales,
        totalRevenueCents,
        averageSaleCents,
        activeListingCount,
        totalListedCount: activeListingCount,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch sales stats' });
    }
  });

  // GET /pipeline - count and total whole orders, including gift line items.
  fastify.get('/pipeline', async (_request, reply) => {
    try {
      const byStatus = new Map<
        OrderStatus,
        { status: OrderStatus; count: number; totalCents: number }
      >();
      for (const order of await getOrderSummaries()) {
        const entry = byStatus.get(order.orderStatus) ?? {
          status: order.orderStatus,
          count: 0,
          totalCents: 0,
        };
        entry.count += 1;
        entry.totalCents += order.totalCents;
        byStatus.set(order.orderStatus, entry);
      }

      const statusOrder = new Map(
        validOrderStatuses.map((status, index) => [status, index]),
      );
      const pipeline = [...byStatus.values()].sort(
        (left, right) =>
          (statusOrder.get(left.status) ?? Number.MAX_SAFE_INTEGER) -
          (statusOrder.get(right.status) ?? Number.MAX_SAFE_INTEGER),
      );
      return reply.send({ pipeline });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch sales pipeline' });
    }
  });

  // Deprecated compatibility endpoint. It now treats each supplied id as an
  // order representative instead of permitting partial line-item updates.
  fastify.patch<{ Body: BatchUpdateStatusBody }>(
    '/batch-status',
    async (request, reply) => {
      const { saleIds, newStatus, note } = request.body;
      if (
        !Array.isArray(saleIds) ||
        saleIds.length === 0 ||
        saleIds.some((id) => !Number.isInteger(id) || id <= 0)
      ) {
        return reply.code(400).send({
          error: 'saleIds must be a non-empty array of positive integers',
        });
      }
      if (!validOrderStatuses.includes(newStatus)) {
        return reply.code(400).send({ error: 'Invalid newStatus' });
      }

      const skipped: { id: number; reason: string }[] = [];
      const seenOrders = new Set<string>();
      let updated = 0;
      const confirmedLines: any[] = [];

      for (const saleId of saleIds) {
        try {
          const changedLines = await db.transaction(async (tx) => {
            const lines = await getOrderSaleRows(tx, saleId);
            if (lines.length === 0)
              throw new OrderTransitionError('Sale not found');
            const orderKey = lines[0].tcgplayerOrderId
              ? `order:${lines[0].tcgplayerOrderId}`
              : `sale:${lines[0].id}`;
            if (seenOrders.has(orderKey)) return null;
            await transitionOrderStatus(tx, lines, newStatus, note);
            seenOrders.add(orderKey);
            return lines;
          });
          if (!changedLines) continue;
          updated += 1;
          if (newStatus === 'confirmed') confirmedLines.push(...changedLines);
        } catch (error) {
          skipped.push({
            id: saleId,
            reason:
              error instanceof Error ? error.message : 'Failed to update order',
          });
        }
      }

      for (const line of confirmedLines) {
        if (line.lineItemType === 'gift') continue;
        await sendSaleConfirmedAlertBestEffort(
          line,
          await getCardProductName(line.cardId),
        );
      }

      return reply.send({ updated, skipped });
    },
  );

  // GET /:id/history - Sale status history timeline
  fastify.get<{ Params: { id: string } }>(
    '/:id/history',
    async (request, reply) => {
      const saleId = Number.parseInt(request.params.id, 10);
      if (Number.isNaN(saleId) || saleId <= 0) {
        return reply.code(400).send({ error: 'Invalid sale id' });
      }

      try {
        const orderLines = await getOrderSaleRows(db, saleId);
        if (orderLines.length === 0) {
          return reply.code(404).send({ error: 'Sale not found' });
        }
        const history = await db
          .select({
            id: saleStatusHistory.id,
            saleId: saleStatusHistory.saleId,
            previousStatus: saleStatusHistory.previousStatus,
            newStatus: saleStatusHistory.newStatus,
            source: saleStatusHistory.source,
            note: saleStatusHistory.note,
            changedAt: saleStatusHistory.changedAt,
          })
          .from(saleStatusHistory)
          .where(
            inArray(
              saleStatusHistory.saleId,
              orderLines.map((line) => line.id),
            ),
          )
          .orderBy(asc(saleStatusHistory.changedAt));

        return reply.send({ history });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch sale history' });
      }
    },
  );

  // GET /:id - Sale detail
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const saleId = Number.parseInt(request.params.id, 10);
    if (Number.isNaN(saleId) || saleId <= 0) {
      return reply.code(400).send({ error: 'Invalid sale id' });
    }

    try {
      const [sale] = await db
        .select({
          ...getTableColumns(sales),
          cardProductName: cards.productName,
          cardSetName: cards.setName,
        })
        .from(sales)
        .leftJoin(cards, eq(sales.cardId, cards.id))
        .where(eq(sales.id, saleId))
        .limit(1);

      if (!sale) {
        return reply.code(404).send({ error: 'Sale not found' });
      }

      return reply.send(sale);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch sale' });
    }
  });

  // PATCH /:id - Update sale metadata/status
  fastify.patch<{ Params: { id: string }; Body: UpdateSaleBody }>(
    '/:id',
    async (request, reply) => {
      const saleId = Number.parseInt(request.params.id, 10);
      if (Number.isNaN(saleId) || saleId <= 0) {
        return reply.code(400).send({ error: 'Invalid sale id' });
      }

      const {
        buyerName,
        tcgplayerOrderId,
        orderStatus,
        soldAt,
        notes,
        shippingCollectedCents,
      } = request.body;

      if (orderStatus && !validOrderStatuses.includes(orderStatus)) {
        return reply.code(400).send({ error: 'Invalid orderStatus' });
      }

      if (
        shippingCollectedCents !== undefined &&
        !isNonNegativeInteger(shippingCollectedCents)
      ) {
        return reply.code(400).send({
          error: 'shippingCollectedCents must be a non-negative integer',
        });
      }

      try {
        const orderLines = await getOrderSaleRows(db, saleId);
        if (orderLines.length === 0) {
          return reply.code(404).send({ error: 'Sale not found' });
        }
        const existingSale = orderLines.find((line) => line.id === saleId)!;
        const updateData: Record<string, unknown> = { updatedAt: new Date() };

        if (buyerName !== undefined) updateData.buyerName = buyerName;
        if (notes !== undefined) updateData.notes = notes;
        if (soldAt !== undefined) {
          const soldAtDate = parseDate(soldAt);
          if (!soldAtDate)
            return reply.code(400).send({ error: 'Invalid soldAt date' });
          updateData.soldAt = soldAtDate;
        }

        const normalizedOrderId =
          tcgplayerOrderId === undefined
            ? undefined
            : normalizeOptionalOrderId(tcgplayerOrderId);
        if (normalizedOrderId !== undefined)
          updateData.tcgplayerOrderId = normalizedOrderId;
        if (shippingCollectedCents !== undefined) {
          updateData.shippingCollectedCents = shippingCollectedCents;
        } else if (
          normalizedOrderId !== undefined &&
          normalizedOrderId !== existingSale.tcgplayerOrderId &&
          normalizedOrderId !== null
        ) {
          updateData.shippingCollectedCents =
            await getDefaultShippingCollectedCents();
        }

        const hasMetadataUpdate = Object.keys(updateData).length > 1;
        const needsStatusUpdate =
          orderStatus !== undefined && orderStatus !== existingSale.orderStatus;
        if (!hasMetadataUpdate && !needsStatusUpdate) {
          return reply.code(400).send({ error: 'No valid fields to update' });
        }

        let changedLines = orderLines;
        await db.transaction(async (tx) => {
          // Re-read inside the transaction so all validation and restoration
          // acts on the same complete order.
          changedLines = await getOrderSaleRows(tx, saleId);
          if (changedLines.length === 0)
            throw new OrderTransitionError('Sale not found');

          if (hasMetadataUpdate) {
            await tx
              .update(sales)
              .set(updateData)
              .where(
                inArray(
                  sales.id,
                  changedLines.map((line) => line.id),
                ),
              );
          }
          if (needsStatusUpdate) {
            await transitionOrderStatus(tx, changedLines, orderStatus!);
          }
        });

        if (needsStatusUpdate && orderStatus === 'confirmed') {
          for (const line of changedLines) {
            if (line.lineItemType === 'gift') continue;
            await sendSaleConfirmedAlertBestEffort(
              line,
              await getCardProductName(line.cardId),
            );
          }
        }

        const linkedCard = await getCardById(existingSale.cardId);
        return reply.send(
          serializeSaleResponse(
            {
              ...existingSale,
              ...updateData,
              orderStatus: needsStatusUpdate
                ? orderStatus!
                : existingSale.orderStatus,
            } as any,
            linkedCard,
          ),
        );
      } catch (error) {
        if (error instanceof OrderTransitionError) {
          const statusCode = error.message === 'Sale not found' ? 404 : 400;
          return reply.code(statusCode).send({ error: error.message });
        }
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to update sale' });
      }
    },
  );
}
