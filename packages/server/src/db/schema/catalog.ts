import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const catalogSets = pgTable(
  'catalog_sets',
  {
    id: serial('id').primaryKey(),
    tcgtrackingSetId: integer('tcgtracking_set_id'),
    productLine: text('product_line').notNull().default('Riftbound'),
    setCode: text('set_code').notNull(),
    name: text('name').notNull(),
    isSupplemental: boolean('is_supplemental').notNull().default(false),
    publishedOn: text('published_on'),
    productsModified: timestamp('products_modified', { withTimezone: true }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    setCodeIdx: index('catalog_sets_set_code_idx').on(table.setCode),
    productLineSetCodeUnique: uniqueIndex(
      'catalog_sets_product_line_set_code_unique',
    ).on(table.productLine, table.setCode),
    tcgtrackingSetUnique: uniqueIndex('catalog_sets_tcgtracking_set_id_unique').on(
      table.tcgtrackingSetId,
    ),
  }),
);

export const catalogCards = pgTable(
  'catalog_cards',
  {
    id: serial('id').primaryKey(),
    catalogSetId: integer('catalog_set_id')
      .notNull()
      .references(() => catalogSets.id, { onDelete: 'cascade' }),
    tcgProductId: integer('tcg_product_id'),
    productName: text('product_name').notNull(),
    title: text('title'),
    collectorNumber: text('collector_number'),
    normalizedNumber: text('normalized_number'),
    rarity: text('rarity'),
    photoUrl: text('photo_url'),
    cardKind: text('card_kind'),
    raw: jsonb('raw'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    setNumberIdx: index('catalog_cards_set_number_idx').on(
      table.catalogSetId,
      table.normalizedNumber,
    ),
    productNameIdx: index('catalog_cards_product_name_idx').on(table.productName),
    tcgProductUnique: uniqueIndex('catalog_cards_tcg_product_id_unique').on(
      table.tcgProductId,
    ),
  }),
);

export type CatalogSet = typeof catalogSets.$inferSelect;
export type NewCatalogSet = typeof catalogSets.$inferInsert;
export type CatalogCard = typeof catalogCards.$inferSelect;
export type NewCatalogCard = typeof catalogCards.$inferInsert;
