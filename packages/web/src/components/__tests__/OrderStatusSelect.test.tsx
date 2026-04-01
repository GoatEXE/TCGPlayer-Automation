import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderStatusSelect } from '../OrderStatusSelect';

describe('OrderStatusSelect', () => {
  const onChange = vi.fn();

  it('renders a select with valid transitions for pending', () => {
    render(<OrderStatusSelect currentStatus="pending" onChange={onChange} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('confirmed');
    expect(options).toContain('cancelled');
    expect(options).not.toContain('shipped');
    expect(options).not.toContain('delivered');
  });

  it('renders a select with valid transitions for confirmed', () => {
    render(<OrderStatusSelect currentStatus="confirmed" onChange={onChange} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('shipped');
    expect(options).toContain('cancelled');
    expect(options).not.toContain('pending');
    expect(options).not.toContain('delivered');
  });

  it('renders a select with valid transitions for shipped', () => {
    render(<OrderStatusSelect currentStatus="shipped" onChange={onChange} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('delivered');
    expect(options).toContain('cancelled');
    expect(options).not.toContain('pending');
    expect(options).not.toContain('confirmed');
  });

  it('renders non-editable badge for delivered (terminal)', () => {
    render(<OrderStatusSelect currentStatus="delivered" onChange={onChange} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('delivered')).toBeTruthy();
  });

  it('renders non-editable badge for cancelled (terminal)', () => {
    render(<OrderStatusSelect currentStatus="cancelled" onChange={onChange} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('cancelled')).toBeTruthy();
  });

  it('calls onChange with selected status', async () => {
    const user = userEvent.setup();
    render(<OrderStatusSelect currentStatus="pending" onChange={onChange} />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'confirmed');
    expect(onChange).toHaveBeenCalledWith('confirmed');
  });

  it('has the current status as default selected option', () => {
    render(<OrderStatusSelect currentStatus="pending" onChange={onChange} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('pending');
  });
});
