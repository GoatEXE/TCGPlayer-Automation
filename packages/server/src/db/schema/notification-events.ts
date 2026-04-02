import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { cards } from './cards.js';
import { sales } from './sales.js';

export const notificationEvents = pgTable('notification_events', {
  id: serial('id').primaryKey(),
  channel: text('channel').notNull(),
  eventType: text('event_type').notNull(),
  message: text('message').notNull(),
  success: boolean('success').notNull(),
  error: text('error'),
  saleId: integer('sale_id').references(() => sales.id, {
    onDelete: 'set null',
  }),
  cardId: integer('card_id').references(() => cards.id, {
    onDelete: 'set null',
  }),
  tcgplayerOrderId: text('tcgplayer_order_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type NotificationEvent = typeof notificationEvents.$inferSelect;
export type NewNotificationEvent = typeof notificationEvents.$inferInsert;
