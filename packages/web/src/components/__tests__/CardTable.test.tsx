import { describe, expect, it, vi } from 'vitest';
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
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('CardTable review + confirm flow', () => {
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
