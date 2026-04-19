import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { expensesRoutes } from '../expenses.js';

vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}));

import { db } from '../../db/index.js';

describe('expenses routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(expensesRoutes, { prefix: '/api/expenses' });
  });

  describe('POST /api/expenses', () => {
    it('creates a manual expense', async () => {
      const insertValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 1,
            amountCents: 499,
            category: 'shipping',
            description: 'Postage',
            subcategory: null,
            quantity: null,
            unit: null,
            unitCostCents: null,
            source: 'manual',
            isEstimate: false,
            autoKind: null,
            saleId: null,
            tcgplayerOrderId: null,
            occurredAt: new Date('2026-04-18T12:00:00.000Z'),
            createdAt: new Date('2026-04-18T12:00:00.000Z'),
            updatedAt: new Date('2026-04-18T12:00:00.000Z'),
          },
        ]),
      });

      vi.mocked(db.insert).mockReturnValueOnce({
        values: insertValues,
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/expenses',
        payload: {
          amountCents: 499,
          category: 'shipping',
          description: 'Postage',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 499,
          category: 'shipping',
          description: 'Postage',
          source: 'manual',
          isEstimate: false,
          unitCostCents: null,
        }),
      );

      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          id: 1,
          amountCents: 499,
          category: 'shipping',
          source: 'manual',
        }),
      );
    });

    it('stores quantity, unit, and computed unitCostCents when quantity is provided', async () => {
      const insertValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 2,
            amountCents: 300,
            category: 'supplies',
            description: 'Rigid mailers',
            subcategory: 'mailers',
            quantity: 4,
            unit: 'mailer',
            unitCostCents: 75,
            source: 'manual',
            isEstimate: false,
            autoKind: null,
            saleId: null,
            tcgplayerOrderId: null,
            occurredAt: new Date('2026-04-18T12:00:00.000Z'),
            createdAt: new Date('2026-04-18T12:00:00.000Z'),
            updatedAt: new Date('2026-04-18T12:00:00.000Z'),
          },
        ]),
      });

      vi.mocked(db.insert).mockReturnValueOnce({
        values: insertValues,
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/expenses',
        payload: {
          amountCents: 300,
          category: 'supplies',
          description: 'Rigid mailers',
          subcategory: 'mailers',
          quantity: 4,
          unit: 'mailer',
          isEstimate: true,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 4,
          unit: 'mailer',
          unitCostCents: 75,
          isEstimate: true,
        }),
      );
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          quantity: 4,
          unit: 'mailer',
          unitCostCents: 75,
        }),
      );
    });
  });

  describe('GET /api/expenses', () => {
    it('returns paginated expenses with filters, search, and date range', async () => {
      const countWhere = vi.fn().mockResolvedValue([{ count: 1 }]);
      const rowsOffset = vi.fn().mockResolvedValue([
        {
          id: 7,
          amountCents: 300,
          category: 'supplies',
          subcategory: 'mailers',
          description: 'Rigid mailers',
          quantity: 4,
          unit: 'mailer',
          unitCostCents: 75,
          source: 'manual',
          isEstimate: false,
          autoKind: null,
          saleId: null,
          tcgplayerOrderId: 'ORDER-7',
          occurredAt: new Date('2026-04-10T10:00:00.000Z'),
          createdAt: new Date('2026-04-10T10:00:00.000Z'),
          updatedAt: new Date('2026-04-10T10:00:00.000Z'),
        },
      ]);
      const rowsLimit = vi.fn().mockReturnValue({ offset: rowsOffset });
      const rowsOrderBy = vi.fn().mockReturnValue({ limit: rowsLimit });
      const rowsWhere = vi.fn().mockReturnValue({ orderBy: rowsOrderBy });

      let selectCallCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount += 1;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnValue({ where: countWhere }),
          } as any;
        }

        return {
          from: vi.fn().mockReturnValue({ where: rowsWhere }),
        } as any;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/expenses?page=2&limit=10&category=supplies&source=manual&search=mailer&dateFrom=2026-04-01T00:00:00.000Z&dateTo=2026-04-30T23:59:59.999Z',
      });

      expect(response.statusCode).toBe(200);
      expect(countWhere).toHaveBeenCalledTimes(1);
      expect(rowsWhere).toHaveBeenCalledTimes(1);
      expect(rowsLimit).toHaveBeenCalledWith(10);
      expect(rowsOffset).toHaveBeenCalledWith(10);

      expect(JSON.parse(response.body)).toEqual({
        expenses: [
          expect.objectContaining({
            id: 7,
            category: 'supplies',
            tcgplayerOrderId: 'ORDER-7',
            occurredAt: '2026-04-10T10:00:00.000Z',
          }),
        ],
        total: 1,
        page: 2,
        limit: 10,
      });
    });
  });

  describe('PATCH /api/expenses/:id', () => {
    it('updates an expense and recomputes unitCostCents when amount or quantity changes', async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 8,
                amountCents: 300,
                category: 'supplies',
                subcategory: 'mailers',
                description: 'Rigid mailers',
                quantity: 4,
                unit: 'mailer',
                unitCostCents: 75,
                source: 'manual',
                isEstimate: false,
                autoKind: null,
                saleId: null,
                tcgplayerOrderId: null,
                occurredAt: new Date('2026-04-10T10:00:00.000Z'),
                createdAt: new Date('2026-04-10T10:00:00.000Z'),
                updatedAt: new Date('2026-04-10T10:00:00.000Z'),
              },
            ]),
          }),
        }),
      } as any);

      const updateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 8,
              amountCents: 625,
              category: 'supplies',
              subcategory: 'mailers',
              description: 'Updated mailers',
              quantity: 5,
              unit: 'mailer',
              unitCostCents: 125,
              source: 'manual',
              isEstimate: false,
              autoKind: null,
              saleId: null,
              tcgplayerOrderId: null,
              occurredAt: new Date('2026-04-10T10:00:00.000Z'),
              createdAt: new Date('2026-04-10T10:00:00.000Z'),
              updatedAt: new Date('2026-04-11T10:00:00.000Z'),
            },
          ]),
        }),
      });

      vi.mocked(db.update).mockReturnValueOnce({
        set: updateSet,
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/expenses/8',
        payload: {
          amountCents: 625,
          quantity: 5,
          description: 'Updated mailers',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 625,
          quantity: 5,
          description: 'Updated mailers',
          unitCostCents: 125,
          updatedAt: expect.any(Date),
        }),
      );
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          id: 8,
          amountCents: 625,
          quantity: 5,
          unitCostCents: 125,
        }),
      );
    });
  });

  describe('DELETE /api/expenses/:id', () => {
    it('deletes an expense entry', async () => {
      vi.mocked(db.delete).mockReturnValueOnce({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 9,
            },
          ]),
        }),
      } as any);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/expenses/9',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ success: true });
    });
  });

  describe('GET /api/expenses/settings', () => {
    it('returns singleton settings and auto-creates defaults when missing', async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      vi.mocked(db.insert).mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 1,
              autoRecordSaleExpenses: false,
              autoRecordShipping: true,
              shippingCostCents: 99,
              autoRecordSupplies: true,
              suppliesCostCents: 25,
              autoRecordTcgplayerFees: true,
              marketplaceFeeBps: 1075,
              transactionFeeBps: 250,
              transactionFlatFeeCents: 30,
              createdAt: new Date('2026-04-18T12:00:00.000Z'),
              updatedAt: new Date('2026-04-18T12:00:00.000Z'),
            },
          ]),
        }),
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/expenses/settings',
      });

      expect(response.statusCode).toBe(200);
      expect(vi.mocked(db.insert)).toHaveBeenCalledTimes(1);
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          autoRecordSaleExpenses: false,
          shippingCostCents: 99,
          suppliesCostCents: 25,
          marketplaceFeeBps: 1075,
          transactionFeeBps: 250,
          transactionFlatFeeCents: 30,
        }),
      );
    });
  });

  describe('POST /api/expenses/settings', () => {
    it('updates expense settings', async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 1,
              autoRecordSaleExpenses: false,
              autoRecordShipping: true,
              shippingCostCents: 99,
              autoRecordSupplies: true,
              suppliesCostCents: 25,
              autoRecordTcgplayerFees: true,
              marketplaceFeeBps: 1075,
              transactionFeeBps: 250,
              transactionFlatFeeCents: 30,
            },
          ]),
        }),
      } as any);

      const updateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 1,
              autoRecordSaleExpenses: true,
              autoRecordShipping: true,
              shippingCostCents: 149,
              autoRecordSupplies: true,
              suppliesCostCents: 35,
              autoRecordTcgplayerFees: true,
              marketplaceFeeBps: 900,
              transactionFeeBps: 275,
              transactionFlatFeeCents: 35,
              createdAt: new Date('2026-04-18T12:00:00.000Z'),
              updatedAt: new Date('2026-04-18T13:00:00.000Z'),
            },
          ]),
        }),
      });

      vi.mocked(db.update).mockReturnValueOnce({
        set: updateSet,
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/expenses/settings',
        payload: {
          autoRecordSaleExpenses: true,
          shippingCostCents: 149,
          suppliesCostCents: 35,
          marketplaceFeeBps: 900,
          transactionFeeBps: 275,
          transactionFlatFeeCents: 35,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          autoRecordSaleExpenses: true,
          shippingCostCents: 149,
          suppliesCostCents: 35,
          marketplaceFeeBps: 900,
          transactionFeeBps: 275,
          transactionFlatFeeCents: 35,
          updatedAt: expect.any(Date),
        }),
      );
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          autoRecordSaleExpenses: true,
          shippingCostCents: 149,
          suppliesCostCents: 35,
          marketplaceFeeBps: 900,
          transactionFeeBps: 275,
          transactionFlatFeeCents: 35,
        }),
      );
    });

    it('validates cents and fee basis-point ranges', async () => {
      const negativeCentsResponse = await app.inject({
        method: 'POST',
        url: '/api/expenses/settings',
        payload: {
          shippingCostCents: -1,
        },
      });

      expect(negativeCentsResponse.statusCode).toBe(400);
      expect(JSON.parse(negativeCentsResponse.body)).toEqual({
        error: 'shippingCostCents must be a non-negative integer',
      });

      const invalidBpsResponse = await app.inject({
        method: 'POST',
        url: '/api/expenses/settings',
        payload: {
          marketplaceFeeBps: 10001,
        },
      });

      expect(invalidBpsResponse.statusCode).toBe(400);
      expect(JSON.parse(invalidBpsResponse.body)).toEqual({
        error: 'marketplaceFeeBps must be an integer between 0 and 10000',
      });
    });
  });

  describe('GET /api/expenses/performance', () => {
    it('returns performance summary math and category grouping', async () => {
      const salesWhere = vi.fn().mockResolvedValue([
        {
          revenueCents: 1500,
          salesCount: 3,
        },
      ]);
      const expensesWhere = vi.fn().mockResolvedValue([
        {
          expensesCents: 430,
          expenseCount: 4,
          estimatedExpensesCents: 130,
          actualExpensesCents: 300,
        },
      ]);
      const categoriesOrderBy = vi.fn().mockResolvedValue([
        {
          category: 'shipping',
          totalCents: 130,
          count: 2,
        },
        {
          category: 'supplies',
          totalCents: 300,
          count: 2,
        },
      ]);
      const categoriesGroupBy = vi.fn().mockReturnValue({
        orderBy: categoriesOrderBy,
      });
      const categoriesWhere = vi.fn().mockReturnValue({
        groupBy: categoriesGroupBy,
      });

      let selectCallCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount += 1;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnValue({ where: salesWhere }),
          } as any;
        }

        if (selectCallCount === 2) {
          return {
            from: vi.fn().mockReturnValue({ where: expensesWhere }),
          } as any;
        }

        return {
          from: vi.fn().mockReturnValue({ where: categoriesWhere }),
        } as any;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/expenses/performance?dateFrom=2026-04-01T00:00:00.000Z&dateTo=2026-04-30T23:59:59.999Z',
      });

      expect(response.statusCode).toBe(200);
      expect(salesWhere).toHaveBeenCalledTimes(1);
      expect(expensesWhere).toHaveBeenCalledTimes(1);
      expect(categoriesWhere).toHaveBeenCalledTimes(1);
      expect(categoriesGroupBy).toHaveBeenCalledTimes(1);

      const body = JSON.parse(response.body);
      expect(body).toEqual({
        revenueCents: 1500,
        expensesCents: 430,
        netProfitCents: 1070,
        marginPercent: 71.33,
        salesCount: 3,
        expenseCount: 4,
        estimatedExpensesCents: 130,
        actualExpensesCents: 300,
        byCategory: [
          {
            category: 'shipping',
            totalCents: 130,
            count: 2,
          },
          {
            category: 'supplies',
            totalCents: 300,
            count: 2,
          },
        ],
      });
    });

    it('excludes cancelled sales from revenue totals', async () => {
      const salesWhere = vi.fn().mockResolvedValue([
        {
          revenueCents: 800,
          salesCount: 2,
        },
      ]);
      const categoriesOrderBy = vi.fn().mockResolvedValue([]);
      const categoriesGroupBy = vi.fn().mockReturnValue({
        orderBy: categoriesOrderBy,
      });

      let selectCallCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount += 1;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnValue({ where: salesWhere }),
          } as any;
        }

        if (selectCallCount === 2) {
          return {
            from: vi.fn().mockResolvedValue([
              {
                expensesCents: 100,
                expenseCount: 1,
                estimatedExpensesCents: 0,
                actualExpensesCents: 100,
              },
            ]),
          } as any;
        }

        return {
          from: vi.fn().mockReturnValue({
            groupBy: categoriesGroupBy,
          }),
        } as any;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/expenses/performance',
      });

      expect(response.statusCode).toBe(200);
      expect(salesWhere).toHaveBeenCalledTimes(1);
      expect(JSON.parse(response.body)).toEqual(
        expect.objectContaining({
          revenueCents: 800,
          salesCount: 2,
          expensesCents: 100,
          netProfitCents: 700,
        }),
      );
    });
  });
});
