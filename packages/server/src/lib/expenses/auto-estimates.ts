import { sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import {
  type ExpenseSettings,
  expenseSettings,
} from '../../db/schema/expense-settings.js';
import { expenses } from '../../db/schema/expenses.js';

type ExpenseEstimateDatabase = Pick<Database, 'insert' | 'select'>;

export interface CreateSaleAutoEstimatesInput {
  saleId: number;
  salePriceCents: number;
  soldAt?: Date | string | null;
  tcgplayerOrderId?: string | null;
  settings?: ExpenseSettings;
}

const orderLevelAutoKinds = [
  'shipping_order',
  'supplies_order',
  'transaction_flat_order',
] as const;

const orderLevelConflictWhere = sql`${expenses.source} = 'sale_auto_estimate' and ${expenses.tcgplayerOrderId} is not null and ${expenses.autoKind} in ('shipping_order', 'supplies_order', 'transaction_flat_order')`;

function resolveOccurredAt(value?: Date | string | null) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function calculateBpsAmount(amountCents: number, bps: number) {
  return Math.round((amountCents * bps) / 10_000);
}

function shouldInsertAmount(amountCents: number) {
  return Number.isInteger(amountCents) && amountCents > 0;
}

export async function getOrCreateExpenseSettings(
  database: ExpenseEstimateDatabase,
) {
  const [existingSettings] = await database.select().from(expenseSettings).limit(1);

  if (existingSettings) {
    return existingSettings;
  }

  const [createdSettings] = await database
    .insert(expenseSettings)
    .values({ updatedAt: new Date() })
    .returning();

  return createdSettings;
}

export async function createSaleAutoEstimates(
  database: ExpenseEstimateDatabase,
  input: CreateSaleAutoEstimatesInput,
) {
  const settings = input.settings ?? (await getOrCreateExpenseSettings(database));
  const occurredAt = resolveOccurredAt(input.soldAt);
  const tcgplayerOrderId = input.tcgplayerOrderId ?? null;
  const updatedAt = new Date();
  const createdExpenses: Array<typeof expenses.$inferSelect> = [];

  const baseExpense = {
    occurredAt,
    saleId: input.saleId,
    tcgplayerOrderId,
    source: 'sale_auto_estimate' as const,
    isEstimate: true,
    updatedAt,
  };

  const lineExpenses: Array<typeof expenses.$inferInsert> = [];

  if (settings.autoRecordTcgplayerFees) {
    const marketplaceFeeCents = calculateBpsAmount(
      input.salePriceCents,
      settings.marketplaceFeeBps,
    );
    if (shouldInsertAmount(marketplaceFeeCents)) {
      lineExpenses.push({
        ...baseExpense,
        amountCents: marketplaceFeeCents,
        category: 'tcgplayer_fees',
        description: 'Estimated marketplace fee',
        autoKind: 'marketplace_percent_line',
      });
    }

    const transactionFeeCents = calculateBpsAmount(
      input.salePriceCents,
      settings.transactionFeeBps,
    );
    if (shouldInsertAmount(transactionFeeCents)) {
      lineExpenses.push({
        ...baseExpense,
        amountCents: transactionFeeCents,
        category: 'tcgplayer_fees',
        description: 'Estimated transaction percentage fee',
        autoKind: 'transaction_percent_line',
      });
    }
  }

  if (lineExpenses.length > 0) {
    const insertedLineExpenses = await database
      .insert(expenses)
      .values(lineExpenses)
      .returning();

    createdExpenses.push(...insertedLineExpenses);
  }

  const fixedExpenses: Array<typeof expenses.$inferInsert> = [];

  if (settings.autoRecordShipping && shouldInsertAmount(settings.shippingCostCents)) {
    fixedExpenses.push({
      ...baseExpense,
      amountCents: settings.shippingCostCents,
      category: 'shipping',
      description: 'Estimated shipping cost',
      autoKind: 'shipping_order',
    });
  }

  if (settings.autoRecordSupplies && shouldInsertAmount(settings.suppliesCostCents)) {
    fixedExpenses.push({
      ...baseExpense,
      amountCents: settings.suppliesCostCents,
      category: 'supplies',
      description: 'Estimated supplies cost',
      autoKind: 'supplies_order',
    });
  }

  if (
    settings.autoRecordTcgplayerFees &&
    shouldInsertAmount(settings.transactionFlatFeeCents)
  ) {
    fixedExpenses.push({
      ...baseExpense,
      amountCents: settings.transactionFlatFeeCents,
      category: 'tcgplayer_fees',
      description: 'Estimated transaction flat fee',
      autoKind: 'transaction_flat_order',
    });
  }

  for (const fixedExpense of fixedExpenses) {
    let insertQuery: any = database.insert(expenses).values(fixedExpense);

    if (tcgplayerOrderId) {
      insertQuery = insertQuery.onConflictDoNothing({
        target: [expenses.tcgplayerOrderId, expenses.autoKind],
        where: orderLevelConflictWhere,
      });
    }

    const insertedFixedExpenses = await insertQuery.returning();
    createdExpenses.push(...insertedFixedExpenses);
  }

  return createdExpenses;
}

export { orderLevelAutoKinds };
