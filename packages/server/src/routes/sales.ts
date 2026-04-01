import {
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
import { sales } from '../db/schema/sales.js';

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

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (buyerName !== undefined) {
        updateData.buyerName = buyerName;
      }

      if (tcgplayerOrderId !== undefined) {
        updateData.tcgplayerOrderId = tcgplayerOrderId;
      }

      if (orderStatus !== undefined) {
        updateData.orderStatus = orderStatus;
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

      if (Object.keys(updateData).length === 1) {
        return reply.code(400).send({ error: 'No valid fields to update' });
      }

      try {
        const [updatedSale] = await db
          .update(sales)
          .set(updateData)
          .where(eq(sales.id, saleId))
          .returning();

        if (!updatedSale) {
          return reply.code(404).send({ error: 'Sale not found' });
        }

        return reply.send(updatedSale);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to update sale' });
      }
    },
  );
}
