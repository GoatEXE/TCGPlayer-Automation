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
      />,
    );

    // The Last Checked cell should contain a dash
    const rows = screen.getAllByRole('row');
    // row[0] is thead, row[1] is the data row
    const cells = rows[1].querySelectorAll('td');
    // Last Checked is the column before Updated (second-to-last date column)
    // Columns: checkbox, status, name, set, number, rarity, condition, qty, market, listing, lastChecked, updated, actions
    const lastCheckedCell = cells[10];
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
      />,
    );

    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    const lastCheckedCell = cells[10];
    expect(lastCheckedCell.textContent).toBe('3h ago');
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
