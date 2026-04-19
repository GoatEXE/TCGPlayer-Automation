import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseFormModal } from '../ExpenseFormModal';
import type {
  CreateExpenseRequest,
  Expense,
  UpdateExpenseRequest,
} from '../../api/types';

const mockExpense: Expense = {
  id: 7,
  occurredAt: '2026-04-18T14:30:00.000Z',
  amountCents: 750,
  category: 'supplies',
  subcategory: 'top loader',
  description: 'Top loaders',
  quantity: 3,
  unit: 'pack',
  unitCostCents: 250,
  source: 'manual',
  isEstimate: true,
  autoKind: null,
  saleId: null,
  tcgplayerOrderId: null,
  createdAt: '2026-04-18T14:30:00.000Z',
  updatedAt: '2026-04-18T14:30:00.000Z',
};

describe('ExpenseFormModal', () => {
  const onSubmit = vi.fn<
    (data: CreateExpenseRequest | UpdateExpenseRequest) => Promise<void>
  >();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create mode with empty/default fields', () => {
    render(<ExpenseFormModal onSubmit={onSubmit} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: /create expense/i })).toBeTruthy();

    const amount = screen.getByLabelText(/Amount \(\$\)/i) as HTMLInputElement;
    const category = screen.getByLabelText('Category') as HTMLSelectElement;
    const quantity = screen.getByLabelText('Quantity') as HTMLInputElement;
    const estimate = screen.getByLabelText(/Mark as estimate/i) as HTMLInputElement;

    expect(amount.value).toBe('');
    expect(category.value).toBe('');
    expect(quantity.value).toBe('');
    expect(estimate.checked).toBe(false);
  });

  it('renders edit mode with pre-filled values', () => {
    render(
      <ExpenseFormModal
        expense={mockExpense}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('dialog', { name: /edit expense/i })).toBeTruthy();

    const amount = screen.getByLabelText(/Amount \(\$\)/i) as HTMLInputElement;
    const category = screen.getByLabelText('Category') as HTMLSelectElement;
    const subcategory = screen.getByLabelText('Subcategory') as HTMLInputElement;
    const description = screen.getByLabelText('Description') as HTMLTextAreaElement;
    const quantity = screen.getByLabelText('Quantity') as HTMLInputElement;
    const unit = screen.getByLabelText('Unit') as HTMLInputElement;
    const estimate = screen.getByLabelText(/Mark as estimate/i) as HTMLInputElement;

    expect(amount.value).toBe('7.50');
    expect(category.value).toBe('supplies');
    expect(subcategory.value).toBe('top loader');
    expect(description.value).toBe('Top loaders');
    expect(quantity.value).toBe('3');
    expect(unit.value).toBe('pack');
    expect(estimate.checked).toBe(true);
  });

  it('validates amount is greater than 0', async () => {
    const user = userEvent.setup();

    render(<ExpenseFormModal onSubmit={onSubmit} onClose={onClose} />);

    await user.selectOptions(screen.getByLabelText('Category'), 'shipping');

    const amountInput = screen.getByLabelText(/Amount \(\$\)/i);
    await user.type(amountInput, '0');

    await user.click(screen.getByRole('button', { name: /Save Expense/i }));

    expect(screen.getByRole('alert').textContent).toContain(
      'Amount must be greater than 0',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('validates category is required', async () => {
    const user = userEvent.setup();

    render(<ExpenseFormModal onSubmit={onSubmit} onClose={onClose} />);

    await user.type(screen.getByLabelText(/Amount \(\$\)/i), '1.00');
    await user.click(screen.getByRole('button', { name: /Save Expense/i }));

    expect(screen.getByRole('alert').textContent).toContain(
      'Category is required',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('auto-computes and displays per-unit cost when quantity is provided', async () => {
    const user = userEvent.setup();

    render(<ExpenseFormModal onSubmit={onSubmit} onClose={onClose} />);

    await user.type(screen.getByLabelText(/Amount \(\$\)/i), '5.00');
    await user.type(screen.getByLabelText('Quantity'), '4');

    expect(screen.getByText(/Per-unit cost:/i)).toBeTruthy();
    expect(screen.getByText(/\$1\.25/)).toBeTruthy();
  });

  it('submits create payload with cents conversion', async () => {
    const user = userEvent.setup();
    onSubmit.mockResolvedValueOnce(undefined);

    render(<ExpenseFormModal onSubmit={onSubmit} onClose={onClose} />);

    await user.type(screen.getByLabelText(/Amount \(\$\)/i), '2.49');
    await user.selectOptions(screen.getByLabelText('Category'), 'shipping');
    await user.type(screen.getByLabelText('Subcategory'), 'postage');
    await user.type(screen.getByLabelText('Description'), 'USPS stamp');
    await user.type(screen.getByLabelText('Quantity'), '2');
    await user.type(screen.getByLabelText('Unit'), 'order');
    await user.click(screen.getByLabelText(/Mark as estimate/i));

    await user.click(screen.getByRole('button', { name: /Save Expense/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 249,
          category: 'shipping',
          subcategory: 'postage',
          description: 'USPS stamp',
          quantity: 2,
          unit: 'order',
          isEstimate: true,
          occurredAt: expect.any(String),
        }),
      );
    });
  });

  it('submits edit payload from pre-filled expense', async () => {
    const user = userEvent.setup();
    onSubmit.mockResolvedValueOnce(undefined);

    render(
      <ExpenseFormModal
        expense={mockExpense}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    const amountInput = screen.getByLabelText(/Amount \(\$\)/i);
    await user.clear(amountInput);
    await user.type(amountInput, '8.25');

    await user.click(screen.getByRole('button', { name: /Save Expense/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 825,
          category: 'supplies',
          quantity: 3,
          unit: 'pack',
          isEstimate: true,
        }),
      );
    });
  });

  it('closes on Escape key and backdrop click', async () => {
    const user = userEvent.setup();

    render(<ExpenseFormModal onSubmit={onSubmit} onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = screen.getByRole('dialog');
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not close on Escape while saving', async () => {
    const user = userEvent.setup();
    onSubmit.mockReturnValue(new Promise(() => {}));

    render(<ExpenseFormModal onSubmit={onSubmit} onClose={onClose} />);

    await user.type(screen.getByLabelText(/Amount \(\$\)/i), '1.00');
    await user.selectOptions(screen.getByLabelText('Category'), 'other');
    await user.click(screen.getByRole('button', { name: /Save Expense/i }));

    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });
});
