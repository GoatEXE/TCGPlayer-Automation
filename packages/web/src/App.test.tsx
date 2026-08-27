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
  getCollections: vi.fn(),
  getCollectionSellability: vi.fn(),
  updateCatalogCardMetadata: vi.fn(),
  previewCollectionImport: vi.fn(),
  commitCollectionImport: vi.fn(),
  previewCollectionTransferToInventory: vi.fn(),
  commitCollectionTransferToInventory: vi.fn(),
  clearCollection: vi.fn(),
  importCards: vi.fn(),
  createSale: vi.fn(),
  createBulkOrder: vi.fn(),
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
  defaultShippingCollectedCents: 149,
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
      listedPriceAttentionMinDiffCents: 5,
      running: false,
      lastRun: null,
    });
    apiMocks.updatePriceCheckSettings.mockResolvedValue({
      enabled: true,
      intervalHours: 12,
      thresholdPercent: 2,
      listedPriceAttentionThresholdPercent: 10,
      listedPriceAttentionMinDiffCents: 5,
      running: false,
      lastRun: null,
    });
    apiMocks.getSales.mockResolvedValue({
      orders: [],
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
    apiMocks.getCollections.mockResolvedValue({
      collections: [{ id: 1, name: 'Default', purpose: 'owned' }],
    });
    apiMocks.getCollectionSellability.mockResolvedValue({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      summary: {
        sellNormalQty: 0,
        sellFoilQty: 0,
        excludedCards: 0,
        needsClassificationCards: 0,
      },
      rows: [],
    });
    apiMocks.updateCatalogCardMetadata.mockResolvedValue({ card: {} });
    apiMocks.previewCollectionImport.mockResolvedValue({});
    apiMocks.commitCollectionImport.mockResolvedValue({});
    apiMocks.previewCollectionTransferToInventory.mockResolvedValue({
      summary: {
        requestedItems: 0,
        transferableItems: 0,
        blockedItems: 0,
        transferQuantity: 0,
        createRows: 0,
        updateRows: 0,
        warnings: [],
        blockers: [],
      },
      items: [],
    });
    apiMocks.commitCollectionTransferToInventory.mockResolvedValue({
      summary: {
        requestedItems: 0,
        transferableItems: 0,
        blockedItems: 0,
        transferQuantity: 0,
        createRows: 0,
        updateRows: 0,
        warnings: [],
        blockers: [],
      },
      items: [],
    });
    apiMocks.clearCollection.mockResolvedValue({ deleted: 0 });
    apiMocks.importCards.mockResolvedValue({
      imported: 0,
      updated: 0,
      errors: [],
      cards: [],
    });
    apiMocks.createBulkOrder.mockResolvedValue({ sales: [] });
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

  it('does not expose the retired web Scan / Add Cards workflow', () => {
    render(<App />);

    expect(
      screen.queryByRole('tab', { name: /scan \/ add cards/i }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /start camera/i })).toBeNull();
    expect(screen.getByRole('tab', { name: /inventory/i })).toBeTruthy();
  });

  it('keeps legacy selling imports out of Inventory and exposes owned collection import from Collection', async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(apiMocks.getCards).toHaveBeenCalled();
    });
    expect(screen.queryByLabelText(/import to selling inventory/i)).toBeNull();
    expect(screen.queryByText(/drop csv or txt file here/i)).toBeNull();

    await user.click(screen.getByRole('tab', { name: /collection/i }));

    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: /import to owned collection/i,
      }),
    ).toBeTruthy();
    expect(screen.getByLabelText(/owned collection csv file/i)).toBeTruthy();
    expect(screen.queryByLabelText(/import to selling inventory/i)).toBeNull();
  });

  it('opens scheduler settings from the compact header button and restores focus on close', async () => {
    const user = userEvent.setup();

    render(<App />);

    const trigger = screen.getByRole('button', {
      name: 'Price Check Settings',
    });
    expect(trigger).toHaveAttribute('aria-label', 'Price Check Settings');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('title', 'Price Check Settings');
    expect(trigger).toHaveTextContent('⚙');
    expect(trigger).not.toHaveTextContent('Price Check Settings');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const dialog = await screen.findByRole('dialog', {
      name: /price check scheduler/i,
    });
    expect(within(dialog).getByLabelText('Interval (hours)')).toHaveValue(12);
    expect(within(dialog).getByText('No runs yet')).toBeTruthy();

    await user.click(
      within(dialog).getByRole('button', {
        name: /close price check settings/i,
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(trigger).toHaveFocus();
    });
  });

  it('replaces the Notifications tab with a bell that opens and restores focus from notification history', async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.queryByRole('tab', { name: /notifications/i })).toBeNull();
    expect(apiMocks.getNotificationEvents).not.toHaveBeenCalled();

    const trigger = screen.getByRole('button', { name: 'Notifications' });
    expect(trigger).toHaveAttribute('aria-label', 'Notifications');
    expect(trigger).toHaveAttribute('title', 'Notifications');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('🔔');
    expect(trigger).not.toHaveTextContent('Notifications');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const dialog = await screen.findByRole('dialog', {
      name: 'Notifications',
    });
    await waitFor(() => {
      expect(apiMocks.getNotificationEvents).toHaveBeenCalledWith(20);
    });
    expect(within(dialog).getByText('No notifications yet')).toBeTruthy();

    await user.click(
      within(dialog).getByRole('button', { name: /close notifications/i }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Notifications' }),
      ).toBeNull();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
    });
  });

  it('switches to Collection without mutating selling inventory', async () => {
    const user = userEvent.setup();

    apiMocks.getCollectionSellability.mockResolvedValue({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      summary: {
        sellNormalQty: 1,
        sellFoilQty: 0,
        excludedCards: 0,
        needsClassificationCards: 0,
      },
      rows: [
        {
          catalogCardId: 500,
          tcgProductId: 1500,
          productName: 'Collection Sell Candidate',
          title: null,
          setCode: 'ORG',
          setName: 'Origins',
          collectorNumber: '010',
          normalizedNumber: '010',
          rarity: 'Common',
          photoUrl: null,
          kind: 'normal',
          kindSource: 'explicit',
          normalQty: 4,
          foilQty: 0,
          totalQty: 4,
          keepTarget: 3,
          keepNormalQty: 3,
          keepFoilQty: 0,
          sellNormalQty: 1,
          sellFoilQty: 0,
          excluded: false,
          excludedReason: null,
          needsClassification: false,
          reasons: ['1 copy exceeds keep target.'],
          reasonCodes: ['over_cap'],
          primaryReasonCode: 'over_cap',
          opportunityType: 'over_cap',
          keepTargetSatisfiedByNormal: true,
        },
      ],
    });

    render(<App />);

    expect(screen.queryByLabelText(/import to selling inventory/i)).toBeNull();

    await user.click(screen.getByRole('tab', { name: /collection/i }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Collection' }),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/import to selling inventory/i)).toBeNull();
    expect(screen.getByText(/import to owned collection/i)).toBeTruthy();
    expect(
      screen.getByText(/never imports into selling inventory/i),
    ).toBeTruthy();
    expect(screen.getByText('Collection Sell Candidate')).toBeTruthy();
    expect(apiMocks.getCollections).toHaveBeenCalled();
    expect(apiMocks.getCollectionSellability).toHaveBeenCalledWith(1);
    expect(apiMocks.createSale).not.toHaveBeenCalled();
    expect(apiMocks.createBulkOrder).not.toHaveBeenCalled();
  });

  it('loads all Needs Attention cards for Review Pricing regardless of current table rows', async () => {
    const user = userEvent.setup();
    const displayedCard = {
      id: 1,
      tcgplayerId: 100,
      tcgProductId: null,
      productLine: 'Riftbound',
      setName: 'Origins',
      productName: 'Displayed Matched Card',
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
    };
    const reviewCard = {
      ...displayedCard,
      id: 2,
      tcgProductId: 685490,
      productName: 'Fetched Needs Attention Card',
      status: 'needs_attention',
      marketPrice: '2.50',
      listingPrice: '2.00',
    };

    apiMocks.getStats.mockResolvedValue({
      total: 2,
      pending: 0,
      matched: 1,
      listed: 0,
      gift: 0,
      needs_attention: 1,
      sold: 0,
      error: 0,
    });
    apiMocks.getCards.mockImplementation((params) => {
      if (params?.status === 'needs_attention') {
        return Promise.resolve({
          cards: [reviewCard],
          total: 1,
          page: 1,
          limit: 200,
        });
      }
      return Promise.resolve({
        cards: [displayedCard],
        total: 1,
        page: 1,
        limit: 50,
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Displayed Matched Card')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /review pricing/i }));

    const dialog = await screen.findByRole('dialog', {
      name: /pricing review/i,
    });
    expect(dialog).toHaveTextContent('Fetched Needs Attention Card');
    expect(apiMocks.getCards).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'needs_attention',
        page: 1,
        limit: 200,
      }),
    );
  });

  it('requests globally sorted cards and resets to page 1 when Name sort is clicked', async () => {
    const user = userEvent.setup();
    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          tcgProductId: null,
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

    expect(apiMocks.getNotificationEvents).not.toHaveBeenCalled();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Sales History' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search sales' })).toBeTruthy();
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
      orders: [
        {
          orderKey: 'order:ORD-1',
          tcgplayerOrderId: 'ORD-1',
          representativeSaleId: 42,
          buyerName: 'Buyer',
          orderStatus: 'confirmed',
          soldAt: '2026-04-01T00:00:00Z',
          notes: null,
          itemCount: 1,
          productSubtotalCents: 500,
          shippingCollectedCents: 0,
          totalCents: 500,
          shipment: null,
          lineItems: [
            {
              id: 42,
              cardId: 1,
              quantitySold: 1,
              lineItemType: 'sale',
              salePriceCents: 500,
              cardProductName: 'Test Card',
              cardSetName: 'Origins',
              cardCondition: 'Near Mint',
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    render(<App />);

    await user.click(screen.getByRole('tab', { name: /sales history/i }));

    await waitFor(() => {
      expect(screen.getByText('ORD-1')).toBeTruthy();
    });

    await user.click(
      screen.getByRole('button', { name: /actions for ORD-1/i }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Record shipment' }));

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

  it('resets to page 1 when search filter changes after pagination', async () => {
    const user = userEvent.setup();
    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          tcgProductId: null,
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
        expect.objectContaining({ page: 1 }),
      );
    });

    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(apiMocks.getCards).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      );
    });

    await user.type(
      screen.getByPlaceholderText(/search by card name/i),
      'Abandoned',
    );

    await waitFor(() => {
      expect(apiMocks.getCards).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, search: 'Abandoned' }),
      );
    });
  });

  it('does not render a Sold Inventory filter', async () => {
    render(<App />);

    await waitFor(() => {
      expect(apiMocks.getCards).toHaveBeenCalled();
    });

    expect(screen.queryByRole('button', { name: 'Sold' })).toBeNull();
  });

  it('hides terminal and legacy gift cards from the default Inventory All view', async () => {
    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          tcgProductId: null,
          productLine: 'Riftbound',
          setName: 'Origins',
          productName: 'Consumed Card',
          title: null,
          number: '001',
          rarity: 'Common',
          condition: 'Near Mint',
          quantity: 1,
          status: 'sold',
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
          tcgProductId: null,
          productLine: 'Riftbound',
          setName: 'Origins',
          productName: 'Legacy Gift Card',
          title: null,
          number: '002',
          rarity: 'Common',
          condition: 'Near Mint',
          quantity: 1,
          status: 'gift',
          marketPrice: '0.04',
          listingPrice: null,
          floorPriceCents: null,
          isFoilPrice: false,
          photoUrl: null,
          notes: null,
          lastCheckedAt: null,
          importedAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
        {
          id: 3,
          tcgplayerId: 102,
          tcgProductId: null,
          productLine: 'Riftbound',
          setName: 'Origins',
          productName: 'Active Card',
          title: null,
          number: '002',
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
      total: 3,
      page: 1,
      limit: 50,
    });

    render(<App />);

    expect(await screen.findByText('Active Card')).toBeTruthy();
    expect(screen.queryByText('Consumed Card')).toBeNull();
    expect(screen.queryByText('Legacy Gift Card')).toBeNull();
  });

  it('does not render terminal Sold or Gifted Inventory filters', async () => {
    render(<App />);

    await waitFor(() => {
      expect(apiMocks.getCards).toHaveBeenCalled();
    });

    expect(screen.queryByRole('button', { name: 'Sold' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gifted' })).toBeNull();
  });

  it('refreshes sales and pipeline after shipment save', async () => {
    const user = userEvent.setup();
    apiMocks.getSales.mockResolvedValue({
      orders: [
        {
          orderKey: 'sale:10',
          tcgplayerOrderId: null,
          representativeSaleId: 10,
          buyerName: null,
          orderStatus: 'confirmed',
          soldAt: '2026-04-01T00:00:00Z',
          notes: null,
          itemCount: 1,
          productSubtotalCents: 200,
          shippingCollectedCents: 149,
          totalCents: 349,
          shipment: null,
          lineItems: [
            {
              id: 10,
              cardId: 1,
              quantitySold: 1,
              lineItemType: 'sale',
              salePriceCents: 200,
              cardProductName: 'Card A',
              cardSetName: 'Set A',
              cardCondition: 'Near Mint',
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    render(<App />);

    await user.click(screen.getByRole('tab', { name: /sales history/i }));

    await waitFor(() => {
      expect(screen.getByText('Synthetic order #10')).toBeTruthy();
    });

    // Clear call counts before ship action
    apiMocks.getSales.mockClear();
    apiMocks.getSalesPipeline.mockClear();
    apiMocks.getSalesStats.mockClear();

    await user.click(
      screen.getByRole('button', { name: /actions for Synthetic order #10/i }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Record shipment' }));

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
      listedPriceAttentionMinDiffCents: 5,
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
      expect(
        screen.getByRole('heading', { level: 2, name: 'Performance' }),
      ).toBeTruthy();
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
      expect(
        screen.getByRole('dialog', { name: /create expense/i }),
      ).toBeTruthy();
    });

    const expenseDialog = screen.getByRole('dialog', {
      name: /create expense/i,
    });
    await user.type(
      within(expenseDialog).getByLabelText(/Amount \(\$\)/i),
      '1.25',
    );
    await user.selectOptions(
      within(expenseDialog).getByLabelText('Category'),
      'shipping',
    );

    await user.click(
      within(expenseDialog).getByRole('button', { name: /Save Expense/i }),
    );

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
      expect(
        screen.getByRole('button', { name: /Save Settings/i }),
      ).toBeTruthy();
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
      listedPriceAttentionMinDiffCents: 5,
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
          tcgProductId: null,
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
    await user.click(
      screen.getByRole('button', { name: /actions for test card/i }),
    );
    await user.click(screen.getByRole('menuitem', { name: /record sale/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /record sale/i })).toBeTruthy();
    });

    const dialog = screen.getByRole('dialog', { name: /record sale/i });
    await user.click(
      within(dialog).getByRole('button', { name: /record sale/i }),
    );

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

  it('uses expense settings defaultShippingCollectedCents for sale modal', async () => {
    const user = userEvent.setup();
    apiMocks.getExpenseSettings.mockResolvedValue({
      ...expenseSettingsFixture,
      defaultShippingCollectedCents: 249,
    });

    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          tcgProductId: null,
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

    await user.click(screen.getByRole('tab', { name: /inventory/i }));

    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeTruthy();
    });

    await user.click(
      screen.getByRole('button', { name: /actions for test card/i }),
    );
    await user.click(screen.getByRole('menuitem', { name: /record sale/i }));

    const dialog = screen.getByRole('dialog', { name: /record sale/i });
    const shippingInput = within(dialog).getByLabelText(
      /shipping collected/i,
    ) as HTMLInputElement;
    expect(shippingInput.value).toBe('2.49');
    expect(
      within(dialog).queryByRole('checkbox', {
        name: /apply estimated expenses/i,
      }),
    ).toBeNull();

    await user.type(
      within(dialog).getByLabelText(/TCGPlayer Order ID/i),
      'ORD-123',
    );
    await user.click(
      within(dialog).getByRole('button', { name: /record sale/i }),
    );

    await waitFor(() => {
      expect(apiMocks.createSale).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: 1,
          shippingCollectedCents: 249,
        }),
      );
    });
  });

  it('bulk sell handler calls createBulkOrder with paid lines', async () => {
    const user = userEvent.setup();
    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          tcgProductId: null,
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
          tcgProductId: null,
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

    await waitFor(() => {
      expect(screen.getByText('Card A')).toBeTruthy();
    });

    // Select all using header checkbox
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    await user.click(headerCheckbox);

    await user.click(screen.getByText(/attach 2 to order/i));

    const dialog = screen.getByRole('dialog', { name: /bulk sell/i });
    await user.type(
      within(dialog).getByLabelText(/tcgplayer order id/i),
      'ORD-123',
    );
    await user.click(
      within(dialog).getByRole('button', { name: /attach to order/i }),
    );

    await waitFor(() => {
      expect(apiMocks.createBulkOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          tcgplayerOrderId: 'ORD-123',
          orderStatus: 'confirmed',
          lines: [
            {
              cardId: 1,
              quantitySold: 1,
              salePriceCents: 98,
              lineItemType: 'sale',
            },
            {
              cardId: 2,
              quantitySold: 1,
              salePriceCents: 196,
              lineItemType: 'sale',
            },
          ],
        }),
      );
    });
  });

  it('Attach to Order uses selected listings as paid or gift lines without fetching a gift pool', async () => {
    const user = userEvent.setup();
    const listedCard = {
      id: 1,
      tcgplayerId: 100,
      tcgProductId: null,
      productLine: 'Riftbound',
      setName: 'Origins',
      productName: 'Listed Card',
      title: null,
      number: '001',
      rarity: 'Common',
      condition: 'Near Mint',
      quantity: 1,
      status: 'listed' as const,
      marketPrice: '1.00',
      listingPrice: '0.98',
      floorPriceCents: null,
      isFoilPrice: false,
      photoUrl: null,
      notes: null,
      lastCheckedAt: null,
      importedAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
    };
    apiMocks.getCards.mockResolvedValue({
      cards: [listedCard],
      total: 1,
      page: 1,
      limit: 50,
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText('Listed Card')).toBeTruthy());
    await user.click(screen.getByTitle('Select for attach to order'));
    await user.click(screen.getByText(/attach 1 to order/i));

    const dialog = await screen.findByRole('dialog', { name: /bulk sell/i });
    await user.selectOptions(
      within(dialog).getByLabelText(/line type for listed card/i),
      'gift',
    );
    await user.type(
      within(dialog).getByLabelText(/tcgplayer order id/i),
      'ORD-GIFT',
    );
    await user.click(
      within(dialog).getByRole('button', { name: /attach to order/i }),
    );

    await waitFor(() => {
      expect(apiMocks.createBulkOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          tcgplayerOrderId: 'ORD-GIFT',
          shippingCollectedCents: 0,
          lines: [
            {
              cardId: 1,
              quantitySold: 1,
              salePriceCents: 0,
              lineItemType: 'gift',
            },
          ],
        }),
      );
    });
    expect(apiMocks.getCards).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'gift' }),
    );
  });

  it('bulk sell failure shows backend error message', async () => {
    const user = userEvent.setup();
    apiMocks.createBulkOrder.mockRejectedValueOnce(new Error('Network error'));

    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          tcgProductId: null,
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
          tcgProductId: null,
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

    await waitFor(() => {
      expect(screen.getByText('Card A')).toBeTruthy();
    });

    // Select all
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    await user.click(headerCheckbox);

    await user.click(screen.getByText(/attach 2 to order/i));

    const dialog = screen.getByRole('dialog', { name: /bulk sell/i });
    await user.type(
      within(dialog).getByLabelText(/tcgplayer order id/i),
      'ORD-123',
    );
    await user.click(
      within(dialog).getByRole('button', { name: /attach to order/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/network error/i);
    });
  });

  it('Inventory All lets Ready to List cards use the bulk-listing selection control', async () => {
    const user = userEvent.setup();
    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          tcgProductId: null,
          productLine: 'Riftbound',
          setName: 'Origins',
          productName: 'Ready to List Card',
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
      total: 1,
      page: 1,
      limit: 50,
    });

    render(<App />);

    await screen.findByText('Ready to List Card');

    const checkbox = screen.getByTitle('Select for bulk listing');
    expect(checkbox).not.toBeDisabled();

    await user.click(checkbox);

    expect(
      screen.getByRole('button', { name: /mark 1 as listed/i }),
    ).toBeInTheDocument();
  });

  it('Inventory enables listed rows for attach-to-order selection', async () => {
    apiMocks.getCards.mockResolvedValue({
      cards: [
        {
          id: 1,
          tcgplayerId: 100,
          tcgProductId: null,
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

    await waitFor(() => {
      expect(screen.getByText('Listed Card')).toBeTruthy();
    });

    const rows = screen.getAllByRole('row');
    const listedRow = rows[1];
    expect(within(listedRow).getByRole('checkbox')).not.toBeDisabled();
  });
});
