import {
  pgEnum,
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sales, orderStatusEnum } from './sales.js';

export const saleUpdateSourceEnum = pgEnum('sale_update_source', [
  'manual',
  'api_sync',
]);

export const saleStatusHistory = pgTable('sale_status_history', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  previousStatus: orderStatusEnum('previous_status'),
  newStatus: orderStatusEnum('new_status').notNull(),
  source: saleUpdateSourceEnum('source').notNull().default('manual'),
  note: text('note'),
  changedAt: timestamp('changed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SaleStatusHistory = typeof saleStatusHistory.$inferSelect;
export type NewSaleStatusHistory = typeof saleStatusHistory.$inferInsert;
