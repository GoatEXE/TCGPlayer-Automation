import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseTable } from '../ExpenseTable';
import type { Expense } from '../../api/types';

const mockExpenses: Expense[] = [
  {
    id: 1,
    occurredAt: '2026-04-18T12:00:00.000Z',
    amountCents: 499,
    category: 'shipping',
    subcategory: null,
    description: 'USPS postage',
    quantity: 1,
    unit: 'order',
    unitCostCents: 499,
    source: 'manual',
    isEstimate: false,
    autoKind: null,
    saleId: null,
    tcgplayerOrderId: 'ORD-1',
    createdAt: '2026-04-18T12:00:00.000Z',
    updatedAt: '2026-04-18T12:00:00.000Z',
  },
  {
    id: 2,
    occurredAt: '2026-04-17T12:00:00.000Z',
    amountCents: 1200,
    category: 'supplies',
    subcategory: 'mailer',
    description: null,
    quantity: 4,
    unit: 'mailer',
    unitCostCents: 300,
    source: 'sale_auto_estimate',
    isEstimate: true,
    autoKind: 'supplies_order',
    saleId: 33,
    tcgplayerOrderId: null,
    createdAt: '2026-04-17T12:00:00.000Z',
    updatedAt: '2026-04-17T12:00:00.000Z',
  },
];

describe('ExpenseTable', () => {
  const onPageChange = vi.fn<(page: number) => void>();
  const onEdit = vi.fn<(expense: Expense) => void>();
  const onDelete = vi.fn<(expense: Expense) => void>();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders columns and formatted row values', () => {
    render(
      <ExpenseTable
        expenses={mockExpenses}
        total={2}
        page={1}
        limit={50}
        onPageChange={onPageChange}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Category')).toBeTruthy();
    expect(screen.getByText('Subcategory')).toBeTruthy();
    expect(screen.getByText('Description')).toBeTruthy();
    expect(screen.getByText('Qty')).toBeTruthy();
    expect(screen.getByText('Unit Cost')).toBeTruthy();
    expect(screen.getByText('Amount')).toBeTruthy();
    expect(screen.getByText('Source')).toBeTruthy();
    expect(screen.getByText('Order ID')).toBeTruthy();
    expect(screen.getByText('Actions')).toBeTruthy();

    expect(screen.getByText('Shipping')).toBeTruthy();
    expect(screen.getByText('Supplies')).toBeTruthy();
    expect(screen.getByText('$4.99')).toBeTruthy();
    expect(screen.getByText('$12.00')).toBeTruthy();
    expect(screen.getByText('$3.00 / mailer')).toBeTruthy();

    expect(screen.getByText('Manual')).toBeTruthy();
    expect(screen.getByText('Auto-estimate')).toBeTruthy();

    expect(screen.getByText('ORD-1')).toBeTruthy();
  });

  it('calls onEdit and onDelete for row actions', async () => {
    const user = userEvent.setup();

    render(
      <ExpenseTable
        expenses={mockExpenses}
        total={2}
        page={1}
        limit={50}
        onPageChange={onPageChange}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    const editButtons = screen.getAllByTitle('Edit expense');
    const deleteButtons = screen.getAllByTitle('Delete expense');

    await user.click(editButtons[0]);
    await user.click(deleteButtons[1]);

    expect(onEdit).toHaveBeenCalledWith(mockExpenses[0]);
    expect(onDelete).toHaveBeenCalledWith(mockExpenses[1]);
  });

  it('supports pagination callbacks', async () => {
    const user = userEvent.setup();

    render(
      <ExpenseTable
        expenses={mockExpenses}
        total={120}
        page={2}
        limit={50}
        onPageChange={onPageChange}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Next/i }));
    await user.click(screen.getByRole('button', { name: /Previous/i }));

    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('renders empty state when there are no expenses', () => {
    render(
      <ExpenseTable
        expenses={[]}
        total={0}
        page={1}
        limit={50}
        onPageChange={onPageChange}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText(/No expenses recorded yet/i)).toBeTruthy();
  });
});
