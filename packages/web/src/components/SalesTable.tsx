import { Fragment, useState, useEffect } from 'react';
import type { Sale, OrderStatus, SaleStatusHistoryEntry } from '../api/types';
import { OrderStatusSelect } from './OrderStatusSelect';
import { SaleStatusTimeline } from './SaleStatusTimeline';
import { api } from '../api/client';

interface SalesTableProps {
  sales: Sale[];
  loading: boolean;
  onStatusChange?: (saleId: number, newStatus: OrderStatus) => Promise<void>;
  selectedIds?: Set<number>;
  onSelectionChange?: (ids: Set<number>) => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const terminalStatuses: OrderStatus[] = ['delivered', 'cancelled'];

export function SalesTable({
  sales,
  loading,
  onStatusChange,
  selectedIds,
  onSelectionChange,
}: SalesTableProps) {
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  const [history, setHistory] = useState<SaleStatusHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const selectable = !!onSelectionChange && !!selectedIds;
  const colSpan = selectable ? 10 : 9;

  useEffect(() => {
    if (expandedSaleId === null) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    api
      .getSaleStatusHistory(expandedSaleId)
      .then((res) => {
        if (!cancelled) setHistory(res.history);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expandedSaleId]);

  const toggleExpand = (saleId: number) => {
    setExpandedSaleId((prev) => (prev === saleId ? null : saleId));
  };

  const toggleSelect = (id: number) => {
    if (!selectedIds || !onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  };

  const selectableRows = sales.filter(
    (s) => !terminalStatuses.includes(s.orderStatus),
  );
  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((s) => selectedIds?.has(s.id));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(selectableRows.map((s) => s.id)));
    }
  };

  return (
    <div className="table-container">
      <table className="card-table">
        <thead>
          <tr>
            {selectable && (
              <th className="checkbox-column">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  title="Select all"
                  disabled={selectableRows.length === 0}
                />
              </th>
            )}
            <th>Date</th>
            <th>Card</th>
            <th>Set</th>
            <th className="quantity">Qty</th>
            <th className="price">Price</th>
            <th>Buyer</th>
            <th>Order ID</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={colSpan} className="table-loading">
                Loading sales…
              </td>
            </tr>
          )}
          {!loading && sales.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="table-empty">
                No sales recorded yet.
              </td>
            </tr>
          )}
          {!loading &&
            sales.map((sale) => {
              const isTerminal = terminalStatuses.includes(sale.orderStatus);
              const isExpanded = expandedSaleId === sale.id;
              return (
                <Fragment key={sale.id}>
                  <tr>
                    {selectable && (
                      <td className="checkbox-column">
                        <input
                          type="checkbox"
                          checked={selectedIds!.has(sale.id)}
                          onChange={() => toggleSelect(sale.id)}
                          disabled={isTerminal}
                          title={
                            isTerminal
                              ? 'Terminal status'
                              : 'Select for batch update'
                          }
                        />
                      </td>
                    )}
                    <td
                      className="date"
                      title={new Date(sale.soldAt).toLocaleString()}
                    >
                      {formatDate(sale.soldAt)}
                    </td>
                    <td className="card-name">{sale.cardProductName ?? '—'}</td>
                    <td>{sale.cardSetName ?? '—'}</td>
                    <td className="quantity">{sale.quantitySold}</td>
                    <td className="price">
                      {formatCents(sale.salePriceCents)}
                    </td>
                    <td>{sale.buyerName ?? '—'}</td>
                    <td>{sale.tcgplayerOrderId ?? '—'}</td>
                    <td>
                      {onStatusChange ? (
                        <OrderStatusSelect
                          currentStatus={sale.orderStatus}
                          onChange={(next) => onStatusChange(sale.id, next)}
                        />
                      ) : (
                        <span
                          className={`sales-status sales-status-${sale.orderStatus}`}
                        >
                          {sale.orderStatus}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="action-button"
                        title="View status history"
                        onClick={() => toggleExpand(sale.id)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="history-row">
                      <td colSpan={colSpan} className="history-cell">
                        {historyLoading ? (
                          <span className="price-check-loading">
                            Loading history…
                          </span>
                        ) : (
                          <SaleStatusTimeline history={history} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
