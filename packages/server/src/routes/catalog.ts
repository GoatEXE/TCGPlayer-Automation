import type { FastifyInstance } from 'fastify';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { catalogCards, catalogSets } from '../db/schema/catalog.js';
import {
  findCachedCatalogCandidates,
  normalizeCollectorNumber,
  normalizeSetCode,
  mapTCGTrackingProductToCatalogCard,
} from '../lib/catalog/index.js';
import { CARD_KINDS } from '../lib/collections/sellability.js';
import { TCGTrackingClient } from '../lib/tcgtracking/client.js';
import type {
  TCGTrackingProduct,
  TCGTrackingSet,
} from '../lib/tcgtracking/types.js';

const PRODUCT_LINE = 'Riftbound';

interface CatalogLookupQuery {
  setCode?: string;
  number?: string;
  sync?: string;
}

interface CatalogSearchQuery {
  q?: string;
  limit?: string;
}

interface CatalogSyncBody {
  setCode?: string;
}

interface CatalogMetadataBody {
  cardKind?: string | null;
}

function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toSetRow(set: TCGTrackingSet) {
  return {
    tcgtrackingSetId: set.id,
    productLine: PRODUCT_LINE,
    setCode: normalizeSetCode(set.abbreviation),
    name: set.name,
    isSupplemental: set.is_supplemental,
    publishedOn: set.published_on,
    productsModified: parseTimestamp(set.products_modified),
    syncedAt: new Date(),
    updatedAt: new Date(),
  };
}

async function syncCatalogSets(
  client = new TCGTrackingClient(),
): Promise<number> {
  const sets = await client.getSets();

  if (sets.length === 0) {
    return 0;
  }

  await db
    .insert(catalogSets)
    .values(sets.map(toSetRow))
    .onConflictDoUpdate({
      target: [catalogSets.productLine, catalogSets.setCode],
      set: {
        name: sql`excluded.name`,
        tcgtrackingSetId: sql`excluded.tcgtracking_set_id`,
        isSupplemental: sql`excluded.is_supplemental`,
        publishedOn: sql`excluded.published_on`,
        productsModified: sql`excluded.products_modified`,
        syncedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  return sets.length;
}

async function findSetByCode(setCode: string) {
  const rows = await db
    .select()
    .from(catalogSets)
    .where(
      and(
        eq(catalogSets.productLine, PRODUCT_LINE),
        eq(catalogSets.setCode, setCode),
      ),
    )
    .limit(1);

  return rows[0] || null;
}

async function listCatalogSets() {
  return db
    .select()
    .from(catalogSets)
    .where(eq(catalogSets.productLine, PRODUCT_LINE))
    .orderBy(catalogSets.publishedOn, catalogSets.name);
}

async function upsertCatalogProducts(
  catalogSetId: number,
  products: TCGTrackingProduct[],
): Promise<number> {
  const rows = products
    .map((product) => mapTCGTrackingProductToCatalogCard(catalogSetId, product))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return 0;
  }

  await db
    .insert(catalogCards)
    .values(rows)
    .onConflictDoUpdate({
      target: catalogCards.tcgProductId,
      set: {
        productName: sql`excluded.product_name`,
        title: sql`excluded.title`,
        collectorNumber: sql`excluded.collector_number`,
        normalizedNumber: sql`excluded.normalized_number`,
        rarity: sql`excluded.rarity`,
        photoUrl: sql`excluded.photo_url`,
        raw: sql`excluded.raw`,
        syncedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  return rows.length;
}

async function syncCatalogCardsForSetRow(
  set: Awaited<ReturnType<typeof findSetByCode>>,
  client = new TCGTrackingClient(),
): Promise<number> {
  if (!set?.tcgtrackingSetId) {
    return 0;
  }

  const products = await client.getProducts(set.tcgtrackingSetId);
  return upsertCatalogProducts(set.id, products);
}

async function syncCatalogCardsForSet(setCode: string): Promise<number> {
  let set = await findSetByCode(setCode);

  if (!set) {
    await syncCatalogSets();
    set = await findSetByCode(setCode);
  }

  return syncCatalogCardsForSetRow(set);
}

async function syncAllCatalogCards() {
  const client = new TCGTrackingClient();
  let syncedSets = 0;
  let setListError: string | undefined;

  try {
    syncedSets = await syncCatalogSets(client);
  } catch (error) {
    setListError = error instanceof Error ? error.message : 'unknown error';
  }

  const sets = await listCatalogSets();
  const results: Array<{
    setCode: string;
    name: string;
    syncedCards: number;
    status: 'synced' | 'skipped' | 'failed';
    error?: string;
  }> = [];
  let syncedCards = 0;

  for (const set of sets) {
    if (!set.tcgtrackingSetId) {
      results.push({
        setCode: set.setCode,
        name: set.name,
        syncedCards: 0,
        status: 'skipped',
        error: 'missing TCGTracking set id',
      });
      continue;
    }

    try {
      const setSyncedCards = await syncCatalogCardsForSetRow(set, client);
      syncedCards += setSyncedCards;
      results.push({
        setCode: set.setCode,
        name: set.name,
        syncedCards: setSyncedCards,
        status: 'synced',
      });
    } catch (error) {
      results.push({
        setCode: set.setCode,
        name: set.name,
        syncedCards: 0,
        status: 'failed',
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  const failedSets = results.filter((result) => result.status === 'failed');

  return {
    status:
      setListError || failedSets.length > 0
        ? ('partial' as const)
        : ('synced' as const),
    syncedSets,
    attemptedSets: sets.length,
    syncedCards,
    failedSets: failedSets.length,
    ...(setListError ? { setListError } : {}),
    results,
  };
}

async function getCatalogStatus() {
  const [setStats] = await db
    .select({
      count: sql<number>`count(*)`,
      lastSyncedAt: sql<Date | null>`max(${catalogSets.syncedAt})`,
    })
    .from(catalogSets)
    .where(eq(catalogSets.productLine, PRODUCT_LINE));

  const [cardStats] = await db
    .select({
      count: sql<number>`count(*)`,
      lastSyncedAt: sql<Date | null>`max(${catalogCards.syncedAt})`,
    })
    .from(catalogCards)
    .innerJoin(catalogSets, eq(catalogCards.catalogSetId, catalogSets.id))
    .where(eq(catalogSets.productLine, PRODUCT_LINE));

  const setCount = Number(setStats?.count ?? 0);
  const cardCount = Number(cardStats?.count ?? 0);

  return {
    sets: Number.isFinite(setCount) ? setCount : 0,
    cards: Number.isFinite(cardCount) ? cardCount : 0,
    lastSyncedAt: cardStats?.lastSyncedAt ?? setStats?.lastSyncedAt ?? null,
    ready: cardCount > 0,
  };
}

export async function catalogRoutes(fastify: FastifyInstance) {
  fastify.get('/status', async () => ({ catalog: await getCatalogStatus() }));

  fastify.patch('/cards/:id/metadata', async (request, reply) => {
    const cardId = Number.parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(cardId) || cardId <= 0) {
      return reply.code(400).send({ error: 'catalog card id must be a positive integer' });
    }

    const body = (request.body || {}) as CatalogMetadataBody;
    const normalizedKind = body.cardKind?.trim().toLowerCase() ?? null;

    if (
      normalizedKind !== null &&
      !(CARD_KINDS as readonly string[]).includes(normalizedKind)
    ) {
      return reply.code(400).send({
        error: `cardKind must be one of: ${CARD_KINDS.join(', ')}`,
      });
    }

    const [card] = await db
      .update(catalogCards)
      .set({ cardKind: normalizedKind, updatedAt: new Date() })
      .where(eq(catalogCards.id, cardId))
      .returning();

    if (!card) {
      return reply.code(404).send({ error: 'catalog card not found' });
    }

    return { card };
  });

  fastify.get('/sets', async (request) => {
    const query = request.query as { sync?: string };

    if (query.sync === 'true') {
      await syncCatalogSets();
    }

    const sets = await listCatalogSets();

    return { sets };
  });

  fastify.post('/sync', async (request) => {
    const body = (request.body || {}) as CatalogSyncBody;

    if (body.setCode) {
      const setCode = normalizeSetCode(body.setCode);
      const syncedCards = await syncCatalogCardsForSet(setCode);
      return { status: 'synced', syncedSets: 0, attemptedSets: 1, syncedCards };
    }

    return syncAllCatalogCards();
  });

  fastify.get('/lookup', async (request, reply) => {
    const query = request.query as CatalogLookupQuery;

    if (!query.setCode || !query.number) {
      return reply.code(400).send({ error: 'setCode and number are required' });
    }

    const setCode = normalizeSetCode(query.setCode);
    const normalizedNumber = normalizeCollectorNumber(query.number);
    let candidates = await findCachedCatalogCandidates(
      setCode,
      normalizedNumber,
    );

    if (candidates.length === 0 && query.sync !== 'false') {
      await syncCatalogCardsForSet(setCode);
      candidates = await findCachedCatalogCandidates(setCode, normalizedNumber);
    }

    const status =
      candidates.length === 1
        ? 'resolved'
        : candidates.length > 1
          ? 'ambiguous'
          : 'unresolved';

    return {
      status,
      query: {
        setCode,
        number: query.number,
        normalizedNumber,
      },
      candidates,
    };
  });

  fastify.get('/search', async (request, reply) => {
    const query = request.query as CatalogSearchQuery;
    const q = query.q?.trim();

    if (!q) {
      return reply.code(400).send({ error: 'q is required' });
    }

    const limit = Math.min(
      Math.max(Number.parseInt(query.limit || '25', 10) || 25, 1),
      100,
    );
    const pattern = `%${q}%`;

    const candidates = await db
      .select({
        id: catalogCards.id,
        tcgProductId: catalogCards.tcgProductId,
        productName: catalogCards.productName,
        title: catalogCards.title,
        collectorNumber: catalogCards.collectorNumber,
        normalizedNumber: catalogCards.normalizedNumber,
        rarity: catalogCards.rarity,
        photoUrl: catalogCards.photoUrl,
        cardKind: catalogCards.cardKind,
        set: {
          id: catalogSets.id,
          setCode: catalogSets.setCode,
          name: catalogSets.name,
        },
      })
      .from(catalogCards)
      .innerJoin(catalogSets, eq(catalogCards.catalogSetId, catalogSets.id))
      .where(
        and(
          eq(catalogSets.productLine, PRODUCT_LINE),
          or(
            ilike(catalogCards.productName, pattern),
            ilike(catalogCards.title, pattern),
            ilike(catalogCards.collectorNumber, pattern),
          ),
        ),
      )
      .orderBy(catalogSets.setCode, catalogCards.productName)
      .limit(limit);

    return { candidates };
  });
}
