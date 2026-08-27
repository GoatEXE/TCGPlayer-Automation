import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { PriceCheckSettingsModal } from '../PriceCheckSettingsModal';
import type { PriceCheckStatus } from '../../api/types';

const mockStatus: PriceCheckStatus = {
  enabled: true,
  intervalHours: 6,
  thresholdPercent: 10,
  listedPriceAttentionThresholdPercent: 12,
  listedPriceAttentionMinDiffCents: 5,
  running: false,
  lastRun: {
    startedAt: '2026-03-31T10:00:00.000Z',
    finishedAt: '2026-03-31T10:01:30.000Z',
    success: true,
    updated: 42,
    notFound: 3,
    drifted: 5,
    errors: [],
  },
};

describe('PriceCheckSettingsModal', () => {
  it('shows the current scheduler status, values, and last run', async () => {
    render(
      <PriceCheckSettingsModal
        status={mockStatus}
        onClose={() => {}}
        onUpdateInterval={async () => {}}
        onUpdateListedPriceAttentionThreshold={async () => {}}
      />,
    );

    expect(
      screen.getByRole('dialog', { name: /price check scheduler/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(
      (screen.getByLabelText('Interval (hours)') as HTMLInputElement).value,
    ).toBe('6');
    expect(
      (
        screen.getByLabelText(
          'Listing attention threshold (%)',
        ) as HTMLInputElement
      ).value,
    ).toBe('12');
    expect(
      (
        screen.getByLabelText(
          'Minimum dollar difference ($)',
        ) as HTMLInputElement
      ).value,
    ).toBe('0.05');
    expect(screen.getByText(/42 updated/i)).toBeInTheDocument();
    expect(screen.getByText(/3 not found/i)).toBeInTheDocument();
    expect(screen.getByText(/5 drifted/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /close price check settings/i }),
      ).toHaveFocus();
    });
  });

  it('keeps Tab focus within the dialog', async () => {
    const user = userEvent.setup();

    render(<PriceCheckSettingsModal status={mockStatus} onClose={() => {}} />);

    const headerClose = screen.getByRole('button', {
      name: /close price check settings/i,
    });
    const footerClose = screen.getByRole('button', { name: 'Close' });

    footerClose.focus();
    await user.tab();
    expect(headerClose).toHaveFocus();

    await user.tab({ shift: true });
    expect(footerClose).toHaveFocus();
  });

  it('saves interval and listing attention settings through the existing controls', async () => {
    const user = userEvent.setup();
    const onUpdateInterval = vi.fn().mockResolvedValue(undefined);
    const onUpdateListedPriceAttentionThreshold = vi
      .fn()
      .mockResolvedValue(undefined);

    render(
      <PriceCheckSettingsModal
        status={mockStatus}
        onClose={() => {}}
        onUpdateInterval={onUpdateInterval}
        onUpdateListedPriceAttentionThreshold={
          onUpdateListedPriceAttentionThreshold
        }
      />,
    );

    const intervalForm = screen.getByRole('form', {
      name: 'Price check interval settings',
    });
    const intervalInput =
      within(intervalForm).getByLabelText('Interval (hours)');
    await user.clear(intervalInput);
    await user.type(intervalInput, '12');
    await user.click(
      within(intervalForm).getByRole('button', { name: 'Save' }),
    );

    await waitFor(() => {
      expect(onUpdateInterval).toHaveBeenCalledWith(12);
    });

    const thresholdForm = screen.getByRole('form', {
      name: 'Listed price attention threshold settings',
    });
    const percentInput = within(thresholdForm).getByLabelText(
      'Listing attention threshold (%)',
    );
    const minDiffInput = within(thresholdForm).getByLabelText(
      'Minimum dollar difference ($)',
    );
    await user.clear(percentInput);
    await user.type(percentInput, '15');
    await user.clear(minDiffInput);
    await user.type(minDiffInput, '0.10');
    await user.click(
      within(thresholdForm).getByRole('button', { name: 'Save' }),
    );

    await waitFor(() => {
      expect(onUpdateListedPriceAttentionThreshold).toHaveBeenCalledWith(
        15,
        10,
      );
    });
  });

  it('shows the no-runs state and closes from the close button, Escape, and backdrop', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <PriceCheckSettingsModal
        status={{ ...mockStatus, lastRun: null }}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('No runs yet')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /close price check settings/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
