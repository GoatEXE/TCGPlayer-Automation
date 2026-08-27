import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { NotificationHistoryModal } from '../NotificationHistoryModal';
import type { NotificationEvent } from '../../api/types';

const event: NotificationEvent = {
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
};

describe('NotificationHistoryModal', () => {
  it('renders the existing notification history content and focuses its close control', async () => {
    render(
      <NotificationHistoryModal
        events={[event]}
        loading={false}
        error={false}
        onClose={() => {}}
      />,
    );

    expect(
      screen.getByRole('dialog', { name: /notifications/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Sale confirmed: Card A — $5.00'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /close notifications/i }),
      ).toHaveFocus();
    });
  });

  it('keeps Tab focus within the modal', async () => {
    const user = userEvent.setup();

    render(
      <NotificationHistoryModal
        events={[]}
        loading={false}
        error={false}
        onClose={() => {}}
      />,
    );

    const headerClose = screen.getByRole('button', {
      name: /close notifications/i,
    });
    const footerClose = screen.getByRole('button', { name: 'Close' });

    footerClose.focus();
    await user.tab();
    expect(headerClose).toHaveFocus();

    await user.tab({ shift: true });
    expect(footerClose).toHaveFocus();
  });

  it('closes from the close button, Escape, and backdrop', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <NotificationHistoryModal
        events={[]}
        loading={false}
        error={false}
        onClose={onClose}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /close notifications/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('dialog', { name: /notifications/i }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
