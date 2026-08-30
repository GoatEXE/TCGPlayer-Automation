import { useState } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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

describe('CardTable desktop time columns', () => {
  it('does not render Last Checked or Updated headers on desktop', () => {
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

    expect(
      screen.queryByRole('columnheader', { name: /^Last Checked$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: /^Updated$/i }),
    ).not.toBeInTheDocument();
  });
});

describe('CardTable foil condition emphasis', () => {
  it('preserves condition text and styles only full case-insensitive terminal Foil conditions', () => {
    render(
      <CardTable
        cards={[
          makeCard({ id: 1, condition: 'Near Mint Foil' }),
          makeCard({ id: 2, condition: 'Lightly Played foil' }),
          makeCard({ id: 3, condition: 'Near Mint' }),
          makeCard({ id: 4, condition: 'Near Mint Foiled' }),
          makeCard({ id: 5, condition: 'Foil Finish' }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    const [, firstFoilRow, lowercaseFoilRow, nearMintRow, foiledRow, nonterminalRow] =
      screen.getAllByRole('row');
    const firstFoilCell = firstFoilRow.cells[6];
    const firstFoilCondition = firstFoilCell.querySelector('.inventory-condition-foil');

    expect(firstFoilCell.textContent).toBe('Near Mint Foil');
    expect(firstFoilCondition).toHaveTextContent('Near Mint Foil');
    expect(firstFoilCell.querySelectorAll('.inventory-condition-foil')).toHaveLength(1);

    const lowercaseFoilCell = lowercaseFoilRow.cells[6];
    expect(lowercaseFoilCell.textContent).toBe('Lightly Played foil');
    expect(lowercaseFoilCell.querySelector('.inventory-condition-foil')).toHaveTextContent(
      'Lightly Played foil',
    );

    for (const cell of [nearMintRow.cells[6], foiledRow.cells[6], nonterminalRow.cells[6]]) {
      expect(cell.querySelector('.inventory-condition-foil')).toBeNull();
    }
    expect(nearMintRow.cells[6].textContent).toBe('Near Mint');
    expect(foiledRow.cells[6].textContent).toBe('Near Mint Foiled');
    expect(nonterminalRow.cells[6].textContent).toBe('Foil Finish');
  });
});

describe('CardTable desktop numeric alignment', () => {
  it('marks the Qty through Actions block with centered desktop column classes', () => {
    render(
      <CardTable
        cards={[
          makeCard({
            status: 'listed',
            quantity: 7,
            marketPrice: '1.27',
            listingPrice: '1.25',
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
      />,
    );

    for (const headerName of ['Qty', 'Market', "Rec'd"]) {
      expect(screen.getByRole('columnheader', { name: headerName })).toHaveClass(
        'inventory-card-table__numeric-column',
      );
    }
    expect(screen.getByRole('columnheader', { name: 'Listing' })).toHaveClass(
      'inventory-card-table__listing-column',
    );
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toHaveClass(
      'inventory-card-table__actions-column',
    );

    expect(screen.getByText('7').closest('td')).toHaveClass(
      'inventory-card-table__numeric-column',
    );
    expect(screen.getByText('$1.27').closest('td')).toHaveClass(
      'inventory-card-table__numeric-column',
    );
    expect(screen.getByText('$1.24').closest('td')).toHaveClass(
      'inventory-card-table__numeric-column',
    );
    expect(screen.getByRole('button', { name: /edit listing price.*\$1\.25/i }).closest('td')).toHaveClass(
      'inventory-card-table__listing-column',
    );
    expect(
      screen.getByRole('button', { name: /actions for targon's peak/i }).closest('td'),
    ).toHaveClass('inventory-card-table__actions-column');
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
    expect(within(dialog).getAllByText(/^Updated$/i).length).toBeGreaterThan(0);
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
    expect(within(dialog).queryByText(/^Updated$/i)).not.toBeInTheDocument();
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
    expect(within(dialog).queryByText(/^Updated$/i)).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', {
      name: /edit listing price for missing foil price, currently \$1\.25/i,
    })).toBeInTheDocument();
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

  it.each([
    ['Ready to List', 'matched'],
    ['Listed', 'listed'],
    ['Pending', 'pending'],
    ['Needs Attention', 'needs_attention'],
    ['Gift', 'gift'],
    ['Gifted', 'gifted'],
    ['Sold', 'sold'],
    ['Error', 'error'],
  ] as const)(
    'opens the named Open in TCG action from the $0 row menu when a Product ID is available',
    async (_statusLabel, status) => {
      const user = userEvent.setup();
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      const productName = `${_statusLabel} Card`;

      render(
        <CardTable
          cards={[
            makeCard({
              id: 1,
              status,
              tcgProductId: 685490,
              productName,
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
        screen.getByRole('button', {
          name: new RegExp(`actions for ${productName}`, 'i'),
        }),
      );
      await user.click(screen.getByRole('menuitem', { name: 'Open in TCG' }));

      expect(openSpy).toHaveBeenCalledWith(
        `https://store.tcgplayer.com/admin/product/manage/685490?OnlyMyInventory=false&SearchValue=${encodeURIComponent(productName)}&CategoryId=0&SetNameId=0&Rarity=0&DidSearch=true`,
        'tcgplayer-inventory',
      );
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      openSpy.mockRestore();
    },
  );

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
    await user.click(screen.getByRole('menuitem', { name: 'Open in TCG' }));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('SearchValue=Turn%20to%20Dust%20-%20Foil'),
      'tcgplayer-inventory',
    );

    openSpy.mockRestore();
  });

  it('does not show Open in TCG without a TCGPlayer Product ID', async () => {
    const user = userEvent.setup();

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            status: 'matched',
            tcgProductId: null,
            productName: 'Ready to List Without Product ID',
          }),
          makeCard({
            id: 2,
            status: 'listed',
            tcgProductId: null,
            productName: 'Listed Without Product ID',
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
      screen.getByRole('button', {
        name: /actions for ready to list without product id/i,
      }),
    );
    expect(
      screen.queryByRole('menuitem', { name: 'Open in TCG' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: /actions for listed without product id/i,
      }),
    );
    expect(
      screen.queryByRole('menuitem', { name: 'Open in TCG' }),
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

describe('CardTable display-first listing price editing', () => {
  const tableProps = {
    onReprice: () => {},
    onDelete: () => {},
    onMarkListed: () => {},
    onUnlist: () => {},
  };

  it('renders eligible idle listing prices as plain currency edit triggers', () => {
    render(
      <CardTable
        {...tableProps}
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '0.20' })]}
        onUpdateCard={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: /edit listing price for targon's peak, currently \$0\.20/i,
    });
    expect(trigger).toHaveTextContent('$0.20');
    expect(trigger).toHaveClass('listing-price-display');
    expect(trigger.querySelector('.listing-price-display__icon')).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: /listing price/i })).toBeNull();
  });

  it('activates a decimal editor with auto-selected value and accessible save/cancel controls', async () => {
    const user = userEvent.setup();
    render(
      <CardTable
        {...tableProps}
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '1.50' })]}
        onUpdateCard={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit listing price/i }));

    const input = screen.getByRole('textbox', { name: /listing price for targon's peak/i }) as HTMLInputElement;
    expect(input).toHaveValue('1.50');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(4);
    expect(screen.getByRole('button', { name: /save listing price/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel editing listing price/i })).toBeInTheDocument();
  });

  it('saves the decimal value through the explicit Save control and confirms success', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(makeCard({ id: 1, listingPrice: '2.00' }));
    render(
      <CardTable
        {...tableProps}
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '1.50' })]}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit listing price/i }));
    const input = screen.getByRole('textbox', { name: /listing price/i });
    await user.clear(input);
    await user.type(input, '2.00');
    await user.click(screen.getByRole('button', { name: /save listing price/i }));

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { listingPrice: 2 });
    });
    expect(screen.queryByRole('textbox', { name: /listing price/i })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('saves on Enter without relying on blur', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(makeCard({ id: 1, listingPrice: '2.00' }));
    render(
      <CardTable
        {...tableProps}
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '1.50' })]}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit listing price/i }));
    const input = screen.getByRole('textbox', { name: /listing price/i });
    await user.clear(input);
    await user.type(input, '2.00{Enter}');

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { listingPrice: 2 });
    });
  });

  it('restores the original value when cancelled by button or Escape without saving', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn();
    render(
      <CardTable
        {...tableProps}
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '1.50' })]}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit listing price/i }));
    await user.clear(screen.getByRole('textbox', { name: /listing price/i }));
    await user.type(screen.getByRole('textbox', { name: /listing price/i }), '4.00');
    await user.click(screen.getByRole('button', { name: /cancel editing listing price/i }));
    expect(screen.getByRole('button', { name: /currently \$1\.50/i })).toHaveTextContent('$1.50');

    await user.click(screen.getByRole('button', { name: /edit listing price/i }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /currently \$1\.50/i })).toBeInTheDocument();
    expect(onUpdateCard).not.toHaveBeenCalled();
  });

  it('keeps the editor open and surfaces invalid input without mutation', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn();
    render(
      <CardTable
        {...tableProps}
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '1.50' })]}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit listing price/i }));
    const input = screen.getByRole('textbox', { name: /listing price/i });
    await user.clear(input);
    await user.type(input, 'not-a-price');
    await user.click(screen.getByRole('button', { name: /save listing price/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/non-negative dollar amount/i);
    expect(screen.getByRole('textbox', { name: /listing price/i })).toBeInTheDocument();
    expect(onUpdateCard).not.toHaveBeenCalled();
  });

  it('disables editor controls while saving and deduplicates repeated submission', async () => {
    const user = userEvent.setup();
    let resolveUpdate: (card: Card) => void;
    const pendingUpdate = new Promise<Card>((resolve) => {
      resolveUpdate = resolve;
    });
    const onUpdateCard = vi.fn().mockReturnValue(pendingUpdate);
    render(
      <CardTable
        {...tableProps}
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '1.50' })]}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit listing price/i }));
    await user.click(screen.getByRole('button', { name: /save listing price/i }));

    const saveButton = screen.getByRole('button', { name: /save listing price/i });
    const cancelButton = screen.getByRole('button', { name: /cancel editing listing price/i });
    await waitFor(() => {
      expect(saveButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();
    });
    await user.click(saveButton);
    expect(onUpdateCard).toHaveBeenCalledTimes(1);

    resolveUpdate!(makeCard({ id: 1, listingPrice: '1.50' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Saved');
    });
  });

  it('retains editing for needs_attention cards with missing Market values', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(
      makeCard({ id: 1, status: 'needs_attention', marketPrice: null, listingPrice: '2.00' }),
    );
    render(
      <CardTable
        {...tableProps}
        cards={[
          makeCard({
            id: 1,
            status: 'needs_attention',
            marketPrice: null,
            listingPrice: null,
          }),
        ]}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit listing price/i }));
    const input = screen.getByRole('textbox', { name: /listing price/i });
    await user.type(input, '2.00');
    await user.click(screen.getByRole('button', { name: /save listing price/i }));

    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { listingPrice: 2 });
    });
  });

  it('surfaces save errors without discarding the editor value', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockRejectedValue(new Error('Save failed'));
    render(
      <CardTable
        {...tableProps}
        cards={[makeCard({ id: 1, status: 'listed', listingPrice: '1.50' })]}
        onUpdateCard={onUpdateCard}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit listing price/i }));
    await user.click(screen.getByRole('button', { name: /save listing price/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
    expect(screen.getByRole('textbox', { name: /listing price/i })).toHaveValue('1.50');
  });

  it('keeps non-listed and non-attention listing values as non-editable plain text', () => {
    render(
      <CardTable
        {...tableProps}
        cards={[makeCard({ id: 1, status: 'matched', listingPrice: '0.20' })]}
        onUpdateCard={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('row');
    const listingCell = rows[1].querySelectorAll('td')[10];
    expect(listingCell.querySelector('button')).toBeNull();
    expect(listingCell).toHaveTextContent('$0.20');
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
          makeCard({ id: 4, status: 'gifted', productName: 'Gifted Card' }),
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

describe('CardTable phone inventory rows', () => {
  let innerWidthDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    innerWidthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 640,
      writable: true,
    });
    vi.stubGlobal('ResizeObserver', undefined);
  });

  afterEach(() => {
    if (innerWidthDescriptor) {
      Object.defineProperty(window, 'innerWidth', innerWidthDescriptor);
    }
    vi.unstubAllGlobals();
  });

  it('uses collapsed touch rows instead of the inventory table and exposes data and actions on expansion', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            productName: 'Mobile Card',
            status: 'listed',
            condition: 'Near Mint Foil',
            quantity: 3,
            marketPrice: '2.50',
            listingPrice: '2.45',
            tcgProductId: 685490,
            tcgplayerId: 12345,
            photoUrl: 'https://example.com/mobile-card.jpg',
            lastCheckedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          }),
        ]}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={vi.fn().mockResolvedValue(makeCard())}
        onSortChange={onSortChange}
        sortField="updatedAt"
        sortDirection="desc"
      />,
    );

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const list = screen.getByTestId('inventory-mobile-list');
    expect(within(list).getByText('Mobile Card')).toBeInTheDocument();
    expect(within(list).getByText('Listed')).toBeInTheDocument();
    const mobileFoilCondition = within(list).getByText('Near Mint Foil');
    expect(mobileFoilCondition.textContent).toBe('Near Mint Foil');
    expect(mobileFoilCondition).toHaveClass('inventory-condition-foil');
    expect(within(list).getByText('Qty 3')).toBeInTheDocument();
    expect(within(list).getByText('$2.45')).toBeInTheDocument();
    expect(within(list).getByText('$2.50')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /view photo for mobile card/i })).toBeInTheDocument();
    expect(within(list).queryByText('Origins')).not.toBeInTheDocument();

    await user.selectOptions(
      within(list).getByLabelText(/sort inventory/i),
      'productName:asc',
    );
    expect(onSortChange).toHaveBeenCalledWith('productName', 'asc');

    await user.click(
      within(list).getByRole('button', { name: /show details for mobile card/i }),
    );

    expect(within(list).getByText('Origins')).toBeInTheDocument();
    expect(within(list).getByText('12345')).toBeInTheDocument();
    expect(within(list).getByText('685490')).toBeInTheDocument();
    expect(within(list).getByText("Rec’d")).toBeInTheDocument();
    expect(within(list).getByText('Last checked')).toBeInTheDocument();
    expect(within(list).getByText('1h ago')).toBeInTheDocument();
    expect(within(list).getByText('Updated')).toBeInTheDocument();
    expect(within(list).getByText('2h ago')).toBeInTheDocument();

    await user.click(
      within(list).getByRole('button', { name: /actions for mobile card/i }),
    );
    expect(screen.getByRole('menuitem', { name: /record sale/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /remove from listing/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /view price history/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /open in tcg/i })).toBeInTheDocument();
  });

  it('retains selection, listing edits, and global Needs Attention review in phone mode', async () => {
    const user = userEvent.setup();
    const onUpdateCard = vi.fn().mockResolvedValue(makeCard());
    const onLoadNeedsAttentionReviewCards = vi.fn().mockResolvedValue([
      makeCard({
        id: 2,
        productName: 'Off-page Attention Card',
        status: 'needs_attention',
        marketPrice: '4.00',
      }),
    ]);

    render(
      <CardTable
        cards={[
          makeCard({
            id: 1,
            productName: 'Phone Listed Card',
            status: 'listed',
            listingPrice: '1.50',
          }),
        ]}
        needsAttentionCount={1}
        onLoadNeedsAttentionReviewCards={onLoadNeedsAttentionReviewCards}
        onReprice={() => {}}
        onDelete={() => {}}
        onMarkListed={() => {}}
        onUnlist={() => {}}
        onUpdateCard={onUpdateCard}
        enableSellFlow
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /select phone listed card/i }));
    expect(screen.getByRole('button', { name: /attach 1 to order/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', {
      name: /edit listing price for phone listed card/i,
    }));
    const listingInput = screen.getByRole('textbox', {
      name: /listing price for phone listed card/i,
    });
    await user.clear(listingInput);
    await user.type(listingInput, '2.00');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(onUpdateCard).toHaveBeenCalledWith(1, { listingPrice: 2 });
    });

    await user.click(screen.getByRole('button', { name: /review pricing/i }));
    const dialog = await screen.findByRole('dialog', { name: /pricing review/i });
    expect(onLoadNeedsAttentionReviewCards).toHaveBeenCalledOnce();
    expect(dialog).toHaveTextContent('Off-page Attention Card');
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

  it('does not render zero-quantity active or terminal rows', () => {
    render(
      <CardTable
        {...defaultTableProps}
        cards={[
          makeCard({
            id: 1,
            quantity: 0,
            status: 'matched',
            productName: 'Depleted Active Card',
          }),
          makeCard({
            id: 2,
            quantity: 0,
            status: 'sold',
            productName: 'Depleted Sold Card',
          }),
          makeCard({
            id: 3,
            quantity: 1,
            status: 'listed',
            productName: 'Available Card',
          }),
        ]}
      />,
    );

    expect(screen.queryByText('Depleted Active Card')).not.toBeInTheDocument();
    expect(screen.queryByText('Depleted Sold Card')).not.toBeInTheDocument();
    expect(screen.getByText('Available Card')).toBeInTheDocument();
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
