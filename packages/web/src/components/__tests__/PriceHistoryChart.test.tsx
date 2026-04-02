import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PriceHistoryChart } from '../PriceHistoryChart';
import type { PriceHistoryEntry } from '../../api/types';

function makeEntry(
  id: number,
  checkedAt: string,
  newMarketPrice: string | null,
): PriceHistoryEntry {
  return {
    id,
    cardId: 42,
    checkedAt,
    source: 'scheduled',
    previousMarketPrice: null,
    newMarketPrice,
    previousListingPrice: null,
    newListingPrice: null,
    driftPercent: null,
    previousStatus: 'listed',
    newStatus: 'listed',
  };
}

describe('PriceHistoryChart', () => {
  it('renders empty state when no history provided', () => {
    render(<PriceHistoryChart history={[]} />);

    expect(screen.getByText('No chart data available')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders empty state when all market prices are null', () => {
    const entries = [
      makeEntry(1, '2026-04-01T10:00:00Z', null),
      makeEntry(2, '2026-04-01T11:00:00Z', null),
    ];

    render(<PriceHistoryChart history={entries} />);

    expect(screen.getByText('No chart data available')).toBeInTheDocument();
  });

  it('renders an SVG chart when valid data exists', () => {
    const entries = [
      makeEntry(1, '2026-04-01T10:00:00Z', '0.25'),
      makeEntry(2, '2026-04-01T11:00:00Z', '0.30'),
      makeEntry(3, '2026-04-01T12:00:00Z', '0.28'),
    ];

    render(<PriceHistoryChart history={entries} />);

    const svg = screen.getByRole('img');
    expect(svg).toBeInTheDocument();
    expect(svg.tagName).toBe('svg');
  });

  it('renders a dot for each valid data point', () => {
    const entries = [
      makeEntry(1, '2026-04-01T10:00:00Z', '0.25'),
      makeEntry(2, '2026-04-01T11:00:00Z', '0.30'),
      makeEntry(3, '2026-04-01T12:00:00Z', '0.28'),
    ];

    const { container } = render(<PriceHistoryChart history={entries} />);

    const dots = container.querySelectorAll('.chart-dot');
    expect(dots).toHaveLength(3);
  });

  it('limits to 10 most recent points when more exist', () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      makeEntry(
        i + 1,
        `2026-04-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        (0.2 + i * 0.01).toFixed(2),
      ),
    );

    const { container } = render(<PriceHistoryChart history={entries} />);

    const dots = container.querySelectorAll('.chart-dot');
    expect(dots).toHaveLength(10);
  });

  it('orders points oldest-to-newest on x-axis (leftmost is oldest)', () => {
    // API returns newest-first; chart should flip to oldest-first
    const entries = [
      makeEntry(3, '2026-04-03T10:00:00Z', '0.35'), // newest
      makeEntry(2, '2026-04-02T10:00:00Z', '0.30'),
      makeEntry(1, '2026-04-01T10:00:00Z', '0.25'), // oldest
    ];

    const { container } = render(<PriceHistoryChart history={entries} />);

    const dots = container.querySelectorAll('.chart-dot');
    expect(dots).toHaveLength(3);

    // First dot (oldest, $0.25) should have the smallest cx
    const cxValues = Array.from(dots).map((d) => Number(d.getAttribute('cx')));
    expect(cxValues[0]).toBeLessThan(cxValues[1]);
    expect(cxValues[1]).toBeLessThan(cxValues[2]);
  });

  it('skips entries with null market price but charts the rest', () => {
    const entries = [
      makeEntry(1, '2026-04-01T10:00:00Z', '0.25'),
      makeEntry(2, '2026-04-01T11:00:00Z', null), // no price
      makeEntry(3, '2026-04-01T12:00:00Z', '0.30'),
    ];

    const { container } = render(<PriceHistoryChart history={entries} />);

    const dots = container.querySelectorAll('.chart-dot');
    expect(dots).toHaveLength(2);
  });

  it('renders a polyline connecting the points', () => {
    const entries = [
      makeEntry(1, '2026-04-01T10:00:00Z', '0.25'),
      makeEntry(2, '2026-04-01T11:00:00Z', '0.30'),
    ];

    const { container } = render(<PriceHistoryChart history={entries} />);

    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
    expect(polyline!.getAttribute('points')).toBeTruthy();
  });

  it('renders y-axis price labels', () => {
    const entries = [
      makeEntry(1, '2026-04-01T10:00:00Z', '0.25'),
      makeEntry(2, '2026-04-01T11:00:00Z', '0.50'),
    ];

    render(<PriceHistoryChart history={entries} />);

    // Should have at least min and max labels
    expect(screen.getByText('$0.25')).toBeInTheDocument();
    expect(screen.getByText('$0.50')).toBeInTheDocument();
  });

  it('renders a single dot when only one data point exists', () => {
    const entries = [makeEntry(1, '2026-04-01T10:00:00Z', '1.00')];

    const { container } = render(<PriceHistoryChart history={entries} />);

    const dots = container.querySelectorAll('.chart-dot');
    expect(dots).toHaveLength(1);

    // No polyline needed for a single point
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeInTheDocument();
  });

  it('has accessible role and label', () => {
    const entries = [
      makeEntry(1, '2026-04-01T10:00:00Z', '0.25'),
      makeEntry(2, '2026-04-01T11:00:00Z', '0.30'),
    ];

    render(<PriceHistoryChart history={entries} />);

    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('aria-label', 'Market price trend chart');
  });
});
