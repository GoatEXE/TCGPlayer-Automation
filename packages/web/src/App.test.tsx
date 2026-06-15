import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { App } from './App';

const apiMocks = vi.hoisted(() => ({
  getCards: vi.fn(),
  getStats: vi.fn(),
  getPriceCheckStatus: vi.fn(),
  updatePriceCheckSettings: vi.fn(),
  getSales: vi.fn(),
  getSalesStats: vi.fn(),
  getSalesPipeline: vi.fn(),
  updateSale: vi.fn(),
  batchUpdateSaleStatus: vi.fn(),
  getSaleStatusHistory: vi.fn(),
  getShipment: vi.fn(),
  createShipment: vi.fn(),
  updateShipment: vi.fn(),
  getNotificationEvents: vi.fn(),
  createSale: vi.fn(),
  getExpenses: vi.fn(),
  getPerformanceSummary: vi.fn(),
  getExpenseSettings: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
  updateExpenseSettings: vi.fn(),
}));

vi.mock('./api/client', () => ({
  api: apiMocks,
}));

const performanceSummaryFixture = {
  revenueCents: 25000,
  expensesCents: 9843,
  netProfitCents: 15157,
  marginPercent: 60.63,
  salesCount: 12,
  expenseCount: 9,
  estimatedExpensesCents: 3343,
  actualExpensesCents: 6500,
  byCategory: [
    { category: 'shipping', totalCents: 2300, count: 2 },
    { category: 'supplies', totalCents: 1200, count: 3 },
  ],
};

const expenseSettingsFixture = {
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
  createdAt: '2026-04-18T10:00:00.000Z',
  updatedAt: '2026-04-18T10:00:00.000Z',
};

const expenseFixture = {
  id: 42,
  occurredAt: '2026-04-18T12:00:00.000Z',
  amountCents: 499,
  category: 'shipping',
  subcategory: 'postage',
  description: 'USPS postage',
  quantity: 1,
  unit: 'order',
  unitCostCents: 499,
  source: 'manual',
  isEstimate: false,
  autoKind: null,
  saleId: null,
  tcgplayerOrderId: 'ORD-42',
  createdAt: '2026-04-18T12:00:00.000Z',
  updatedAt: '2026-04-18T12:00:00.000Z',
};

describe('App view tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    apiMocks.getCards.mockResolvedValue({
      cards: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    apiMocks.getStats.mockResolvedValue({
      total: 0,
      pending: 0,
      matched: 0,
      listed: 0,
      gift: 0,
      needs_attention: 0,
      sold: 0,
      error: 0,
    });
    apiMocks.getPriceCheckStatus.mockResolvedValue({
      enabled: true,
      intervalHours: 12,
      thresholdPercent: 2,
      listedPriceAttentionThresholdPercent: 10,
      running: false,
      lastRun: null,
    });
    apiMocks.updatePriceCheckSettings.mockResolvedValue({
      enabled: true,
      intervalHours: 12,
      thresholdPercent: 2,
      listedPriceAttentionThresholdPercent: 10,
      running: false,
      lastRun: null,
    });
    apiMocks.getSales.mockResolvedValue({
      sales: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    apiMocks.getSalesStats.mockResolvedValue({
      totalSales: 0,
      totalRevenueCents: 0,
      averageSaleCents: 0,
      activeListingCount: 0,
      totalListedCount: 0,
    });
    apiMocks.getSalesPipeline.mockResolvedValue({ pipeline: [] });
    apiMocks.updateSale.mockResolvedValue({});
    apiMocks.batchUpdateSaleStatus.mockResolvedValue({
      updated: 0,
      skipped: [],
    });
    apiMocks.getSaleStatusHistory.mockResolvedValue({ history: [] });
    apiMocks.getShipment.mockRejectedValue(new Error('Not found'));
    apiMocks.createShipment.mockResolvedValue({
      id: 1,
      saleId: 1,
      carrier: null,
      trackingNumber: null,
      shippedAt: null,
      deliveredAt: null,
      notes: null,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
    });
    apiMocks.updateShipment.mockResolvedValue({});
    apiMocks.getNotificationEvents.mockResolvedValue({
      events: [],
      limit: 20,
    });
    apiMocks.getExpenses.mockResolvedValue({
      expenses: [expenseFixture],
      total: 1,
      page: 1,
      limit: 50,
    });
    apiMocks.getPerformanceSummary.mockResolvedValue(performanceSummaryFixture);
    apiMocks.getExpenseSettings.mockResolvedValue(expenseSettingsFixture);
    apiMocks.createExpense.mockResolvedValue(expenseFixture);
    apiMocks.updateExpense.mockResolvedValue(expenseFixture);
    apiMocks.deleteExpense.mockResolvedValue(undefined);
    apiMocks.updateExpenseSettings.mockResolvedValue(expenseSettingsFixture);
  });

  it('switches to Active Listings mode and requests listed cards', async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(apiMocks.getCards).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined }),
      );
    });

    await user.click(screen.getByRole('tab', { name: /active listings/i }));

    await waitFor(() => {
      expect(apiMocks.getCards).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'listed' }),
      );
    });

    expect(
      screen.getByRole('heading', { level: 2, name: 'Active Listings' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
  });

  it('requests globally sorted cards and resets to page 1 when Name sort is clicked', async () => {
    const user = userEvent.setup();
    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          productLine: 'Riftbound',
          setName: 'Origins',
          productName: 'Against the Odds',
          title: null,
          number: '001',
          rarity: 'Common',
          condition: 'Near Mint',
          quantity: 1,
          status: 'matched',
          marketPrice: '1.00',
          listingPrice: '0.98',
          floorPriceCents: null,
          isFoilPrice: false,
          photoUrl: null,
          notes: null,
          lastCheckedAt: null,
          importedAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ],
      total: 51,
      page: 1,
      limit: 50,
    });

    render(<App />);

    await waitFor(() => {
      expect(apiMocks.getCards).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 50 }),
      );
    });

    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(apiMocks.getCards).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      );
    });

    await user.click(screen.getByRole('columnheader', { name: /^Name$/ }));

    await waitFor(() => {
      expect(apiMocks.getCards).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          sortField: 'productName',
          sortDirection: 'asc',
        }),
      );
    });
  });

  it('switches to Sales History mode and requests sales data', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('tab', { name: /sales history/i }));

    await waitFor(() => {
      expect(apiMocks.getSales).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 50,
          search: undefined,
        }),
      );
      expect(apiMocks.getSalesStats).toHaveBeenCalled();
    });

    expect(
      screen.getByRole('heading', { level: 2, name: 'Sales History' }),
    ).toBeTruthy();
  });

  it('fetches pipeline when switching to sales-history view', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('tab', { name: /sales history/i }));

    await waitFor(() => {
      expect(apiMocks.getSalesPipeline).toHaveBeenCalled();
    });
  });

  it('passes orderStatus filter to getSales when pipeline status is clicked', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('tab', { name: /sales history/i }));

    await waitFor(() => {
      expect(apiMocks.getSalesPipeline).toHaveBeenCalled();
    });

    // Click the 'pending' pipeline card
    await user.click(screen.getByText('pending'));

    await waitFor(() => {
      expect(apiMocks.getSales).toHaveBeenLastCalledWith(
        expect.objectContaining({ orderStatus: 'pending' }),
      );
    });
  });

  it('opens shipment modal when ship button clicked and calls createShipment on submit', async () => {
    const user = userEvent.setup();
    apiMocks.getSales.mockResolvedValue({
      sales: [
        {
          id: 42,
          cardId: 1,
          tcgplayerOrderId: 'ORD-1',
          quantitySold: 1,
          salePriceCents: 500,
          buyerName: 'Buyer',
          orderStatus: 'confirmed',
          soldAt: '2026-04-01T00:00:00Z',
          notes: null,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
          cardProductName: 'Test Card',
          cardSetName: 'Origins',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    render(<App />);

    await user.click(screen.getByRole('tab', { name: /sales history/i }));

    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeTruthy();
    });

    await user.click(screen.getByTitle('Record shipment'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Carrier'), 'USPS');
    await user.click(within(dialog).getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(apiMocks.createShipment).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ carrier: 'USPS' }),
      );
    });
  });

  it('renders Sold filter pill and clicking it fetches cards with status=sold', async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(apiMocks.getCards).toHaveBeenCalled();
    });

    const soldButton = screen.getByRole('button', { name: 'Sold' });
    expect(soldButton).toBeTruthy();

    await user.click(soldButton);

    await waitFor(() => {
      expect(apiMocks.getCards).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'sold' }),
      );
    });
  });

  it('refreshes sales and pipeline after shipment save', async () => {
    const user = userEvent.setup();
    apiMocks.getSales.mockResolvedValue({
      sales: [
        {
          id: 10,
          cardId: 1,
          tcgplayerOrderId: null,
          quantitySold: 1,
          salePriceCents: 200,
          buyerName: null,
          orderStatus: 'confirmed',
          soldAt: '2026-04-01T00:00:00Z',
          notes: null,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
          cardProductName: 'Card A',
          cardSetName: 'Set A',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    render(<App />);

    await user.click(screen.getByRole('tab', { name: /sales history/i }));

    await waitFor(() => {
      expect(screen.getByText('Card A')).toBeTruthy();
    });

    // Clear call counts before ship action
    apiMocks.getSales.mockClear();
    apiMocks.getSalesPipeline.mockClear();
    apiMocks.getSalesStats.mockClear();

    await user.click(screen.getByTitle('Record shipment'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    const dialog2 = screen.getByRole('dialog');
    await user.click(within(dialog2).getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(apiMocks.createShipment).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(apiMocks.getSales).toHaveBeenCalled();
      expect(apiMocks.getSalesPipeline).toHaveBeenCalled();
      expect(apiMocks.getSalesStats).toHaveBeenCalled();
    });
  });
});

describe('App performance view integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    apiMocks.getCards.mockResolvedValue({
      cards: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    apiMocks.getStats.mockResolvedValue({
      total: 0,
      pending: 0,
      matched: 0,
      listed: 0,
      gift: 0,
      needs_attention: 0,
      sold: 0,
      error: 0,
    });
    apiMocks.getPriceCheckStatus.mockResolvedValue({
      enabled: true,
      intervalHours: 12,
      thresholdPercent: 2,
      listedPriceAttentionThresholdPercent: 10,
      running: false,
      lastRun: null,
    });

    apiMocks.getExpenses.mockResolvedValue({
      expenses: [expenseFixture],
      total: 1,
      page: 1,
      limit: 50,
    });
    apiMocks.getPerformanceSummary.mockResolvedValue(performanceSummaryFixture);
    apiMocks.getExpenseSettings.mockResolvedValue(expenseSettingsFixture);

    apiMocks.createExpense.mockResolvedValue(expenseFixture);
    apiMocks.updateExpense.mockResolvedValue(expenseFixture);
    apiMocks.deleteExpense.mockResolvedValue(undefined);
    apiMocks.updateExpenseSettings.mockResolvedValue(expenseSettingsFixture);
  });

  it('shows a Performance tab in the tab bar', () => {
    render(<App />);

    expect(screen.getByRole('tab', { name: /performance/i })).toBeTruthy();
  });

  it('clicking Performance tab fetches performance summary, expenses, and settings', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('tab', { name: /performance/i }));

    await waitFor(() => {
      expect(apiMocks.getPerformanceSummary).toHaveBeenCalled();
      expect(apiMocks.getExpenses).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 50 }),
      );
      expect(apiMocks.getExpenseSettings).toHaveBeenCalled();
    });
  });

  it('renders summary, settings, and expenses table in Performance view', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('tab', { name: /performance/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Performance' })).toBeTruthy();
    });

    expect(screen.getByText(/Profit & Loss/i)).toBeTruthy();
    expect(screen.getByText(/Expense Settings/i)).toBeTruthy();
    expect(screen.getByText('USPS postage')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add Expense/i })).toBeTruthy();
  });

  it('creating an expense calls createExpense and refreshes expenses + summary', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('tab', { name: /performance/i }));

    await waitFor(() => {
      expect(screen.getByText('USPS postage')).toBeTruthy();
    });

    apiMocks.getExpenses.mockClear();
    apiMocks.getPerformanceSummary.mockClear();

    await user.click(screen.getByRole('button', { name: /Add Expense/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /create expense/i })).toBeTruthy();
    });

    const expenseDialog = screen.getByRole('dialog', { name: /create expense/i });
    await user.type(within(expenseDialog).getByLabelText(/Amount \(\$\)/i), '1.25');
    await user.selectOptions(
      within(expenseDialog).getByLabelText('Category'),
      'shipping',
    );

    await user.click(within(expenseDialog).getByRole('button', { name: /Save Expense/i }));

    await waitFor(() => {
      expect(apiMocks.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 125,
          category: 'shipping',
        }),
      );
    });

    await waitFor(() => {
      expect(apiMocks.getExpenses).toHaveBeenCalled();
      expect(apiMocks.getPerformanceSummary).toHaveBeenCalled();
    });
  });

  it('deleting an expense calls deleteExpense and refreshes expenses + summary', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<App />);

    await user.click(screen.getByRole('tab', { name: /performance/i }));

    await waitFor(() => {
      expect(screen.getByText('USPS postage')).toBeTruthy();
    });

    apiMocks.getExpenses.mockClear();
    apiMocks.getPerformanceSummary.mockClear();

    await user.click(screen.getByTitle('Delete expense'));

    await waitFor(() => {
      expect(apiMocks.deleteExpense).toHaveBeenCalledWith(42);
    });

    await waitFor(() => {
      expect(apiMocks.getExpenses).toHaveBeenCalled();
      expect(apiMocks.getPerformanceSummary).toHaveBeenCalled();
    });

    confirmSpy.mockRestore();
  });

  it('saving settings calls updateExpenseSettings and refreshes settings', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('tab', { name: /performance/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Settings/i })).toBeTruthy();
    });

    apiMocks.getExpenseSettings.mockClear();

    await user.click(screen.getByRole('button', { name: /Save Settings/i }));

    await waitFor(() => {
      expect(apiMocks.updateExpenseSettings).toHaveBeenCalledWith(
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

    await waitFor(() => {
      expect(apiMocks.getExpenseSettings).toHaveBeenCalled();
    });
  });
});

describe('App record sale + bulk sell integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    apiMocks.getCards.mockResolvedValue({
      cards: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    apiMocks.getStats.mockResolvedValue({
      total: 0,
      pending: 0,
      matched: 0,
      listed: 0,
      gift: 0,
      needs_attention: 0,
      sold: 0,
      error: 0,
    });
    apiMocks.getPriceCheckStatus.mockResolvedValue({
      enabled: true,
      intervalHours: 12,
      thresholdPercent: 2,
      listedPriceAttentionThresholdPercent: 10,
      running: false,
      lastRun: null,
    });
    apiMocks.createSale.mockResolvedValue({
      id: 1,
      cardId: 1,
      tcgplayerOrderId: null,
      quantitySold: 1,
      salePriceCents: 200,
      buyerName: null,
      orderStatus: 'pending',
      soldAt: '2026-04-01T00:00:00Z',
      notes: null,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
      cardProductName: 'Card A',
      cardSetName: 'Origins',
    });
    apiMocks.getExpenses.mockResolvedValue({
      expenses: [expenseFixture],
      total: 1,
      page: 1,
      limit: 50,
    });
    apiMocks.getPerformanceSummary.mockResolvedValue(performanceSummaryFixture);
    apiMocks.getExpenseSettings.mockResolvedValue(expenseSettingsFixture);
    apiMocks.createExpense.mockResolvedValue(expenseFixture);
    apiMocks.updateExpense.mockResolvedValue(expenseFixture);
    apiMocks.deleteExpense.mockResolvedValue(undefined);
    apiMocks.updateExpenseSettings.mockResolvedValue(expenseSettingsFixture);
  });

  it('record sale handler calls createSale and refreshes data', async () => {
    const user = userEvent.setup();
    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          productLine: 'Riftbound',
          setName: 'Origins',
          productName: 'Test Card',
          title: null,
          number: '001',
          rarity: 'Common',
          condition: 'Near Mint',
          quantity: 1,
          status: 'listed',
          marketPrice: '2.00',
          listingPrice: '1.96',
          floorPriceCents: null,
          isFoilPrice: false,
          photoUrl: null,
          notes: null,
          lastCheckedAt: null,
          importedAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeTruthy();
    });

    // Open row actions menu and click Record Sale
    await user.click(screen.getByRole('button', { name: /actions for test card/i }));
    await user.click(screen.getByRole('menuitem', { name: /record sale/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /record sale/i })).toBeTruthy();
    });

    const dialog = screen.getByRole('dialog', { name: /record sale/i });
    await user.click(within(dialog).getByRole('button', { name: /record sale/i }));

    await waitFor(() => {
      expect(apiMocks.createSale).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: 1,
          quantitySold: 1,
          salePriceCents: 196,
        }),
      );
    });

    // Should refresh cards and stats
    await waitFor(() => {
      // getCards called at least twice: initial load + refresh
      expect(apiMocks.getCards.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(apiMocks.getStats.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('uses expense settings autoRecordSaleExpenses as default for sale modal', async () => {
    const user = userEvent.setup();
    apiMocks.getExpenseSettings.mockResolvedValue({
      ...expenseSettingsFixture,
      autoRecordSaleExpenses: true,
    });

    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          productLine: 'Riftbound',
          setName: 'Origins',
          productName: 'Test Card',
          title: null,
          number: '001',
          rarity: 'Common',
          condition: 'Near Mint',
          quantity: 1,
          status: 'listed',
          marketPrice: '2.00',
          listingPrice: '1.96',
          floorPriceCents: null,
          isFoilPrice: false,
          photoUrl: null,
          notes: null,
          lastCheckedAt: null,
          importedAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeTruthy();
    });

    await user.click(screen.getByRole('tab', { name: /performance/i }));

    await waitFor(() => {
      expect(apiMocks.getExpenseSettings).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('tab', { name: /active listings/i }));

    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /actions for test card/i }));
    await user.click(screen.getByRole('menuitem', { name: /record sale/i }));

    const dialog = screen.getByRole('dialog', { name: /record sale/i });
    const checkbox = within(dialog).getByRole('checkbox', {
      name: /apply estimated expenses/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    await user.click(within(dialog).getByRole('button', { name: /record sale/i }));

    await waitFor(() => {
      expect(apiMocks.createSale).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: 1,
          applyEstimatedExpenses: true,
        }),
      );
    });
  });

  it('bulk sell handler calls createSale for each card', async () => {
    const user = userEvent.setup();
    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          productLine: 'Riftbound',
          setName: 'Origins',
          productName: 'Card A',
          title: null,
          number: '001',
          rarity: 'Common',
          condition: 'Near Mint',
          quantity: 1,
          status: 'listed',
          marketPrice: '1.00',
          listingPrice: '0.98',
          floorPriceCents: null,
          isFoilPrice: false,
          photoUrl: null,
          notes: null,
          lastCheckedAt: null,
          importedAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
        {
          id: 2,
          tcgplayerId: 101,
          productLine: 'Riftbound',
          setName: 'Origins',
          productName: 'Card B',
          title: null,
          number: '002',
          rarity: 'Rare',
          condition: 'Near Mint',
          quantity: 1,
          status: 'listed',
          marketPrice: '2.00',
          listingPrice: '1.96',
          floorPriceCents: null,
          isFoilPrice: false,
          photoUrl: null,
          notes: null,
          lastCheckedAt: null,
          importedAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 50,
    });

    render(<App />);

    // Switch to Active Listings to enable sell flow
    await user.click(screen.getByRole('tab', { name: /active listings/i }));

    await waitFor(() => {
      expect(screen.getByText('Card A')).toBeTruthy();
    });

    // Select all using header checkbox
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    await user.click(headerCheckbox);

    await user.click(screen.getByText(/attach 2 to order/i));

    const dialog = screen.getByRole('dialog', { name: /bulk sell/i });
    await user.click(within(dialog).getByRole('button', { name: /attach to order/i }));

    await waitFor(() => {
      expect(apiMocks.createSale).toHaveBeenCalledTimes(2);
    });
  });

  it('bulk sell with partial failure throws error with summary message', async () => {
    const user = userEvent.setup();
    // First call succeeds, second fails
    apiMocks.createSale
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(new Error('Network error'));

    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          productLine: 'Riftbound',
          setName: 'Origins',
          productName: 'Card A',
          title: null,
          number: '001',
          rarity: 'Common',
          condition: 'Near Mint',
          quantity: 1,
          status: 'listed',
          marketPrice: '1.00',
          listingPrice: '0.98',
          floorPriceCents: null,
          isFoilPrice: false,
          photoUrl: null,
          notes: null,
          lastCheckedAt: null,
          importedAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
        {
          id: 2,
          tcgplayerId: 101,
          productLine: 'Riftbound',
          setName: 'Origins',
          productName: 'Card B',
          title: null,
          number: '002',
          rarity: 'Rare',
          condition: 'Near Mint',
          quantity: 1,
          status: 'listed',
          marketPrice: '2.00',
          listingPrice: '1.96',
          floorPriceCents: null,
          isFoilPrice: false,
          photoUrl: null,
          notes: null,
          lastCheckedAt: null,
          importedAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 50,
    });

    render(<App />);

    // Switch to Active Listings
    await user.click(screen.getByRole('tab', { name: /active listings/i }));

    await waitFor(() => {
      expect(screen.getByText('Card A')).toBeTruthy();
    });

    // Select all
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    await user.click(headerCheckbox);

    await user.click(screen.getByText(/attach 2 to order/i));

    const dialog = screen.getByRole('dialog', { name: /bulk sell/i });
    await user.click(within(dialog).getByRole('button', { name: /attach to order/i }));

    // The error message should appear in the modal since BulkSellModal catches errors
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/1 of 2 sales recorded.*1 failed/i);
    });
  });

  it('enableSellFlow is true when active-listings view is active', async () => {
    const user = userEvent.setup();
    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          productLine: 'Riftbound',
          setName: 'Origins',
          productName: 'Listed Card',
          title: null,
          number: '001',
          rarity: 'Common',
          condition: 'Near Mint',
          quantity: 1,
          status: 'listed',
          marketPrice: '1.00',
          listingPrice: '0.98',
          floorPriceCents: null,
          isFoilPrice: false,
          photoUrl: null,
          notes: null,
          lastCheckedAt: null,
          importedAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    render(<App />);

    // In inventory view (default), listed card checkbox should be disabled
    await waitFor(() => {
      expect(screen.getByText('Listed Card')).toBeTruthy();
    });

    const rows1 = screen.getAllByRole('row');
    const listedRow1 = rows1[1];
    expect(within(listedRow1).getByRole('checkbox')).toBeDisabled();

    // Switch to Active Listings
    await user.click(screen.getByRole('tab', { name: /active listings/i }));

    await waitFor(() => {
      expect(screen.getByText('Listed Card')).toBeTruthy();
    });

    // Now listed card checkbox should be enabled
    const rows2 = screen.getAllByRole('row');
    const listedRow2 = rows2[1];
    expect(within(listedRow2).getByRole('checkbox')).not.toBeDisabled();
  });
});
