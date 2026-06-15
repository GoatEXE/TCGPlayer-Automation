import type { ExpenseCategory, PerformanceSummaryResponse } from '../api/types';

interface PerformanceSummaryCardProps {
  summary: PerformanceSummaryResponse;
}

const categoryOrder: ExpenseCategory[] = [
  'supplies',
  'shipping',
  'tcgplayer_fees',
  'inventory_acquisition',
  'other',
];

const categoryLabels: Record<ExpenseCategory, string> = {
  supplies: 'Supplies',
  shipping: 'Shipping',
  tcgplayer_fees: 'TCGplayer Fees',
  inventory_acquisition: 'Inventory Acquisition',
  other: 'Other',
};

function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = `$${(abs / 100).toFixed(2)}`;
  return cents < 0 ? `-${formatted}` : formatted;
}

function formatMargin(percent: number | null): string {
  if (percent === null) return '—';
  return `${percent.toFixed(2)}%`;
}

export function PerformanceSummaryCard({ summary }: PerformanceSummaryCardProps) {
  const categoryMap = new Map(
    summary.byCategory.map((row) => [row.category, row] as const),
  );

  return (
    <section className="price-check-card performance-summary-card">
      <div className="price-check-header">
        <span className="price-check-title">📊 Profit &amp; Loss</span>
      </div>

      <div className="price-check-body performance-summary-grid">
        <span className="stat-item">
          <strong>{formatCents(summary.revenueCents)}</strong> Revenue (product + shipping collected)
        </span>
        <span className="stat-item">
          <strong>{formatCents(summary.expensesCents)}</strong> Expenses
        </span>
        <span className="stat-item">
          <strong>{formatCents(summary.netProfitCents)}</strong> Net Profit after fees + manual expenses
        </span>
        <span className="stat-item">
          Margin <strong>{formatMargin(summary.marginPercent)}</strong>
        </span>
        <span className="stat-item">
          Sales Count <strong>{summary.salesCount}</strong>
        </span>
        <span className="stat-item">
          Expense Count <strong>{summary.expenseCount}</strong>
        </span>
      </div>

      <div className="price-check-body performance-summary-split">
        <span className="stat-item">
          Estimated TCGplayer Fees <strong>{formatCents(summary.estimatedTcgplayerFeesCents ?? 0)}</strong>
        </span>
        <span className="stat-item">
          Estimated Expenses <strong>{formatCents(summary.estimatedExpensesCents)}</strong>
        </span>
        <span className="stat-item">
          Actual Expenses <strong>{formatCents(summary.actualExpensesCents)}</strong>
        </span>
      </div>

      <div className="price-check-body performance-summary-breakdown">
        <span className="price-check-title">Expense Breakdown</span>
        <ul
          className="performance-category-list"
          aria-label="Expense category breakdown"
        >
          {categoryOrder.map((category) => {
            const row = categoryMap.get(category);
            return (
              <li key={category} className="performance-category-item">
                <span>{categoryLabels[category]}</span>
                <strong>{formatCents(row?.totalCents ?? 0)}</strong>
                <span className="price-check-no-runs">
                  {row?.count ?? 0} entr{(row?.count ?? 0) === 1 ? 'y' : 'ies'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
