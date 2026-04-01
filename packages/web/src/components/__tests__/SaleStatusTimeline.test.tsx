import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SaleStatusTimeline } from '../SaleStatusTimeline';
import type { SaleStatusHistoryEntry } from '../../api/types';

const mockHistory: SaleStatusHistoryEntry[] = [
  {
    id: 1,
    previousStatus: 'pending',
    newStatus: 'confirmed',
    source: 'manual',
    note: null,
    changedAt: '2026-03-30T10:00:00.000Z',
  },
  {
    id: 2,
    previousStatus: 'confirmed',
    newStatus: 'shipped',
    source: 'manual',
    note: 'Shipped via USPS',
    changedAt: '2026-03-31T14:30:00.000Z',
  },
];

describe('SaleStatusTimeline', () => {
  it('renders empty state when history is empty', () => {
    render(<SaleStatusTimeline history={[]} />);
    expect(screen.getByText('No status changes recorded.')).toBeTruthy();
  });

  it('renders timeline entries with status transitions', () => {
    render(<SaleStatusTimeline history={mockHistory} />);

    expect(screen.getByText('pending')).toBeTruthy();
    // 'confirmed' appears as both newStatus of entry 1 and previousStatus of entry 2
    expect(screen.getAllByText('confirmed')).toHaveLength(2);
    expect(screen.getByText('shipped')).toBeTruthy();
  });

  it('renders an initial marker when previousStatus is null', () => {
    const initialEntry: SaleStatusHistoryEntry = {
      ...mockHistory[0],
      previousStatus: null,
    };

    render(<SaleStatusTimeline history={[initialEntry]} />);
    expect(screen.getByText('initial')).toBeTruthy();
  });

  it('displays the source for each entry', () => {
    render(<SaleStatusTimeline history={mockHistory} />);

    const sources = screen.getAllByText('manual');
    expect(sources.length).toBe(2);
  });

  it('displays note when present', () => {
    render(<SaleStatusTimeline history={mockHistory} />);

    expect(screen.getByText('Shipped via USPS')).toBeTruthy();
  });

  it('does not render note element when note is null', () => {
    render(<SaleStatusTimeline history={[mockHistory[0]]} />);

    expect(screen.queryByText('Shipped via USPS')).toBeNull();
  });

  it('renders timestamps for each entry', () => {
    const { container } = render(<SaleStatusTimeline history={mockHistory} />);

    const timeElements = container.querySelectorAll('time');
    expect(timeElements.length).toBe(2);
    expect(timeElements[0].getAttribute('datetime')).toBe(
      '2026-03-30T10:00:00.000Z',
    );
    expect(timeElements[1].getAttribute('datetime')).toBe(
      '2026-03-31T14:30:00.000Z',
    );
  });
});
