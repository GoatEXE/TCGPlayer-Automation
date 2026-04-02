import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationHistoryPanel } from '../NotificationHistoryPanel';
import type { NotificationEvent } from '../../api/types';

const sampleEvents: NotificationEvent[] = [
  {
    id: 1,
    channel: 'telegram',
    eventType: 'sale_confirmed',
    message: 'Sale confirmed: Card A — $5.00',
    success: true,
    error: null,
    saleId: 10,
    cardId: null,
    tcgplayerOrderId: 'ORD-001',
    createdAt: '2026-04-01T14:30:00.000Z',
  },
  {
    id: 2,
    channel: 'telegram',
    eventType: 'order_shipped',
    message: 'Order shipped: ORD-002 via USPS',
    success: false,
    error: 'Telegram API timeout',
    saleId: 11,
    cardId: null,
    tcgplayerOrderId: 'ORD-002',
    createdAt: '2026-04-01T13:00:00.000Z',
  },
  {
    id: 3,
    channel: 'telegram',
    eventType: 'needs_attention',
    message: 'Card B has no market price',
    success: true,
    error: null,
    saleId: null,
    cardId: 42,
    tcgplayerOrderId: null,
    createdAt: '2026-04-01T12:00:00.000Z',
  },
];

describe('NotificationHistoryPanel', () => {
  it('renders loading state', () => {
    render(
      <NotificationHistoryPanel events={[]} loading={true} error={false} />,
    );

    expect(screen.getByText('Loading notifications…')).toBeTruthy();
  });

  it('renders empty state when no events exist', () => {
    render(
      <NotificationHistoryPanel events={[]} loading={false} error={false} />,
    );

    expect(screen.getByText('No notifications yet')).toBeTruthy();
  });

  it('renders error state', () => {
    render(
      <NotificationHistoryPanel events={[]} loading={false} error={true} />,
    );

    expect(
      screen.getByText('Failed to load notification history'),
    ).toBeTruthy();
  });

  it('renders events with key fields', () => {
    render(
      <NotificationHistoryPanel
        events={sampleEvents}
        loading={false}
        error={false}
      />,
    );

    // Event types displayed
    expect(screen.getByText('sale_confirmed')).toBeTruthy();
    expect(screen.getByText('order_shipped')).toBeTruthy();
    expect(screen.getByText('needs_attention')).toBeTruthy();

    // Message snippets
    expect(screen.getByText('Sale confirmed: Card A — $5.00')).toBeTruthy();
    expect(screen.getByText('Order shipped: ORD-002 via USPS')).toBeTruthy();
    expect(screen.getByText('Card B has no market price')).toBeTruthy();
  });

  it('displays success indicator for successful events', () => {
    render(
      <NotificationHistoryPanel
        events={sampleEvents}
        loading={false}
        error={false}
      />,
    );

    // Two successful events should have ✅, one failed should have ❌
    const successMarkers = screen.getAllByText('✅');
    const failMarkers = screen.getAllByText('❌');
    expect(successMarkers).toHaveLength(2);
    expect(failMarkers).toHaveLength(1);
  });

  it('shows error detail for failed events', () => {
    render(
      <NotificationHistoryPanel
        events={sampleEvents}
        loading={false}
        error={false}
      />,
    );

    expect(screen.getByText('Telegram API timeout')).toBeTruthy();
  });

  it('renders the panel heading', () => {
    render(
      <NotificationHistoryPanel
        events={sampleEvents}
        loading={false}
        error={false}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 3, name: /notification history/i }),
    ).toBeTruthy();
  });

  it('has accessible region role', () => {
    render(
      <NotificationHistoryPanel
        events={sampleEvents}
        loading={false}
        error={false}
      />,
    );

    expect(
      screen.getByRole('region', { name: /notification history/i }),
    ).toBeTruthy();
  });
});
