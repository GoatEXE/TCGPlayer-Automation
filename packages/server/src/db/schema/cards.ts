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

// `gift` remains in the PostgreSQL enum only because historical
// price_history rows reference it. Active card workflows must never assign it.
export const cardStatusEnum = pgEnum('card_status', [
  'pending',
  'matched',
  'listed',
  'needs_attention',
  'gift',
  'gifted',
  'error',
  'sold',
]);

// Keep the retired reason label in the enum for forward-only migration
// compatibility. New active workflows only use drift and missing-price reasons.
export const cardAttentionReasonValues = [
  'listed_price_drift',
  'listed_missing_price',
  'listed_below_threshold',
] as const;

export type CardAttentionReason = (typeof cardAttentionReasonValues)[number];

export const cardAttentionReasonEnum = pgEnum(
  'card_attention_reason',
  cardAttentionReasonValues,
);

export function isListedOriginAttentionReason(
  value: string | null | undefined,
): value is CardAttentionReason {
  return (
    value !== null &&
    value !== undefined &&
    (['listed_price_drift', 'listed_missing_price'] as const).includes(
      value as 'listed_price_drift' | 'listed_missing_price',
    )
  );
}

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
  attentionReason: cardAttentionReasonEnum('attention_reason'),
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
