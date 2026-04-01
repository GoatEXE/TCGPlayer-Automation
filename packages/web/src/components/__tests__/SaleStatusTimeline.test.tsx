import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SaleStatusTimeline } from '../SaleStatusTimeline';
import type { SaleStatusHistoryEntry, Shipment } from '../../api/types';

const mockShipment: Shipment = {
  id: 10,
  saleId: 5,
  carrier: 'USPS',
  trackingNumber: '9400111899223',
  shippedAt: '2026-03-31T15:00:00.000Z',
  deliveredAt: '2026-04-02T10:00:00.000Z',
  notes: 'Left at PO',
  createdAt: '2026-03-31T15:00:00.000Z',
  updatedAt: '2026-04-02T10:00:00.000Z',
};

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

  it('renders shipment details when shipment is provided', () => {
    render(
      <SaleStatusTimeline history={mockHistory} shipment={mockShipment} />,
    );

    expect(screen.getByText('USPS')).toBeTruthy();
    expect(screen.getByText('9400111899223')).toBeTruthy();
    expect(screen.getByText('Left at PO')).toBeTruthy();
  });

  it('renders shipped and delivered dates from shipment', () => {
    const { container } = render(
      <SaleStatusTimeline history={[]} shipment={mockShipment} />,
    );

    const shipmentSection = container.querySelector('.timeline-shipment');
    expect(shipmentSection).toBeTruthy();

    const times = shipmentSection!.querySelectorAll('time');
    expect(times.length).toBe(2);
    expect(times[0].getAttribute('datetime')).toBe('2026-03-31T15:00:00.000Z');
    expect(times[1].getAttribute('datetime')).toBe('2026-04-02T10:00:00.000Z');
  });

  it('omits delivered date when deliveredAt is null', () => {
    const shipmentNoDelivery = { ...mockShipment, deliveredAt: null };
    const { container } = render(
      <SaleStatusTimeline history={[]} shipment={shipmentNoDelivery} />,
    );

    const shipmentSection = container.querySelector('.timeline-shipment');
    expect(shipmentSection).toBeTruthy();

    const times = shipmentSection!.querySelectorAll('time');
    expect(times.length).toBe(1);
  });

  it('does not render shipment section when shipment is not provided', () => {
    const { container } = render(<SaleStatusTimeline history={mockHistory} />);

    expect(container.querySelector('.timeline-shipment')).toBeNull();
  });

  it('renders shipment with no carrier or tracking gracefully', () => {
    const minimalShipment: Shipment = {
      ...mockShipment,
      carrier: null,
      trackingNumber: null,
      notes: null,
      deliveredAt: null,
    };
    const { container } = render(
      <SaleStatusTimeline history={[]} shipment={minimalShipment} />,
    );

    const shipmentSection = container.querySelector('.timeline-shipment');
    expect(shipmentSection).toBeTruthy();
  });
});
