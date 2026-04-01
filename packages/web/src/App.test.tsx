import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

const apiMocks = vi.hoisted(() => ({
  getCards: vi.fn(),
  getStats: vi.fn(),
  getPriceCheckStatus: vi.fn(),
  updatePriceCheckSettings: vi.fn(),
  getSales: vi.fn(),
  getSalesStats: vi.fn(),
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
});
