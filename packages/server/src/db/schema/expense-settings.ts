import { boolean, integer, pgTable, serial, timestamp } from 'drizzle-orm/pg-core';

export const expenseSettings = pgTable('expense_settings', {
  id: serial('id').primaryKey(),
  autoRecordSaleExpenses: boolean('auto_record_sale_expenses')
    .notNull()
    .default(false),
  autoRecordShipping: boolean('auto_record_shipping').notNull().default(true),
  shippingCostCents: integer('shipping_cost_cents').notNull().default(99),
  autoRecordSupplies: boolean('auto_record_supplies').notNull().default(true),
  suppliesCostCents: integer('supplies_cost_cents').notNull().default(25),
  autoRecordTcgplayerFees: boolean('auto_record_tcgplayer_fees')
    .notNull()
    .default(true),
  marketplaceFeeBps: integer('marketplace_fee_bps').notNull().default(1075),
  transactionFeeBps: integer('transaction_fee_bps').notNull().default(250),
  transactionFlatFeeCents: integer('transaction_flat_fee_cents')
    .notNull()
    .default(30),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ExpenseSettings = typeof expenseSettings.$inferSelect;
export type NewExpenseSettings = typeof expenseSettings.$inferInsert;
