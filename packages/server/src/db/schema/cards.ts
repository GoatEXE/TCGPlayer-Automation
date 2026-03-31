import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  pgEnum,
  boolean,
} from 'drizzle-orm/pg-core';

export const cardStatusEnum = pgEnum('card_status', [
  'pending',
  'matched',
  'listed',
  'needs_attention',
  'gift',
  'error',
]);

export const cards = pgTable('cards', {
  id: serial('id').primaryKey(),
  tcgplayerId: integer('tcgplayer_id'),
  tcgProductId: integer('tcg_product_id'),
  productLine: text('product_line').notNull().default('Riftbound'),
  setName: text('set_name'),
  productName: text('product_name').notNull(),
  title: text('title'),
  number: text('number'),
  rarity: text('rarity'),
  condition: text('condition').notNull().default('Near Mint'),
  quantity: integer('quantity').notNull().default(1),
  status: cardStatusEnum('status').notNull().default('pending'),
  marketPrice: numeric('market_price', { precision: 10, scale: 2 }),
  listingPrice: numeric('listing_price', { precision: 10, scale: 2 }),
  floorPriceCents: integer('floor_price_cents'),
  isFoilPrice: boolean('is_foil_price').notNull().default(false),
  photoUrl: text('photo_url'),
  notes: text('notes'),
  importedAt: timestamp('imported_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
