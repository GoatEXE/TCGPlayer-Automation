import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListedPriceThresholdControl } from '../ListedPriceThresholdControl';

describe('ListedPriceThresholdControl', () => {
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays the current threshold and minimum difference values without helper copy', () => {
    render(
      <ListedPriceThresholdControl
        currentThresholdPercent={12}
        currentMinDiffCents={5}
        onSaved={onSaved}
      />,
    );

    const percentInput = screen.getByLabelText(
      'Listing attention threshold (%)',
    ) as HTMLInputElement;
    const minDiffInput = screen.getByLabelText(
      'Minimum dollar difference ($)',
    ) as HTMLInputElement;

    expect(percentInput.value).toBe('12');
    expect(minDiffInput.value).toBe('0.05');
    expect(screen.queryByText(/both the percent threshold and/i)).toBeNull();
    expect(screen.queryByText(/missing-price and below-threshold/i)).toBeNull();
    expect(
      screen.queryByText(/differs from current rec'd by at least this percent/i),
    ).toBeNull();
  });

  it('calls onSaved with new threshold and min diff cents on submit', async () => {
    const user = userEvent.setup();
    onSaved.mockResolvedValueOnce(undefined);

    render(
      <ListedPriceThresholdControl
        currentThresholdPercent={12}
        currentMinDiffCents={5}
        onSaved={onSaved}
      />,
    );

    const percentInput = screen.getByLabelText('Listing attention threshold (%)');
    await user.clear(percentInput);
    await user.type(percentInput, '15');

    const minDiffInput = screen.getByLabelText('Minimum dollar difference ($)');
    await user.clear(minDiffInput);
    await user.type(minDiffInput, '0.10');

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(15, 10);
    });
  });

  it('shows validation error below zero for percent', async () => {
    render(
      <ListedPriceThresholdControl
        currentThresholdPercent={12}
        currentMinDiffCents={5}
        onSaved={onSaved}
      />,
    );

    const input = screen.getByLabelText('Listing attention threshold (%)');
    fireEvent.change(input, { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.getByRole('alert').textContent).toContain(
      'Percent threshold must be a non-negative number',
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows validation error for invalid minimum difference', async () => {
    const user = userEvent.setup();
    render(
      <ListedPriceThresholdControl
        currentThresholdPercent={12}
        currentMinDiffCents={5}
        onSaved={onSaved}
      />,
    );

    const input = screen.getByLabelText('Minimum dollar difference ($)');
    await user.clear(input);
    await user.type(input, '-0.01');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.getByRole('alert').textContent).toContain(
      'Minimum dollar difference must be a valid non-negative dollar amount',
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('allows thresholds above 100 when submitted', async () => {
    const user = userEvent.setup();
    onSaved.mockResolvedValueOnce(undefined);

    render(
      <ListedPriceThresholdControl
        currentThresholdPercent={12}
        currentMinDiffCents={5}
        onSaved={onSaved}
      />,
    );

    const input = screen.getByLabelText('Listing attention threshold (%)');
    await user.clear(input);
    await user.type(input, '101');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(101, 5);
    });
  });

  it('shows server error message on failed save', async () => {
    const user = userEvent.setup();
    onSaved.mockRejectedValueOnce(new Error('Server error'));

    render(
      <ListedPriceThresholdControl
        currentThresholdPercent={12}
        currentMinDiffCents={5}
        onSaved={onSaved}
      />,
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
