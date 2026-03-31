import { describe, expect, it } from 'vitest';
import { buildScheduledPriceCheckMessage } from '../scheduler.js';

describe('buildScheduledPriceCheckMessage', () => {
  it('includes summary, top drifted cards, and first error', () => {
    const message = buildScheduledPriceCheckMessage(
      {
        updated: 42,
        notFound: 3,
        drifted: 4,
        errors: ['Error fetching pricing for set Origins: timeout'],
        driftedCards: [
          {
            cardId: 1,
            productName: 'Jinx',
            previousListingPrice: 1.96,
            newListingPrice: 2.24,
            driftPercent: 14.29,
          },
          {
            cardId: 2,
            productName: 'Yasuo',
            previousListingPrice: 0.49,
            newListingPrice: 0.42,
            driftPercent: -14.29,
          },
        ],
      },
      2,
    );

    expect(message).toContain('📈 Scheduled price check completed');
    expect(message).toContain('Updated: 42');
    expect(message).toContain('Not found: 3');
    expect(message).toContain('Drifted (>= 2%): 4');
    expect(message).toContain('Errors: 1');
    expect(message).toContain('Top drifted cards:');
    expect(message).toContain('• Jinx - $1.96 → $2.24 (+14.29%)');
    expect(message).toContain('• Yasuo - $0.49 → $0.42 (-14.29%)');
    expect(message).toContain('First error:');
  });

  it('omits drift and error detail sections when none', () => {
    const message = buildScheduledPriceCheckMessage(
      {
        updated: 10,
        notFound: 0,
        drifted: 0,
        errors: [],
        driftedCards: [],
      },
      2,
    );

    expect(message).toContain('Updated: 10');
    expect(message).not.toContain('Top drifted cards:');
    expect(message).not.toContain('First error:');
  });

  it('limits drift details to top 5 by absolute drift', () => {
    const driftedCards = Array.from({ length: 7 }, (_, i) => ({
      cardId: i + 1,
      productName: `Card ${i + 1}`,
      previousListingPrice: 1,
      newListingPrice: 1 + i / 10,
      driftPercent: i + 1,
    }));

    const message = buildScheduledPriceCheckMessage(
      {
        updated: 7,
        notFound: 0,
        drifted: 7,
        errors: [],
        driftedCards,
      },
      2,
    );

    const lines = message
      .split('\n')
      .filter((line) => line.trim().startsWith('• '));
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('Card 7');
  });
});
