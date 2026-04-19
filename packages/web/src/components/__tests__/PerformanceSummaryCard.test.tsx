import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PerformanceSummaryCard } from '../PerformanceSummaryCard';
import type { PerformanceSummaryResponse } from '../../api/types';

const mockSummary: PerformanceSummaryResponse = {
  revenueCents: 25000,
  expensesCents: 9843,
  netProfitCents: 15157,
  marginPercent: 60.63,
  salesCount: 12,
  expenseCount: 9,
  estimatedExpensesCents: 3343,
  actualExpensesCents: 6500,
  byCategory: [
    { category: 'supplies', totalCents: 1200, count: 3 },
    { category: 'shipping', totalCents: 2300, count: 2 },
    { category: 'tcgplayer_fees', totalCents: 4000, count: 2 },
    { category: 'inventory_acquisition', totalCents: 1800, count: 1 },
    { category: 'other', totalCents: 543, count: 1 },
  ],
};

describe('PerformanceSummaryCard', () => {
  it('renders P&L totals, margin, counts, and estimate split', () => {
    render(<PerformanceSummaryCard summary={mockSummary} />);

    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('$250.00')).toBeTruthy();

    expect(screen.getByText('Expenses')).toBeTruthy();
    expect(screen.getByText('$98.43')).toBeTruthy();

    expect(screen.getByText('Net Profit')).toBeTruthy();
    expect(screen.getByText('$151.57')).toBeTruthy();

    expect(screen.getByText('Margin')).toBeTruthy();
    expect(screen.getByText('60.63%')).toBeTruthy();

    expect(screen.getByText(/Sales Count/i)).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();

    expect(screen.getByText(/Expense Count/i)).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();

    expect(screen.getByText(/Estimated Expenses/i)).toBeTruthy();
    expect(screen.getByText('$33.43')).toBeTruthy();

    expect(screen.getByText(/Actual Expenses/i)).toBeTruthy();
    expect(screen.getByText('$65.00')).toBeTruthy();
  });

  it('renders full category breakdown with totals', () => {
    render(<PerformanceSummaryCard summary={mockSummary} />);

    expect(screen.getByText('Supplies')).toBeTruthy();
    expect(screen.getByText('$12.00')).toBeTruthy();

    expect(screen.getByText('Shipping')).toBeTruthy();
    expect(screen.getByText('$23.00')).toBeTruthy();

    expect(screen.getByText('TCGplayer Fees')).toBeTruthy();
    expect(screen.getByText('$40.00')).toBeTruthy();

    expect(screen.getByText('Inventory Acquisition')).toBeTruthy();
    expect(screen.getByText('$18.00')).toBeTruthy();

    expect(screen.getByText('Other')).toBeTruthy();
    expect(screen.getByText('$5.43')).toBeTruthy();
  });

  it('shows $0.00 for categories that are missing from byCategory', () => {
    const partial: PerformanceSummaryResponse = {
      ...mockSummary,
      byCategory: [{ category: 'shipping', totalCents: 500, count: 1 }],
    };

    render(<PerformanceSummaryCard summary={partial} />);

    const suppliesRow = screen.getByText('Supplies').closest('li');
    const shippingRow = screen.getByText('Shipping').closest('li');
    const feesRow = screen.getByText('TCGplayer Fees').closest('li');
    const acquisitionRow = screen.getByText('Inventory Acquisition').closest(
      'li',
    );
    const otherRow = screen.getByText('Other').closest('li');

    expect(suppliesRow?.textContent).toContain('$0.00');
    expect(shippingRow?.textContent).toContain('$5.00');
    expect(feesRow?.textContent).toContain('$0.00');
    expect(acquisitionRow?.textContent).toContain('$0.00');
    expect(otherRow?.textContent).toContain('$0.00');
  });

  it('shows em dash margin when marginPercent is null', () => {
    render(
      <PerformanceSummaryCard summary={{ ...mockSummary, marginPercent: null }} />,
    );

    const marginRow = screen.getByText('Margin').closest('.stat-item');
    expect(marginRow?.textContent).toContain('—');
  });
});
