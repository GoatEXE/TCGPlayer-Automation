import { useState } from 'react';
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
  tcgProductId: null,
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
  it('does not render the Floor column or floor edit control in the main table', () => {
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

    expect(
      screen.queryByRole('columnheader', { name: /^Floor$/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTitle('Click to set floor price')).toBeNull();
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

  it('renders an actions menu button for each card row', () => {
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

    const actionButtons = screen.getAllByRole('button', { name: /actions for/i });
    expect(actionButtons).toHaveLength(2);
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

    await user.click(screen.getByRole('button', { name: /actions for test card/i }));
    await user.click(screen.getByRole('menuitem', { name: /view price history/i }));

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

    await user.click(screen.getByRole('button', { name: /actions for test card/i }));
    await user.click(screen.getByRole('menuitem', { name: /view price history/i }));

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

    await user.click(screen.getByRole('button', { name: /actions for display title/i }));
    await user.click(screen.getByRole('menuitem', { name: /view price history/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveAttribute(
        'aria-label',
        'Price history for Display Title',
      );
    });
  });
});

describe('CardTable pricing review', () => {
  it('shows the review launcher from the global Needs Attention count and opens fetched cards', async () => {
    const user = userEvent.setup();

    const onLoadNeedsAttentionReviewCards = vi.fn().mockResolvedValue([
      makeCard({ id: 2, status: 'needs_attention', productName: 'Fetched Review Card' }),
    ]);

    render(
      <CardTable
        cards={[makeCard({ id: 1, status: 'matched', productName: 'Displayed Card' })]}
        needsAttentionCount={1}
        onLoadNeedsAttentionReviewCards={onLoadNeedsAttentionReviewCards}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));

    const dialog = await screen.findByRole('dialog', { name: /pricing review/i });
    expect(onLoadNeedsAttentionReviewCards).toHaveBeenCalled();
    expect(dialog).toHaveTextContent('Fetched Review Card');
    expect(dialog).toHaveTextContent('Market');
    expect(dialog).toHaveTextContent('Listing');
    expect(dialog).toHaveTextContent('Rec’d');
  });

  it('groups Normal and Foil variants with the same Product ID into one review step', async () => {
    const user = userEvent.setup();

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            status: 'needs_attention',
            tcgProductId: 685490,
            productName: 'Punch First',
            condition: 'Near Mint',
            marketPrice: '0.15',
          }),
          makeCard({
            id: 2,
            status: 'needs_attention',
            tcgProductId: 685490,
            productName: 'Punch First',
            condition: 'Near Mint Foil',
            marketPrice: '0.80',
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));

    const dialog = await screen.findByRole('dialog', { name: /pricing review/i });
    expect(dialog).toHaveTextContent('Punch First, 2 variants');
    expect(within(dialog).getByText('Near Mint Foil')).toBeInTheDocument();
    expect(within(dialog).getByText('$0.78')).toBeInTheDocument();
    expect(within(dialog).getByText(/1 of 1 groups/i)).toBeInTheDocument();
  });

  it('copies all valid grouped Rec’d prices as a multiline list', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <CardTable
        cards={[
          makeCard({ id: 1, status: 'needs_attention', tcgProductId: 685490, productName: 'Punch First', condition: 'Near Mint', marketPrice: '0.15' }),
          makeCard({ id: 2, status: 'needs_attention', tcgProductId: 685490, productName: 'Punch First', condition: 'Near Mint Foil', marketPrice: '0.80' }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    await user.click(screen.getByRole('button', { name: /copy all rec’d/i }));

    expect(writeText).toHaveBeenCalledWith('Near Mint: $0.15\nNear Mint Foil: $0.78');
  });

  it('keeps the same title in different Product IDs as separate review groups', async () => {
    const user = userEvent.setup();

    render(
      <CardTable
        cards={[
          makeCard({ id: 1, status: 'needs_attention', tcgProductId: 111, productName: 'Shared Name', setName: 'Set A' }),
          makeCard({ id: 2, status: 'needs_attention', tcgProductId: 222, productName: 'Shared Name', setName: 'Set B' }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));

    expect(await screen.findByText(/1 of 2 groups/i)).toBeInTheDocument();
  });

  it('copies the recommended price to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <CardTable
        cards={[makeCard({ id: 1, status: 'needs_attention', marketPrice: '2.50' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    await user.click(screen.getByRole('button', { name: /copy all rec’d/i }));

    expect(writeText).toHaveBeenCalledWith('Near Mint: $2.45');
    expect(await screen.findByRole('status')).toHaveTextContent(/copied rec’d prices/i);
  });

  it('falls back to a temporary textarea when Clipboard API is unavailable', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
    });

    render(
      <CardTable
        cards={[makeCard({ id: 1, status: 'needs_attention', marketPrice: '2.50' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    await user.click(screen.getByRole('button', { name: /copy all rec’d/i }));

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(await screen.findByRole('status')).toHaveTextContent(/copied rec’d price/i);
    expect(document.querySelector('textarea')).toBeNull();

  });

  it('shows a graceful message when clipboard copy fails', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    const execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
    });

    render(
      <CardTable
        cards={[makeCard({ id: 1, status: 'needs_attention', marketPrice: '2.50' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    await user.click(screen.getByRole('button', { name: /copy all rec’d/i }));

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(await screen.findByRole('status')).toHaveTextContent(/copy failed/i);
    expect(document.querySelector('textarea')).toBeNull();

  });

  it('opens TCGPlayer in a reusable named browser target', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            status: 'needs_attention',
            tcgProductId: 685490,
            productName: 'Turn to Dust',
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    await user.click(screen.getByRole('button', { name: /open tcgplayer/i }));

    expect(openSpy).toHaveBeenCalledWith(
      'https://store.tcgplayer.com/admin/product/manage/685490?OnlyMyInventory=false&SearchValue=Turn%20to%20Dust&CategoryId=0&SetNameId=0&Rarity=0&DidSearch=true',
      'tcgplayer-inventory',
    );

    openSpy.mockRestore();
  });

  it('saves Listing to Rec’d and advances to the next card even when the parent updates resolved status', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn();

    function Harness() {
      const [cards, setCards] = useState([
        makeCard({ id: 1, status: 'needs_attention', productName: 'First Card', marketPrice: '2.50' }),
        makeCard({ id: 2, status: 'needs_attention', productName: 'Second Card', marketPrice: '5.00' }),
      ]);

      return (
        <CardTable
          cards={cards}
          onReprice={() => {}}
          onDelete={() => {}}
          onMarkListed={() => {}}
          onUnlist={() => {}}
          onUpdateCard={async (id, data) => {
            onUpdateCard(id, data);
            setCards((current) =>
              current.map((card) =>
                card.id === id
                  ? { ...card, ...data, status: 'listed' as const }
                  : card,
              ),
            );
            return makeCard({ id, status: 'listed', ...data });
          }}
        />
      );
    }

    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    await user.click(
      screen.getByRole('button', { name: /save selected listings to rec’d/i }),
    );

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { listingPrice: 2.45 });
    });
    expect(screen.getByRole('dialog', { name: /pricing review/i })).toHaveTextContent(
      'Second Card',
    );
  });

  it('shows Updated indicators for saved rows when navigating back to a saved group', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(makeCard());

    render(
      <CardTable
        cards={[
          makeCard({ id: 1, status: 'needs_attention', tcgProductId: 111, productName: 'First Group', condition: 'Near Mint', marketPrice: '2.50' }),
          makeCard({ id: 2, status: 'needs_attention', tcgProductId: 222, productName: 'Second Group', condition: 'Near Mint Foil', marketPrice: '5.00' }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    await user.click(
      screen.getByRole('button', { name: /save selected listings to rec’d/i }),
    );

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { listingPrice: 2.45 });
    });
    expect(screen.getByRole('dialog', { name: /pricing review/i })).toHaveTextContent(
      'Second Group',
    );

    await user.click(screen.getByRole('button', { name: /previous/i }));

    const dialog = screen.getByRole('dialog', { name: /pricing review/i });
    expect(dialog).toHaveTextContent('First Group');
    expect(within(dialog).getAllByText(/^✓ Updated$/i).length).toBeGreaterThan(0);
  });

  it('does not mark skipped rows as Updated when navigating back', async () => {
    const user = userEvent.setup();

    render(
      <CardTable
        cards={[
          makeCard({ id: 1, status: 'needs_attention', tcgProductId: 111, productName: 'Skipped Group', marketPrice: '2.50' }),
          makeCard({ id: 2, status: 'needs_attention', tcgProductId: 222, productName: 'Next Group', marketPrice: '5.00' }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    let dialog = screen.getByRole('dialog', { name: /pricing review/i });
    await user.click(within(dialog).getByRole('button', { name: /^skip$/i }));
    dialog = screen.getByRole('dialog', { name: /pricing review/i });
    await user.click(within(dialog).getByRole('button', { name: /previous/i }));

    dialog = screen.getByRole('dialog', { name: /pricing review/i });
    expect(dialog).toHaveTextContent('Skipped Group');
    expect(within(dialog).queryByText(/^✓ Updated$/i)).not.toBeInTheDocument();
  });

  it('saves every selected valid row in a grouped review step', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(makeCard());

    render(
      <CardTable
        cards={[
          makeCard({ id: 1, status: 'needs_attention', tcgProductId: 685490, productName: 'Punch First', condition: 'Near Mint', marketPrice: '0.15' }),
          makeCard({ id: 2, status: 'needs_attention', tcgProductId: 685490, productName: 'Punch First', condition: 'Near Mint Foil', marketPrice: '0.80' }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    await user.click(
      screen.getByRole('button', { name: /save selected listings to rec’d/i }),
    );

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { listingPrice: 0.15 });
      expect(onUpdateCard).toHaveBeenCalledWith(2, { listingPrice: 0.78 });
    });
    expect(screen.getByRole('dialog', { name: /pricing review/i })).toHaveTextContent(
      /all needs attention cards reviewed/i,
    );
  });

  it('shows a completion state after the last queued card is resolved', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(makeCard());

    render(
      <CardTable
        cards={[makeCard({ id: 1, status: 'needs_attention', productName: 'Only Card', marketPrice: '2.50' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    await user.click(
      screen.getByRole('button', { name: /save selected listings to rec’d/i }),
    );

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { listingPrice: 2.45 });
    });
    expect(screen.getByRole('dialog', { name: /pricing review/i })).toHaveTextContent(
      /all needs attention cards reviewed/i,
    );
  });

  it('marks only successfully saved rows when a later selected update fails', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi
      .fn()
      .mockResolvedValueOnce(makeCard())
      .mockRejectedValueOnce(new Error('Second update failed'));

    render(
      <CardTable
        cards={[
          makeCard({ id: 1, status: 'needs_attention', tcgProductId: 685490, productName: 'Punch First', condition: 'Near Mint', marketPrice: '2.50' }),
          makeCard({ id: 2, status: 'needs_attention', tcgProductId: 685490, productName: 'Punch First', condition: 'Near Mint Foil', marketPrice: '5.00' }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    await user.click(
      screen.getByRole('button', { name: /save selected listings to rec’d/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Second update failed');
    const dialog = screen.getByRole('dialog', { name: /pricing review/i });
    const rows = within(dialog).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(/updated/i);
    expect(rows[2]).not.toHaveTextContent(/updated/i);
  });

  it('keeps the group open and displays an error when a selected update fails', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockRejectedValue(new Error('Update failed'));

    render(
      <CardTable
        cards={[
          makeCard({ id: 1, status: 'needs_attention', tcgProductId: 685490, productName: 'Punch First', marketPrice: '2.50' }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    await user.click(
      screen.getByRole('button', { name: /save selected listings to rec’d/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Update failed');
    const dialog = screen.getByRole('dialog', { name: /pricing review/i });
    expect(dialog).toHaveTextContent('Punch First');
    expect(within(dialog).queryByText(/^✓ Updated$/i)).not.toBeInTheDocument();
  });

  it('disables unavailable actions when Rec’d price or Product ID is missing', async () => {
    const user = userEvent.setup();

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            status: 'needs_attention',
            productName: 'Incomplete Card',
            marketPrice: null,
            tcgProductId: null,
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /review pricing/i }));

    expect(screen.getByRole('button', { name: /copy all rec’d/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /open tcgplayer/i })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /save selected listings to rec’d/i }),
    ).toBeDisabled();
    expect(screen.getByText(/no valid rec’d price/i)).toBeInTheDocument();
    expect(screen.getByText(/no tcgplayer product id/i)).toBeInTheDocument();
  });
});

describe('CardTable row actions menu', () => {
  it('opens Edit details and submits quantity and condition updates', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(
      makeCard({ id: 1, quantity: 4, condition: 'Near Mint Foil' }),
    );

    render(
      <CardTable
        cards={[makeCard({ id: 1, productName: 'Editable Card' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /actions for editable card/i }));
    await user.click(screen.getByRole('menuitem', { name: /edit details/i }));

    const dialog = screen.getByRole('dialog', { name: /edit details for editable card/i });
    await user.clear(within(dialog).getByLabelText(/quantity/i));
    await user.type(within(dialog).getByLabelText(/quantity/i), '4');
    await user.selectOptions(
      within(dialog).getByLabelText(/condition/i),
      'Near Mint Foil',
    );
    await user.click(within(dialog).getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, {
        quantity: 4,
        condition: 'Near Mint Foil',
      });
    });
  });

  it('blocks invalid quantity in Edit details', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(makeCard());

    render(
      <CardTable
        cards={[makeCard({ id: 1, productName: 'Editable Card' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /actions for editable card/i }));
    await user.click(screen.getByRole('menuitem', { name: /edit details/i }));

    const dialog = screen.getByRole('dialog', { name: /edit details for editable card/i });
    await user.clear(within(dialog).getByLabelText(/quantity/i));
    await user.type(within(dialog).getByLabelText(/quantity/i), '-1');
    await user.click(within(dialog).getByRole('button', { name: /save/i }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /quantity must be a non-negative whole number/i,
    );
    expect(onUpdateCard).not.toHaveBeenCalled();
  });

  it('opens manual listing modal for Needs Attention cards and submits listing price', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(
      makeCard({ id: 1, status: 'needs_attention', listingPrice: '1.25' }),
    );

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            status: 'needs_attention',
            productName: 'Missing Foil Price',
            marketPrice: null,
            listingPrice: null,
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /actions for missing foil price/i }));
    await user.click(screen.getByRole('menuitem', { name: /set manual listing price/i }));

    const dialog = screen.getByRole('dialog', {
      name: /set manual listing price for missing foil price/i,
    });
    expect(dialog).toHaveTextContent(/source market/i);

    await user.type(within(dialog).getByLabelText(/listing price/i), '1.25');
    await user.click(within(dialog).getByRole('button', { name: /save listing price/i }));

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { listingPrice: 1.25 });
    });
  });

  it('validates manual listing price is positive', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(makeCard());

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            status: 'needs_attention',
            productName: 'Missing Foil Price',
            marketPrice: null,
            listingPrice: null,
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /actions for missing foil price/i }));
    await user.click(screen.getByRole('menuitem', { name: /set manual listing price/i }));

    const dialog = screen.getByRole('dialog', {
      name: /set manual listing price for missing foil price/i,
    });
    await user.click(within(dialog).getByRole('button', { name: /save listing price/i }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /listing price must be a positive dollar amount/i,
    );
    expect(onUpdateCard).not.toHaveBeenCalled();
  });

  it('keeps status driven by returned card state after manual listing save', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [cards, setCards] = useState([
        makeCard({
          id: 1,
          status: 'needs_attention',
          productName: 'Missing Foil Price',
          marketPrice: null,
          listingPrice: null,
        }),
      ]);

      return (
        <CardTable
          cards={cards}
          onReprice={() => {}}
          onDelete={() => {}}
          onMarkListed={() => {}}
          onUnlist={() => {}}
          onUpdateCard={async (id, data) => {
            const updated = makeCard({
              ...cards[0],
              ...data,
              id,
              status: 'needs_attention',
              listingPrice: '1.25',
            });
            setCards([updated]);
            return updated;
          }}
        />
      );
    }

    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /actions for missing foil price/i }));
    await user.click(screen.getByRole('menuitem', { name: /set manual listing price/i }));
    const dialog = screen.getByRole('dialog', {
      name: /set manual listing price for missing foil price/i,
    });
    await user.type(within(dialog).getByLabelText(/listing price/i), '1.25');
    await user.click(within(dialog).getByRole('button', { name: /save listing price/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '$1.25' })).toBeInTheDocument();
  });

  it('triggers Re-price from the row actions menu', async () => {
    const user = userEvent.setup();
    const onReprice = vi.fn().mockResolvedValue(undefined);

    render(
      <CardTable
        cards={[makeCard({ id: 1, productName: 'Matched Card' })]}
        onReprice={onReprice}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /actions for matched card/i }));
    await user.click(screen.getByRole('menuitem', { name: /re-price/i }));

    await waitFor(() => {
      expect(onReprice).toHaveBeenCalledWith(1);
    });
  });

  it('triggers Remove from listing from the row actions menu', async () => {
    const user = userEvent.setup();
    const onUnlist = vi.fn().mockResolvedValue(undefined);

    render(
      <CardTable
        cards={[makeCard({ id: 1, status: 'listed', productName: 'Listed Card' })]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={onUnlist}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /actions for listed card/i }));
    await user.click(
      screen.getByRole('menuitem', { name: /remove from listing/i }),
    );

    await waitFor(() => {
      expect(onUnlist).toHaveBeenCalledWith(1);
    });
  });

  it('opens TCGPlayer inventory for Needs Attention cards with a Product ID', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            status: 'needs_attention',
            tcgProductId: 685490,
            productName: 'Turn to Dust',
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /actions for turn to dust/i }));
    await user.click(
      screen.getByRole('menuitem', { name: /open tcgplayer inventory/i }),
    );

    expect(openSpy).toHaveBeenCalledWith(
      'https://store.tcgplayer.com/admin/product/manage/685490?OnlyMyInventory=false&SearchValue=Turn%20to%20Dust&CategoryId=0&SetNameId=0&Rarity=0&DidSearch=true',
      'tcgplayer-inventory',
    );

    openSpy.mockRestore();
  });

  it('uses the display title in the TCGPlayer inventory search value', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            status: 'needs_attention',
            tcgProductId: 685490,
            productName: 'Raw Name',
            title: 'Turn to Dust - Foil',
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /actions for turn to dust - foil/i }));
    await user.click(
      screen.getByRole('menuitem', { name: /open tcgplayer inventory/i }),
    );

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('SearchValue=Turn%20to%20Dust%20-%20Foil'),
      'tcgplayer-inventory',
    );

    openSpy.mockRestore();
  });

  it('does not show TCGPlayer inventory action without Needs Attention and Product ID', async () => {
    const user = userEvent.setup();

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            status: 'needs_attention',
            tcgProductId: null,
            productName: 'Missing Product ID',
          }),
          makeCard({
            id: 2,
            status: 'listed',
            tcgProductId: 685490,
            productName: 'Listed Card',
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /actions for missing product id/i }));
    expect(
      screen.queryByRole('menuitem', { name: /open tcgplayer inventory/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /actions for listed card/i }));
    expect(
      screen.queryByRole('menuitem', { name: /open tcgplayer inventory/i }),
    ).not.toBeInTheDocument();
  });

  it('triggers Delete from the row actions menu after confirmation', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <CardTable
        cards={[makeCard({ id: 1, productName: 'Delete Card' })]}
        onReprice={() => {}}
        onDelete={onDelete}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    await user.click(screen.getByRole('button', { name: /actions for delete card/i }));
    await user.click(screen.getByRole('menuitem', { name: /^delete$/i }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(1);
    });

    confirmSpy.mockRestore();
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

  it('needs_attention cards can edit and save listing price', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(
      makeCard({ id: 1, status: 'needs_attention', listingPrice: '2.00' }),
    );

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            status: 'needs_attention',
            listingPrice: '1.50',
          }),
        ]}
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
    const listingInput = inputs.find(
      (input) => (input as HTMLInputElement).value === '1.50',
    )!;
    await user.clear(listingInput);
    await user.type(listingInput, '2.00');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { listingPrice: 2.0 });
    });
  });

  it('non-listed and non-attention cards show non-editable listing price', () => {
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

  it('shows Record Sale action in the row menu on listed cards', async () => {
    render(
      <CardTable
        {...defaultTableProps}
        cards={[makeCard({ id: 1, status: 'listed', productName: 'Listed Card' })]}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /actions for listed card/i }));
    expect(
      screen.getByRole('menuitem', { name: /record sale/i }),
    ).toBeInTheDocument();
  });

  it('does NOT show Record Sale action on non-listed cards', async () => {
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

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /actions for matched card/i }));
    expect(
      screen.queryByRole('menuitem', { name: /record sale/i }),
    ).not.toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: /actions for test card/i }));
    await user.click(screen.getByRole('menuitem', { name: /record sale/i }));

    const dialog = screen.getByRole('dialog', { name: /record sale/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Test Card')).toBeInTheDocument();
  });

  it('passes defaultShippingCollectedCents through to RecordSaleModal', async () => {
    const user = userEvent.setup();
    render(
      <CardTable
        {...defaultTableProps}
        defaultShippingCollectedCents={249}
        cards={[
          makeCard({ id: 5, status: 'listed', productName: 'Test Card', listingPrice: '1.50', setName: 'Origins' }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /actions for test card/i }));
    await user.click(screen.getByRole('menuitem', { name: /record sale/i }));

    const dialog = screen.getByRole('dialog', { name: /record sale/i });
    const shippingInput = within(dialog).getByLabelText(
      /shipping collected/i,
    ) as HTMLInputElement;
    expect(shippingInput.value).toBe('2.49');
    expect(
      within(dialog).queryByRole('checkbox', { name: /apply estimated expenses/i }),
    ).toBeNull();
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

    await user.click(screen.getByRole('button', { name: /actions for sell me/i }));
    await user.click(screen.getByRole('menuitem', { name: /record sale/i }));

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

    const listedCheckbox = screen.getByTitle('Select for attach to order');
    expect(listedCheckbox).not.toBeDisabled();
  });

  it('when enableSellFlow=true, listed-origin needs_attention cards can be selected for attach to order', () => {
    render(
      <CardTable
        {...defaultTableProps}
        enableSellFlow
        cards={[
          makeCard({
            id: 1,
            status: 'needs_attention',
            attentionReason: 'listed_price_drift',
            productName: 'Attention Listed Card',
          }),
        ]}
      />,
    );

    expect(screen.getByTitle('Select for attach to order')).not.toBeDisabled();
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

  it('passes defaultShippingCollectedCents through to BulkSellModal', async () => {
    const user = userEvent.setup();
    render(
      <CardTable
        {...defaultTableProps}
        enableSellFlow
        defaultShippingCollectedCents={249}
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
    const shippingInput = within(dialog).getByLabelText(
      /shipping collected/i,
    ) as HTMLInputElement;
    expect(shippingInput.value).toBe('2.49');
  });

  it('when bulkMode=list, matched cards are selectable and Mark as Listed is shown', async () => {
    const user = userEvent.setup();
    render(
      <CardTable
        {...defaultTableProps}
        bulkMode="list"
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

  it('when bulkMode=list, listed card checkboxes are disabled', () => {
    render(
      <CardTable
        {...defaultTableProps}
        bulkMode="list"
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
