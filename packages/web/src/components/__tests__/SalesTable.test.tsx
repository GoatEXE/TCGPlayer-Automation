import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalesTable } from '../SalesTable';
import type { Sale } from '../../api/types';
import { api } from '../../api/client';

vi.mock('../../api/client', () => ({
  api: {
    getSaleStatusHistory: vi.fn(),
    getInvoiceUrl: vi.fn((saleId: number) => `/api/sales/${saleId}/invoice`),
    getPackingSlipUrl: vi.fn(
      (saleId: number) => `/api/sales/${saleId}/packing-slip`,
    ),
  },
}));

const mockGetHistory = vi.mocked(api.getSaleStatusHistory);
const mockGetInvoiceUrl = vi.mocked(api.getInvoiceUrl);
const mockGetPackingSlipUrl = vi.mocked(api.getPackingSlipUrl);

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

async function openActionsMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', {
    name: /actions for targon's peak/i,
  });
  await user.click(trigger);
  return trigger;
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
    const loadingCell = screen.getByText('Loading sales…');
    expect(loadingCell).toBeTruthy();
    expect(loadingCell.getAttribute('colspan')).toBe('9');
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

    expect(
      screen.getByRole('combobox', {
        name: "Change order status for Targon's Peak",
      }),
    ).toBeTruthy();
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

    expect(
      screen.getByRole('checkbox', { name: 'Select all sales' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('checkbox', {
        name: "Select Targon's Peak for batch update",
      }),
    ).toBeTruthy();
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

    const rowCheckbox = screen.getByRole('checkbox', {
      name: "Select Targon's Peak for batch update",
    }) as HTMLInputElement;
    expect(rowCheckbox.disabled).toBe(true);
  });
});

describe('SalesTable history expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expands history from the named action menu', async () => {
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

    await openActionsMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: 'View status history' }),
    );

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

    await openActionsMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: 'View status history' }),
    );

    await waitFor(() => {
      expect(screen.getByText('No status changes recorded.')).toBeTruthy();
    });
  });

  it('collapses history from the named action menu', async () => {
    mockGetHistory.mockResolvedValue({ history: [] });

    const user = userEvent.setup();
    render(<SalesTable sales={[makeSale({ id: 7 })]} loading={false} />);

    await openActionsMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: 'View status history' }),
    );

    await waitFor(() => {
      expect(screen.getByText('No status changes recorded.')).toBeTruthy();
    });

    await openActionsMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: 'Hide status history' }),
    );

    await waitFor(() => {
      expect(screen.queryByText('No status changes recorded.')).toBeNull();
    });
  });
});

describe('SalesTable row action menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups row actions in an accessible menu with named controls', async () => {
    const user = userEvent.setup();
    render(
      <SalesTable
        sales={[makeSale({ id: 1, orderStatus: 'confirmed' })]}
        loading={false}
        onShip={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: /actions for targon's peak/i,
    });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await user.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: 'Record shipment' }),
    ).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Open invoice' })).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: 'Open packing slip' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: 'View status history' }),
    ).toBeTruthy();
  });

  it('only shows actions available for the sale status', async () => {
    const user = userEvent.setup();
    const cases = [
      {
        status: 'pending' as const,
        actions: ['Open invoice', 'View status history'],
      },
      {
        status: 'delivered' as const,
        actions: ['View status history'],
      },
      {
        status: 'cancelled' as const,
        actions: ['View status history'],
      },
    ];

    for (const { status, actions } of cases) {
      const view = render(
        <SalesTable
          sales={[makeSale({ id: 1, orderStatus: status })]}
          loading={false}
          onShip={vi.fn()}
        />,
      );

      await openActionsMenu(user);
      expect(
        screen.getAllByRole('menuitem').map((item) => item.textContent),
      ).toEqual(actions);
      view.unmount();
    }
  });

  it('opens document urls from named menu actions', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <SalesTable
        sales={[makeSale({ id: 42, orderStatus: 'confirmed' })]}
        loading={false}
      />,
    );

    await openActionsMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Open invoice' }));
    await openActionsMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: 'Open packing slip' }),
    );

    expect(mockGetInvoiceUrl).toHaveBeenCalledWith(42);
    expect(mockGetPackingSlipUrl).toHaveBeenCalledWith(42);
    expect(openSpy).toHaveBeenCalledWith(
      '/api/sales/42/invoice',
      '_blank',
      'noopener,noreferrer',
    );
    expect(openSpy).toHaveBeenCalledWith(
      '/api/sales/42/packing-slip',
      '_blank',
      'noopener,noreferrer',
    );

    openSpy.mockRestore();
  });

  it('records a shipment from its named menu action', async () => {
    const user = userEvent.setup();
    const onShip = vi.fn();
    render(
      <SalesTable
        sales={[makeSale({ id: 42, orderStatus: 'confirmed' })]}
        loading={false}
        onShip={onShip}
      />,
    );

    await openActionsMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Record shipment' }));

    expect(onShip).toHaveBeenCalledWith(42);
  });

  it('dismisses the menu with Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<SalesTable sales={[makeSale()]} loading={false} />);

    const trigger = await openActionsMenu(user);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses the menu when clicking outside it', async () => {
    const user = userEvent.setup();
    render(<SalesTable sales={[makeSale()]} loading={false} />);

    await openActionsMenu(user);
    await user.click(screen.getByText('Jane Doe'));

    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('SalesTable tracking column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Tracking header when shipments map provided', () => {
    render(
      <SalesTable
        sales={[makeSale({ id: 1 })]}
        loading={false}
        shipments={new Map()}
      />,
    );

    expect(screen.getByText('Tracking')).toBeTruthy();
  });

  it('displays carrier and tracking number when shipment exists', () => {
    const shipmentsMap = new Map([
      [
        1,
        {
          id: 10,
          saleId: 1,
          carrier: 'USPS',
          trackingNumber: '9400111899223',
          shippedAt: null,
          deliveredAt: null,
          notes: null,
          createdAt: '',
          updatedAt: '',
        },
      ],
    ]);

    render(
      <SalesTable
        sales={[makeSale({ id: 1 })]}
        loading={false}
        shipments={shipmentsMap}
      />,
    );

    expect(screen.getByText('USPS · 9400111899223')).toBeTruthy();
  });

  it('displays dash when no shipment for sale', () => {
    render(
      <SalesTable
        sales={[makeSale({ id: 1 })]}
        loading={false}
        shipments={new Map()}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    // Find the tracking cell (after status column)
    const trackingCell = Array.from(cells).find((c) =>
      c.classList.contains('tracking-cell'),
    );
    expect(trackingCell?.textContent).toBe('—');
  });

  it('does not render Tracking header when shipments not provided', () => {
    render(<SalesTable sales={[makeSale({ id: 1 })]} loading={false} />);

    expect(screen.queryByText('Tracking')).toBeNull();
  });
});
