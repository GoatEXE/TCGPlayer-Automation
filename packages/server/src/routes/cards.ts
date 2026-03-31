import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  eq,
  desc,
  isNotNull,
  sql,
  ilike,
  and,
  or,
  isNull,
  inArray,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import { cards } from '../db/schema/cards.js';
import { parseCsv, parseTxt } from '../lib/importers/index.js';
import { calculatePrice } from '../lib/pricing/index.js';
import {
  runPriceCheck,
  getPriceCheckSchedulerStatus,
} from '../lib/price-check/index.js';
import type { ImportedCard } from '../lib/importers/index.js';
import type { Card } from '../db/schema/cards.js';

interface ImportResponse {
  imported: number;
  updated: number;
  errors: string[];
  cards: Card[];
}

interface StatsResponse {
  total: number;
  pending: number;
  matched: number;
  listed: number;
  needs_attention: number;
  gift: number;
  error: number;
}

interface CardsListResponse {
  cards: Card[];
  total: number;
  page: number;
  limit: number;
}

interface UpdateCardBody {
  status?:
    | 'pending'
    | 'matched'
    | 'listed'
    | 'needs_attention'
    | 'gift'
    | 'error';
  quantity?: number;
  listingPrice?: number;
  notes?: string;
  condition?: string;
}

interface FetchPricesResponse {
  updated: number;
  notFound: number;
  drifted: number;
  errors: string[];
}

interface MarkListedBody {
  cardIds: number[];
}

interface MarkListedResponse {
  updated: number;
  errors: string[];
}

interface PriceCheckStatusResponse {
  enabled: boolean;
  intervalHours: number;
  thresholdPercent: number;
  running: boolean;
  lastRun: {
    startedAt: string;
    finishedAt: string;
    success: boolean;
    updated: number;
    notFound: number;
    drifted: number;
    errors: string[];
  } | null;
}

export async function cardsRoutes(fastify: FastifyInstance) {
  // POST /import - Import cards from CSV or TXT with duplicate handling
  fastify.post<{ Reply: ImportResponse }>('/import', async (request, reply) => {
    try {
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();
      const content = buffer.toString('utf-8');
      const filename = data.filename.toLowerCase();

      let importResult;

      // Auto-detect format from file extension
      if (filename.endsWith('.csv')) {
        importResult = parseCsv(content);
      } else if (filename.endsWith('.txt')) {
        importResult = parseTxt(content);
      } else {
        return reply.code(400).send({
          error: 'Invalid file type. Only .csv and .txt files are supported',
        });
      }

      const processedCards: Card[] = [];
      let importedCount = 0;
      let updatedCount = 0;

      // Process each imported card - check for duplicates and either insert or update
      for (const importedCard of importResult.cards) {
        const marketPrice = importedCard.snapshotMarketPrice;
        const pricingResult = calculatePrice({ marketPrice });

        // Check if card already exists
        let existingCards: Card[];

        if (importedCard.tcgplayerId) {
          // For CSV imports with tcgplayerId: match on tcgplayerId + condition
          existingCards = await db
            .select()
            .from(cards)
            .where(
              and(
                eq(cards.tcgplayerId, importedCard.tcgplayerId),
                eq(cards.condition, importedCard.condition),
              ),
            );
        } else {
          // For TXT imports without tcgplayerId: match on productName + setName + number + condition
          const conditions = [
            eq(cards.productName, importedCard.productName),
            eq(cards.condition, importedCard.condition),
          ];

          // Add setName condition (handle null)
          if (importedCard.setName) {
            conditions.push(eq(cards.setName, importedCard.setName));
          } else {
            conditions.push(isNull(cards.setName));
          }

          // Add number condition (handle null)
          if (importedCard.number) {
            conditions.push(eq(cards.number, importedCard.number));
          } else {
            conditions.push(isNull(cards.number));
          }

          existingCards = await db
            .select()
            .from(cards)
            .where(and(...conditions));
        }

        if (existingCards.length > 0) {
          // Card exists - increment quantity
          const existingCard = existingCards[0];
          const newQuantity = existingCard.quantity + importedCard.quantity;

          const [updatedCard] = await db
            .update(cards)
            .set({
              quantity: newQuantity,
              updatedAt: new Date(),
            })
            .where(eq(cards.id, existingCard.id))
            .returning();

          processedCards.push(updatedCard);
          updatedCount++;
        } else {
          // Card doesn't exist - insert new
          const cardData = {
            tcgplayerId: importedCard.tcgplayerId,
            tcgProductId: importedCard.tcgProductId,
            productLine: importedCard.productLine,
            setName: importedCard.setName,
            productName: importedCard.productName,
            title: importedCard.title,
            number: importedCard.number,
            rarity: importedCard.rarity,
            condition: importedCard.condition,
            quantity: importedCard.quantity,
            status: pricingResult.status,
            marketPrice: marketPrice?.toString() ?? null,
            listingPrice: pricingResult.listingPrice?.toString() ?? null,
            photoUrl: importedCard.photoUrl,
          };

          const [insertedCard] = await db
            .insert(cards)
            .values(cardData)
            .returning();
          processedCards.push(insertedCard);
          importedCount++;
        }
      }

      return reply.code(201).send({
        imported: importedCount,
        updated: updatedCount,
        errors: importResult.errors,
        cards: processedCards,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to import cards' });
    }
  });

  // GET / - List cards with pagination and filtering
  fastify.get<{
    Querystring: {
      status?: string;
      page?: string;
      limit?: string;
      search?: string;
    };
    Reply: CardsListResponse;
  }>('/', async (request, reply) => {
    const { status, page = '1', limit = '50', search } = request.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    try {
      // Build where conditions
      const conditions = [];
      if (status) {
        conditions.push(eq(cards.status, status as any));
      }
      if (search) {
        conditions.push(ilike(cards.productName, `%${search}%`));
      }

      // Get total count
      let countQuery = db
        .select({ count: sql<number>`count(*)::int` })
        .from(cards);
      if (conditions.length > 0) {
        countQuery = countQuery.where(sql`${sql.join(conditions, sql` AND `)}`);
      }
      const [{ count: total }] = await countQuery;

      // Get cards
      let query = db.select().from(cards);
      if (conditions.length > 0) {
        query = query.where(sql`${sql.join(conditions, sql` AND `)}`);
      }
      const cardsResult = await query
        .orderBy(desc(cards.importedAt))
        .limit(limitNum)
        .offset(offset);

      return reply.send({
        cards: cardsResult,
        total,
        page: pageNum,
        limit: limitNum,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch cards' });
    }
  });

  // GET /stats - Get card statistics by status
  fastify.get<{ Reply: StatsResponse }>('/stats', async (request, reply) => {
    try {
      const stats = await db
        .select({
          status: cards.status,
          count: sql<number>`coalesce(sum(quantity), 0)::int`,
        })
        .from(cards)
        .groupBy(cards.status);

      const statsMap: Record<string, number> = {};
      let total = 0;

      for (const stat of stats) {
        const statusKey = stat.status || 'pending';
        statsMap[statusKey] = stat.count;
        total += stat.count;
      }

      return reply.send({
        total,
        pending: statsMap.pending || 0,
        matched: statsMap.matched || 0,
        listed: statsMap.listed || 0,
        needs_attention: statsMap.needs_attention || 0,
        gift: statsMap.gift || 0,
        error: statsMap.error || 0,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch stats' });
    }
  });

  // PATCH /:id - Update a card
  fastify.patch<{
    Params: { id: string };
    Body: UpdateCardBody;
    Reply: Card;
  }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const updates = request.body;

    try {
      const updateData: any = { ...updates, updatedAt: new Date() };

      // Convert listingPrice to string if provided
      if (updates.listingPrice !== undefined) {
        updateData.listingPrice = updates.listingPrice.toString();
      }

      const [updatedCard] = await db
        .update(cards)
        .set(updateData)
        .where(eq(cards.id, parseInt(id, 10)))
        .returning();

      if (!updatedCard) {
        return reply.code(404).send({ error: 'Card not found' });
      }

      return reply.send(updatedCard);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update card' });
    }
  });

  // DELETE /:id - Delete a card
  fastify.delete<{
    Params: { id: string };
    Reply: { success: boolean };
  }>('/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const [deletedCard] = await db
        .delete(cards)
        .where(eq(cards.id, parseInt(id, 10)))
        .returning();

      if (!deletedCard) {
        return reply.code(404).send({ error: 'Card not found' });
      }

      return reply.send({ success: true });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete card' });
    }
  });

  // POST /:id/reprice - Reprice a single card
  fastify.post<{
    Params: { id: string };
    Reply: Card;
  }>('/:id/reprice', async (request, reply) => {
    const { id } = request.params;

    try {
      // Fetch the card
      const [card] = await db
        .select()
        .from(cards)
        .where(eq(cards.id, parseInt(id, 10)));

      if (!card) {
        return reply.code(404).send({ error: 'Card not found' });
      }

      // Calculate new price
      const marketPrice = card.marketPrice
        ? parseFloat(card.marketPrice)
        : null;
      const pricingResult = calculatePrice({ marketPrice });

      // Preserve 'listed' status — only override if pricing engine says gift/needs_attention
      const newStatus =
        card.status === 'listed' && pricingResult.status === 'matched'
          ? 'listed'
          : pricingResult.status;

      // Update card with new pricing
      const [updatedCard] = await db
        .update(cards)
        .set({
          listingPrice: pricingResult.listingPrice?.toString() ?? null,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(cards.id, parseInt(id, 10)))
        .returning();

      return reply.send(updatedCard);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to reprice card' });
    }
  });

  // POST /reprice-all - Reprice all cards
  fastify.post<{ Reply: { updated: number } }>(
    '/reprice-all',
    async (request, reply) => {
      try {
        // Fetch all cards with a market price
        const cardsToReprice = await db
          .select()
          .from(cards)
          .where(isNotNull(cards.marketPrice));

        let updated = 0;

        // Update each card with new pricing
        for (const card of cardsToReprice) {
          const marketPrice = parseFloat(card.marketPrice!);
          const pricingResult = calculatePrice({ marketPrice });

          // Preserve 'listed' status — only override if pricing engine says gift/needs_attention
          const newStatus =
            card.status === 'listed' && pricingResult.status === 'matched'
              ? 'listed'
              : pricingResult.status;

          await db
            .update(cards)
            .set({
              listingPrice: pricingResult.listingPrice?.toString() ?? null,
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(cards.id, card.id));

          updated++;
        }

        return reply.send({ updated });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to reprice cards' });
      }
    },
  );

  // POST /fetch-prices - Fetch latest prices from TCGTracking API
  fastify.post<{ Reply: FetchPricesResponse }>(
    '/fetch-prices',
    async (_request, reply) => {
      try {
        const result = await runPriceCheck({ source: 'manual' });
        return reply.send({
          updated: result.updated,
          notFound: result.notFound,
          drifted: result.drifted,
          errors: result.errors,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch prices' });
      }
    },
  );

  // GET /price-check-status - Get scheduler status and last run metadata
  fastify.get<{ Reply: PriceCheckStatusResponse }>(
    '/price-check-status',
    async (_request, reply) => {
      try {
        return reply.send(getPriceCheckSchedulerStatus());
      } catch (error) {
        fastify.log.error(error);
        return reply
          .code(500)
          .send({ error: 'Failed to fetch price check status' });
      }
    },
  );

  // POST /mark-listed - Bulk mark cards as listed
  fastify.post<{
    Body: MarkListedBody;
    Reply: MarkListedResponse;
  }>('/mark-listed', async (request, reply) => {
    const { cardIds } = request.body;

    // Validate request
    if (!cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
      return reply
        .code(400)
        .send({ error: 'cardIds must be a non-empty array' });
    }

    try {
      // Fetch all requested cards
      const cardsToUpdate = await db
        .select()
        .from(cards)
        .where(inArray(cards.id, cardIds));

      let updated = 0;
      const errors: string[] = [];

      // Process each card
      for (const card of cardsToUpdate) {
        if (card.status === 'matched') {
          // Update status to listed
          await db
            .update(cards)
            .set({
              status: 'listed',
              updatedAt: new Date(),
            })
            .where(eq(cards.id, card.id));
          updated++;
        } else {
          // Skip non-matched cards with error message
          errors.push(
            `Card "${card.productName}" (ID: ${card.id}) has status "${card.status}" - only matched cards can be marked as listed`,
          );
        }
      }

      return reply.send({ updated, errors });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to mark cards as listed' });
    }
  });

  // POST /:id/unlist - Unlist a card (set status back to matched)
  fastify.post<{
    Params: { id: string };
    Reply: Card;
  }>('/:id/unlist', async (request, reply) => {
    const { id } = request.params;

    try {
      // Fetch the card
      const [card] = await db
        .select()
        .from(cards)
        .where(eq(cards.id, parseInt(id, 10)));

      if (!card) {
        return reply.code(404).send({ error: 'Card not found' });
      }

      // Validate that card is listed
      if (card.status !== 'listed') {
        return reply
          .code(400)
          .send({ error: 'Only listed cards can be unlisted' });
      }

      // Re-run pricing engine
      const marketPrice = card.marketPrice
        ? parseFloat(card.marketPrice)
        : null;
      const pricingResult = calculatePrice({ marketPrice });

      // Update card back to matched status
      const [updatedCard] = await db
        .update(cards)
        .set({
          status: pricingResult.status,
          listingPrice: pricingResult.listingPrice?.toString() ?? null,
          updatedAt: new Date(),
        })
        .where(eq(cards.id, parseInt(id, 10)))
        .returning();

      return reply.send(updatedCard);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to unlist card' });
    }
  });
}
