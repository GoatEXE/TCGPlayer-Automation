import type { PriceCheckStatus } from '../api/types';
import { IntervalSettingsControl } from './IntervalSettingsControl';

interface PriceCheckStatusCardProps {
  status: PriceCheckStatus | null;
  loading?: boolean;
  error?: boolean;
  onUpdateInterval?: (intervalHours: number) => Promise<void>;
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

export function PriceCheckStatusCard({
  status,
  loading,
  error,
  onUpdateInterval,
}: PriceCheckStatusCardProps) {
  if (error) {
    return null; // fail gracefully — don't render anything
  }

  if (loading || !status) {
    return (
      <div
        className="price-check-card"
        aria-label="Price check scheduler status"
      >
        <div className="price-check-header">
          <span className="price-check-title">⏱️ Price Check Scheduler</span>
        </div>
        <div className="price-check-body">
          <span className="price-check-loading">Loading…</span>
        </div>
      </div>
    );
  }

  const lastRun = status.lastRun;

  return (
    <div className="price-check-card" aria-label="Price check scheduler status">
      <div className="price-check-header">
        <span className="price-check-title">⏱️ Price Check Scheduler</span>
        <span
          className={`price-check-badge ${status.enabled ? 'badge-enabled' : 'badge-disabled'}`}
        >
          {status.running ? 'Running' : status.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <div className="price-check-body">
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
          <span className="price-check-meta">
            Drift ≥ <strong>{status.thresholdPercent}%</strong>
          </span>
        </div>

        {lastRun && (
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
                ✅ {lastRun.updated} updated
              </span>
              <span className="result-chip result-notfound">
                ❓ {lastRun.notFound} not found
              </span>
              <span className="result-chip result-drifted">
                📈 {lastRun.drifted} drifted
              </span>
              {lastRun.errors.length > 0 && (
                <span className="result-chip result-errors">
                  ⚠️ {lastRun.errors.length} errors
                </span>
              )}
            </div>
          </div>
        )}

        {!lastRun && <span className="price-check-no-runs">No runs yet</span>}
      </div>
    </div>
  );
}
