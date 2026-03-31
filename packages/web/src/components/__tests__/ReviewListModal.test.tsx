import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { Card } from '../../api/types';
import { ReviewListModal } from '../ReviewListModal';

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

describe('ReviewListModal', () => {
  it('renders selected card summary and totals', () => {
    render(
      <ReviewListModal
        cards={[
          makeCard({
            id: 1,
            productName: 'Card One',
            quantity: 2,
            listingPrice: '0.25',
          }),
          makeCard({
            id: 2,
            productName: 'Card Two',
            quantity: 3,
            listingPrice: '0.10',
          }),
        ]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Card One')).toBeInTheDocument();
    expect(screen.getByText('Card Two')).toBeInTheDocument();
    expect(screen.getByText(/5 total qty/)).toBeInTheDocument();
    expect(screen.getByText('$0.80')).toBeInTheDocument();
  });

  it('calls confirm and cancel handlers', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ReviewListModal
        cards={[makeCard()]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /confirm mark as listed/i }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
