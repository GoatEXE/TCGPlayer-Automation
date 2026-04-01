import type { SaleStatusHistoryEntry, Shipment } from '../api/types';

interface SaleStatusTimelineProps {
  history: SaleStatusHistoryEntry[];
  shipment?: Shipment | null;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function SaleStatusTimeline({
  history,
  shipment,
}: SaleStatusTimelineProps) {
  const hasHistory = history.length > 0;
  const hasShipment = !!shipment;

  if (!hasHistory && !hasShipment) {
    return <div className="timeline-empty">No status changes recorded.</div>;
  }

  return (
    <div>
      {hasHistory && (
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
                <span
                  className={`sales-status sales-status-${entry.newStatus}`}
                >
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
      )}

      {hasShipment && (
        <div className="timeline-shipment">
          <div className="timeline-shipment-header">📦 Shipment</div>
          <div className="timeline-shipment-details">
            {shipment.carrier && (
              <span className="timeline-shipment-field">
                {shipment.carrier}
              </span>
            )}
            {shipment.trackingNumber && (
              <span className="timeline-shipment-field">
                {shipment.trackingNumber}
              </span>
            )}
          </div>
          <div className="timeline-shipment-dates">
            {shipment.shippedAt && (
              <span>
                Shipped:{' '}
                <time dateTime={shipment.shippedAt}>
                  {formatTimestamp(shipment.shippedAt)}
                </time>
              </span>
            )}
            {shipment.deliveredAt && (
              <span>
                Delivered:{' '}
                <time dateTime={shipment.deliveredAt}>
                  {formatTimestamp(shipment.deliveredAt)}
                </time>
              </span>
            )}
          </div>
          {shipment.notes && (
            <div className="timeline-note">{shipment.notes}</div>
          )}
        </div>
      )}
    </div>
  );
}
