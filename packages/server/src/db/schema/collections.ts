import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { catalogCards } from './catalog.js';

export const collections = pgTable(
  'collections',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    purpose: text('purpose').notNull().default('owned'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    purposeIdx: index('collections_purpose_idx').on(table.purpose),
    nameUnique: uniqueIndex('collections_name_unique').on(table.name),
  }),
);

export const collectionItems = pgTable(
  'collection_items',
  {
    id: serial('id').primaryKey(),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    catalogCardId: integer('catalog_card_id')
      .notNull()
      .references(() => catalogCards.id, { onDelete: 'restrict' }),
    condition: text('condition').notNull().default('Near Mint'),
    finish: text('finish').notNull().default('Normal'),
    language: text('language').notNull().default('EN'),
    quantity: integer('quantity').notNull().default(1),
    source: text('source').notNull().default('scanner'),
    notes: text('notes'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    collectionIdx: index('collection_items_collection_id_idx').on(
      table.collectionId,
    ),
    mergeKeyUnique: uniqueIndex('collection_items_merge_key_unique').on(
      table.collectionId,
      table.catalogCardId,
      table.condition,
      table.finish,
      table.language,
    ),
  }),
);

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
export type CollectionItem = typeof collectionItems.$inferSelect;
export type NewCollectionItem = typeof collectionItems.$inferInsert;
