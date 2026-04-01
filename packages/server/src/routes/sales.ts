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
import { cards } from '../db/schema/cards.js';
import { saleStatusHistory } from '../db/schema/sale-status-history.js';
import { sales } from '../db/schema/sales.js';
import { isValidTransition } from '../lib/sales/status-machine.js';

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

interface RecordSaleBody {
  cardId: number;
  quantitySold: number;
  salePriceCents: number;
  buyerName?: string | null;
  tcgplayerOrderId?: string | null;
  orderStatus?: OrderStatus;
  soldAt?: string;
  notes?: string | null;
}

interface UpdateSaleBody {
  buyerName?: string | null;
  tcgplayerOrderId?: string | null;
  orderStatus?: OrderStatus;
  soldAt?: string;
  notes?: string | null;
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

function parseDate(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export async function salesRoutes(fastify: FastifyInstance) {
  // POST / - Record a sale
  fastify.post<{ Body: RecordSaleBody }>('/', async (request, reply) => {
    const {
      cardId,
      quantitySold,
      salePriceCents,
      buyerName,
      tcgplayerOrderId,
      orderStatus = 'pending',
      soldAt,
      notes,
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

    const soldAtDate = soldAt ? parseDate(soldAt) : new Date();
    if (!soldAtDate) {
      return reply.code(400).send({ error: 'Invalid soldAt date' });
    }

    try {
      const [card] = await db
        .select()
        .from(cards)
        .where(eq(cards.id, cardId))
        .limit(1);

      if (!card) {
        return reply.code(404).send({ error: 'Card not found' });
      }

      if (card.status !== 'listed') {
        return reply.code(400).send({ error: 'Only listed cards can be sold' });
      }

      if (quantitySold > card.quantity) {
        return reply.code(400).send({
          error: 'quantitySold cannot exceed available card quantity',
        });
      }

      const remainingQuantity = card.quantity - quantitySold;
      const nextCardStatus = remainingQuantity === 0 ? 'sold' : 'listed';

      await db
        .update(cards)
        .set({
          quantity: remainingQuantity,
          status: nextCardStatus,
          updatedAt: new Date(),
        })
        .where(eq(cards.id, card.id));

      const [sale] = await db
        .insert(sales)
        .values({
          cardId,
          quantitySold,
          salePriceCents,
          buyerName: buyerName ?? null,
          tcgplayerOrderId: tcgplayerOrderId ?? null,
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

      return reply.code(201).send(sale);
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

    const conditions = [];

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
      const [salesSummary] = await db
        .select({
          totalSales: sql<number>`count(*)::int`,
          totalRevenueCents: sql<number>`coalesce(sum(${sales.salePriceCents}), 0)::int`,
          averageSaleCents: sql<number>`coalesce(round(avg(${sales.salePriceCents})), 0)::int`,
        })
        .from(sales);

      const [listedSummary] = await db
        .select({
          activeListingCount: sql<number>`coalesce(sum(${cards.quantity}), 0)::int`,
        })
        .from(cards)
        .where(eq(cards.status, 'listed'));

      const activeListingCount = listedSummary?.activeListingCount ?? 0;

      return reply.send({
        totalSales: salesSummary?.totalSales ?? 0,
        totalRevenueCents: salesSummary?.totalRevenueCents ?? 0,
        averageSaleCents: salesSummary?.averageSaleCents ?? 0,
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

          if (newStatus === 'cancelled' && existingSale.cardId !== null) {
            const [linkedCard] = await db
              .select()
              .from(cards)
              .where(eq(cards.id, existingSale.cardId))
              .limit(1);

            if (linkedCard) {
              const restoredQuantity =
                linkedCard.quantity + existingSale.quantitySold;

              await db
                .update(cards)
                .set({
                  quantity: restoredQuantity,
                  status:
                    linkedCard.status === 'sold' && restoredQuantity > 0
                      ? 'listed'
                      : linkedCard.status,
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

      const { buyerName, tcgplayerOrderId, orderStatus, soldAt, notes } =
        request.body;

      if (orderStatus && !validOrderStatuses.includes(orderStatus)) {
        return reply.code(400).send({ error: 'Invalid orderStatus' });
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

        if (tcgplayerOrderId !== undefined) {
          updateData.tcgplayerOrderId = tcgplayerOrderId;
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

        if (nextStatus) {
          await db.insert(saleStatusHistory).values({
            saleId: existingSale.id,
            previousStatus: existingSale.orderStatus,
            newStatus: nextStatus,
            source: 'manual',
          });

          if (nextStatus === 'cancelled' && existingSale.cardId !== null) {
            const [linkedCard] = await db
              .select()
              .from(cards)
              .where(eq(cards.id, existingSale.cardId))
              .limit(1);

            if (linkedCard) {
              const restoredQuantity =
                linkedCard.quantity + existingSale.quantitySold;
              await db
                .update(cards)
                .set({
                  quantity: restoredQuantity,
                  status:
                    linkedCard.status === 'sold' && restoredQuantity > 0
                      ? 'listed'
                      : linkedCard.status,
                  updatedAt: new Date(),
                })
                .where(eq(cards.id, linkedCard.id));
            }
          }
        }

        return reply.send(updatedSale);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to update sale' });
      }
    },
  );
}
