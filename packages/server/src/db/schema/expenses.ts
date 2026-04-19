import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sales } from './sales.js';

export const expenseCategoryEnum = pgEnum('expense_category', [
  'supplies',
  'shipping',
  'tcgplayer_fees',
  'inventory_acquisition',
  'other',
]);

export const expenseSourceEnum = pgEnum('expense_source', [
  'manual',
  'sale_auto_estimate',
]);

export const autoExpenseKindEnum = pgEnum('auto_expense_kind', [
  'shipping_order',
  'supplies_order',
  'transaction_flat_order',
  'marketplace_percent_line',
  'transaction_percent_line',
]);

export const expenses = pgTable(
  'expenses',
  {
    id: serial('id').primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    amountCents: integer('amount_cents').notNull(),
    category: expenseCategoryEnum('category').notNull(),
    subcategory: text('subcategory'),
    description: text('description'),
    quantity: integer('quantity'),
    unit: text('unit'),
    unitCostCents: integer('unit_cost_cents'),
    source: expenseSourceEnum('source').notNull().default('manual'),
    isEstimate: boolean('is_estimate').notNull().default(false),
    autoKind: autoExpenseKindEnum('auto_kind'),
    saleId: integer('sale_id').references(() => sales.id, {
      onDelete: 'set null',
    }),
    tcgplayerOrderId: text('tcgplayer_order_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('expenses_occurred_at_idx').on(table.occurredAt),
    index('expenses_category_idx').on(table.category),
    index('expenses_sale_id_idx').on(table.saleId),
    index('expenses_tcgplayer_order_id_idx').on(table.tcgplayerOrderId),
    uniqueIndex('expenses_order_level_auto_estimate_idx')
      .on(table.tcgplayerOrderId, table.autoKind)
      .where(
        sql`${table.source} = 'sale_auto_estimate' and ${table.tcgplayerOrderId} is not null and ${table.autoKind} in ('shipping_order', 'supplies_order', 'transaction_flat_order')`,
      ),
  ],
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
