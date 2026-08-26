import { useEffect, useMemo, useRef, useState } from 'react';
import type { SaleStatusHistoryEntry } from '../api/types';
import { api } from '../api/client';
import { SaleStatusTimeline } from './SaleStatusTimeline';

interface OrderStatusHistoryModalProps {
  representativeSaleId: number;
  orderLabel: string;
  onClose: () => void;
}

/**
 * Bulk order transitions are persisted once per sale line. Collapse matching
 * entries into the single order-level change the seller performed.
 */
function deduplicateOrderStatusHistory(
  history: SaleStatusHistoryEntry[],
): SaleStatusHistoryEntry[] {
  const seen = new Set<string>();

  return history.filter((entry) => {
    const key = [
      entry.previousStatus ?? '',
      entry.newStatus,
      entry.changedAt,
      entry.reason ?? entry.source,
      entry.note ?? '',
    ].join('\u0000');

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function OrderStatusHistoryModal({
  representativeSaleId,
  orderLabel,
  onClose,
}: OrderStatusHistoryModalProps) {
  const [history, setHistory] = useState<SaleStatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError(null);
      try {
        const response = await api.getSaleStatusHistory(representativeSaleId);
        if (!cancelled) setHistory(response.history);
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : 'Failed to load status history',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [representativeSaleId]);

  const deduplicatedHistory = useMemo(
    () => deduplicateOrderStatusHistory(history),
    [history],
  );

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div
      ref={dialogRef}
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Status history for ${orderLabel}`}
      tabIndex={-1}
    >
      <div className="modal-content order-status-history-modal">
        <div className="modal-header">
          <h2>Status history</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close status history"
          >
            ✕
          </button>
        </div>

        <p className="order-status-history-label">{orderLabel}</p>

        {loading && (
          <div className="order-status-history-state">
            Loading status history…
          </div>
        )}

        {!loading && error && (
          <div
            className="order-status-history-state order-status-history-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="order-status-history-body">
            <SaleStatusTimeline history={deduplicatedHistory} />
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
