import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntervalSettingsControl } from '../IntervalSettingsControl';

describe('IntervalSettingsControl', () => {
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays the current interval value', () => {
    render(
      <IntervalSettingsControl currentIntervalHours={6} onSaved={onSaved} />,
    );
    const input = screen.getByLabelText('Interval (hours)') as HTMLInputElement;
    expect(input.value).toBe('6');
  });

  it('calls onSaved with new value on submit', async () => {
    const user = userEvent.setup();
    onSaved.mockResolvedValueOnce(undefined);

    render(
      <IntervalSettingsControl currentIntervalHours={6} onSaved={onSaved} />,
    );

    const input = screen.getByLabelText('Interval (hours)');
    await user.clear(input);
    await user.type(input, '12');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(12);
    });
  });

  it('shows validation error for value below 1', async () => {
    const user = userEvent.setup();

    render(
      <IntervalSettingsControl currentIntervalHours={6} onSaved={onSaved} />,
    );

    const input = screen.getByLabelText('Interval (hours)');
    await user.clear(input);
    await user.type(input, '0');
    await user.click(screen.getByRole('button', { name: /save/i }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Must be between 1 and 168');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows validation error for value above 168', async () => {
    const user = userEvent.setup();

    render(
      <IntervalSettingsControl currentIntervalHours={6} onSaved={onSaved} />,
    );

    const input = screen.getByLabelText('Interval (hours)');
    await user.clear(input);
    await user.type(input, '200');
    await user.click(screen.getByRole('button', { name: /save/i }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Must be between 1 and 168');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows validation error for non-integer value', async () => {
    const user = userEvent.setup();

    render(
      <IntervalSettingsControl currentIntervalHours={6} onSaved={onSaved} />,
    );

    const input = screen.getByLabelText('Interval (hours)');
    await user.clear(input);
    await user.type(input, '6.5');
    await user.click(screen.getByRole('button', { name: /save/i }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Must be a whole number');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('disables submit when value equals current interval', () => {
    render(
      <IntervalSettingsControl currentIntervalHours={6} onSaved={onSaved} />,
    );

    const button = screen.getByRole('button', {
      name: /save/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('shows saving state while submitting', async () => {
    const user = userEvent.setup();
    let resolvePromise: () => void;
    onSaved.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolvePromise = r;
      }),
    );

    render(
      <IntervalSettingsControl currentIntervalHours={6} onSaved={onSaved} />,
    );

    const input = screen.getByLabelText('Interval (hours)');
    await user.clear(input);
    await user.type(input, '12');
    await user.click(screen.getByRole('button', { name: /save/i }));

    const savingButton = screen.getByRole('button', {
      name: /saving/i,
    }) as HTMLButtonElement;
    expect(savingButton.disabled).toBe(true);

    // Cleanup
    resolvePromise!();
  });

  it('shows server error message on failed save', async () => {
    const user = userEvent.setup();
    onSaved.mockRejectedValueOnce(new Error('Server error'));

    render(
      <IntervalSettingsControl currentIntervalHours={6} onSaved={onSaved} />,
    );

    const input = screen.getByLabelText('Interval (hours)');
    await user.clear(input);
    await user.type(input, '12');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Server error');
    });
  });

  it('updates displayed value when currentIntervalHours prop changes', () => {
    const { rerender } = render(
      <IntervalSettingsControl currentIntervalHours={6} onSaved={onSaved} />,
    );

    rerender(
      <IntervalSettingsControl currentIntervalHours={12} onSaved={onSaved} />,
    );

    const input = screen.getByLabelText('Interval (hours)') as HTMLInputElement;
    expect(input.value).toBe('12');
  });
});
