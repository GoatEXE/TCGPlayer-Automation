import {
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  cards,
  isListedOriginAttentionReason,
  type Card,
} from '../db/schema/cards.js';
import { saleStatusHistory } from '../db/schema/sale-status-history.js';
import { sales } from '../db/schema/sales.js';
import { getOrCreateExpenseSettings } from '../lib/expenses/index.js';
import { sendSaleConfirmedAlert } from '../lib/notifications/telegram.js';
import { isValidTransition } from '../lib/sales/status-machine.js';
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

function buildPaidOrderSummaries(
  saleRows: Array<{
    id: number;
    tcgplayerOrderId: string | null;
    salePriceCents: number;
    shippingCollectedCents: number;
  }>,
) {
  const orders = new Map<
    string,
    {
      productRevenueCents: number;
      shippingCollectedCents: number;
    }
  >();

  for (const sale of saleRows) {
    const key = sale.tcgplayerOrderId ?? `sale:${sale.id}`;
    const existing = orders.get(key);

    if (existing) {
      existing.productRevenueCents += sale.salePriceCents;
      existing.shippingCollectedCents = Math.max(
        existing.shippingCollectedCents,
        sale.shippingCollectedCents,
      );
      continue;
    }

    orders.set(key, {
      productRevenueCents: sale.salePriceCents,
      shippingCollectedCents: sale.shippingCollectedCents,
    });
  }

  return [...orders.values()];
}

function getRestoredCardStateForCancelledLine(params: {
  lineItemType: SaleLineItemType;
  linkedCardStatus: Card['status'];
  restoredQuantity: number;
  linkedCardAttentionReason: Card['attentionReason'];
}): {
  status: Card['status'];
  attentionReason: Card['attentionReason'];
} {
  const {
    lineItemType,
    linkedCardStatus,
    restoredQuantity,
    linkedCardAttentionReason,
  } = params;

  if (lineItemType === 'gift') {
    return {
      status: restoredQuantity > 0 ? 'gift' : linkedCardStatus,
      attentionReason: null,
    };
  }

  if (linkedCardStatus === 'sold' && restoredQuantity > 0) {
    return {
      status: 'listed',
      attentionReason: null,
    };
  }

  return {
    status: linkedCardStatus,
    attentionReason: linkedCardAttentionReason,
  };
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
  fastify.post<{ Body: BulkRecordSaleBody }>('/bulk', async (request, reply) => {
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
      const resolvedShippingCollectedCents =
        shippingCollectedCents ?? (await getDefaultShippingCollectedCents());
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
            throw new SalesRouteError(400, 'cardId must be a positive integer');
          }

          if (!Number.isInteger(line.quantitySold) || line.quantitySold <= 0) {
            throw new SalesRouteError(
              400,
              'quantitySold must be a positive integer',
            );
          }

          if (!Number.isInteger(line.salePriceCents) || line.salePriceCents < 0) {
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
      return reply.code(500).send({ error: 'Failed to record bulk sale order' });
    }
  });

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

      return reply
        .code(201)
        .send(serializeSaleResponse(sale, card));
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to record sale' });
    }
  });

  // GET / - List sales
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
    const offset = (pageNum - 1) * limitNum;

    if (
      orderStatus &&
      !validOrderStatuses.includes(orderStatus as OrderStatus)
    ) {
      return reply.code(400).send({ error: 'Invalid orderStatus' });
    }

    const conditions: any[] = [eq(sales.lineItemType, 'sale')];

    if (orderStatus) {
      conditions.push(eq(sales.orderStatus, orderStatus as OrderStatus));
    }

    if (search) {
      conditions.push(
        or(
          ilike(sales.buyerName, `%${search}%`),
          ilike(sales.tcgplayerOrderId, `%${search}%`),
          ilike(cards.productName, `%${search}%`),
        ),
      );
    }

    if (dateFrom) {
      const fromDate = parseDate(dateFrom);
      if (!fromDate) {
        return reply.code(400).send({ error: 'Invalid dateFrom' });
      }
      conditions.push(gte(sales.soldAt, fromDate));
    }

    if (dateTo) {
      const toDate = parseDate(dateTo);
      if (!toDate) {
        return reply.code(400).send({ error: 'Invalid dateTo' });
      }
      conditions.push(lte(sales.soldAt, toDate));
    }

    try {
      let countQuery: any = db
        .select({ count: sql<number>`count(*)::int` })
        .from(sales)
        .leftJoin(cards, eq(sales.cardId, cards.id));

      if (conditions.length > 0) {
        countQuery = countQuery.where(sql`${sql.join(conditions, sql` AND `)}`);
      }

      const [{ count: total }] = await countQuery;

      let query: any = db
        .select({
          ...getTableColumns(sales),
          cardProductName: cards.productName,
          cardSetName: cards.setName,
        })
        .from(sales)
        .leftJoin(cards, eq(sales.cardId, cards.id));

      if (conditions.length > 0) {
        query = query.where(sql`${sql.join(conditions, sql` AND `)}`);
      }

      const rows = await query
        .orderBy(desc(sales.soldAt))
        .limit(limitNum)
        .offset(offset);

      return reply.send({
        sales: rows,
        total,
        page: pageNum,
        limit: limitNum,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch sales' });
    }
  });

  // GET /stats - Dashboard summary statistics
  fastify.get('/stats', async (request, reply) => {
    try {
      const saleRows = await db
        .select({
          id: sales.id,
          tcgplayerOrderId: sales.tcgplayerOrderId,
          salePriceCents: sales.salePriceCents,
          shippingCollectedCents: sales.shippingCollectedCents,
        })
        .from(sales)
        .where(eq(sales.lineItemType, 'sale'));

      const paidOrders = buildPaidOrderSummaries(saleRows);
      const totalSales = saleRows.length;
      const totalRevenueCents = paidOrders.reduce(
        (sum, order) =>
          sum + order.productRevenueCents + order.shippingCollectedCents,
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
        // For now, total listed count uses the same quantity-based semantics as active listings.
        totalListedCount: activeListingCount,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch sales stats' });
    }
  });

  // GET /pipeline - Order pipeline summary by status
  fastify.get('/pipeline', async (request, reply) => {
    try {
      const statusOrder = new Map(
        validOrderStatuses.map((status, index) => [status, index]),
      );

      const pipeline = await db
        .select({
          status: sales.orderStatus,
          count: sql<number>`count(*)::int`,
          totalCents: sql<number>`coalesce(sum(${sales.salePriceCents}), 0)::int`,
        })
        .from(sales)
        .where(eq(sales.lineItemType, 'sale'))
        .groupBy(sales.orderStatus);

      pipeline.sort(
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

  // PATCH /batch-status - Batch order status updates
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
      let updated = 0;

      try {
        for (const saleId of saleIds) {
          const [existingSale] = await db
            .select()
            .from(sales)
            .where(eq(sales.id, saleId))
            .limit(1);

          if (!existingSale) {
            skipped.push({ id: saleId, reason: 'Sale not found' });
            continue;
          }

          if (!isValidTransition(existingSale.orderStatus, newStatus)) {
            skipped.push({
              id: saleId,
              reason: `Invalid orderStatus transition from ${existingSale.orderStatus} to ${newStatus}`,
            });
            continue;
          }

          const [updatedSale] = await db
            .update(sales)
            .set({
              orderStatus: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(sales.id, saleId))
            .returning();

          if (!updatedSale) {
            skipped.push({ id: saleId, reason: 'Sale not found' });
            continue;
          }

          await db.insert(saleStatusHistory).values({
            saleId: existingSale.id,
            previousStatus: existingSale.orderStatus,
            newStatus,
            source: 'manual',
            note: note ?? null,
          });

          if (newStatus === 'confirmed') {
            await createShipmentOnConfirm(db, existingSale.id);
            const productName = await getCardProductName(existingSale.cardId);
            await sendSaleConfirmedAlertBestEffort(
              {
                id: existingSale.id,
                cardId: existingSale.cardId,
                quantitySold: existingSale.quantitySold,
                salePriceCents: existingSale.salePriceCents,
                buyerName: existingSale.buyerName,
                tcgplayerOrderId: existingSale.tcgplayerOrderId,
              },
              productName,
            );
          }

          if (newStatus === 'cancelled' && existingSale.cardId !== null) {
            const [linkedCard] = await db
              .select()
              .from(cards)
              .where(eq(cards.id, existingSale.cardId))
              .limit(1);

            if (linkedCard) {
              const restoredQuantity =
                linkedCard.quantity + existingSale.quantitySold;
              const restoredCardState = getRestoredCardStateForCancelledLine({
                lineItemType:
                  (existingSale.lineItemType as SaleLineItemType | undefined) ??
                  'sale',
                linkedCardStatus: linkedCard.status,
                restoredQuantity,
                linkedCardAttentionReason: linkedCard.attentionReason,
              });

              await db
                .update(cards)
                .set({
                  quantity: restoredQuantity,
                  status: restoredCardState.status as any,
                  attentionReason: restoredCardState.attentionReason,
                  updatedAt: new Date(),
                })
                .where(eq(cards.id, linkedCard.id));
            }
          }

          updated += 1;
        }

        return reply.send({
          updated,
          skipped,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply
          .code(500)
          .send({ error: 'Failed to batch update sales status' });
      }
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
        const history = await db
          .select({
            id: saleStatusHistory.id,
            previousStatus: saleStatusHistory.previousStatus,
            newStatus: saleStatusHistory.newStatus,
            source: saleStatusHistory.source,
            note: saleStatusHistory.note,
            changedAt: saleStatusHistory.changedAt,
          })
          .from(saleStatusHistory)
          .where(eq(saleStatusHistory.saleId, saleId))
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
        const [existingSale] = await db
          .select()
          .from(sales)
          .where(eq(sales.id, saleId))
          .limit(1);

        if (!existingSale) {
          return reply.code(404).send({ error: 'Sale not found' });
        }

        const updateData: any = {
          updatedAt: new Date(),
        };

        if (buyerName !== undefined) {
          updateData.buyerName = buyerName;
        }

        const normalizedOrderId =
          tcgplayerOrderId !== undefined
            ? normalizeOptionalOrderId(tcgplayerOrderId)
            : undefined;

        if (tcgplayerOrderId !== undefined) {
          updateData.tcgplayerOrderId = normalizedOrderId;
        }

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

        if (notes !== undefined) {
          updateData.notes = notes;
        }

        if (soldAt !== undefined) {
          const soldAtDate = parseDate(soldAt);
          if (!soldAtDate) {
            return reply.code(400).send({ error: 'Invalid soldAt date' });
          }
          updateData.soldAt = soldAtDate;
        }

        let nextStatus: OrderStatus | null = null;
        if (
          orderStatus !== undefined &&
          orderStatus !== existingSale.orderStatus
        ) {
          if (!isValidTransition(existingSale.orderStatus, orderStatus)) {
            return reply.code(400).send({
              error: `Invalid orderStatus transition from ${existingSale.orderStatus} to ${orderStatus}`,
            });
          }

          updateData.orderStatus = orderStatus;
          nextStatus = orderStatus;
        }

        if (Object.keys(updateData).length === 1) {
          return reply.code(400).send({ error: 'No valid fields to update' });
        }

        const [updatedSale] = await db
          .update(sales)
          .set(updateData)
          .where(eq(sales.id, saleId))
          .returning();

        if (!updatedSale) {
          return reply.code(404).send({ error: 'Sale not found' });
        }

        const effectiveOrderId = normalizeOptionalOrderId(
          updatedSale.tcgplayerOrderId ?? existingSale.tcgplayerOrderId,
        );

        if (shippingCollectedCents !== undefined && effectiveOrderId) {
          await db
            .update(sales)
            .set({
              shippingCollectedCents,
              updatedAt: new Date(),
            })
            .where(eq(sales.tcgplayerOrderId, effectiveOrderId));

          updatedSale.shippingCollectedCents = shippingCollectedCents;
        }

        if (nextStatus) {
          await db.insert(saleStatusHistory).values({
            saleId: existingSale.id,
            previousStatus: existingSale.orderStatus,
            newStatus: nextStatus,
            source: 'manual',
          });

          if (nextStatus === 'confirmed') {
            await createShipmentOnConfirm(db, existingSale.id);
            const productName = await getCardProductName(existingSale.cardId);
            await sendSaleConfirmedAlertBestEffort(
              {
                id: existingSale.id,
                cardId: existingSale.cardId,
                quantitySold: existingSale.quantitySold,
                salePriceCents: existingSale.salePriceCents,
                buyerName: updatedSale.buyerName ?? existingSale.buyerName,
                tcgplayerOrderId:
                  updatedSale.tcgplayerOrderId ?? existingSale.tcgplayerOrderId,
              },
              productName,
            );
          }

          if (nextStatus === 'cancelled' && existingSale.cardId !== null) {
            const [linkedCard] = await db
              .select()
              .from(cards)
              .where(eq(cards.id, existingSale.cardId))
              .limit(1);

            if (linkedCard) {
              const restoredQuantity =
                linkedCard.quantity + existingSale.quantitySold;
              const restoredCardState = getRestoredCardStateForCancelledLine({
                lineItemType:
                  (existingSale.lineItemType as SaleLineItemType | undefined) ??
                  'sale',
                linkedCardStatus: linkedCard.status,
                restoredQuantity,
                linkedCardAttentionReason: linkedCard.attentionReason,
              });
              await db
                .update(cards)
                .set({
                  quantity: restoredQuantity,
                  status: restoredCardState.status as any,
                  attentionReason: restoredCardState.attentionReason,
                  updatedAt: new Date(),
                })
                .where(eq(cards.id, linkedCard.id));
            }
          }
        }

        const linkedCard = await getCardById(
          updatedSale.cardId ?? existingSale.cardId,
        );

        return reply.send(serializeSaleResponse(updatedSale, linkedCard));
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to update sale' });
      }
    },
  );
}
