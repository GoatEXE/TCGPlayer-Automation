import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
}));

vi.mock('./api/client', () => ({
  api: apiMocks,
}));

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
      error: 0,
    });
    apiMocks.getPriceCheckStatus.mockResolvedValue({
      enabled: true,
      intervalHours: 12,
      thresholdPercent: 2,
      running: false,
      lastRun: null,
    });
    apiMocks.updatePriceCheckSettings.mockResolvedValue({
      enabled: true,
      intervalHours: 12,
      thresholdPercent: 2,
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
