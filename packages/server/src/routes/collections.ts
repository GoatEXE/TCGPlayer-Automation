import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cards } from '../db/schema/cards.js';
import { catalogCards, catalogSets } from '../db/schema/catalog.js';
import { collectionItems, collections } from '../db/schema/collections.js';
import { normalizeCollectorNumber } from '../lib/catalog/index.js';
import {
  parseTcgplayerCollectionCsv,
  type CollectionCsvRow,
} from '../lib/collections/import-csv.js';
import { calculatePrice } from '../lib/pricing/index.js';
import { TCGTrackingClient } from '../lib/tcgtracking/client.js';
import {
  classifyCatalogCard,
  computeCollectionSellability,
  DEFAULT_CONDITION,
  DEFAULT_FINISH,
  DEFAULT_KEEP_COLLECTION_NAME,
  DEFAULT_LANGUAGE,
  DEFAULT_SELL_COLLECTION_NAME,
  normalizeFinishKind,
  type SellabilityCollectionItemInput,
} from '../lib/collections/sellability.js';

const DEFAULT_OWNED_PURPOSE = 'owned';
const DEFAULT_TO_BE_SOLD_PURPOSE = 'to_be_sold';
const COLLECTION_IMPORT_SOURCE = 'tcgplayer_collection_csv';
const PRODUCT_LINE = 'Riftbound';

const SET_CODE_BY_NAME: Record<string, string> = {
  origins: 'OGN',
  unleashed: 'UNL',
  spiritforged: 'SFD',
  vendetta: 'VEN',
  'origins: proving grounds': 'OGS',
  'riftbound judge promotional cards': 'JDG',
  'riftbound organized play promotional cards': 'OPP',
  'riftbound promotional cards': 'PR',
  'riftbound worlds bundle 2025': 'RWB',
};

interface CollectionItemInput {
  catalogCardId?: number | string;
  quantity?: number;
  condition?: string;
  finish?: string;
  language?: string;
  source?: string;
  notes?: string | null;
}

type CollectionImportMode = 'merge' | 'set';

interface ClearCollectionBody {
  confirmation?: string;
}

interface CollectionImportResolvedRow {
  rowNumber: number;
  status: 'matched' | 'created' | 'unresolved';
  catalogCardId: number | null;
  tcgProductId: number | null;
  productName: string;
  setName: string;
  number: string | null;
  condition: string;
  finish: 'Normal' | 'Foil';
  quantity: number;
  warnings: string[];
}

interface TransferToInventoryInput {
  collectionItemId?: number | string;
  quantity?: number;
}

interface TransferToInventoryBody {
  items?: TransferToInventoryInput[];
}

interface CollectionImportPlan {
  source: 'tcgplayer_collection_csv';
  mode: CollectionImportMode;
  parseErrors: string[];
  rows: CollectionImportResolvedRow[];
  items: Array<ReturnType<typeof normalizeCollectionItem>>;
  summary: {
    totalRows: number;
    parsedRows: number;
    matchedCatalogRows: number;
    createdCatalogRows: number;
    unresolvedRows: number;
    totalQuantity: number;
    normalQuantity: number;
    foilQuantity: number;
    warnings: string[];
  };
}

async function runInDbTransaction<T>(
  callback: (database: typeof db) => Promise<T>,
): Promise<T> {
  const maybeTransactionalDb = db as typeof db & {
    transaction?: (callback: (database: typeof db) => Promise<T>) => Promise<T>;
  };

  if (typeof maybeTransactionalDb.transaction === 'function') {
    return maybeTransactionalDb.transaction(callback);
  }

  return callback(db);
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function toPositiveInteger(value: unknown): number | null {
  if (positiveInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value, 10);
    return positiveInteger(parsed) ? parsed : null;
  }

  return null;
}

function normalizeCollectionItem(input: CollectionItemInput) {
  return {
    catalogCardId: toPositiveInteger(input.catalogCardId),
    quantity: input.quantity ?? 1,
    condition: input.condition?.trim() || DEFAULT_CONDITION,
    finish: input.finish?.trim() || DEFAULT_FINISH,
    language: input.language?.trim().toUpperCase() || DEFAULT_LANGUAGE,
    source: input.source?.trim() || COLLECTION_IMPORT_SOURCE,
    notes: input.notes ?? null,
  };
}

async function insertCollectionIfMissing(name: string, purpose: string) {
  await db
    .insert(collections)
    .values({ name, purpose })
    .onConflictDoNothing({ target: collections.name });
}

async function ensureDefaultCollections() {
  await insertCollectionIfMissing(DEFAULT_KEEP_COLLECTION_NAME, DEFAULT_OWNED_PURPOSE);
  await insertCollectionIfMissing(
    DEFAULT_SELL_COLLECTION_NAME,
    DEFAULT_TO_BE_SOLD_PURPOSE,
  );
}

async function ensureCollectionByName(name: string, purpose: string) {
  await insertCollectionIfMissing(name, purpose);
  const rows = await db
    .select()
    .from(collections)
    .where(eq(collections.name, name))
    .limit(1);
  const row = rows[0];

  if (row && row.purpose !== purpose) {
    const [updated] = await db
      .update(collections)
      .set({ purpose, updatedAt: new Date() })
      .where(eq(collections.id, row.id))
      .returning();

    return updated || row;
  }

  return row || null;
}

async function getCollectionById(collectionId: number) {
  const rows = await db
    .select()
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1);

  return rows[0] || null;
}

async function addItemsToCollection(
  collectionId: number,
  inputs: Array<ReturnType<typeof normalizeCollectionItem>>,
  mode: CollectionImportMode = 'merge',
  database = db,
) {
  const items = [];
  let inserted = 0;
  let updated = 0;

  for (const input of inputs) {
    if (input.catalogCardId === null) {
      continue;
    }

    const matchingItems = await database
      .select()
      .from(collectionItems)
      .where(
        and(
          eq(collectionItems.collectionId, collectionId),
          eq(collectionItems.catalogCardId, input.catalogCardId),
          eq(collectionItems.condition, input.condition),
          eq(collectionItems.finish, input.finish),
          eq(collectionItems.language, input.language),
        ),
      )
      .limit(1);

    const existingItem = matchingItems[0];
    const now = new Date();

    if (existingItem) {
      const [row] = await database
        .update(collectionItems)
        .set({
          quantity:
            mode === 'set' ? input.quantity : existingItem.quantity + input.quantity,
          source: input.source,
          notes: input.notes ?? existingItem.notes,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(collectionItems.id, existingItem.id))
        .returning();

      updated += 1;
      items.push(row);
    } else {
      const [row] = await database
        .insert(collectionItems)
        .values({
          collectionId,
          catalogCardId: input.catalogCardId,
          condition: input.condition,
          finish: input.finish,
          language: input.language,
          quantity: input.quantity,
          source: input.source,
          notes: input.notes,
          firstSeenAt: now,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      inserted += 1;
      items.push(row);
    }
  }

  return { inserted, updated, items };
}

async function selectCollectionItemsWithCatalog(
  collectionId: number,
): Promise<SellabilityCollectionItemInput[]> {
  return db
    .select({
      collectionItemId: collectionItems.id,
      catalogCardId: catalogCards.id,
      tcgProductId: catalogCards.tcgProductId,
      productName: catalogCards.productName,
      title: catalogCards.title,
      collectorNumber: catalogCards.collectorNumber,
      normalizedNumber: catalogCards.normalizedNumber,
      rarity: catalogCards.rarity,
      photoUrl: catalogCards.photoUrl,
      cardKind: catalogCards.cardKind,
      raw: catalogCards.raw,
      quantity: collectionItems.quantity,
      finish: collectionItems.finish,
      condition: collectionItems.condition,
      language: collectionItems.language,
      set: {
        id: catalogSets.id,
        setCode: catalogSets.setCode,
        name: catalogSets.name,
      },
    })
    .from(collectionItems)
    .innerJoin(catalogCards, eq(collectionItems.catalogCardId, catalogCards.id))
    .innerJoin(catalogSets, eq(catalogCards.catalogSetId, catalogSets.id))
    .where(
      and(
        eq(collectionItems.collectionId, collectionId),
        gt(collectionItems.quantity, 0),
      ),
    )
    .orderBy(catalogSets.setCode, catalogCards.normalizedNumber, catalogCards.productName);
}

function normalizeSetName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getSetCodeForName(setName: string): string | null {
  return SET_CODE_BY_NAME[normalizeSetName(setName)] ?? null;
}

async function findCatalogCardForImport(row: CollectionCsvRow) {
  if (row.tcgProductId) {
    const byProductId = await db
      .select({ id: catalogCards.id })
      .from(catalogCards)
      .where(eq(catalogCards.tcgProductId, row.tcgProductId))
      .limit(1);

    if (byProductId[0]) {
      return byProductId[0].id;
    }
  }

  const setRows = await db
    .select({ id: catalogSets.id })
    .from(catalogSets)
    .where(
      and(eq(catalogSets.productLine, PRODUCT_LINE), eq(catalogSets.name, row.setName)),
    )
    .limit(1);
  const set = setRows[0];
  if (!set || !row.number) {
    return null;
  }

  const bySetNumber = await db
    .select({ id: catalogCards.id })
    .from(catalogCards)
    .where(
      and(
        eq(catalogCards.catalogSetId, set.id),
        eq(catalogCards.normalizedNumber, normalizeCollectorNumber(row.number)),
      ),
    )
    .limit(1);

  return bySetNumber[0]?.id ?? null;
}

async function ensureCatalogSetForImport(row: CollectionCsvRow) {
  const existing = await db
    .select()
    .from(catalogSets)
    .where(
      and(eq(catalogSets.productLine, PRODUCT_LINE), eq(catalogSets.name, row.setName)),
    )
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const setCode = getSetCodeForName(row.setName);
  if (!setCode) {
    return null;
  }

  await db
    .insert(catalogSets)
    .values({
      productLine: PRODUCT_LINE,
      setCode,
      name: row.setName,
      syncedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [catalogSets.productLine, catalogSets.setCode],
      set: { name: sql`excluded.name`, updatedAt: new Date() },
    });

  const created = await db
    .select()
    .from(catalogSets)
    .where(
      and(eq(catalogSets.productLine, PRODUCT_LINE), eq(catalogSets.setCode, setCode)),
    )
    .limit(1);

  return created[0] ?? null;
}

async function createCatalogCardSnapshot(row: CollectionCsvRow) {
  const set = await ensureCatalogSetForImport(row);
  if (!set) {
    return null;
  }

  const values = {
    catalogSetId: set.id,
    tcgProductId: row.tcgProductId,
    productName: row.productName,
    title: row.title,
    collectorNumber: row.number,
    normalizedNumber: row.number ? normalizeCollectorNumber(row.number) : null,
    rarity: row.rarity,
    photoUrl: row.photoUrl,
    raw: {
      source: COLLECTION_IMPORT_SOURCE,
      tcgplayerId: row.tcgplayerId,
      snapshotMarketPrice: row.snapshotMarketPrice,
      printing: row.printing,
      importedFromCollectionCsv: true,
    },
    syncedAt: new Date(),
    updatedAt: new Date(),
  };

  if (row.tcgProductId) {
    await db
      .insert(catalogCards)
      .values(values)
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
          updatedAt: new Date(),
        },
      });

    return findCatalogCardForImport(row);
  }

  const [created] = await db.insert(catalogCards).values(values).returning();
  return created?.id ?? null;
}

async function buildCollectionImportPlan(
  content: string,
  mode: CollectionImportMode,
  writeCatalogSnapshots: boolean,
): Promise<CollectionImportPlan> {
  const parsed = parseTcgplayerCollectionCsv(content);
  const resolvedRows: CollectionImportResolvedRow[] = [];
  const items: Array<ReturnType<typeof normalizeCollectionItem>> = [];

  for (const row of parsed.rows) {
    const warnings = [...row.warnings];
    let catalogCardId = await findCatalogCardForImport(row);
    let status: CollectionImportResolvedRow['status'] = catalogCardId
      ? 'matched'
      : 'created';

    if (!catalogCardId && writeCatalogSnapshots) {
      catalogCardId = await createCatalogCardSnapshot(row);
    }

    if (!catalogCardId && !row.tcgProductId && (!row.setName || !row.number)) {
      status = 'unresolved';
      warnings.push('Unable to resolve catalog card: missing Product ID and set/number');
    } else if (!catalogCardId && !getSetCodeForName(row.setName)) {
      status = 'unresolved';
      warnings.push(`Unable to create catalog snapshot for unknown set: ${row.setName}`);
    } else if (!catalogCardId && writeCatalogSnapshots) {
      status = 'unresolved';
      warnings.push('Unable to create catalog snapshot');
    }

    resolvedRows.push({
      rowNumber: row.rowNumber,
      status,
      catalogCardId,
      tcgProductId: row.tcgProductId,
      productName: row.productName,
      setName: row.setName,
      number: row.number,
      condition: row.condition,
      finish: row.finish,
      quantity: row.quantity,
      warnings,
    });

    if (catalogCardId) {
      items.push(
        normalizeCollectionItem({
          catalogCardId,
          quantity: row.quantity,
          condition: row.condition,
          finish: row.finish,
          language: DEFAULT_LANGUAGE,
          source: COLLECTION_IMPORT_SOURCE,
          notes: null,
        }),
      );
    }
  }

  const warnings = resolvedRows.flatMap((row) =>
    row.warnings.map((warning) => `Row ${row.rowNumber}: ${warning}`),
  );

  return {
    source: parsed.source,
    mode,
    parseErrors: parsed.errors,
    rows: resolvedRows,
    items,
    summary: {
      totalRows: parsed.totalRows,
      parsedRows: parsed.rows.length,
      matchedCatalogRows: resolvedRows.filter((row) => row.status === 'matched').length,
      createdCatalogRows: resolvedRows.filter((row) => row.status === 'created').length,
      unresolvedRows: resolvedRows.filter((row) => row.status === 'unresolved').length,
      totalQuantity: resolvedRows.reduce((sum, row) => sum + row.quantity, 0),
      normalQuantity: resolvedRows
        .filter((row) => row.finish === 'Normal')
        .reduce((sum, row) => sum + row.quantity, 0),
      foilQuantity: resolvedRows
        .filter((row) => row.finish === 'Foil')
        .reduce((sum, row) => sum + row.quantity, 0),
      warnings,
    },
  };
}

function parseNullableNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractSnapshotMarketPrice(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const value = (raw as { snapshotMarketPrice?: unknown }).snapshotMarketPrice;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

async function getTCGTrackingMarketPrice(params: {
  tcgtrackingSetId: number | null;
  tcgProductId: number | null;
  finish: string;
}) {
  if (!params.tcgtrackingSetId || !params.tcgProductId) {
    return { marketPrice: null, isFoilFallback: false };
  }

  const pricing = await new TCGTrackingClient().getPricing(params.tcgtrackingSetId);
  const productPricing = pricing?.prices[String(params.tcgProductId)];
  if (!productPricing) {
    return { marketPrice: null, isFoilFallback: false };
  }

  const conditionKey = normalizeFinishKind(params.finish) === 'foil' ? 'Foil' : 'Normal';
  const conditionPricing = productPricing.tcg?.[conditionKey];
  if (conditionPricing?.market) {
    return { marketPrice: conditionPricing.market, isFoilFallback: false };
  }

  if (conditionKey === 'Normal') {
    const foilPricing = productPricing.tcg?.Foil;
    if (foilPricing?.market) {
      return { marketPrice: foilPricing.market, isFoilFallback: true };
    }
  }

  return { marketPrice: null, isFoilFallback: false };
}

function inventoryCondition(condition: string, finish: string) {
  if (normalizeFinishKind(finish) !== 'foil' || /foil/i.test(condition)) {
    return condition;
  }

  return `${condition} Foil`;
}

async function selectTransferCollectionItem(
  collectionId: number,
  collectionItemId: number,
) {
  const rows = await db
    .select({
      collectionItemId: collectionItems.id,
      collectionId: collectionItems.collectionId,
      catalogCardId: catalogCards.id,
      tcgProductId: catalogCards.tcgProductId,
      productLine: catalogSets.productLine,
      setName: catalogSets.name,
      setCode: catalogSets.setCode,
      setTcgtrackingSetId: catalogSets.tcgtrackingSetId,
      productName: catalogCards.productName,
      title: catalogCards.title,
      number: catalogCards.collectorNumber,
      normalizedNumber: catalogCards.normalizedNumber,
      rarity: catalogCards.rarity,
      photoUrl: catalogCards.photoUrl,
      cardKind: catalogCards.cardKind,
      raw: catalogCards.raw,
      condition: collectionItems.condition,
      finish: collectionItems.finish,
      language: collectionItems.language,
      availableQuantity: collectionItems.quantity,
    })
    .from(collectionItems)
    .innerJoin(catalogCards, eq(collectionItems.catalogCardId, catalogCards.id))
    .innerJoin(catalogSets, eq(catalogCards.catalogSetId, catalogSets.id))
    .where(
      and(
        eq(collectionItems.collectionId, collectionId),
        eq(collectionItems.id, collectionItemId),
        gt(collectionItems.quantity, 0),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

async function findTransferTargetCard(params: {
  tcgProductId: number | null;
  setName: string | null;
  productName: string;
  number: string | null;
  condition: string;
}) {
  const statusFilter = inArray(cards.status, ['matched', 'needs_attention', 'gift']);
  const filters = [eq(cards.condition, params.condition), statusFilter];

  if (params.tcgProductId) {
    filters.push(eq(cards.tcgProductId, params.tcgProductId));
  } else {
    filters.push(eq(cards.productName, params.productName));
    if (params.setName) {
      filters.push(eq(cards.setName, params.setName));
    }
    if (params.number) {
      filters.push(eq(cards.number, params.number));
    }
  }

  const rows = await db.select().from(cards).where(and(...filters)).limit(1);
  return rows[0] ?? null;
}

async function hasListedInventoryRow(tcgProductId: number | null, condition: string) {
  if (!tcgProductId) {
    return false;
  }

  const rows = await db
    .select({ id: cards.id })
    .from(cards)
    .where(
      and(
        eq(cards.tcgProductId, tcgProductId),
        eq(cards.condition, condition),
        eq(cards.status, 'listed'),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

async function buildTransferPlan(
  collectionId: number,
  body: TransferToInventoryBody,
) {
  const requestedItems = Array.isArray(body.items) ? body.items : [];
  const planItems = [];

  for (const [index, input] of requestedItems.entries()) {
    const collectionItemId = toPositiveInteger(input.collectionItemId);
    const quantity = input.quantity ?? 1;

    if (collectionItemId === null || !positiveInteger(quantity)) {
      planItems.push({
        inputIndex: index,
        collectionItemId: collectionItemId ?? null,
        catalogCardId: null,
        quantity: positiveInteger(quantity) ? quantity : 0,
        availableQuantity: 0,
        finish: null,
        condition: null,
        inventoryCondition: null,
        action: 'blocked' as const,
        targetCardId: null,
        status: null,
        marketPrice: null,
        listingPrice: null,
        blockers: ['invalid_input'],
        warnings: [],
        card: null,
      });
      continue;
    }

    const item = await selectTransferCollectionItem(collectionId, collectionItemId);
    if (!item) {
      planItems.push({
        inputIndex: index,
        collectionItemId,
        catalogCardId: null,
        quantity,
        availableQuantity: 0,
        finish: null,
        condition: null,
        inventoryCondition: null,
        action: 'blocked' as const,
        targetCardId: null,
        status: null,
        marketPrice: null,
        listingPrice: null,
        blockers: ['collection_item_not_found'],
        warnings: [],
        card: null,
      });
      continue;
    }

    const classified = classifyCatalogCard({
      catalogCardId: item.catalogCardId,
      tcgProductId: item.tcgProductId,
      productName: item.productName,
      title: item.title,
      collectorNumber: item.number,
      normalizedNumber: item.normalizedNumber,
      rarity: item.rarity,
      photoUrl: item.photoUrl,
      cardKind: item.cardKind,
      raw: item.raw,
      set: { setCode: item.setCode, name: item.setName },
    });
    const targetCondition = inventoryCondition(item.condition, item.finish);
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (quantity > item.availableQuantity) {
      blockers.push('insufficient_quantity');
    }
    if (classified.kind === 'token' || classified.kind === 'rune') {
      blockers.push(`${classified.kind}_excluded_from_selling_inventory`);
    }
    if (!item.productName || !item.setName) {
      blockers.push('missing_catalog_identity');
    }

    const targetCard = await findTransferTargetCard({
      tcgProductId: item.tcgProductId,
      setName: item.setName,
      productName: item.productName,
      number: item.number,
      condition: targetCondition,
    });
    if (await hasListedInventoryRow(item.tcgProductId, targetCondition)) {
      warnings.push('listed_inventory_row_exists_not_merged');
    }

    const existingMarketPrice = parseNullableNumber(targetCard?.marketPrice);
    const snapshotMarketPrice = extractSnapshotMarketPrice(item.raw);
    const syncedPricing =
      existingMarketPrice === null && snapshotMarketPrice === null
        ? await getTCGTrackingMarketPrice({
            tcgtrackingSetId: item.setTcgtrackingSetId,
            tcgProductId: item.tcgProductId,
            finish: item.finish,
          })
        : { marketPrice: null, isFoilFallback: false };
    const marketPrice =
      existingMarketPrice ?? snapshotMarketPrice ?? syncedPricing.marketPrice;
    const pricing = calculatePrice({ marketPrice });
    if (syncedPricing.isFoilFallback) {
      warnings.push('normal_price_missing_used_foil_price');
    }
    if (marketPrice === null) {
      warnings.push('missing_market_price_creates_needs_attention');
    }

    planItems.push({
      inputIndex: index,
      collectionItemId,
      catalogCardId: item.catalogCardId,
      quantity,
      availableQuantity: item.availableQuantity,
      finish: item.finish,
      condition: item.condition,
      inventoryCondition: targetCondition,
      action: blockers.length > 0 ? ('blocked' as const) : targetCard ? ('update' as const) : ('create' as const),
      targetCardId: targetCard?.id ?? null,
      status: blockers.length > 0 ? null : pricing.status,
      marketPrice,
      listingPrice: blockers.length > 0 ? null : pricing.listingPrice,
      blockers,
      warnings,
      card: {
        productLine: item.productLine,
        setName: item.setName,
        setCode: item.setCode,
        productName: item.productName,
        title: item.title,
        number: item.number,
        rarity: item.rarity,
        photoUrl: item.photoUrl,
        tcgProductId: item.tcgProductId,
        kind: classified.kind,
        cardKindSource: classified.cardKindSource,
      },
    });
  }

  const transferable = planItems.filter((item) => item.action !== 'blocked');

  return {
    summary: {
      requestedItems: planItems.length,
      transferableItems: transferable.length,
      blockedItems: planItems.length - transferable.length,
      transferQuantity: transferable.reduce((sum, item) => sum + item.quantity, 0),
      createRows: transferable.filter((item) => item.action === 'create').length,
      updateRows: transferable.filter((item) => item.action === 'update').length,
      warnings: planItems.flatMap((item) =>
        item.warnings.map((warning) => ({ collectionItemId: item.collectionItemId, warning })),
      ),
      blockers: planItems.flatMap((item) =>
        item.blockers.map((blocker) => ({ collectionItemId: item.collectionItemId, blocker })),
      ),
    },
    items: planItems,
  };
}

async function clearCollectionItems(collectionId: number, database = db) {
  const rows = await database
    .select({ id: collectionItems.id, quantity: collectionItems.quantity })
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, collectionId));

  if (rows.length > 0) {
    await database
      .delete(collectionItems)
      .where(eq(collectionItems.collectionId, collectionId));
  }

  return {
    deletedItems: rows.length,
    deletedQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
  };
}

async function commitTransferPlan(
  collectionId: number,
  plan: Awaited<ReturnType<typeof buildTransferPlan>>,
  database = db,
) {
  const transferredCards = [];

  for (const item of plan.items.filter((planItem) => planItem.action !== 'blocked')) {
    if (!item.card || !item.catalogCardId || !item.inventoryCondition || !item.status) {
      continue;
    }

    const now = new Date();
    if (item.action === 'update' && item.targetCardId) {
      const existing = await database
        .select()
        .from(cards)
        .where(
          and(
            eq(cards.id, item.targetCardId),
            inArray(cards.status, ['matched', 'needs_attention', 'gift']),
          ),
        )
        .limit(1);
      const existingCard = existing[0];
      if (!existingCard) {
        continue;
      }

      const [updated] = await database
        .update(cards)
        .set({
          quantity: existingCard.quantity + item.quantity,
          status: item.status,
          marketPrice: item.marketPrice?.toFixed(2) ?? existingCard.marketPrice,
          listingPrice: item.listingPrice?.toFixed(2) ?? null,
          isFoilPrice: normalizeFinishKind(item.finish || '') === 'foil',
          updatedAt: now,
        })
        .where(eq(cards.id, item.targetCardId))
        .returning();
      transferredCards.push(updated);
    } else {
      const [inserted] = await database
        .insert(cards)
        .values({
          tcgProductId: item.card.tcgProductId,
          productLine: item.card.productLine,
          setName: item.card.setName,
          productName: item.card.productName,
          title: item.card.title,
          number: item.card.number,
          rarity: item.card.rarity,
          condition: item.inventoryCondition,
          quantity: item.quantity,
          status: item.status,
          marketPrice: item.marketPrice?.toFixed(2) ?? null,
          listingPrice: item.listingPrice?.toFixed(2) ?? null,
          isFoilPrice: normalizeFinishKind(item.finish || '') === 'foil',
          photoUrl: item.card.photoUrl,
          notes: `Transferred from collection ${collectionId}`,
          importedAt: now,
          updatedAt: now,
        })
        .returning();
      transferredCards.push(inserted);
    }

    const remainingQuantity = item.availableQuantity - item.quantity;
    if (remainingQuantity <= 0) {
      await database
        .delete(collectionItems)
        .where(eq(collectionItems.id, item.collectionItemId as number));
    } else {
      await database
        .update(collectionItems)
        .set({ quantity: remainingQuantity, updatedAt: now, lastSeenAt: now })
        .where(eq(collectionItems.id, item.collectionItemId as number));
    }
  }

  return transferredCards;
}

export async function collectionsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async () => {
    await ensureDefaultCollections();

    const rows = await db.select().from(collections).orderBy(collections.id);
    return { collections: rows };
  });

  fastify.get('/defaults', async () => {
    const [owned, toBeSold] = await Promise.all([
      ensureCollectionByName(DEFAULT_KEEP_COLLECTION_NAME, DEFAULT_OWNED_PURPOSE),
      ensureCollectionByName(DEFAULT_SELL_COLLECTION_NAME, DEFAULT_TO_BE_SOLD_PURPOSE),
    ]);

    return { owned, toBeSold };
  });

  fastify.post('/:id/clear', async (request, reply) => {
    const collectionId = Number.parseInt((request.params as { id: string }).id, 10);
    const collection = await getCollectionForImport(collectionId, reply);
    if (!collection) {
      return reply;
    }

    const body = (request.body || {}) as ClearCollectionBody;
    if (body.confirmation !== 'CLEAR COLLECTION') {
      return reply.code(400).send({
        error: 'confirmation must equal CLEAR COLLECTION',
        collection: {
          id: collection.id,
          name: collection.name,
          purpose: collection.purpose,
        },
      });
    }

    const result = await runInDbTransaction((database) =>
      clearCollectionItems(collectionId, database),
    );

    return {
      collection,
      ...result,
    };
  });

  fastify.post('/:id/transfer-to-inventory/preview', async (request, reply) => {
    const collectionId = Number.parseInt((request.params as { id: string }).id, 10);
    const collection = await getCollectionForImport(collectionId, reply);
    if (!collection) {
      return reply;
    }

    const body = (request.body || {}) as TransferToInventoryBody;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return reply.code(400).send({ error: 'items must be a non-empty array' });
    }

    const plan = await buildTransferPlan(collectionId, body);
    return { collection, ...plan };
  });

  fastify.post('/:id/transfer-to-inventory', async (request, reply) => {
    const collectionId = Number.parseInt((request.params as { id: string }).id, 10);
    const collection = await getCollectionForImport(collectionId, reply);
    if (!collection) {
      return reply;
    }

    const body = (request.body || {}) as TransferToInventoryBody;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return reply.code(400).send({ error: 'items must be a non-empty array' });
    }

    const plan = await buildTransferPlan(collectionId, body);
    if (plan.summary.blockedItems > 0) {
      return reply.code(409).send({ collection, ...plan, error: 'transfer has blocked items' });
    }

    const transferredCards = await runInDbTransaction((database) =>
      commitTransferPlan(collectionId, plan, database),
    );
    return { collection, ...plan, transferredCards };
  });

  async function readCollectionImportUpload(request: FastifyRequest) {
    const data = await request.file();
    if (!data) {
      return { error: 'No file uploaded' } as const;
    }

    if (!data.filename.toLowerCase().endsWith('.csv')) {
      return { error: 'Invalid file type. Only .csv files are supported' } as const;
    }

    const buffer = await data.toBuffer();
    const modeFromQuery = (request.query as { mode?: string } | undefined)?.mode;
    const modeField = (data.fields?.mode as { value?: unknown } | undefined)?.value;
    const rawMode = typeof modeField === 'string' ? modeField : modeFromQuery;
    const mode: CollectionImportMode = rawMode === 'set' ? 'set' : 'merge';

    return { content: buffer.toString('utf-8'), mode } as const;
  }

  async function getCollectionForImport(collectionId: number, reply: FastifyReply) {
    if (!positiveInteger(collectionId)) {
      reply.code(400).send({ error: 'collection id must be a positive integer' });
      return null;
    }

    const collection = await getCollectionById(collectionId);
    if (!collection) {
      reply.code(404).send({ error: 'collection not found' });
      return null;
    }

    return collection;
  }

  fastify.post('/:id/import/preview', async (request, reply) => {
    const collectionId = Number.parseInt((request.params as { id: string }).id, 10);
    const collection = await getCollectionForImport(collectionId, reply);
    if (!collection) {
      return reply;
    }

    const upload = await readCollectionImportUpload(request);
    if ('error' in upload) {
      return reply.code(400).send({ error: upload.error });
    }

    const plan = await buildCollectionImportPlan(upload.content, upload.mode, false);

    return {
      collection,
      mode: plan.mode,
      source: plan.source,
      summary: plan.summary,
      rows: plan.rows,
      errors: plan.parseErrors,
    };
  });

  fastify.post('/:id/import', async (request, reply) => {
    const collectionId = Number.parseInt((request.params as { id: string }).id, 10);
    const collection = await getCollectionForImport(collectionId, reply);
    if (!collection) {
      return reply;
    }

    const upload = await readCollectionImportUpload(request);
    if ('error' in upload) {
      return reply.code(400).send({ error: upload.error });
    }

    const plan = await buildCollectionImportPlan(upload.content, upload.mode, true);
    const result = await addItemsToCollection(collectionId, plan.items, plan.mode);

    return reply
      .code(plan.parseErrors.length > 0 || plan.summary.unresolvedRows > 0 ? 207 : 200)
      .send({
      collection,
      mode: plan.mode,
      source: plan.source,
      summary: plan.summary,
      rows: plan.rows,
      errors: plan.parseErrors,
      inserted: result.inserted,
      updated: result.updated,
      items: result.items,
    });
  });

  fastify.get('/:id/items', async (request, reply) => {
    const collectionId = Number.parseInt(
      (request.params as { id: string }).id,
      10,
    );

    if (!positiveInteger(collectionId)) {
      return reply
        .code(400)
        .send({ error: 'collection id must be a positive integer' });
    }

    const collection = await getCollectionById(collectionId);
    if (!collection) {
      return reply.code(404).send({ error: 'collection not found' });
    }

    const items = await selectCollectionItemsWithCatalog(collectionId);
    return { collection, items };
  });

  fastify.get('/:id/sellability', async (request, reply) => {
    const collectionId = Number.parseInt(
      (request.params as { id: string }).id,
      10,
    );

    if (!positiveInteger(collectionId)) {
      return reply
        .code(400)
        .send({ error: 'collection id must be a positive integer' });
    }

    const collection = await getCollectionById(collectionId);
    if (!collection) {
      return reply.code(404).send({ error: 'collection not found' });
    }

    const rows = computeCollectionSellability(
      await selectCollectionItemsWithCatalog(collectionId),
    );

    return {
      collection,
      summary: {
        sellNormalQty: rows.reduce((sum, row) => sum + row.sellNormalQty, 0),
        sellFoilQty: rows.reduce((sum, row) => sum + row.sellFoilQty, 0),
        excludedCards: rows.filter((row) => row.excluded).length,
        needsClassificationCards: rows.filter((row) => row.needsClassification).length,
      },
      rows,
    };
  });

}
