import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PriceCheckStatusCard } from '../PriceCheckStatusCard';
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
  latestPriceCheckAt: '2026-03-31T10:01:00.000Z',
};

describe('PriceCheckStatusCard', () => {
  it('returns null on error (graceful fail)', () => {
    const result = PriceCheckStatusCard({ status: null, error: true });
    expect(result).toBeNull();
  });

  it('renders loading state when loading', () => {
    const el = PriceCheckStatusCard({ status: null, loading: true });
    expect(el).not.toBeNull();
    expect(el!.props['aria-label']).toBe('Price check scheduler status');
    // Should contain loading text somewhere in children
    const body = el!.props.children[1]; // price-check-body div
    expect(body.props.children.props.children).toBe('Loading…');
  });

  it('renders enabled badge when scheduler is enabled', () => {
    const el = PriceCheckStatusCard({ status: mockStatus });
    const header = el!.props.children[0]; // price-check-header
    const badge = header.props.children[1]; // badge span
    expect(badge.props.className).toContain('badge-enabled');
    expect(badge.props.children).toBe('Enabled');
  });

  it('renders disabled badge when scheduler is disabled', () => {
    const disabledStatus = { ...mockStatus, enabled: false };
    const el = PriceCheckStatusCard({ status: disabledStatus });
    const header = el!.props.children[0];
    const badge = header.props.children[1];
    expect(badge.props.className).toContain('badge-disabled');
    expect(badge.props.children).toBe('Disabled');
  });

  it('renders Running badge when running', () => {
    const runningStatus = { ...mockStatus, running: true };
    const el = PriceCheckStatusCard({ status: runningStatus });
    const header = el!.props.children[0];
    const badge = header.props.children[1];
    expect(badge.props.children).toBe('Running');
  });

  it('renders interval and listing attention config without market drift copy', () => {
    render(<PriceCheckStatusCard status={mockStatus} />);

    expect(screen.getByText('Every')).toBeTruthy();
    expect(screen.getByText('6h')).toBeTruthy();
    expect(screen.getByText(/Listing attention ≥/i)).toBeTruthy();
    expect(screen.getByText('12%')).toBeTruthy();
    expect(screen.getByText('$0.05')).toBeTruthy();
    expect(screen.queryByText(/Market drift/i)).toBeNull();
  });

  it('renders last run results when available', () => {
    const el = PriceCheckStatusCard({ status: mockStatus });
    const body = el!.props.children[1];
    const lastRunSection = body.props.children[1]; // price-check-last-run
    const results = lastRunSection.props.children[1]; // price-check-results
    const chips = results.props.children;
    // 3 chips visible (updated, notFound, drifted); errors hidden (length === 0)
    expect(chips[0].props.children).toEqual(['✅ ', 42, ' updated']);
    expect(chips[1].props.children).toEqual(['❓ ', 3, ' not found']);
    expect(chips[2].props.children).toEqual(['📈 ', 5, ' drifted']);
    expect(chips[3]).toBeFalsy(); // no errors chip
  });

  it('renders errors chip when errors exist', () => {
    const statusWithErrors: PriceCheckStatus = {
      ...mockStatus,
      lastRun: {
        ...mockStatus.lastRun!,
        errors: ['err1', 'err2'],
      },
    };
    const el = PriceCheckStatusCard({ status: statusWithErrors });
    const body = el!.props.children[1];
    const lastRunSection = body.props.children[1];
    const results = lastRunSection.props.children[1];
    const errChip = results.props.children[3];
    expect(errChip.props.children).toEqual(['⚠️ ', 2, ' errors']);
  });

  it('renders listed price attention threshold control and saves changes', async () => {
    const user = userEvent.setup();
    const onUpdateListedPriceAttentionThreshold = vi
      .fn()
      .mockResolvedValue(undefined);

    render(
      <PriceCheckStatusCard
        status={mockStatus}
        onUpdateListedPriceAttentionThreshold={
          onUpdateListedPriceAttentionThreshold
        }
      />,
    );

    const input = screen.getByLabelText('Listing attention threshold (%)');
    const minDiffInput = screen.getByLabelText('Minimum dollar difference ($)');
    expect((input as HTMLInputElement).value).toBe('12');
    expect((minDiffInput as HTMLInputElement).value).toBe('0.05');
    expect(screen.queryByText(/both the percent threshold and/i)).toBeNull();

    await user.clear(input);
    await user.type(input, '15');
    await user.clear(minDiffInput);
    await user.type(minDiffInput, '0.10');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onUpdateListedPriceAttentionThreshold).toHaveBeenCalledWith(15, 10);
    });
  });

  it('renders "No runs yet" when lastRun is null', () => {
    const noRunStatus = { ...mockStatus, lastRun: null };
    const el = PriceCheckStatusCard({ status: noRunStatus });
    const body = el!.props.children[1];
    const noRuns = body.props.children[2]; // third child (after config, after falsy lastRun block)
    expect(noRuns.props.children).toBe('No runs yet');
  });
});
