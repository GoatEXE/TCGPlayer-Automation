import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListedPriceThresholdControl } from '../ListedPriceThresholdControl';

describe('ListedPriceThresholdControl', () => {
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays the current threshold value and helper copy', () => {
    render(
      <ListedPriceThresholdControl currentThresholdPercent={12} onSaved={onSaved} />,
    );

    const input = screen.getByLabelText('Listing attention threshold (%)') as HTMLInputElement;
    expect(input.value).toBe('12');
    expect(
      screen.getByText(/does not change tcgplayer listing prices/i),
    ).toBeTruthy();
  });

  it('calls onSaved with new threshold on submit', async () => {
    const user = userEvent.setup();
    onSaved.mockResolvedValueOnce(undefined);

    render(
      <ListedPriceThresholdControl currentThresholdPercent={12} onSaved={onSaved} />,
    );

    const input = screen.getByLabelText('Listing attention threshold (%)');
    await user.clear(input);
    await user.type(input, '15');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(15);
    });
  });

  it('shows validation error below zero', async () => {
    render(
      <ListedPriceThresholdControl currentThresholdPercent={12} onSaved={onSaved} />,
    );

    const input = screen.getByLabelText('Listing attention threshold (%)');
    fireEvent.change(input, { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.getByRole('alert').textContent).toContain(
      'Must be a non-negative number',
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('allows thresholds above 100 when submitted', async () => {
    const user = userEvent.setup();
    onSaved.mockResolvedValueOnce(undefined);

    render(
      <ListedPriceThresholdControl currentThresholdPercent={12} onSaved={onSaved} />,
    );

    const input = screen.getByLabelText('Listing attention threshold (%)');
    await user.clear(input);
    await user.type(input, '101');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(101);
    });
  });

  it('shows server error message on failed save', async () => {
    const user = userEvent.setup();
    onSaved.mockRejectedValueOnce(new Error('Server error'));

    render(
      <ListedPriceThresholdControl currentThresholdPercent={12} onSaved={onSaved} />,
    );

    const input = screen.getByLabelText('Listing attention threshold (%)');
    await user.clear(input);
    await user.type(input, '15');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Server error');
    });
  });
});
