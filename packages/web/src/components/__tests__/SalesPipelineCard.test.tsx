import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalesPipelineCard } from '../SalesPipelineCard';
import type { SalesPipelineEntry } from '../../api/types';

const fullPipeline: SalesPipelineEntry[] = [
  { status: 'pending', count: 3, totalCents: 1500 },
  { status: 'confirmed', count: 5, totalCents: 2500 },
  { status: 'shipped', count: 2, totalCents: 800 },
  { status: 'delivered', count: 10, totalCents: 5000 },
  { status: 'cancelled', count: 1, totalCents: 200 },
];

describe('SalesPipelineCard', () => {
  it('renders all five status cards', () => {
    render(<SalesPipelineCard pipeline={fullPipeline} />);

    expect(screen.getByText('pending')).toBeTruthy();
    expect(screen.getByText('confirmed')).toBeTruthy();
    expect(screen.getByText('shipped')).toBeTruthy();
    expect(screen.getByText('delivered')).toBeTruthy();
    expect(screen.getByText('cancelled')).toBeTruthy();
  });

  it('displays count and dollar total for each status', () => {
    render(<SalesPipelineCard pipeline={fullPipeline} />);

    // pending: 3 orders, $15.00
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('$15.00')).toBeTruthy();

    // delivered: 10 orders, $50.00
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('$50.00')).toBeTruthy();
  });

  it('renders zero-count statuses when pipeline is empty', () => {
    render(<SalesPipelineCard pipeline={[]} />);

    expect(screen.getByText('pending')).toBeTruthy();
    expect(screen.getByText('confirmed')).toBeTruthy();
    expect(screen.getByText('shipped')).toBeTruthy();
    expect(screen.getByText('delivered')).toBeTruthy();
    expect(screen.getByText('cancelled')).toBeTruthy();

    // All counts should be 0
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBe(5);
  });

  it('highlights the active status when activeStatus is set', () => {
    const { container } = render(
      <SalesPipelineCard pipeline={fullPipeline} activeStatus="shipped" />,
    );

    const activeCard = container.querySelector('.pipeline-card-active');
    expect(activeCard).toBeTruthy();
    expect(activeCard!.textContent).toContain('shipped');
  });

  it('calls onSelectStatus when a status card is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <SalesPipelineCard pipeline={fullPipeline} onSelectStatus={onSelect} />,
    );

    await user.click(screen.getByText('confirmed'));
    expect(onSelect).toHaveBeenCalledWith('confirmed');
  });

  it('does not crash when onSelectStatus is not provided', async () => {
    const user = userEvent.setup();

    render(<SalesPipelineCard pipeline={fullPipeline} />);

    // Clicking should not throw
    await user.click(screen.getByText('confirmed'));
  });

  it('fills in missing statuses from partial pipeline data', () => {
    const partial: SalesPipelineEntry[] = [
      { status: 'pending', count: 2, totalCents: 400 },
    ];
    render(<SalesPipelineCard pipeline={partial} />);

    // All 5 statuses should still render
    expect(screen.getByText('confirmed')).toBeTruthy();
    expect(screen.getByText('shipped')).toBeTruthy();
    expect(screen.getByText('delivered')).toBeTruthy();
    expect(screen.getByText('cancelled')).toBeTruthy();
  });
});
