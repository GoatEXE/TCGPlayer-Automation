import { Settings } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { PriceCheckStatus } from '../api/types';
import { BlueprintButton, BlueprintDialog } from '../ui';
import { IntervalSettingsControl } from './IntervalSettingsControl';
import { ListedPriceThresholdControl } from './ListedPriceThresholdControl';

interface PriceCheckSettingsModalProps {
  status: PriceCheckStatus | null;
  loading?: boolean;
  error?: boolean;
  onClose: () => void;
  onUpdateInterval?: (intervalHours: number) => Promise<void>;
  onUpdateListedPriceAttentionThreshold?: (
    thresholdPercent: number,
    minDiffCents: number,
  ) => Promise<void>;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Keeps the first focused element aligned with the previous utility dialog. */
function useUtilityDialogInitialFocus(contentRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const timer = window.setTimeout(() => {
      contentRef.current
        ?.closest<HTMLElement>('.industry-dialog')
        ?.querySelector<HTMLButtonElement>('.industry-dialog__close')
        ?.focus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [contentRef]);
}

export function PriceCheckSettingsModal({
  status,
  loading,
  error,
  onClose,
  onUpdateInterval,
  onUpdateListedPriceAttentionThreshold,
}: PriceCheckSettingsModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  useUtilityDialogInitialFocus(contentRef);

  const renderBody = () => {
    if (error) {
      return (
        <p className="price-check-settings-state" role="alert">
          Unable to load scheduler settings. Close this window and try again.
        </p>
      );
    }

    if (loading || !status) {
      return <p className="price-check-settings-state">Loading…</p>;
    }

    const lastRun = status.lastRun;

    return (
      <>
        <div className="price-check-config">
          {onUpdateInterval ? (
            <IntervalSettingsControl
              currentIntervalHours={status.intervalHours}
              onSaved={onUpdateInterval}
            />
          ) : (
            <span className="price-check-meta">
              Every <strong>{status.intervalHours}h</strong>
            </span>
          )}
          {onUpdateListedPriceAttentionThreshold ? (
            <ListedPriceThresholdControl
              currentThresholdPercent={
                status.listedPriceAttentionThresholdPercent
              }
              currentMinDiffCents={status.listedPriceAttentionMinDiffCents}
              onSaved={onUpdateListedPriceAttentionThreshold}
            />
          ) : (
            <span className="price-check-meta">
              Listing attention ≥{' '}
              <strong>{status.listedPriceAttentionThresholdPercent}%</strong>{' '}
              and{' '}
              <strong>
                ${(status.listedPriceAttentionMinDiffCents / 100).toFixed(2)}
              </strong>
            </span>
          )}
        </div>

        {lastRun ? (
          <div className="price-check-last-run">
            <span className="price-check-last-run-time">
              Last run:{' '}
              <strong title={new Date(lastRun.finishedAt).toLocaleString()}>
                {formatRelativeTime(lastRun.finishedAt)}
              </strong>
              {!lastRun.success && (
                <span className="price-check-failed"> (failed)</span>
              )}
            </span>
            <div className="price-check-results">
              <span className="result-chip result-updated">
                {lastRun.updated} updated
              </span>
              <span className="result-chip result-notfound">
                {lastRun.notFound} not found
              </span>
              <span className="result-chip result-drifted">
                {lastRun.drifted} drifted
              </span>
              {lastRun.errors.length > 0 && (
                <span className="result-chip result-errors">
                  {lastRun.errors.length} errors
                </span>
              )}
            </div>
          </div>
        ) : (
          <span className="price-check-no-runs">No runs yet</span>
        )}
      </>
    );
  };

  const badgeText = status?.running
    ? 'Running'
    : status?.enabled
      ? 'Enabled'
      : 'Disabled';

  return (
    <BlueprintDialog
      open
      title={
        <span className="utility-dialog-title">
          <Settings aria-hidden="true" size={18} strokeWidth={1.5} />
          Price check scheduler
        </span>
      }
      className="utility-dialog utility-price-check-dialog"
      closeLabel="Close price check settings"
      onClose={onClose}
      footer={
        <BlueprintButton variant="secondary" onClick={onClose}>
          Close
        </BlueprintButton>
      }
    >
      <div
        ref={contentRef}
        className="utility-dialog-content price-check-settings-body"
      >
        <div className="utility-dialog-status-row">
          {status && !loading && !error ? (
            <span
              className={`price-check-badge ${status.enabled ? 'badge-enabled' : 'badge-disabled'}`}
              aria-label={`Scheduler ${badgeText}`}
            >
              {badgeText}
            </span>
          ) : null}
        </div>
        {renderBody()}
      </div>
    </BlueprintDialog>
  );
}
