import type { SaleStatusHistoryEntry } from '../api/types';

interface SaleStatusTimelineProps {
  history: SaleStatusHistoryEntry[];
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function SaleStatusTimeline({ history }: SaleStatusTimelineProps) {
  if (history.length === 0) {
    return <div className="timeline-empty">No status changes recorded.</div>;
  }

  return (
    <ol className="status-timeline" aria-label="Status change history">
      {history.map((entry) => (
        <li key={entry.id} className="timeline-entry">
          <div className="timeline-transition">
            {entry.previousStatus ? (
              <span
                className={`sales-status sales-status-${entry.previousStatus}`}
              >
                {entry.previousStatus}
              </span>
            ) : (
              <span className="timeline-initial">initial</span>
            )}
            <span className="timeline-arrow">→</span>
            <span className={`sales-status sales-status-${entry.newStatus}`}>
              {entry.newStatus}
            </span>
          </div>
          <div className="timeline-meta">
            <time dateTime={entry.changedAt}>
              {formatTimestamp(entry.changedAt)}
            </time>
            <span className="timeline-source">{entry.source}</span>
          </div>
          {entry.note && <div className="timeline-note">{entry.note}</div>}
        </li>
      ))}
    </ol>
  );
}
