import { useEffect, useRef, useState } from 'react';
import type { PriceHistoryEntry } from '../api/types';
import { api } from '../api/client';

interface PriceHistoryModalProps {
  cardId: number;
  cardName: string;
  onClose: () => void;
}

export function PriceHistoryModal({
  cardId,
  cardName,
  onClose,
}: PriceHistoryModalProps) {
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backdropRef = useRef<HTMLDivElement>(null);

  // Auto-focus the dialog on mount for screen-reader announcement
  useEffect(() => {
    backdropRef.current?.focus();
  }, []);

  // Document-level Escape listener — fires regardless of focus
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getCardPriceHistory(cardId, 50);
        if (!cancelled) {
          setHistory(res.history);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load price history',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formatPrice = (price: string | null) => {
    if (!price) return '—';
    return `$${parseFloat(price).toFixed(2)}`;
  };

  const formatPriceChange = (before: string | null, after: string | null) => {
    if (!before && !after) return '—';
    return `${formatPrice(before)} → ${formatPrice(after)}`;
  };

  const formatDrift = (drift: string | null) => {
    if (drift === null || drift === undefined) return '—';
    const num = parseFloat(drift);
    if (isNaN(num)) return '—';
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
  };

  const driftClass = (drift: string | null) => {
    if (drift === null || drift === undefined) return '';
    const num = parseFloat(drift);
    if (isNaN(num)) return '';
    if (num > 0) return 'drift-up';
    if (num < 0) return 'drift-down';
    return '';
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatStatusChange = (before: string | null, after: string | null) => {
    if (!before && !after) return '—';
    if (before === after) return '—';
    return `${before || '—'} → ${after || '—'}`;
  };

  return (
    <div
      ref={backdropRef}
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Price history for ${cardName}`}
      tabIndex={-1}
    >
      <div className="modal-content price-history-modal">
        <div className="modal-header">
          <h2>📈 Price History</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="price-history-card-name">{cardName}</p>

        {loading && (
          <div
            className="price-history-state"
            data-testid="price-history-loading"
          >
            <p>⏳ Loading price history…</p>
          </div>
        )}

        {error && (
          <div
            className="price-history-state price-history-error"
            data-testid="price-history-error"
          >
            <p>❌ {error}</p>
            <button className="button-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {!loading && !error && history.length === 0 && (
          <div
            className="price-history-state"
            data-testid="price-history-empty"
          >
            <p>No price history recorded yet for this card.</p>
          </div>
        )}

        {!loading && !error && history.length > 0 && (
          <div className="price-history-table-wrapper">
            <table className="price-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th className="price-history-col-right">Market</th>
                  <th className="price-history-col-right">Listing</th>
                  <th className="price-history-col-right">Drift</th>
                  <th>Status Change</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td className="price-history-date">
                      {formatDate(entry.checkedAt)}
                    </td>
                    <td>{entry.source}</td>
                    <td className="price-history-col-right">
                      {formatPriceChange(
                        entry.previousMarketPrice,
                        entry.newMarketPrice,
                      )}
                    </td>
                    <td className="price-history-col-right">
                      {formatPriceChange(
                        entry.previousListingPrice,
                        entry.newListingPrice,
                      )}
                    </td>
                    <td
                      className={`price-history-col-right ${driftClass(entry.driftPercent)}`}
                    >
                      {formatDrift(entry.driftPercent)}
                    </td>
                    <td className="price-history-status-change">
                      {formatStatusChange(
                        entry.previousStatus,
                        entry.newStatus,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-actions">
          <button className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
