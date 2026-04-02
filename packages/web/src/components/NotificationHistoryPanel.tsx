import type { NotificationEvent } from '../api/types';

interface NotificationHistoryPanelProps {
  events: NotificationEvent[];
  loading: boolean;
  error: boolean;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotificationHistoryPanel({
  events,
  loading,
  error,
}: NotificationHistoryPanelProps) {
  return (
    <section
      className="notification-history-panel"
      role="region"
      aria-label="Notification history"
    >
      <h3 className="notification-history-title">🔔 Notification History</h3>

      {loading ? (
        <p className="notification-history-state">Loading notifications…</p>
      ) : error ? (
        <p className="notification-history-state notification-history-error">
          Failed to load notification history
        </p>
      ) : events.length === 0 ? (
        <p className="notification-history-state">No notifications yet</p>
      ) : (
        <ul className="notification-history-list">
          {events.map((evt) => (
            <li key={evt.id} className="notification-history-item">
              <div className="notification-history-row">
                <span className="notification-history-success">
                  {evt.success ? '✅' : '❌'}
                </span>
                <span className="notification-history-type">
                  {evt.eventType}
                </span>
                <span className="notification-history-time">
                  {formatTimestamp(evt.createdAt)}
                </span>
              </div>
              <div className="notification-history-message">{evt.message}</div>
              {!evt.success && evt.error && (
                <div className="notification-history-err-detail">
                  {evt.error}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
