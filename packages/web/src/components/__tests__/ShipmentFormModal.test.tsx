import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShipmentFormModal } from '../ShipmentFormModal';
import type { Shipment } from '../../api/types';

const mockShipment: Shipment = {
  id: 10,
  saleId: 5,
  carrier: 'USPS',
  trackingNumber: '9400111899223',
  shippedAt: '2026-03-30T14:00:00.000Z',
  deliveredAt: null,
  notes: 'Left at post office',
  createdAt: '2026-03-30T14:00:00.000Z',
  updatedAt: '2026-03-30T14:00:00.000Z',
};

describe('ShipmentFormModal', () => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create mode with empty/default fields', () => {
    render(
      <ShipmentFormModal
        saleId={5}
        shipment={null}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('dialog', { name: /shipment/i })).toBeTruthy();

    const carrierSelect = screen.getByLabelText('Carrier') as HTMLSelectElement;
    expect(carrierSelect.value).toBe('');

    const trackingInput = screen.getByLabelText(
      'Tracking Number',
    ) as HTMLInputElement;
    expect(trackingInput.value).toBe('');

    const notesInput = screen.getByLabelText('Notes') as HTMLTextAreaElement;
    expect(notesInput.value).toBe('');
  });

  it('renders edit mode with pre-filled data', () => {
    render(
      <ShipmentFormModal
        saleId={5}
        shipment={mockShipment}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    const carrierSelect = screen.getByLabelText('Carrier') as HTMLSelectElement;
    expect(carrierSelect.value).toBe('USPS');

    const trackingInput = screen.getByLabelText(
      'Tracking Number',
    ) as HTMLInputElement;
    expect(trackingInput.value).toBe('9400111899223');

    const notesInput = screen.getByLabelText('Notes') as HTMLTextAreaElement;
    expect(notesInput.value).toBe('Left at post office');
  });

  it('submits create payload for new shipment', async () => {
    const user = userEvent.setup();
    onSubmit.mockResolvedValueOnce(undefined);

    render(
      <ShipmentFormModal
        saleId={5}
        shipment={null}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Carrier'), 'USPS');
    await user.type(screen.getByLabelText('Tracking Number'), '9400111899223');
    await user.type(screen.getByLabelText('Notes'), 'Dropped at PO');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        mode: 'create',
        saleId: 5,
        data: expect.objectContaining({
          carrier: 'USPS',
          trackingNumber: '9400111899223',
          notes: 'Dropped at PO',
        }),
      });
    });
  });

  it('submits update payload for existing shipment', async () => {
    const user = userEvent.setup();
    onSubmit.mockResolvedValueOnce(undefined);

    render(
      <ShipmentFormModal
        saleId={5}
        shipment={mockShipment}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    const trackingInput = screen.getByLabelText('Tracking Number');
    await user.clear(trackingInput);
    await user.type(trackingInput, '1Z999AA10123456784');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        mode: 'update',
        shipmentId: 10,
        data: expect.objectContaining({
          trackingNumber: '1Z999AA10123456784',
        }),
      });
    });
  });

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ShipmentFormModal
        saleId={5}
        shipment={null}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
