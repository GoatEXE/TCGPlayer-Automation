import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { Card } from '../../api/types';
import { CardTable } from '../CardTable';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 1,
    tcgplayerId: 123,
    productLine: 'Riftbound: League of Legends Trading Card Game',
    setName: 'Origins',
    productName: "Targon's Peak",
    title: null,
    number: '289/298',
    rarity: 'Uncommon',
    condition: 'Near Mint',
    quantity: 2,
    status: 'matched',
    marketPrice: '0.20',
    listingPrice: '0.20',
    floorPriceCents: null,
    isFoilPrice: false,
    photoUrl: null,
    notes: null,
    lastCheckedAt: null,
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Mock api for PriceHistoryModal
vi.mock('../../api/client', () => ({
  api: {
    getCardPriceHistory: vi.fn(),
  },
}));

import { api } from '../../api/client';
const mockGetCardPriceHistory = vi.mocked(api.getCardPriceHistory);

describe('CardTable review + confirm flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('opens review modal and confirms mark listed with selected IDs', async () => {
    const user = userEvent.setup();
    const onMarkListed = vi.fn().mockResolvedValue(undefined);

    render(
      <CardTable
        cards={[
          makeCard({ id: 1, productName: 'Matched Card', status: 'matched' }),
          makeCard({ id: 2, productName: 'Listed Card', status: 'listed' }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={onMarkListed}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    // Select the matched card row checkbox
    const rowCheckbox = screen.getByTitle('Select for bulk listing');
    await user.click(rowCheckbox);

    const markButton = screen.getByRole('button', {
      name: /mark 1 as listed/i,
    });
    await user.click(markButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Matched Card');

    await user.click(
      screen.getByRole('button', { name: /confirm mark as listed/i }),
    );

    await waitFor(() => {
      expect(onMarkListed).toHaveBeenCalledWith([1]);
    });
  });

  it('cancels review modal without calling mark listed', async () => {
    const user = userEvent.setup();
    const onMarkListed = vi.fn().mockResolvedValue(undefined);

    render(
      <CardTable
        cards={[
          makeCard({ id: 1, productName: 'Matched Card', status: 'matched' }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={onMarkListed}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByTitle('Select for bulk listing'));
    await user.click(screen.getByRole('button', { name: /mark 1 as listed/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(onMarkListed).not.toHaveBeenCalled();
  });
});

describe('CardTable Last Checked column', () => {
  it('renders Last Checked column header', () => {
    render(
      <CardTable
        cards={[makeCard()]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    expect(screen.getByText('Last Checked')).toBeInTheDocument();
  });

  it('shows dash when lastCheckedAt is null', () => {
    render(
      <CardTable
        cards={[makeCard({ id: 1, lastCheckedAt: null })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    // The Last Checked cell should contain a dash
    const rows = screen.getAllByRole('row');
    // row[0] is thead, row[1] is the data row
    const cells = rows[1].querySelectorAll('td');
    // Columns: checkbox, status, name, set, number, rarity, condition, qty, market, rec'd, listing, floor, lastChecked, updated, actions
    const lastCheckedCell = cells[12];
    expect(lastCheckedCell.textContent).toBe('—');
  });

  it('shows relative time when lastCheckedAt has a value', () => {
    const recentDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3h ago
    render(
      <CardTable
        cards={[makeCard({ id: 1, lastCheckedAt: recentDate })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const lastCheckedCell = cells[12];
    expect(lastCheckedCell.textContent).toBe('3h ago');
  });
});

describe('CardTable floor price column', () => {
  it('renders Floor column header', () => {
    render(
      <CardTable
        cards={[makeCard()]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn()}
      />,
    );

    expect(screen.getByText('Floor')).toBeInTheDocument();
  });

  it('shows dash when floorPriceCents is null', () => {
    render(
      <CardTable
        cards={[makeCard({ id: 1, floorPriceCents: null })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('row');
    // Columns: checkbox, status, name, set, number, rarity, condition, qty, market, rec'd, listing, floor, lastChecked, updated, actions
    const cells = rows[1].querySelectorAll('td');
    const floorCell = cells[11];
    expect(floorCell.textContent).toBe('—');
  });

  it('shows formatted dollar value when floorPriceCents is set', () => {
    render(
      <CardTable
        cards={[makeCard({ id: 1, floorPriceCents: 150 })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const floorCell = cells[11];
    expect(floorCell.textContent).toBe('$1.50');
  });

  it('shows floor price edit input when floor cell is clicked', async () => {
    const user = userEvent.setup();
    render(
      <CardTable
        cards={[makeCard({ id: 1, floorPriceCents: 150 })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const floorCell = cells[11];
    await user.click(floorCell.querySelector('button')!);

    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
  });

  it('saves floor price when edit is confirmed', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi
      .fn()
      .mockResolvedValue(makeCard({ id: 1, floorPriceCents: 200 }));

    render(
      <CardTable
        cards={[makeCard({ id: 1, floorPriceCents: 150 })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const floorCell = cells[11];
    await user.click(floorCell.querySelector('button')!);

    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '2.00');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { floorPriceCents: 200 });
    });
  });

  it('clears floor price when input is emptied and confirmed', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi
      .fn()
      .mockResolvedValue(makeCard({ id: 1, floorPriceCents: null }));

    render(
      <CardTable
        cards={[makeCard({ id: 1, floorPriceCents: 150 })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const floorCell = cells[11];
    await user.click(floorCell.querySelector('button')!);

    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { floorPriceCents: null });
    });
  });

  it('cancels floor price edit on Escape', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn();

    render(
      <CardTable
        cards={[makeCard({ id: 1, floorPriceCents: 150 })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const floorCell = cells[11];
    await user.click(floorCell.querySelector('button')!);

    const input = screen.getByRole('spinbutton');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(onUpdateCard).not.toHaveBeenCalled();
  });
});

describe('CardTable photo viewer', () => {
  it('opens valid absolute image URLs in an in-app dialog', async () => {
    const user = userEvent.setup();

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            productName: 'Photo Card',
            photoUrl: 'https://tcgplayer-cdn.tcgplayer.com/product/653083_in_400x400.jpg',
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /view photo for photo card/i }),
    );

    const dialog = screen.getByRole('dialog', { name: /card photo: photo card/i });
    expect(
      within(dialog).getByRole('img', { name: /photo card/i }),
    ).toHaveAttribute(
      'src',
      'https://tcgplayer-cdn.tcgplayer.com/product/653083_in_400x400.jpg',
    );
  });

  it('does not render a photo trigger for invalid or relative photo URLs', () => {
    render(
      <CardTable
        cards={[
          makeCard({ id: 1, productName: 'Bare Numeric', photoUrl: '2' }),
          makeCard({
            id: 2,
            productName: 'Relative Path',
            photoUrl: '/product/653083',
          }),
          makeCard({
            id: 3,
            productName: 'Not Image',
            photoUrl: 'https://example.com/product/653083',
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    expect(screen.queryByRole('button', { name: /view photo/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /🖼️/i })).toBeNull();
  });
});

describe('CardTable price history button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a history button for each card row', () => {
    render(
      <CardTable
        cards={[
          makeCard({ id: 1, productName: 'Card A' }),
          makeCard({ id: 2, productName: 'Card B' }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    const historyButtons = screen.getAllByTitle('View price history');
    expect(historyButtons).toHaveLength(2);
  });

  it('opens price history modal when history button clicked', async () => {
    mockGetCardPriceHistory.mockResolvedValue({ history: [] });
    const user = userEvent.setup();

    render(
      <CardTable
        cards={[makeCard({ id: 7, productName: 'Test Card' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByTitle('View price history'));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute(
        'aria-label',
        'Price history for Test Card',
      );
    });

    expect(mockGetCardPriceHistory).toHaveBeenCalledWith(7, 50);
  });

  it('closes price history modal when close is clicked', async () => {
    mockGetCardPriceHistory.mockResolvedValue({ history: [] });
    const user = userEvent.setup();

    render(
      <CardTable
        cards={[makeCard({ id: 7, productName: 'Test Card' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByTitle('View price history'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Click the X close button (first close button in the modal)
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    await user.click(closeButtons[0]);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('uses card title when available instead of productName', async () => {
    mockGetCardPriceHistory.mockResolvedValue({ history: [] });
    const user = userEvent.setup();

    render(
      <CardTable
        cards={[
          makeCard({
            id: 7,
            productName: 'Raw Name',
            title: 'Display Title',
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByTitle('View price history'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveAttribute(
        'aria-label',
        'Price history for Display Title',
      );
    });
  });
});

describe('CardTable recommended price column', () => {
  it('renders Rec\'d column header', () => {
    render(
      <CardTable
        cards={[makeCard()]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn()}
      />,
    );

    expect(screen.getByText("Rec'd")).toBeInTheDocument();
  });

  it('shows 98% of market price formatted to 2 decimals', () => {
    render(
      <CardTable
        cards={[makeCard({ id: 1, marketPrice: '10.00' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    // Columns: checkbox(0), status(1), name(2), set(3), number(4), rarity(5), condition(6), qty(7), market(8), rec'd(9), listing(10), floor(11), lastChecked(12), updated(13), actions(14)
    const recdCell = cells[9];
    expect(recdCell.textContent).toBe('$9.80');
  });

  it('shows dash when no market price', () => {
    render(
      <CardTable
        cards={[makeCard({ id: 1, marketPrice: null })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const recdCell = cells[9];
    expect(recdCell.textContent).toBe('\u2014');
  });

  it('shows dashes instead of $NaN for invalid numeric price strings', () => {
    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            status: 'listed',
            marketPrice: 'NaN',
            listingPrice: 'NaN',
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    expect(cells[8].textContent).toBe('—');
    expect(cells[9].textContent).toBe('—');
    expect(cells[10].textContent).toBe('—');
  });

  it('correctly computes 98% for fractional prices', () => {
    render(
      <CardTable
        cards={[makeCard({ id: 1, marketPrice: '0.20' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const recdCell = cells[9];
    // 0.20 * 0.98 = 0.196, rounded to nearest cent = 0.20
    expect(recdCell.textContent).toBe('$0.20');
  });
});

describe('CardTable inline listing price editing', () => {
  it('listed card shows clickable listing price', () => {
    render(
      <CardTable
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '0.20' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    // listing column is index 10
    const listingCell = cells[10];
    const button = listingCell.querySelector('button');
    expect(button).not.toBeNull();
    expect(button!.textContent).toBe('$0.20');
  });

  it('clicking opens input pre-filled with current price', async () => {
    const user = userEvent.setup();
    render(
      <CardTable
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '1.50' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const listingCell = cells[10];
    await user.click(listingCell.querySelector('button')!);

    const inputs = screen.getAllByRole('spinbutton');
    // Find the listing price input (should have value 1.50)
    const listingInput = inputs.find((input) => (input as HTMLInputElement).value === '1.50');
    expect(listingInput).toBeDefined();
  });

  it('Enter calls onUpdateCard with numeric listingPrice', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(makeCard({ id: 1, listingPrice: '2.00' }));

    render(
      <CardTable
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '1.50' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const listingCell = cells[10];
    await user.click(listingCell.querySelector('button')!);

    const inputs = screen.getAllByRole('spinbutton');
    const listingInput = inputs.find((input) => (input as HTMLInputElement).value === '1.50')!;
    await user.clear(listingInput);
    await user.type(listingInput, '2.00');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { listingPrice: 2.00 });
    });
  });

  it('Escape cancels listing price edit', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn();

    render(
      <CardTable
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '1.50' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const listingCell = cells[10];
    await user.click(listingCell.querySelector('button')!);

    await user.keyboard('{Escape}');

    // Input should be gone
    const listingCell2 = rows[1].querySelectorAll('td')[10];
    expect(listingCell2.querySelector('input')).toBeNull();
    expect(onUpdateCard).not.toHaveBeenCalled();
  });

  it('non-listed cards show non-editable listing price', () => {
    render(
      <CardTable
        cards={[makeCard({ id: 1, status: 'matched', listingPrice: '0.20' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const listingCell = cells[10];
    // Should have no button (plain text)
    expect(listingCell.querySelector('button')).toBeNull();
    expect(listingCell.textContent).toBe('$0.20');
  });

  it('blur saves listing price edit', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(makeCard({ id: 1, listingPrice: '3.00' }));

    render(
      <CardTable
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '1.50' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const listingCell = cells[10];
    await user.click(listingCell.querySelector('button')!);

    const inputs = screen.getAllByRole('spinbutton');
    const listingInput = inputs.find((input) => (input as HTMLInputElement).value === '1.50')!;
    await user.clear(listingInput);
    await user.type(listingInput, '3.00');
    // Tab away to trigger blur
    await user.tab();

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { listingPrice: 3.00 });
    });
  });
});

describe('CardTable Record Sale button', () => {
  const defaultTableProps = {
    onReprice: vi.fn(),
    onDelete: vi.fn(),
    onMarkListed: vi.fn(),
    onUnlist: vi.fn(),
    onUpdateCard: vi.fn().mockResolvedValue(makeCard()),
    onRecordSale: vi.fn().mockResolvedValue(undefined),
    onBulkSell: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Record Sale button on listed cards', () => {
    render(
      <CardTable
        {...defaultTableProps}
        cards={[makeCard({ id: 1, status: 'listed', productName: 'Listed Card' })]}
      />,
    );

    expect(screen.getByTitle('Record sale')).toBeInTheDocument();
  });

  it('does NOT show Record Sale button on non-listed cards', () => {
    render(
      <CardTable
        {...defaultTableProps}
        cards={[
          makeCard({ id: 1, status: 'matched', productName: 'Matched Card' }),
          makeCard({ id: 2, status: 'pending', productName: 'Pending Card' }),
          makeCard({ id: 3, status: 'sold', productName: 'Sold Card' }),
          makeCard({ id: 4, status: 'gift', productName: 'Gift Card' }),
        ]}
      />,
    );

    expect(screen.queryByTitle('Record sale')).not.toBeInTheDocument();
  });

  it('clicking Record Sale opens RecordSaleModal with correct card', async () => {
    const user = userEvent.setup();
    render(
      <CardTable
        {...defaultTableProps}
        cards={[
          makeCard({ id: 5, status: 'listed', productName: 'Test Card', listingPrice: '1.50', setName: 'Origins' }),
        ]}
      />,
    );

    await user.click(screen.getByTitle('Record sale'));

    const dialog = screen.getByRole('dialog', { name: /record sale/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Test Card')).toBeInTheDocument();
  });

  it('passes defaultApplyExpenses through to RecordSaleModal', async () => {
    const user = userEvent.setup();
    render(
      <CardTable
        {...defaultTableProps}
        defaultApplyExpenses
        cards={[
          makeCard({ id: 5, status: 'listed', productName: 'Test Card', listingPrice: '1.50', setName: 'Origins' }),
        ]}
      />,
    );

    await user.click(screen.getByTitle('Record sale'));

    const dialog = screen.getByRole('dialog', { name: /record sale/i });
    const checkbox = within(dialog).getByRole('checkbox', {
      name: /apply estimated expenses/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('RecordSaleModal onSubmit calls onRecordSale prop', async () => {
    const user = userEvent.setup();
    const onRecordSale = vi.fn().mockResolvedValue(undefined);
    render(
      <CardTable
        {...defaultTableProps}
        onRecordSale={onRecordSale}
        cards={[
          makeCard({ id: 10, status: 'listed', productName: 'Sell Me', listingPrice: '2.00', quantity: 1 }),
        ]}
      />,
    );

    await user.click(screen.getByTitle('Record sale'));

    const dialog = screen.getByRole('dialog', { name: /record sale/i });
    // Submit the form as-is (defaults)
    await user.click(within(dialog).getByRole('button', { name: /record sale/i }));

    await waitFor(() => {
      expect(onRecordSale).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: 10,
          quantitySold: 1,
          salePriceCents: 200,
        }),
      );
    });
  });
});

describe('CardTable sell flow (enableSellFlow)', () => {
  const defaultTableProps = {
    onReprice: vi.fn(),
    onDelete: vi.fn(),
    onMarkListed: vi.fn(),
    onUnlist: vi.fn(),
    onUpdateCard: vi.fn().mockResolvedValue(makeCard()),
    onRecordSale: vi.fn().mockResolvedValue(undefined),
    onBulkSell: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('when enableSellFlow=true, checkboxes are enabled for listed cards', () => {
    render(
      <CardTable
        {...defaultTableProps}
        enableSellFlow
        cards={[
          makeCard({ id: 1, status: 'listed', productName: 'Listed Card' }),
          makeCard({ id: 2, status: 'matched', productName: 'Matched Card' }),
        ]}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    // header + 2 rows = 3 checkboxes
    // Listed card checkbox (row 1) should be enabled
    const rows = screen.getAllByRole('row');
    const listedRow = rows[1]; // first data row (sorted, listed should appear)
    const listedCheckbox = within(listedRow).getByRole('checkbox');
    expect(listedCheckbox).not.toBeDisabled();
  });

  it('when enableSellFlow=true and listed cards selected, shows Attach to Order button', async () => {
    const user = userEvent.setup();
    render(
      <CardTable
        {...defaultTableProps}
        enableSellFlow
        cards={[
          makeCard({ id: 1, status: 'listed', productName: 'Listed A' }),
          makeCard({ id: 2, status: 'listed', productName: 'Listed B' }),
        ]}
      />,
    );

    // Select one listed card
    const rows = screen.getAllByRole('row');
    const firstDataRow = rows[1];
    await user.click(within(firstDataRow).getByRole('checkbox'));

    expect(screen.getByText(/attach 1 to order/i)).toBeInTheDocument();
  });

  it('clicking Attach to Order opens BulkSellModal with selected cards', async () => {
    const user = userEvent.setup();
    render(
      <CardTable
        {...defaultTableProps}
        enableSellFlow
        cards={[
          makeCard({ id: 1, status: 'listed', productName: 'Sell Card A', listingPrice: '1.00' }),
          makeCard({ id: 2, status: 'listed', productName: 'Sell Card B', listingPrice: '2.00' }),
        ]}
      />,
    );

    // Select both cards using header checkbox
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    await user.click(headerCheckbox);

    await user.click(screen.getByText(/attach 2 to order/i));

    const dialog = screen.getByRole('dialog', { name: /bulk sell/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Sell Card A')).toBeInTheDocument();
    expect(within(dialog).getByText('Sell Card B')).toBeInTheDocument();
  });

  it('passes defaultApplyExpenses through to BulkSellModal', async () => {
    const user = userEvent.setup();
    render(
      <CardTable
        {...defaultTableProps}
        enableSellFlow
        defaultApplyExpenses
        cards={[
          makeCard({ id: 1, status: 'listed', productName: 'Sell Card A', listingPrice: '1.00' }),
          makeCard({ id: 2, status: 'listed', productName: 'Sell Card B', listingPrice: '2.00' }),
        ]}
      />,
    );

    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    await user.click(headerCheckbox);
    await user.click(screen.getByText(/attach 2 to order/i));

    const dialog = screen.getByRole('dialog', { name: /bulk sell/i });
    const checkbox = within(dialog).getByRole('checkbox', {
      name: /apply estimated expenses/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('when enableSellFlow=false, matched cards are selectable and Mark as Listed is shown', async () => {
    const user = userEvent.setup();
    render(
      <CardTable
        {...defaultTableProps}
        enableSellFlow={false}
        cards={[
          makeCard({ id: 1, status: 'matched', productName: 'Matched Card' }),
          makeCard({ id: 2, status: 'listed', productName: 'Listed Card' }),
        ]}
      />,
    );

    // The matched card checkbox should be enabled
    const matchedCheckbox = screen.getByTitle('Select for bulk listing');
    expect(matchedCheckbox).not.toBeDisabled();

    await user.click(matchedCheckbox);

    // Should show Mark as Listed button, not Attach to Order
    expect(screen.getByText(/mark 1 as listed/i)).toBeInTheDocument();
    expect(screen.queryByText(/attach.*to order/i)).not.toBeInTheDocument();
  });

  it('when enableSellFlow=false, listed card checkboxes are disabled', () => {
    render(
      <CardTable
        {...defaultTableProps}
        enableSellFlow={false}
        cards={[
          makeCard({ id: 1, status: 'listed', productName: 'Listed Card' }),
        ]}
      />,
    );

    const rows = screen.getAllByRole('row');
    const listedRow = rows[1];
    const checkbox = within(listedRow).getByRole('checkbox');
    expect(checkbox).toBeDisabled();
  });
});
