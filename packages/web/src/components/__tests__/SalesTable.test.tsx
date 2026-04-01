import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalesTable } from '../SalesTable';
import type { Sale } from '../../api/types';

// Mock api for history fetching
vi.mock('../../api/client', () => ({
  api: {
    getSaleStatusHistory: vi.fn(),
  },
}));

import { api } from '../../api/client';
const mockGetHistory = vi.mocked(api.getSaleStatusHistory);

function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 1,
    cardId: 10,
    tcgplayerOrderId: 'ORD-123',
    quantitySold: 2,
    salePriceCents: 499,
    buyerName: 'Jane Doe',
    orderStatus: 'confirmed',
    soldAt: '2026-03-30T14:00:00.000Z',
    notes: null,
    createdAt: '2026-03-30T14:00:00.000Z',
    updatedAt: '2026-03-30T14:00:00.000Z',
    cardProductName: "Targon's Peak",
    cardSetName: 'Origins',
    ...overrides,
  };
}

describe('SalesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders column headers', () => {
    render(<SalesTable sales={[]} loading={false} />);

    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Card')).toBeTruthy();
    expect(screen.getByText('Set')).toBeTruthy();
    expect(screen.getByText('Qty')).toBeTruthy();
    expect(screen.getByText('Price')).toBeTruthy();
    expect(screen.getByText('Buyer')).toBeTruthy();
    expect(screen.getByText('Order ID')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
  });

  it('renders loading state', () => {
    render(<SalesTable sales={[]} loading={true} />);
    expect(screen.getByText('Loading sales…')).toBeTruthy();
  });

  it('renders empty state when no sales', () => {
    render(<SalesTable sales={[]} loading={false} />);
    expect(screen.getByText('No sales recorded yet.')).toBeTruthy();
  });

  it('renders sale rows with formatted data', () => {
    const sale = makeSale();
    render(<SalesTable sales={[sale]} loading={false} />);

    expect(screen.getByText("Targon's Peak")).toBeTruthy();
    expect(screen.getByText('Origins')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('$4.99')).toBeTruthy();
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText('ORD-123')).toBeTruthy();
  });

  it('shows dash for missing buyer name', () => {
    render(
      <SalesTable sales={[makeSale({ buyerName: null })]} loading={false} />,
    );
    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    // date, card, set, qty, price, buyer, orderId, status, expand
    expect(cells[5].textContent).toBe('—');
  });

  it('shows dash for missing order id', () => {
    render(
      <SalesTable
        sales={[makeSale({ tcgplayerOrderId: null })]}
        loading={false}
      />,
    );
    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    expect(cells[6].textContent).toBe('—');
  });

  it('shows dash for missing card name', () => {
    render(
      <SalesTable
        sales={[makeSale({ cardProductName: null })]}
        loading={false}
      />,
    );
    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    expect(cells[1].textContent).toBe('—');
  });
});

describe('SalesTable inline status change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders OrderStatusSelect when onStatusChange is provided', () => {
    const onStatusChange = vi.fn();
    render(
      <SalesTable
        sales={[makeSale({ orderStatus: 'pending' })]}
        loading={false}
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('renders static badge when onStatusChange is not provided', () => {
    render(
      <SalesTable
        sales={[makeSale({ orderStatus: 'confirmed' })]}
        loading={false}
      />,
    );

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('confirmed')).toBeTruthy();
  });

  it('calls onStatusChange when status is changed via select', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(undefined);

    render(
      <SalesTable
        sales={[makeSale({ id: 5, orderStatus: 'pending' })]}
        loading={false}
        onStatusChange={onStatusChange}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), 'confirmed');
    expect(onStatusChange).toHaveBeenCalledWith(5, 'confirmed');
  });
});

describe('SalesTable row selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders checkboxes when selection props are provided', () => {
    render(
      <SalesTable
        sales={[makeSale({ id: 1, orderStatus: 'pending' })]}
        loading={false}
        selectedIds={new Set()}
        onSelectionChange={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    // select-all + row checkbox
    expect(checkboxes.length).toBe(2);
  });

  it('does not render checkboxes when selection props are absent', () => {
    render(
      <SalesTable
        sales={[makeSale({ id: 1, orderStatus: 'pending' })]}
        loading={false}
      />,
    );

    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('calls onSelectionChange when row checkbox is toggled', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    render(
      <SalesTable
        sales={[makeSale({ id: 3, orderStatus: 'pending' })]}
        loading={false}
        selectedIds={new Set()}
        onSelectionChange={onSelectionChange}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    // checkboxes[0] is select-all, checkboxes[1] is the row
    await user.click(checkboxes[1]);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set([3]));
  });

  it('disables checkbox for terminal status sales', () => {
    render(
      <SalesTable
        sales={[makeSale({ id: 1, orderStatus: 'delivered' })]}
        loading={false}
        selectedIds={new Set()}
        onSelectionChange={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    const rowCheckbox = checkboxes[1] as HTMLInputElement;
    expect(rowCheckbox.disabled).toBe(true);
  });
});

describe('SalesTable history expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expands history when expand button is clicked', async () => {
    mockGetHistory.mockResolvedValue({
      history: [
        {
          id: 1,
          previousStatus: 'pending',
          newStatus: 'confirmed',
          source: 'manual',
          note: null,
          changedAt: '2026-03-30T10:00:00.000Z',
        },
      ],
    });

    const user = userEvent.setup();
    render(<SalesTable sales={[makeSale({ id: 7 })]} loading={false} />);

    await user.click(screen.getByTitle('View status history'));

    await waitFor(() => {
      expect(mockGetHistory).toHaveBeenCalledWith(7);
    });

    await waitFor(() => {
      expect(screen.getByText('pending')).toBeTruthy();
    });
  });

  it('shows empty state when no history entries', async () => {
    mockGetHistory.mockResolvedValue({ history: [] });

    const user = userEvent.setup();
    render(<SalesTable sales={[makeSale({ id: 7 })]} loading={false} />);

    await user.click(screen.getByTitle('View status history'));

    await waitFor(() => {
      expect(screen.getByText('No status changes recorded.')).toBeTruthy();
    });
  });

  it('collapses history on second click', async () => {
    mockGetHistory.mockResolvedValue({ history: [] });

    const user = userEvent.setup();
    render(<SalesTable sales={[makeSale({ id: 7 })]} loading={false} />);

    const btn = screen.getByTitle('View status history');
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByText('No status changes recorded.')).toBeTruthy();
    });

    await user.click(btn);

    await waitFor(() => {
      expect(screen.queryByText('No status changes recorded.')).toBeNull();
    });
  });
});
