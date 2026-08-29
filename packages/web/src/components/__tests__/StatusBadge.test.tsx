import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StatusBadge } from '../StatusBadge';
import type { Card } from '../../api/types';

describe('StatusBadge', () => {
  const testCases: Array<{
    status: Card['status'];
    label: string;
  }> = [
    { status: 'pending', label: 'Pending' },
    { status: 'matched', label: 'Ready to List' },
    { status: 'listed', label: 'Listed' },
    { status: 'gifted', label: 'Gifted' },
    { status: 'needs_attention', label: 'Needs Attention' },
    { status: 'error', label: 'Error' },
    { status: 'sold', label: 'Sold' },
  ];

  testCases.forEach(({ status, label }) => {
    it(`renders ${status} with an Industry status token`, () => {
      render(<StatusBadge status={status} />);

      const badge = screen.getByText(label);
      expect(badge).toHaveClass('inventory-status-badge');
      expect(badge).toHaveClass(`inventory-status-badge--${status}`);
      expect(badge).toHaveAttribute('data-status', status);
    });
  });

  it('falls back to the Pending label for an unknown runtime status', () => {
    render(<StatusBadge status={'unknown' as Card['status']} />);

    expect(screen.getByText('Pending')).toHaveClass(
      'inventory-status-badge--unknown',
    );
  });
});
