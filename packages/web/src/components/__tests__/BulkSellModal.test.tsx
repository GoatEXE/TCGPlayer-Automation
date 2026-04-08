import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkSellModal } from '../BulkSellModal';
import type { Card, CreateSaleRequest } from '../../api/types';

const makeCard = (overrides: Partial<Card> = {}): Card => ({
  id: 1,
  tcgplayerId: 100,
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
  ...overrides,
});

const mockCards: Card[] = [
  makeCard({ id: 1, productName: 'Fire Drake', title: 'Fire Drake - Holo', marketPrice: '2.50', listingPrice: '2.45', quantity: 4 }),
  makeCard({ id: 2, productName: 'Ice Golem', title: 'Ice Golem', marketPrice: '5.00', listingPrice: '4.90', quantity: 2 }),
  makeCard({ id: 3, productName: 'Storm Mage', title: 'Storm Mage - Foil', marketPrice: '10.00', listingPrice: '9.80', quantity: 1 }),
];

describe('BulkSellModal', () => {
  const onSubmit = vi.fn<(sales: CreateSaleRequest[]) => Promise<void>>();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all cards in the table', () => {
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Fire Drake - Holo')).toBeTruthy();
    expect(screen.getByText('Ice Golem')).toBeTruthy();
    expect(screen.getByText('Storm Mage - Foil')).toBeTruthy();
  });

  it('shows shared order fields (buyer name, order ID, sold date, notes)', () => {
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    expect(screen.getByLabelText(/Buyer Name/i)).toBeTruthy();
    expect(screen.getByLabelText(/TCGPlayer Order ID/i)).toBeTruthy();
    expect(screen.getByLabelText(/Sold Date/i)).toBeTruthy();
    expect(screen.getByLabelText(/Notes/i)).toBeTruthy();
  });

  it('defaults per-card quantity to card.quantity', () => {
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    const qtyInputs = screen.getAllByRole('spinbutton', { name: /quantity/i });
    expect(qtyInputs).toHaveLength(3);
    expect((qtyInputs[0] as HTMLInputElement).value).toBe('4');
    expect((qtyInputs[1] as HTMLInputElement).value).toBe('2');
    expect((qtyInputs[2] as HTMLInputElement).value).toBe('1');
  });

  it('defaults per-card sale price to listing price in dollars', () => {
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    const priceInputs = screen.getAllByRole('spinbutton', { name: /sale price/i });
    expect(priceInputs).toHaveLength(3);
    expect((priceInputs[0] as HTMLInputElement).value).toBe('2.45');
    expect((priceInputs[1] as HTMLInputElement).value).toBe('4.9');
    expect((priceInputs[2] as HTMLInputElement).value).toBe('9.8');
  });

  it('shows recommended price column (98% of market)', () => {
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    const headers = screen.getAllByRole('columnheader');
    const headerTexts = headers.map(h => h.textContent);
    expect(headerTexts).toContain("Rec'd");

    // Fire Drake: Math.round(2.50 * 98) / 100 = 2.45 — appears in both Rec'd and Listed
    // Ice Golem: Math.round(5.00 * 98) / 100 = 4.90 — appears in both Rec'd and Listed
    // Storm Mage: Math.round(10.00 * 98) / 100 = 9.80 — appears in both Rec'd and Listed
    // Verify via row-scoped queries (Rec'd is 3rd td, index 2)
    const rows = screen.getAllByRole('row');
    // Fire Drake rec'd
    const fireDrakeCells = within(rows[1]).getAllByRole('cell');
    expect(fireDrakeCells[2].textContent).toBe('$2.45');
    // Ice Golem rec'd
    const iceGolemCells = within(rows[2]).getAllByRole('cell');
    expect(iceGolemCells[2].textContent).toBe('$4.90');
    // Storm Mage rec'd
    const stormMageCells = within(rows[3]).getAllByRole('cell');
    expect(stormMageCells[2].textContent).toBe('$9.80');
  });

  it('shows dash for recommended price when no market price', () => {
    const cards = [makeCard({ id: 10, marketPrice: null, listingPrice: '1.00', quantity: 1 })];
    render(<BulkSellModal cards={cards} onSubmit={onSubmit} onClose={onClose} />);

    const rows = screen.getAllByRole('row');
    const dataRow = rows[1];
    const cells = within(dataRow).getAllByRole('cell');
    // Market (index 1) and Rec'd (index 2) should both show dash
    expect(cells[1].textContent).toBe('—');
    expect(cells[2].textContent).toBe('—');
  });

  it('computes grand total correctly (sum of qty × price for each card)', () => {
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    // Fire Drake: 4 × 2.45 = 9.80
    // Ice Golem: 2 × 4.90 = 9.80
    // Storm Mage: 1 × 9.80 = 9.80
    // Grand total = 29.40
    expect(screen.getByText(/\$29\.40/)).toBeTruthy();
  });

  it('shows card count in footer', () => {
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);
    const footer = document.querySelector('.bulk-sell-card-count')!;
    expect(footer.textContent).toMatch(/3 cards/i);
  });

  it('updates grand total when per-card quantity changes', async () => {
    const user = userEvent.setup();
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    // Change Fire Drake qty from 4 to 2
    const qtyInputs = screen.getAllByRole('spinbutton', { name: /quantity/i });
    await user.clear(qtyInputs[0]);
    await user.type(qtyInputs[0], '2');

    // New total: 2 × 2.45 + 2 × 4.90 + 1 × 9.80 = 4.90 + 9.80 + 9.80 = 24.50
    expect(screen.getByText(/\$24\.50/)).toBeTruthy();
  });

  it('updates grand total when per-card price changes', async () => {
    const user = userEvent.setup();
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    // Change Fire Drake price from 2.45 to 5.00
    const priceInputs = screen.getAllByRole('spinbutton', { name: /sale price/i });
    await user.clear(priceInputs[0]);
    await user.type(priceInputs[0], '5');

    // New total: 4 × 5.00 + 2 × 4.90 + 1 × 9.80 = 20.00 + 9.80 + 9.80 = 39.60
    expect(screen.getByText(/\$39\.60/)).toBeTruthy();
  });

  it('per-card qty is independently editable', async () => {
    const user = userEvent.setup();
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    const qtyInputs = screen.getAllByRole('spinbutton', { name: /quantity/i });

    // Change second card qty
    await user.clear(qtyInputs[1]);
    await user.type(qtyInputs[1], '1');

    // First and third unchanged
    expect((qtyInputs[0] as HTMLInputElement).value).toBe('4');
    expect((qtyInputs[1] as HTMLInputElement).value).toBe('1');
    expect((qtyInputs[2] as HTMLInputElement).value).toBe('1');
  });

  it('submits correct CreateSaleRequest[] with shared fields applied to all cards', async () => {
    const user = userEvent.setup();
    onSubmit.mockResolvedValueOnce(undefined);

    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    // Fill shared fields
    await user.type(screen.getByLabelText(/Buyer Name/i), 'Alice');
    await user.type(screen.getByLabelText(/TCGPlayer Order ID/i), 'ORD-99');
    await user.type(screen.getByLabelText(/Notes/i), 'Bulk order');

    await user.click(screen.getByRole('button', { name: /attach to order|record \d+ sales/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const sales: CreateSaleRequest[] = onSubmit.mock.calls[0][0];
      expect(sales).toHaveLength(3);

      // All share buyer/order/notes
      for (const sale of sales) {
        expect(sale.buyerName).toBe('Alice');
        expect(sale.tcgplayerOrderId).toBe('ORD-99');
        expect(sale.notes).toBe('Bulk order');
      }

      // Per-card fields
      expect(sales[0]).toMatchObject({ cardId: 1, quantitySold: 4, salePriceCents: 245 });
      expect(sales[1]).toMatchObject({ cardId: 2, quantitySold: 2, salePriceCents: 490 });
      expect(sales[2]).toMatchObject({ cardId: 3, quantitySold: 1, salePriceCents: 980 });
    });
  });

  it('submits with empty optional fields as null', async () => {
    const user = userEvent.setup();
    onSubmit.mockResolvedValueOnce(undefined);

    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    // Don't fill any shared fields, just submit
    await user.click(screen.getByRole('button', { name: /attach to order|record \d+ sales/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const sales: CreateSaleRequest[] = onSubmit.mock.calls[0][0];
      for (const sale of sales) {
        expect(sale.buyerName).toBeNull();
        expect(sale.tcgplayerOrderId).toBeNull();
        expect(sale.notes).toBeNull();
      }
    });
  });

  it('shows loading state during submission', async () => {
    const user = userEvent.setup();
    onSubmit.mockReturnValue(new Promise(() => {})); // never resolves

    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /attach to order|record \d+ sales/i }));

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /saving/i }) as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.disabled).toBe(true);
    });
  });

  it('displays error message on rejection and keeps modal open', async () => {
    const user = userEvent.setup();
    onSubmit.mockRejectedValueOnce(new Error('Network error'));

    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /attach to order|record \d+ sales/i }));

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeTruthy();
    });

    // Modal still open - submit button re-enabled
    expect(screen.getByRole('button', { name: /attach to order|record \d+ sales/i })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape key', async () => {
    const user = userEvent.setup();
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', async () => {
    const user = userEvent.setup();
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    const backdrop = screen.getByRole('dialog');
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close on Escape while saving', async () => {
    const user = userEvent.setup();
    onSubmit.mockReturnValue(new Promise(() => {}));

    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /attach to order|record \d+ sales/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeTruthy();
    });

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close on backdrop click while saving', async () => {
    const user = userEvent.setup();
    onSubmit.mockReturnValue(new Promise(() => {}));

    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /attach to order|record \d+ sales/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeTruthy();
    });

    const backdrop = screen.getByRole('dialog');
    await user.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows per-card subtotals', () => {
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    const rows = screen.getAllByRole('row');
    // Subtotal is the last cell (index 6)
    // Row 1 (Fire Drake): 4 × 2.45 = $9.80
    const fireDrakeCells = within(rows[1]).getAllByRole('cell');
    expect(fireDrakeCells[6].textContent).toMatch(/9\.80/);
    // Row 2 (Ice Golem): 2 × 4.90 = $9.80
    const iceGolemCells = within(rows[2]).getAllByRole('cell');
    expect(iceGolemCells[6].textContent).toMatch(/9\.80/);
    // Row 3 (Storm Mage): 1 × 9.80 = $9.80
    const stormMageCells = within(rows[3]).getAllByRole('cell');
    expect(stormMageCells[6].textContent).toMatch(/9\.80/);
  });

  it('handles card with no listing price (defaults sale price to 0)', () => {
    const cards = [makeCard({ id: 10, listingPrice: null, quantity: 1 })];
    render(<BulkSellModal cards={cards} onSubmit={onSubmit} onClose={onClose} />);

    const priceInputs = screen.getAllByRole('spinbutton', { name: /sale price/i });
    expect((priceInputs[0] as HTMLInputElement).value).toBe('0');
  });

  it('shows market price column', () => {
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    // Check table header
    const headers = screen.getAllByRole('columnheader');
    const headerTexts = headers.map(h => h.textContent);
    expect(headerTexts).toContain('Market');
  });

  it('shows listed price column', () => {
    render(<BulkSellModal cards={mockCards} onSubmit={onSubmit} onClose={onClose} />);

    const headers = screen.getAllByRole('columnheader');
    const headerTexts = headers.map(h => h.textContent);
    expect(headerTexts).toContain('Listed');
  });
});
