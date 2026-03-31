import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    // Columns: checkbox, status, name, set, number, rarity, condition, qty, market, listing, floor, lastChecked, updated, actions
    const lastCheckedCell = cells[11];
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
    const lastCheckedCell = cells[11];
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
    // Columns: checkbox, status, name, set, number, rarity, condition, qty, market, listing, floor, lastChecked, updated, actions
    const cells = rows[1].querySelectorAll('td');
    const floorCell = cells[10];
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
    const floorCell = cells[10];
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
    const floorCell = cells[10];
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
    const floorCell = cells[10];
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
    const floorCell = cells[10];
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
    const floorCell = cells[10];
    await user.click(floorCell.querySelector('button')!);

    const input = screen.getByRole('spinbutton');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(onUpdateCard).not.toHaveBeenCalled();
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
