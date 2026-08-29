import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StatsBar } from '../StatsBar';

const stats = {
  total: 37,
  pending: 3,
  matched: 11,
  listed: 14,
  needs_attention: 2,
  sold: 6,
  gifted: 1,
  error: 4,
};

describe('StatsBar', () => {
  it('renders Industry KPI plates from the live inventory statistics', () => {
    render(<StatsBar stats={stats} />);

    const metrics = screen.getByRole('region', { name: 'Inventory metrics' });
    expect(metrics).toHaveTextContent('Total cards');
    expect(metrics).toHaveTextContent('37');
    expect(metrics).toHaveTextContent('Ready to list');
    expect(metrics).toHaveTextContent('11');
    expect(metrics).toHaveTextContent('Needs review');
    expect(metrics).toHaveTextContent('2');
    expect(metrics).toHaveTextContent('Sold');
    expect(metrics).toHaveTextContent('6');
    expect(metrics).toHaveTextContent('1 gifted');
    expect(metrics.querySelectorAll('.stats-plate')).toHaveLength(7);
  });

  it('keeps a labeled loading state while statistics are pending', () => {
    render(<StatsBar stats={null} loading />);

    expect(
      screen.getByRole('region', { name: 'Inventory metrics' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading inventory metrics…')).toBeInTheDocument();
  });
});
