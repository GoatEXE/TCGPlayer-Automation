import { ChartNoAxesCombined } from 'lucide-react';
import type { ExpenseCategory, PerformanceSummaryResponse } from '../api/types';
import { BlueprintPanel } from '../ui';

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
  const metrics = [
    {
      label: 'Revenue (product + shipping collected)',
      value: formatCents(summary.revenueCents),
    },
    { label: 'Expenses', value: formatCents(summary.expensesCents) },
    {
      label: 'Net Profit after fees + manual expenses',
      value: formatCents(summary.netProfitCents),
    },
    { label: 'Margin', value: formatMargin(summary.marginPercent) },
    { label: 'Sales Count', value: String(summary.salesCount) },
    { label: 'Expense Count', value: String(summary.expenseCount) },
  ];

  return (
    <BlueprintPanel className="performance-summary-card commerce-performance-summary">
      <header className="commerce-performance-card-header">
        <ChartNoAxesCombined size={20} strokeWidth={1.6} aria-hidden="true" />
        <h3>Profit &amp; Loss</h3>
      </header>

      <dl className="performance-summary-grid commerce-performance-metrics">
        {metrics.map((metric) => (
          <div key={metric.label} className="stat-item commerce-performance-metric">
            <dt>{metric.label}</dt>
            <dd data-numeric>{metric.value}</dd>
          </div>
        ))}
      </dl>

      <div className="performance-summary-split commerce-performance-detail-strip">
        <span className="stat-item">
          Estimated TCGplayer Fees
          <strong data-numeric>
            {formatCents(summary.estimatedTcgplayerFeesCents ?? 0)}
          </strong>
        </span>
        <span className="stat-item">
          Estimated Expenses
          <strong data-numeric>{formatCents(summary.estimatedExpensesCents)}</strong>
        </span>
        <span className="stat-item">
          Actual Expenses
          <strong data-numeric>{formatCents(summary.actualExpensesCents)}</strong>
        </span>
      </div>

      <div className="performance-summary-breakdown">
        <h4 className="commerce-breakdown-title">Expense Breakdown</h4>
        <ul
          className="performance-category-list"
          aria-label="Expense category breakdown"
        >
          {categoryOrder.map((category) => {
            const row = categoryMap.get(category);
            return (
              <li key={category} className="performance-category-item">
                <span>{categoryLabels[category]}</span>
                <strong data-numeric>{formatCents(row?.totalCents ?? 0)}</strong>
                <span className="price-check-no-runs">
                  {row?.count ?? 0} entr{(row?.count ?? 0) === 1 ? 'y' : 'ies'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </BlueprintPanel>
  );
}
