import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordSaleModal } from '../RecordSaleModal';
import type { Card, CreateSaleRequest } from '../../api/types';

const mockCard: Card = {
  id: 42,
  tcgplayerId: 12345,
  tcgProductId: null,
  productLine: 'Riftbound',
  setName: 'Origins',
  productName: 'Fire Drake',
  title: 'Fire Drake - Holo',
  number: '007',
  rarity: 'Rare',
  condition: 'Near Mint',
  quantity: 4,
  status: 'listed',
  marketPrice: '2.50',
  listingPrice: '2.45',
  floorPriceCents: 5,
  isFoilPrice: false,
  photoUrl: null,
  notes: null,
  lastCheckedAt: '2026-04-01T12:00:00.000Z',
  importedAt: '2026-03-20T10:00:00.000Z',
  updatedAt: '2026-04-01T12:00:00.000Z',
};

describe('RecordSaleModal', () => {
  const onSubmit = vi.fn<(data: CreateSaleRequest) => Promise<void>>();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with card context (name, set, condition visible)', () => {
    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Fire Drake/)).toBeTruthy();
    expect(screen.getByText(/Origins/)).toBeTruthy();
    expect(screen.getByText(/Near Mint/)).toBeTruthy();
  });

  it('defaults quantity to card.quantity', () => {
    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    const qtyInput = screen.getByLabelText('Quantity') as HTMLInputElement;
    expect(qtyInput.value).toBe('4');
  });

  it('defaults price to listing price in dollars', () => {
    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    const priceInput = screen.getByLabelText(/Sale Price/i) as HTMLInputElement;
    expect(priceInput.value).toBe('2.45');
  });

  it('shows shipping collected and hides deprecated estimated-expenses checkbox', () => {
    render(
      <RecordSaleModal
        card={mockCard}
        onSubmit={onSubmit}
        onClose={onClose}
        defaultShippingCollectedCents={149}
      />,
    );

    const shippingInput = screen.getByLabelText(
      /shipping collected/i,
    ) as HTMLInputElement;
    expect(shippingInput.value).toBe('1.49');
    expect(
      screen.queryByRole('checkbox', { name: /apply estimated expenses/i }),
    ).toBeNull();
  });

  it('validates quantity does not exceed card.quantity', async () => {
    const user = userEvent.setup();
    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    const qtyInput = screen.getByLabelText('Quantity');
    await user.clear(qtyInput);
    await user.type(qtyInput, '10');

    await user.click(screen.getByRole('button', { name: /Record Sale/i }));

    expect(
      screen.getByText(/quantity cannot exceed/i),
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('validates price is greater than 0', async () => {
    const user = userEvent.setup();
    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    const priceInput = screen.getByLabelText(/Sale Price/i);
    await user.clear(priceInput);
    await user.type(priceInput, '0');

    await user.click(screen.getByRole('button', { name: /Record Sale/i }));

    expect(
      screen.getByText(/price must be greater than/i),
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits with correct CreateSaleRequest (price converted to cents)', async () => {
    const user = userEvent.setup();
    onSubmit.mockResolvedValueOnce(undefined);

    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    // Keep defaults and submit
    await user.click(screen.getByRole('button', { name: /Record Sale/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: 42,
          quantitySold: 4,
          salePriceCents: 245,
          shippingCollectedCents: 149,
        }),
      );
    });
  });

  it('submits edited shipping collected cents', async () => {
    const user = userEvent.setup();
    onSubmit.mockResolvedValueOnce(undefined);

    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    await user.clear(screen.getByLabelText(/shipping collected/i));
    await user.type(screen.getByLabelText(/shipping collected/i), '2.49');
    await user.click(screen.getByRole('button', { name: /record sale/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ shippingCollectedCents: 249 }),
      );
    });
  });

  it('includes optional fields when filled', async () => {
    const user = userEvent.setup();
    onSubmit.mockResolvedValueOnce(undefined);

    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    await user.type(screen.getByLabelText(/Buyer Name/i), 'Alice');
    await user.type(
      screen.getByLabelText(/TCGPlayer Order ID/i),
      'ORD-12345',
    );
    await user.type(screen.getByLabelText(/Notes/i), 'Great buyer');

    await user.click(screen.getByRole('button', { name: /Record Sale/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: 42,
          quantitySold: 4,
          salePriceCents: 245,
          buyerName: 'Alice',
          tcgplayerOrderId: 'ORD-12345',
          notes: 'Great buyer',
        }),
      );
    });
  });

  it('shows loading state during submission', async () => {
    const user = userEvent.setup();
    // Never resolve — keep in loading state
    onSubmit.mockReturnValue(new Promise(() => {}));

    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    await user.click(screen.getByRole('button', { name: /Record Sale/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeTruthy();
    });
  });

  it('displays error message on rejection', async () => {
    const user = userEvent.setup();
    onSubmit.mockRejectedValueOnce(new Error('Network error'));

    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    await user.click(screen.getByRole('button', { name: /Record Sale/i }));

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeTruthy();
    });

    // Modal stays open — submit button should be re-enabled
    expect(
      screen.getByRole('button', { name: /Record Sale/i }),
    ).toBeTruthy();
  });

  it('closes on Escape key', async () => {
    const user = userEvent.setup();

    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', async () => {
    const user = userEvent.setup();

    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    const backdrop = screen.getByRole('dialog');
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalled();
  });

  it('does not close on backdrop click while saving', async () => {
    const user = userEvent.setup();
    onSubmit.mockReturnValue(new Promise(() => {}));

    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    await user.click(screen.getByRole('button', { name: /Record Sale/i }));

    // Wait for saving state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeTruthy();
    });

    const backdrop = screen.getByRole('dialog');
    await user.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('displays computed total that updates with quantity and price', async () => {
    const user = userEvent.setup();

    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    // Default total: 4 * $2.45 = $9.80
    expect(screen.getByText(/\$9\.80/)).toBeTruthy();

    // Change quantity to 2 → 2 * $2.45 = $4.90
    const qtyInput = screen.getByLabelText('Quantity');
    await user.clear(qtyInput);
    await user.type(qtyInput, '2');

    expect(screen.getByText(/\$4\.90/)).toBeTruthy();
  });

  it('shows market and listing price context in card info', () => {
    render(
      <RecordSaleModal card={mockCard} onSubmit={onSubmit} onClose={onClose} />,
    );

    expect(screen.getByText(/\$2\.50/)).toBeTruthy(); // market price
    expect(screen.getByText(/\$2\.45/)).toBeTruthy(); // listing price
  });
});
