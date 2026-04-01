import {
  pgTable,
  serial,
  integer,
  numeric,
  timestamp,
  pgEnum,
  boolean,
} from 'drizzle-orm/pg-core';
import { cards, cardStatusEnum } from './cards.js';

export const priceCheckSourceEnum = pgEnum('price_check_source', [
  'manual',
  'scheduled',
]);

export const priceHistory = pgTable('price_history', {
  id: serial('id').primaryKey(),
  cardId: integer('card_id')
    .notNull()
    .references(() => cards.id, { onDelete: 'cascade' }),
  source: priceCheckSourceEnum('source').notNull().default('manual'),
  previousMarketPrice: numeric('previous_market_price', {
    precision: 10,
    scale: 2,
  }),
  newMarketPrice: numeric('new_market_price', {
    precision: 10,
    scale: 2,
  }),
  previousListingPrice: numeric('previous_listing_price', {
    precision: 10,
    scale: 2,
  }),
  newListingPrice: numeric('new_listing_price', {
    precision: 10,
    scale: 2,
  }),
  adjustedToPrice: numeric('adjusted_to_price', {
    precision: 10,
    scale: 2,
  }),
  previousStatus: cardStatusEnum('previous_status'),
  newStatus: cardStatusEnum('new_status'),
  driftPercent: numeric('drift_percent', {
    precision: 8,
    scale: 2,
  }),
  notificationSent: boolean('notification_sent').notNull().default(false),
  checkedAt: timestamp('checked_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PriceHistory = typeof priceHistory.$inferSelect;
export type NewPriceHistory = typeof priceHistory.$inferInsert;
