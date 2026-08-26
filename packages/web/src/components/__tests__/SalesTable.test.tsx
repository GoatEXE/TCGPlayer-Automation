import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { SalesTable } from '../SalesTable';
import type { SalesOrder } from '../../api/types';
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

class TestResizeObserver {
  static instances: TestResizeObserver[] = [];

  readonly callback: ResizeObserverCallback;
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    TestResizeObserver.instances.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function installResizeObserver() {
  TestResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeOrder(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    orderKey: 'order:ORD-123',
    tcgplayerOrderId: 'ORD-123',
    representativeSaleId: 1,
    buyerName: 'Jane Doe',
    orderStatus: 'confirmed',
    soldAt: '2026-03-30T14:00:00.000Z',
    notes: null,
    itemCount: 2,
    productSubtotalCents: 499,
    shippingCollectedCents: 149,
    totalCents: 648,
    shipment: null,
    lineItems: [
      {
        id: 1,
        cardId: 10,
        quantitySold: 2,
        lineItemType: 'sale',
        salePriceCents: 499,
        cardProductName: "Targon's Peak",
        cardSetName: 'Origins',
        cardCondition: 'Near Mint',
      },
    ],
    ...overrides,
  };
}

async function openActionsMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', {
    name: /actions for ORD-123/i,
  });
  await user.click(trigger);
  return trigger;
}

describe('SalesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders order summary column headers and no selection checkboxes', () => {
    render(<SalesTable orders={[]} loading={false} />);

    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Order')).toBeTruthy();
    expect(screen.getByText('Product subtotal')).toBeTruthy();
    expect(screen.getByText('Shipping')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('renders loading state', () => {
    render(<SalesTable orders={[]} loading={true} />);
    const loadingCell = screen.getByText('Loading sales…');
    expect(loadingCell).toBeTruthy();
    expect(loadingCell.getAttribute('colspan')).toBe('10');
  });

  it('renders empty state when no sales', () => {
    render(<SalesTable orders={[]} loading={false} />);
    expect(screen.getByText('No sales recorded yet.')).toBeTruthy();
  });

  it('renders order rows with formatted summaries', () => {
    render(<SalesTable orders={[makeOrder()]} loading={false} />);

    const summaryRow = document.querySelector('tr.order-summary-row');
    expect(summaryRow).not.toBeNull();
    const summary = within(summaryRow!);
    expect(summary.getByText('ORD-123')).toBeTruthy();
    expect(summary.getByText('2')).toBeTruthy();
    expect(summary.getByText('$4.99')).toBeTruthy();
    expect(summary.getByText('$1.49')).toBeTruthy();
    expect(summary.getByText('$6.48')).toBeTruthy();
    expect(summary.getByText('Jane Doe')).toBeTruthy();
  });

  it('shows dash for missing buyer name', () => {
    render(
      <SalesTable orders={[makeOrder({ buyerName: null })]} loading={false} />,
    );
    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    expect(cells[2].textContent).toBe('—');
  });

  it('uses a synthetic order label for a missing order id', () => {
    render(
      <SalesTable
        orders={[
          makeOrder({
            orderKey: 'sale:9',
            tcgplayerOrderId: null,
            representativeSaleId: 9,
          }),
        ]}
        loading={false}
      />,
    );
    expect(screen.getByText('Synthetic order #9')).toBeTruthy();
  });

  it('shows dash for a missing card name after expanding the order', async () => {
    mockGetHistory.mockResolvedValue({ history: [] });
    const user = userEvent.setup();
    render(
      <SalesTable
        orders={[
          makeOrder({
            lineItems: [{ ...makeOrder().lineItems[0], cardProductName: null }],
          }),
        ]}
        loading={false}
      />,
    );
    const chevron = screen.getByRole('button', {
      name: 'Expand ORD-123 items',
    });
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
    expect(chevron.getAttribute('aria-controls')).toBe(
      'order-items-order:ORD-123',
    );
    await user.click(chevron);
    expect(chevron.getAttribute('aria-expanded')).toBe('true');
    expect(
      (await screen.findByRole('row', { name: /— origins/i })).textContent,
    ).toContain('—');
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
        orders={[makeOrder({ orderStatus: 'pending' })]}
        loading={false}
        onStatusChange={onStatusChange}
      />,
    );

    expect(
      screen.getByRole('combobox', {
        name: 'Change order status for ORD-123',
      }),
    ).toBeTruthy();
  });

  it('renders static badge when onStatusChange is not provided', () => {
    render(
      <SalesTable
        orders={[makeOrder({ orderStatus: 'confirmed' })]}
        loading={false}
      />,
    );

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('confirmed')).toBeTruthy();
  });

  it('calls onStatusChange with the representative sale id for the complete order', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(undefined);

    render(
      <SalesTable
        orders={[
          makeOrder({ representativeSaleId: 5, orderStatus: 'pending' }),
        ]}
        loading={false}
        onStatusChange={onStatusChange}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), 'confirmed');
    expect(onStatusChange).toHaveBeenCalledWith(5, 'confirmed');
  });
});

describe('SalesTable history expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expands only paid and gift card line items without fetching status history', async () => {
    mockGetHistory.mockResolvedValue({
      history: [
        {
          id: 1,
          saleId: 7,
          previousStatus: 'pending',
          newStatus: 'confirmed',
          source: 'manual',
          note: null,
          changedAt: '2026-03-30T10:00:00.000Z',
        },
      ],
    });

    const user = userEvent.setup();
    render(
      <SalesTable
        orders={[
          makeOrder({
            representativeSaleId: 7,
            lineItems: [
              ...makeOrder().lineItems,
              {
                ...makeOrder().lineItems[0],
                id: 8,
                lineItemType: 'gift',
                salePriceCents: 0,
                cardProductName: 'Bonus Card',
              },
            ],
          }),
        ]}
        loading={false}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Expand ORD-123 items' }),
    );

    expect(mockGetHistory).not.toHaveBeenCalled();
    expect(await screen.findByText("Targon's Peak")).toBeTruthy();
    expect(screen.getByText('Bonus Card')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('Gift')).toBeTruthy();
    const detailsRow = document.getElementById('order-items-order:ORD-123');
    expect(detailsRow?.querySelectorAll('.order-line-items')).toHaveLength(1);
    expect(detailsRow?.querySelector('section')).toBeNull();
    expect(screen.queryByText('Status history')).toBeNull();
    expect(document.querySelector('.timeline-shipment')).toBeNull();
  });

  it('shows empty state when no history entries', async () => {
    mockGetHistory.mockResolvedValue({ history: [] });

    const user = userEvent.setup();
    render(
      <SalesTable
        orders={[makeOrder({ representativeSaleId: 7 })]}
        loading={false}
      />,
    );

    await openActionsMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: 'View status history' }),
    );

    await waitFor(() => {
      expect(screen.getByText('No status changes recorded.')).toBeTruthy();
    });
  });

  it('measures a pixel height on first open and restores zero with accessibility state on collapse', async () => {
    mockGetHistory.mockResolvedValue({ history: [] });

    const user = userEvent.setup();
    render(
      <SalesTable
        orders={[
          makeOrder(),
          makeOrder({
            orderKey: 'order:ORD-456',
            tcgplayerOrderId: 'ORD-456',
            representativeSaleId: 2,
            buyerName: 'John Doe',
          }),
        ]}
        loading={false}
      />,
    );

    const firstChevron = screen.getByRole('button', {
      name: 'Expand ORD-123 items',
    });
    const secondChevron = screen.getByRole('button', {
      name: 'Expand ORD-456 items',
    });
    const detailsRow = document.getElementById('order-items-order:ORD-123');
    const secondDetailsRow = document.getElementById(
      'order-items-order:ORD-456',
    );
    const details = detailsRow?.querySelector<HTMLElement>('.order-details');
    const content = details?.querySelector<HTMLElement>(
      '.order-details-content',
    );
    let measuredHeight = 344;

    expect(details).not.toBeNull();
    expect(content).not.toBeNull();
    Object.defineProperty(content!, 'scrollHeight', {
      configurable: true,
      get: () => measuredHeight,
    });

    expect(detailsRow).not.toBeNull();
    expect(secondDetailsRow).not.toBeNull();
    expect(firstChevron.getAttribute('aria-expanded')).toBe('false');
    expect(secondChevron.getAttribute('aria-expanded')).toBe('false');
    expect(detailsRow?.getAttribute('aria-hidden')).toBe('true');
    expect(secondDetailsRow?.getAttribute('aria-hidden')).toBe('true');
    expect(details?.style.height).toBe('0px');
    expect(details?.hasAttribute('inert')).toBe(true);

    await user.click(screen.getByText('Jane Doe'));

    await waitFor(() => expect(details?.style.height).toBe('344px'));
    expect(firstChevron.getAttribute('aria-expanded')).toBe('true');
    expect(secondChevron.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('order-items-order:ORD-123')).toBe(
      detailsRow,
    );
    expect(detailsRow?.getAttribute('aria-hidden')).toBe('false');
    expect(details?.hasAttribute('inert')).toBe(false);

    await user.click(screen.getByText('Jane Doe'));

    await waitFor(() => expect(details?.style.height).toBe('0px'));
    expect(firstChevron.getAttribute('aria-expanded')).toBe('false');
    expect(detailsRow?.getAttribute('aria-hidden')).toBe('true');
    expect(details?.hasAttribute('inert')).toBe(true);

    measuredHeight = 412;
    await user.click(screen.getByText('Jane Doe'));
    await waitFor(() => expect(details?.style.height).toBe('412px'));
  });

  it('keeps the latest measured target through interrupted rapid toggles', async () => {
    installResizeObserver();
    mockGetHistory.mockResolvedValue({ history: [] });

    const user = userEvent.setup();
    render(<SalesTable orders={[makeOrder()]} loading={false} />);

    const chevron = screen.getByRole('button', {
      name: 'Expand ORD-123 items',
    });
    const details = document.querySelector<HTMLElement>('.order-details')!;
    const content = details.querySelector<HTMLElement>(
      '.order-details-content',
    )!;
    let measuredHeight = 280;
    Object.defineProperty(content, 'scrollHeight', {
      configurable: true,
      get: () => measuredHeight,
    });

    await user.click(chevron);
    await waitFor(() => expect(details.style.height).toBe('280px'));

    await user.click(chevron);
    expect(details.style.height).toBe('0px');

    measuredHeight = 476;
    TestResizeObserver.instances[0].trigger();
    expect(details.style.height).toBe('0px');

    await user.click(chevron);
    await waitFor(() => expect(details.style.height).toBe('476px'));
    await user.click(chevron);
    await user.click(chevron);
    await waitFor(() => expect(details.style.height).toBe('476px'));
    expect(chevron.getAttribute('aria-expanded')).toBe('true');
  });

  it('remeasures card line items and disconnects its observer on cleanup', async () => {
    installResizeObserver();

    const user = userEvent.setup();
    const view = render(<SalesTable orders={[makeOrder()]} loading={false} />);
    const details = document.querySelector<HTMLElement>('.order-details')!;
    const content = details.querySelector<HTMLElement>(
      '.order-details-content',
    )!;
    let measuredHeight = 196;
    Object.defineProperty(content, 'scrollHeight', {
      configurable: true,
      get: () => measuredHeight,
    });

    await user.click(
      screen.getByRole('button', { name: 'Expand ORD-123 items' }),
    );
    await waitFor(() => expect(details.style.height).toBe('196px'));
    expect(TestResizeObserver.instances).toHaveLength(1);
    expect(TestResizeObserver.instances[0].observe).toHaveBeenCalledWith(
      content,
    );

    measuredHeight = 401;
    TestResizeObserver.instances[0].trigger();
    await waitFor(() => expect(details.style.height).toBe('401px'));

    view.unmount();
    expect(TestResizeObserver.instances[0].disconnect).toHaveBeenCalledOnce();
  });

  it('collapses order details from the explicit chevron control', async () => {
    const user = userEvent.setup();
    render(<SalesTable orders={[makeOrder()]} loading={false} />);

    const chevron = screen.getByRole('button', {
      name: 'Expand ORD-123 items',
    });
    await user.click(chevron);
    await user.click(chevron);

    await waitFor(() => {
      expect(
        document
          .getElementById('order-items-order:ORD-123')
          ?.getAttribute('aria-hidden'),
      ).toBe('true');
    });
  });

  it('does not double-toggle or fetch history when clicking the explicit chevron control', async () => {
    mockGetHistory.mockResolvedValue({ history: [] });

    const user = userEvent.setup();
    render(<SalesTable orders={[makeOrder()]} loading={false} />);

    const chevron = screen.getByRole('button', {
      name: 'Expand ORD-123 items',
    });
    await user.click(chevron);

    expect(chevron.getAttribute('aria-expanded')).toBe('true');
    expect(mockGetHistory).not.toHaveBeenCalled();

    await user.click(chevron);

    expect(chevron.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('SalesTable row action menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups order actions in an accessible menu with named controls', async () => {
    const user = userEvent.setup();
    render(
      <SalesTable
        orders={[makeOrder({ orderStatus: 'confirmed' })]}
        loading={false}
        onShip={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Actions for ORD-123' });
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
    expect(
      screen.queryByRole('menuitem', { name: /order details/i }),
    ).toBeNull();
  });

  it('does not expand from embedded status or action controls', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onStatusChange = vi.fn().mockResolvedValue(undefined);
    render(
      <SalesTable
        orders={[makeOrder({ orderStatus: 'pending' })]}
        loading={false}
        onStatusChange={onStatusChange}
      />,
    );

    const chevron = screen.getByRole('button', {
      name: 'Expand ORD-123 items',
    });
    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Change order status for ORD-123',
      }),
      'confirmed',
    );
    expect(onStatusChange).toHaveBeenCalledWith(1, 'confirmed');
    expect(chevron.getAttribute('aria-expanded')).toBe('false');

    await user.click(
      screen.getByRole('button', { name: 'Actions for ORD-123' }),
    );
    expect(chevron.getAttribute('aria-expanded')).toBe('false');

    await user.click(screen.getByRole('menuitem', { name: 'Open invoice' }));
    expect(openSpy).toHaveBeenCalledOnce();
    expect(chevron.getAttribute('aria-expanded')).toBe('false');

    openSpy.mockRestore();
  });

  it('opens status history without toggling the row and restores focus when closed', async () => {
    mockGetHistory.mockResolvedValue({ history: [] });
    const user = userEvent.setup();
    render(<SalesTable orders={[makeOrder()]} loading={false} />);

    const chevron = screen.getByRole('button', {
      name: 'Expand ORD-123 items',
    });
    const trigger = await openActionsMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: 'View status history' }),
    );

    expect(chevron).toHaveAttribute('aria-expanded', 'false');
    expect(mockGetHistory).toHaveBeenCalledWith(1);
    expect(
      await screen.findByRole('dialog', { name: 'Status history for ORD-123' }),
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('only shows actions available for the order status', async () => {
    const user = userEvent.setup();
    const cases = [
      {
        status: 'pending' as const,
        actions: ['Open invoice', 'View status history'],
      },
      {
        status: 'delivered' as const,
        actions: ['Open invoice', 'View status history'],
      },
      { status: 'cancelled' as const, actions: ['View status history'] },
    ];

    for (const { status, actions } of cases) {
      const view = render(
        <SalesTable
          orders={[makeOrder({ orderStatus: status })]}
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

  it('opens document urls from named menu actions using the order representative', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <SalesTable
        orders={[
          makeOrder({ representativeSaleId: 42, orderStatus: 'confirmed' }),
        ]}
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

  it('records a shipment from its named order action', async () => {
    const user = userEvent.setup();
    const onShip = vi.fn();
    const order = makeOrder({
      representativeSaleId: 42,
      orderStatus: 'confirmed',
    });
    render(<SalesTable orders={[order]} loading={false} onShip={onShip} />);

    await openActionsMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Record shipment' }));

    expect(onShip).toHaveBeenCalledWith(order);
  });

  it('dismisses the menu with Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<SalesTable orders={[makeOrder()]} loading={false} />);

    const trigger = await openActionsMenu(user);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses the menu when clicking outside it', async () => {
    const user = userEvent.setup();
    render(<SalesTable orders={[makeOrder()]} loading={false} />);

    await openActionsMenu(user);
    await user.click(screen.getByText('Jane Doe'));

    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('SalesTable tracking column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Tracking header for every order', () => {
    render(<SalesTable orders={[makeOrder()]} loading={false} />);

    expect(screen.getByText('Tracking')).toBeTruthy();
  });

  it('displays carrier and tracking number from the order shipment', () => {
    render(
      <SalesTable
        orders={[
          makeOrder({
            shipment: {
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
          }),
        ]}
        loading={false}
      />,
    );

    expect(screen.getByText('USPS · 9400111899223')).toBeTruthy();
  });

  it('displays dash when no shipment is associated with the order', () => {
    render(
      <SalesTable orders={[makeOrder({ shipment: null })]} loading={false} />,
    );

    const trackingCell = document.querySelector('.tracking-cell');
    expect(trackingCell?.textContent).toBe('—');
  });

  it('displays dash when the order shipment is still a placeholder', () => {
    render(
      <SalesTable
        orders={[
          makeOrder({
            shipment: {
              id: 10,
              saleId: 1,
              carrier: null,
              trackingNumber: null,
              shippedAt: null,
              deliveredAt: null,
              notes: null,
              createdAt: '',
              updatedAt: '',
            },
          }),
        ]}
        loading={false}
      />,
    );

    expect(document.querySelector('.tracking-cell')?.textContent).toBe('—');
  });
});
