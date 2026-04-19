import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { expenseSettings } from '../db/schema/expense-settings.js';
import { expenses } from '../db/schema/expenses.js';
import { sales } from '../db/schema/sales.js';

const expenseCategories = [
  'supplies',
  'shipping',
  'tcgplayer_fees',
  'inventory_acquisition',
  'other',
] as const;

const expenseSources = ['manual', 'sale_auto_estimate'] as const;

type ExpenseCategory = (typeof expenseCategories)[number];
type ExpenseSource = (typeof expenseSources)[number];

interface ListExpensesQuery {
  page?: string;
  limit?: string;
  category?: string;
  source?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface CreateExpenseBody {
  amountCents: number;
  category: ExpenseCategory;
  occurredAt?: string;
  description?: string | null;
  subcategory?: string | null;
  quantity?: number;
  unit?: string | null;
  isEstimate?: boolean;
}

interface UpdateExpenseBody {
  amountCents?: number;
  category?: ExpenseCategory;
  occurredAt?: string;
  description?: string | null;
  subcategory?: string | null;
  quantity?: number | null;
  unit?: string | null;
  isEstimate?: boolean;
}

interface PerformanceQuery {
  dateFrom?: string;
  dateTo?: string;
}

interface UpdateExpenseSettingsBody {
  autoRecordSaleExpenses?: boolean;
  autoRecordShipping?: boolean;
  shippingCostCents?: number;
  autoRecordSupplies?: boolean;
  suppliesCostCents?: number;
  autoRecordTcgplayerFees?: boolean;
  marketplaceFeeBps?: number;
  transactionFeeBps?: number;
  transactionFlatFeeCents?: number;
}

function isExpenseCategory(value: string): value is ExpenseCategory {
  return expenseCategories.includes(value as ExpenseCategory);
}

function isExpenseSource(value: string): value is ExpenseSource {
  return expenseSources.includes(value as ExpenseSource);
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function computeUnitCostCents(
  amountCents: number,
  quantity: number | null | undefined,
) {
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
    return null;
  }

  return Math.round(amountCents / quantity);
}

function isNonNegativeInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

async function getOrCreateExpenseSettings() {
  const [existingSettings] = await db.select().from(expenseSettings).limit(1);

  if (existingSettings) {
    return existingSettings;
  }

  const [createdSettings] = await db
    .insert(expenseSettings)
    .values({ updatedAt: new Date() })
    .returning();

  return createdSettings;
}

export async function expensesRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: ListExpensesQuery }>('/', async (request, reply) => {
    const {
      page = '1',
      limit = '50',
      category,
      source,
      search,
      dateFrom,
      dateTo,
    } = request.query;

    const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
    const limitNum = Math.min(
      Math.max(Number.parseInt(limit, 10) || 50, 1),
      200,
    );
    const offset = (pageNum - 1) * limitNum;

    if (category && !isExpenseCategory(category)) {
      return reply.code(400).send({ error: 'Invalid category' });
    }

    if (source && !isExpenseSource(source)) {
      return reply.code(400).send({ error: 'Invalid source' });
    }

    const parsedCategory = category as ExpenseCategory | undefined;
    const parsedSource = source as ExpenseSource | undefined;
    const conditions = [];

    if (parsedCategory) {
      conditions.push(eq(expenses.category, parsedCategory));
    }

    if (parsedSource) {
      conditions.push(eq(expenses.source, parsedSource));
    }

    if (search) {
      conditions.push(
        or(
          ilike(expenses.description, `%${search}%`),
          ilike(expenses.subcategory, `%${search}%`),
          ilike(expenses.tcgplayerOrderId, `%${search}%`),
        ),
      );
    }

    if (dateFrom) {
      const fromDate = parseDate(dateFrom);
      if (!fromDate) {
        return reply.code(400).send({ error: 'Invalid dateFrom' });
      }
      conditions.push(gte(expenses.occurredAt, fromDate));
    }

    if (dateTo) {
      const toDate = parseDate(dateTo);
      if (!toDate) {
        return reply.code(400).send({ error: 'Invalid dateTo' });
      }
      conditions.push(lte(expenses.occurredAt, toDate));
    }

    try {
      let countQuery: any = db
        .select({ count: sql<number>`count(*)::int` })
        .from(expenses);

      if (conditions.length > 0) {
        countQuery = countQuery.where(and(...conditions));
      }

      const [{ count: total }] = await countQuery;

      let query: any = db
        .select({
          ...getTableColumns(expenses),
        })
        .from(expenses);

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const rows = await query
        .orderBy(desc(expenses.occurredAt), desc(expenses.id))
        .limit(limitNum)
        .offset(offset);

      return reply.send({
        expenses: rows,
        total,
        page: pageNum,
        limit: limitNum,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch expenses' });
    }
  });

  fastify.post<{ Body: CreateExpenseBody }>('/', async (request, reply) => {
    const {
      amountCents,
      category,
      occurredAt,
      description,
      subcategory,
      quantity,
      unit,
      isEstimate = false,
    } = request.body;

    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return reply
        .code(400)
        .send({ error: 'amountCents must be a positive integer' });
    }

    if (!isExpenseCategory(category)) {
      return reply.code(400).send({ error: 'Invalid category' });
    }

    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity <= 0)) {
      return reply
        .code(400)
        .send({ error: 'quantity must be a positive integer' });
    }

    if (!isBoolean(isEstimate)) {
      return reply.code(400).send({ error: 'isEstimate must be a boolean' });
    }

    const occurredAtDate = occurredAt ? parseDate(occurredAt) : new Date();
    if (!occurredAtDate) {
      return reply.code(400).send({ error: 'Invalid occurredAt date' });
    }

    try {
      const [expense] = await db
        .insert(expenses)
        .values({
          amountCents,
          category,
          occurredAt: occurredAtDate,
          description: description ?? null,
          subcategory: subcategory ?? null,
          quantity: quantity ?? null,
          unit: unit ?? null,
          unitCostCents: computeUnitCostCents(amountCents, quantity),
          source: 'manual',
          isEstimate,
          updatedAt: new Date(),
        })
        .returning();

      return reply.code(201).send(expense);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create expense' });
    }
  });

  fastify.get<{ Querystring: PerformanceQuery }>(
    '/performance',
    async (request, reply) => {
      const { dateFrom, dateTo } = request.query;

      const salesConditions = [ne(sales.orderStatus, 'cancelled')];
      const expenseConditions = [];

      if (dateFrom) {
        const fromDate = parseDate(dateFrom);
        if (!fromDate) {
          return reply.code(400).send({ error: 'Invalid dateFrom' });
        }
        salesConditions.push(gte(sales.soldAt, fromDate));
        expenseConditions.push(gte(expenses.occurredAt, fromDate));
      }

      if (dateTo) {
        const toDate = parseDate(dateTo);
        if (!toDate) {
          return reply.code(400).send({ error: 'Invalid dateTo' });
        }
        salesConditions.push(lte(sales.soldAt, toDate));
        expenseConditions.push(lte(expenses.occurredAt, toDate));
      }

      try {
        const [salesSummary] = await db
          .select({
            revenueCents:
              sql<number>`coalesce(sum(${sales.salePriceCents}), 0)::int`,
            salesCount: sql<number>`count(*)::int`,
          })
          .from(sales)
          .where(and(...salesConditions));

        let expensesSummaryQuery: any = db
          .select({
            expensesCents:
              sql<number>`coalesce(sum(${expenses.amountCents}), 0)::int`,
            expenseCount: sql<number>`count(*)::int`,
            estimatedExpensesCents:
              sql<number>`coalesce(sum(case when ${expenses.isEstimate} then ${expenses.amountCents} else 0 end), 0)::int`,
            actualExpensesCents:
              sql<number>`coalesce(sum(case when not ${expenses.isEstimate} then ${expenses.amountCents} else 0 end), 0)::int`,
          })
          .from(expenses);

        if (expenseConditions.length > 0) {
          expensesSummaryQuery = expensesSummaryQuery.where(and(...expenseConditions));
        }

        const [expensesSummary] = await expensesSummaryQuery;

        let byCategoryQuery: any = db
          .select({
            category: expenses.category,
            totalCents: sql<number>`coalesce(sum(${expenses.amountCents}), 0)::int`,
            count: sql<number>`count(*)::int`,
          })
          .from(expenses);

        if (expenseConditions.length > 0) {
          byCategoryQuery = byCategoryQuery.where(and(...expenseConditions));
        }

        const byCategory = await byCategoryQuery
          .groupBy(expenses.category)
          .orderBy(asc(expenses.category));

        const revenueCents = salesSummary?.revenueCents ?? 0;
        const expensesCents = expensesSummary?.expensesCents ?? 0;
        const netProfitCents = revenueCents - expensesCents;
        const marginPercent =
          revenueCents > 0
            ? Number(((netProfitCents / revenueCents) * 100).toFixed(2))
            : null;

        return reply.send({
          revenueCents,
          expensesCents,
          netProfitCents,
          marginPercent,
          salesCount: salesSummary?.salesCount ?? 0,
          expenseCount: expensesSummary?.expenseCount ?? 0,
          estimatedExpensesCents: expensesSummary?.estimatedExpensesCents ?? 0,
          actualExpensesCents: expensesSummary?.actualExpensesCents ?? 0,
          byCategory,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply
          .code(500)
          .send({ error: 'Failed to fetch performance summary' });
      }
    },
  );

  fastify.get('/settings', async (_request, reply) => {
    try {
      const settings = await getOrCreateExpenseSettings();
      return reply.send(settings);
    } catch (error) {
      fastify.log.error(error);
      return reply
        .code(500)
        .send({ error: 'Failed to fetch expense settings' });
    }
  });

  fastify.post<{ Body: UpdateExpenseSettingsBody }>(
    '/settings',
    async (request, reply) => {
      const {
        autoRecordSaleExpenses,
        autoRecordShipping,
        shippingCostCents,
        autoRecordSupplies,
        suppliesCostCents,
        autoRecordTcgplayerFees,
        marketplaceFeeBps,
        transactionFeeBps,
        transactionFlatFeeCents,
      } = request.body;

      if (
        autoRecordSaleExpenses !== undefined &&
        !isBoolean(autoRecordSaleExpenses)
      ) {
        return reply
          .code(400)
          .send({ error: 'autoRecordSaleExpenses must be a boolean' });
      }

      if (
        autoRecordShipping !== undefined &&
        !isBoolean(autoRecordShipping)
      ) {
        return reply
          .code(400)
          .send({ error: 'autoRecordShipping must be a boolean' });
      }

      if (
        shippingCostCents !== undefined &&
        !isNonNegativeInteger(shippingCostCents)
      ) {
        return reply.code(400).send({
          error: 'shippingCostCents must be a non-negative integer',
        });
      }

      if (
        autoRecordSupplies !== undefined &&
        !isBoolean(autoRecordSupplies)
      ) {
        return reply
          .code(400)
          .send({ error: 'autoRecordSupplies must be a boolean' });
      }

      if (
        suppliesCostCents !== undefined &&
        !isNonNegativeInteger(suppliesCostCents)
      ) {
        return reply.code(400).send({
          error: 'suppliesCostCents must be a non-negative integer',
        });
      }

      if (
        autoRecordTcgplayerFees !== undefined &&
        !isBoolean(autoRecordTcgplayerFees)
      ) {
        return reply
          .code(400)
          .send({ error: 'autoRecordTcgplayerFees must be a boolean' });
      }

      if (
        marketplaceFeeBps !== undefined &&
        (!Number.isInteger(marketplaceFeeBps) ||
          marketplaceFeeBps < 0 ||
          marketplaceFeeBps > 10000)
      ) {
        return reply.code(400).send({
          error: 'marketplaceFeeBps must be an integer between 0 and 10000',
        });
      }

      if (
        transactionFeeBps !== undefined &&
        (!Number.isInteger(transactionFeeBps) ||
          transactionFeeBps < 0 ||
          transactionFeeBps > 10000)
      ) {
        return reply.code(400).send({
          error: 'transactionFeeBps must be an integer between 0 and 10000',
        });
      }

      if (
        transactionFlatFeeCents !== undefined &&
        !isNonNegativeInteger(transactionFlatFeeCents)
      ) {
        return reply.code(400).send({
          error: 'transactionFlatFeeCents must be a non-negative integer',
        });
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (autoRecordSaleExpenses !== undefined) {
        updateData.autoRecordSaleExpenses = autoRecordSaleExpenses;
      }

      if (autoRecordShipping !== undefined) {
        updateData.autoRecordShipping = autoRecordShipping;
      }

      if (shippingCostCents !== undefined) {
        updateData.shippingCostCents = shippingCostCents;
      }

      if (autoRecordSupplies !== undefined) {
        updateData.autoRecordSupplies = autoRecordSupplies;
      }

      if (suppliesCostCents !== undefined) {
        updateData.suppliesCostCents = suppliesCostCents;
      }

      if (autoRecordTcgplayerFees !== undefined) {
        updateData.autoRecordTcgplayerFees = autoRecordTcgplayerFees;
      }

      if (marketplaceFeeBps !== undefined) {
        updateData.marketplaceFeeBps = marketplaceFeeBps;
      }

      if (transactionFeeBps !== undefined) {
        updateData.transactionFeeBps = transactionFeeBps;
      }

      if (transactionFlatFeeCents !== undefined) {
        updateData.transactionFlatFeeCents = transactionFlatFeeCents;
      }

      if (Object.keys(updateData).length === 1) {
        return reply.code(400).send({ error: 'No valid fields to update' });
      }

      try {
        const settings = await getOrCreateExpenseSettings();

        const [updatedSettings] = await db
          .update(expenseSettings)
          .set(updateData)
          .where(eq(expenseSettings.id, settings.id))
          .returning();

        return reply.send(updatedSettings);
      } catch (error) {
        fastify.log.error(error);
        return reply
          .code(500)
          .send({ error: 'Failed to update expense settings' });
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateExpenseBody }>(
    '/:id',
    async (request, reply) => {
      const expenseId = Number.parseInt(request.params.id, 10);
      if (Number.isNaN(expenseId) || expenseId <= 0) {
        return reply.code(400).send({ error: 'Invalid expense id' });
      }

      try {
        const [existingExpense] = await db
          .select()
          .from(expenses)
          .where(eq(expenses.id, expenseId))
          .limit(1);

        if (!existingExpense) {
          return reply.code(404).send({ error: 'Expense not found' });
        }

        const {
          amountCents,
          category,
          occurredAt,
          description,
          subcategory,
          quantity,
          unit,
          isEstimate,
        } = request.body;

        if (amountCents !== undefined) {
          if (!Number.isInteger(amountCents) || amountCents <= 0) {
            return reply
              .code(400)
              .send({ error: 'amountCents must be a positive integer' });
          }
        }

        if (category !== undefined && !isExpenseCategory(category)) {
          return reply.code(400).send({ error: 'Invalid category' });
        }

        if (
          quantity !== undefined &&
          quantity !== null &&
          (!Number.isInteger(quantity) || quantity <= 0)
        ) {
          return reply
            .code(400)
            .send({ error: 'quantity must be a positive integer or null' });
        }

        if (isEstimate !== undefined && !isBoolean(isEstimate)) {
          return reply.code(400).send({ error: 'isEstimate must be a boolean' });
        }

        const updateData: Record<string, unknown> = {
          updatedAt: new Date(),
        };

        if (amountCents !== undefined) {
          updateData.amountCents = amountCents;
        }

        if (category !== undefined) {
          updateData.category = category;
        }

        if (occurredAt !== undefined) {
          const occurredAtDate = parseDate(occurredAt);
          if (!occurredAtDate) {
            return reply.code(400).send({ error: 'Invalid occurredAt date' });
          }
          updateData.occurredAt = occurredAtDate;
        }

        if (description !== undefined) {
          updateData.description = description ?? null;
        }

        if (subcategory !== undefined) {
          updateData.subcategory = subcategory ?? null;
        }

        if (quantity !== undefined) {
          updateData.quantity = quantity;
        }

        if (unit !== undefined) {
          updateData.unit = unit ?? null;
        }

        if (isEstimate !== undefined) {
          updateData.isEstimate = isEstimate;
        }

        if (amountCents !== undefined || quantity !== undefined) {
          const nextAmountCents = amountCents ?? existingExpense.amountCents;
          const nextQuantity = quantity !== undefined ? quantity : existingExpense.quantity;
          updateData.unitCostCents = computeUnitCostCents(nextAmountCents, nextQuantity);
        }

        if (Object.keys(updateData).length === 1) {
          return reply.code(400).send({ error: 'No valid fields to update' });
        }

        const [updatedExpense] = await db
          .update(expenses)
          .set(updateData)
          .where(eq(expenses.id, expenseId))
          .returning();

        if (!updatedExpense) {
          return reply.code(404).send({ error: 'Expense not found' });
        }

        return reply.send(updatedExpense);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to update expense' });
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const expenseId = Number.parseInt(request.params.id, 10);
    if (Number.isNaN(expenseId) || expenseId <= 0) {
      return reply.code(400).send({ error: 'Invalid expense id' });
    }

    try {
      const [deletedExpense] = await db
        .delete(expenses)
        .where(eq(expenses.id, expenseId))
        .returning();

      if (!deletedExpense) {
        return reply.code(404).send({ error: 'Expense not found' });
      }

      return reply.send({ success: true });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete expense' });
    }
  });
}
