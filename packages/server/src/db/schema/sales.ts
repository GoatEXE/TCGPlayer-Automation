import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { cards } from './cards.js';

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
]);

export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  cardId: integer('card_id').references(() => cards.id, {
    onDelete: 'set null',
  }),
  tcgplayerOrderId: text('tcgplayer_order_id'),
  quantitySold: integer('quantity_sold').notNull(),
  salePriceCents: integer('sale_price_cents').notNull(),
  buyerName: text('buyer_name'),
  orderStatus: orderStatusEnum('order_status').notNull().default('pending'),
  soldAt: timestamp('sold_at', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
