import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SalesStatsBar } from '../SalesStatsBar';
import type { SalesStats } from '../../api/types';

const mockStats: SalesStats = {
  totalSales: 15,
  totalRevenueCents: 7525,
  averageSaleCents: 502,
  activeListingCount: 42,
  totalListedCount: 42,
};

describe('SalesStatsBar', () => {
  it('renders loading state', () => {
    render(<SalesStatsBar stats={null} loading={true} />);
    expect(screen.getByText('Loading stats...')).toBeTruthy();
  });

  it('returns null when not loading and stats is null', () => {
    const { container } = render(
      <SalesStatsBar stats={null} loading={false} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders total listed count', () => {
    render(<SalesStatsBar stats={{ ...mockStats, totalListedCount: 50 }} />);
    expect(screen.getByText('50')).toBeTruthy();
    expect(screen.getByText('total listed')).toBeTruthy();
  });

  it('renders total revenue formatted as dollars', () => {
    render(<SalesStatsBar stats={mockStats} />);
    expect(screen.getByText('$75.25')).toBeTruthy();
    expect(screen.getByText('revenue')).toBeTruthy();
  });

  it('renders average sale price formatted as dollars', () => {
    render(<SalesStatsBar stats={mockStats} />);
    expect(screen.getByText('$5.02')).toBeTruthy();
    expect(screen.getByText('avg sale')).toBeTruthy();
  });

  it('renders active listing count', () => {
    render(<SalesStatsBar stats={{ ...mockStats, activeListingCount: 38 }} />);
    expect(screen.getByText('38')).toBeTruthy();
    expect(screen.getByText('active listings')).toBeTruthy();
  });

  it('renders zero values correctly', () => {
    const zeroStats: SalesStats = {
      totalSales: 0,
      totalRevenueCents: 0,
      averageSaleCents: 0,
      activeListingCount: 0,
      totalListedCount: 0,
    };
    render(<SalesStatsBar stats={zeroStats} />);
    // Both revenue and avg sale render $0.00
    const dollarZeros = screen.getAllByText('$0.00');
    expect(dollarZeros).toHaveLength(2);
    // totalListedCount and activeListingCount both render 0
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });
});
