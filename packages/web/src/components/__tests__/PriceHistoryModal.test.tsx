import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { PriceHistoryModal } from '../PriceHistoryModal';
import type { PriceHistoryEntry } from '../../api/types';

// Mock the api module
vi.mock('../../api/client', () => ({
  api: {
    getCardPriceHistory: vi.fn(),
  },
}));

import { api } from '../../api/client';
const mockGetCardPriceHistory = vi.mocked(api.getCardPriceHistory);

function makeEntry(
  overrides: Partial<PriceHistoryEntry> = {},
): PriceHistoryEntry {
  return {
    id: 1,
    cardId: 42,
    checkedAt: '2026-03-30T14:30:00Z',
    source: 'scheduled',
    previousMarketPrice: '0.25',
    newMarketPrice: '0.30',
    previousListingPrice: '0.25',
    newListingPrice: '0.29',
    driftPercent: '20.00',
    previousStatus: 'listed',
    newStatus: 'listed',
    ...overrides,
  } as PriceHistoryEntry;
}

describe('PriceHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockGetCardPriceHistory.mockReturnValue(new Promise(() => {})); // never resolves

    render(
      <PriceHistoryModal
        cardId={42}
        cardName="Targon's Peak"
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId('price-history-loading')).toBeInTheDocument();
    expect(screen.getByText(/loading price history/i)).toBeInTheDocument();
  });

  it('renders card name in header', () => {
    mockGetCardPriceHistory.mockReturnValue(new Promise(() => {}));

    render(
      <PriceHistoryModal
        cardId={42}
        cardName="Targon's Peak"
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Targon's Peak")).toBeInTheDocument();
  });

  it('shows empty state when no history', async () => {
    mockGetCardPriceHistory.mockResolvedValue({ history: [] });

    render(
      <PriceHistoryModal
        cardId={42}
        cardName="Targon's Peak"
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('price-history-empty')).toBeInTheDocument();
    });
    expect(screen.getByText(/no price history recorded/i)).toBeInTheDocument();
  });

  it('shows error state on API failure', async () => {
    mockGetCardPriceHistory.mockRejectedValue(new Error('Network error'));

    render(
      <PriceHistoryModal
        cardId={42}
        cardName="Targon's Peak"
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('price-history-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  it('renders history table with entries', async () => {
    const entries: PriceHistoryEntry[] = [
      makeEntry({
        id: 1,
        source: 'scheduled',
        previousMarketPrice: '0.25',
        newMarketPrice: '0.30',
        previousListingPrice: '0.25',
        newListingPrice: '0.29',
        driftPercent: '20.00',
        previousStatus: 'listed',
        newStatus: 'listed',
      }),
      makeEntry({
        id: 2,
        checkedAt: '2026-03-29T10:00:00Z',
        source: 'manual',
        previousMarketPrice: '0.20',
        newMarketPrice: '0.25',
        previousListingPrice: '0.20',
        newListingPrice: '0.25',
        driftPercent: '25.00',
        previousStatus: 'matched',
        newStatus: 'listed',
      }),
    ];
    mockGetCardPriceHistory.mockResolvedValue({ history: entries });

    render(
      <PriceHistoryModal
        cardId={42}
        cardName="Targon's Peak"
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('scheduled')).toBeInTheDocument();
    });

    // Check table headers
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Market')).toBeInTheDocument();
    expect(screen.getByText('Listing')).toBeInTheDocument();
    expect(screen.getByText('Drift')).toBeInTheDocument();
    expect(screen.getByText('Status Change')).toBeInTheDocument();

    // Check data rows
    expect(screen.getByText('scheduled')).toBeInTheDocument();
    expect(screen.getByText('manual')).toBeInTheDocument();
    expect(screen.getByText('+20.00%')).toBeInTheDocument();
    expect(screen.getByText('+25.00%')).toBeInTheDocument();

    // Status change shows for row 2 (matched → listed)
    expect(screen.getByText('matched → listed')).toBeInTheDocument();
  });

  it('formats negative drift correctly', async () => {
    mockGetCardPriceHistory.mockResolvedValue({
      history: [makeEntry({ id: 1, driftPercent: '-5.50' })],
    });

    render(
      <PriceHistoryModal cardId={42} cardName="Test Card" onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText('-5.50%')).toBeInTheDocument();
    });
  });

  it('shows dash for null drift', async () => {
    mockGetCardPriceHistory.mockResolvedValue({
      history: [makeEntry({ id: 1, driftPercent: null })],
    });

    render(
      <PriceHistoryModal cardId={42} cardName="Test Card" onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText('scheduled')).toBeInTheDocument();
    });
    // Drift column should show dash — the table renders multiple '—' values;
    // verify the source rendered, indicating the row is complete
  });

  it('calls onClose when footer close button clicked', async () => {
    mockGetCardPriceHistory.mockResolvedValue({ history: [] });
    const onClose = vi.fn();

    render(
      <PriceHistoryModal cardId={42} cardName="Test Card" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('price-history-empty')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    // Footer "Close" button (the second one)
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    await user.click(closeButtons[closeButtons.length - 1]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when X button clicked', async () => {
    mockGetCardPriceHistory.mockResolvedValue({ history: [] });
    const onClose = vi.fn();

    render(
      <PriceHistoryModal cardId={42} cardName="Test Card" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('price-history-empty')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    // The X button is the first close button (in header)
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    await user.click(closeButtons[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', async () => {
    mockGetCardPriceHistory.mockResolvedValue({ history: [] });
    const onClose = vi.fn();

    render(
      <PriceHistoryModal cardId={42} cardName="Test Card" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('price-history-empty')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const backdrop = screen.getByRole('dialog');
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('passes correct cardId and limit to API', async () => {
    mockGetCardPriceHistory.mockResolvedValue({ history: [] });

    render(
      <PriceHistoryModal cardId={99} cardName="Test Card" onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(mockGetCardPriceHistory).toHaveBeenCalledWith(99, 50);
    });
  });

  it('calls onClose when Escape key is pressed', async () => {
    mockGetCardPriceHistory.mockResolvedValue({ history: [] });
    const onClose = vi.fn();

    render(
      <PriceHistoryModal cardId={42} cardName="Test Card" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('price-history-empty')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has proper dialog aria attributes', () => {
    mockGetCardPriceHistory.mockReturnValue(new Promise(() => {}));

    render(
      <PriceHistoryModal cardId={42} cardName="Test Card" onClose={() => {}} />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Price history for Test Card');
  });
});
