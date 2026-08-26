import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { OrderStatusHistoryModal } from '../OrderStatusHistoryModal';
import { api } from '../../api/client';

vi.mock('../../api/client', () => ({
  api: {
    getSaleStatusHistory: vi.fn(),
  },
}));

const mockGetHistory = vi.mocked(api.getSaleStatusHistory);

const firstEntry = {
  id: 1,
  saleId: 10,
  previousStatus: 'pending' as const,
  newStatus: 'confirmed' as const,
  source: 'manual' as const,
  reason: 'Order status updated',
  note: 'Payment cleared',
  changedAt: '2026-04-01T10:00:00.000Z',
};

function renderModal(onClose = vi.fn()) {
  return {
    onClose,
    ...render(
      <OrderStatusHistoryModal
        representativeSaleId={10}
        orderLabel="ORD-123"
        onClose={onClose}
      />,
    ),
  };
}

describe('OrderStatusHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads status history for the order and exposes a loading state', () => {
    mockGetHistory.mockReturnValue(new Promise(() => {}));

    renderModal();

    expect(
      screen.getByRole('dialog', { name: 'Status history for ORD-123' }),
    ).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Loading status history…')).toBeInTheDocument();
    expect(mockGetHistory).toHaveBeenCalledWith(10);
  });

  it('shows empty and error states', async () => {
    mockGetHistory.mockResolvedValueOnce({ history: [] });
    const first = renderModal();

    expect(
      await screen.findByText('No status changes recorded.'),
    ).toBeInTheDocument();
    first.unmount();

    mockGetHistory.mockRejectedValueOnce(new Error('Network error'));
    renderModal();

    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
  });

  it('deduplicates order-wide entries while retaining logically distinct updates', async () => {
    mockGetHistory.mockResolvedValue({
      history: [
        firstEntry,
        { ...firstEntry, id: 2, saleId: 11 },
        { ...firstEntry, id: 3, reason: 'Marketplace sync' },
      ],
    });

    renderModal();

    const timeline = await screen.findByRole('list', {
      name: 'Status change history',
    });
    expect(timeline.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getAllByText('Payment cleared')).toHaveLength(2);
  });

  it('closes with a named close button, Escape, or an outside click', async () => {
    mockGetHistory.mockResolvedValue({ history: [] });
    const user = userEvent.setup();

    const namedClose = renderModal();
    await screen.findByText('No status changes recorded.');
    await user.click(
      screen.getByRole('button', { name: 'Close status history' }),
    );
    expect(namedClose.onClose).toHaveBeenCalledOnce();
    namedClose.unmount();

    const escapeClose = renderModal();
    await user.keyboard('{Escape}');
    expect(escapeClose.onClose).toHaveBeenCalledOnce();
    escapeClose.unmount();

    const outsideClose = renderModal();
    await user.click(screen.getByRole('dialog'));
    expect(outsideClose.onClose).toHaveBeenCalledOnce();
  });
});
