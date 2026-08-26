import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { OrderStatus, SalesOrder } from '../api/types';
import { api } from '../api/client';
import { MeasuredHeight } from './MeasuredHeight';
import { OrderStatusSelect } from './OrderStatusSelect';
import { OrderStatusHistoryModal } from './OrderStatusHistoryModal';

interface SalesTableProps {
  orders: SalesOrder[];
  loading: boolean;
  onStatusChange?: (
    representativeSaleId: number,
    newStatus: OrderStatus,
  ) => Promise<void>;
  onShip?: (order: SalesOrder) => void;
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

const shippableStatuses: OrderStatus[] = ['confirmed', 'shipped'];

const interactiveSummaryRowSelector = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'option',
  'summary',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
].join(',');

function isInteractiveSummaryRowTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(interactiveSummaryRowSelector) !== null
  );
}

function orderLabel(order: SalesOrder) {
  return (
    order.tcgplayerOrderId ?? `Synthetic order #${order.representativeSaleId}`
  );
}

export function SalesTable({
  orders,
  loading,
  onStatusChange,
  onShip,
}: SalesTableProps) {
  const [expandedOrderKey, setExpandedOrderKey] = useState<string | null>(null);
  const [statusHistoryOrder, setStatusHistoryOrder] =
    useState<SalesOrder | null>(null);
  const [openActionMenuKey, setOpenActionMenuKey] = useState<string | null>(
    null,
  );
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const statusHistoryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const colCount = 10;

  const closeActionMenu = useCallback((restoreFocus = false) => {
    setOpenActionMenuKey(null);
    if (restoreFocus) actionMenuTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (openActionMenuKey === null) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        actionMenuRef.current &&
        !actionMenuRef.current.contains(event.target as Node)
      ) {
        closeActionMenu();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActionMenu(true);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeActionMenu, openActionMenuKey]);

  const closeStatusHistory = useCallback(() => {
    setStatusHistoryOrder(null);
    statusHistoryTriggerRef.current?.focus();
  }, []);

  const openStatusHistory = (order: SalesOrder) => {
    statusHistoryTriggerRef.current = actionMenuTriggerRef.current;
    closeActionMenu();
    setStatusHistoryOrder(order);
  };

  const toggleExpand = (order: SalesOrder) => {
    setExpandedOrderKey((current) =>
      current === order.orderKey ? null : order.orderKey,
    );
  };

  const handleSummaryRowClick = (
    event: ReactMouseEvent<HTMLTableRowElement>,
    order: SalesOrder,
  ) => {
    if (isInteractiveSummaryRowTarget(event.target)) return;
    toggleExpand(order);
  };

  return (
    <div className="table-container">
      <table className="card-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Order</th>
            <th>Buyer</th>
            <th className="quantity">Items</th>
            <th className="price">Product subtotal</th>
            <th className="price">Shipping</th>
            <th className="price">Total</th>
            <th>Status</th>
            <th>Tracking</th>
            <th className="actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={colCount} className="table-loading">
                Loading sales…
              </td>
            </tr>
          )}
          {!loading && orders.length === 0 && (
            <tr>
              <td colSpan={colCount} className="table-empty">
                No sales recorded yet.
              </td>
            </tr>
          )}
          {!loading &&
            orders.map((order) => {
              const isCancelled = order.orderStatus === 'cancelled';
              const isExpanded = expandedOrderKey === order.orderKey;
              const label = orderLabel(order);
              const tracking = order.shipment
                ? [order.shipment.carrier, order.shipment.trackingNumber]
                    .filter(Boolean)
                    .join(' · ') || '—'
                : '—';
              return (
                <Fragment key={order.orderKey}>
                  <tr
                    className="order-summary-row"
                    onClick={(event) => handleSummaryRowClick(event, order)}
                  >
                    <td
                      className="date"
                      title={new Date(order.soldAt).toLocaleString()}
                    >
                      {formatDate(order.soldAt)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="order-expand-button"
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label} items`}
                        aria-expanded={isExpanded}
                        aria-controls={`order-items-${order.orderKey}`}
                        onClick={() => toggleExpand(order)}
                      >
                        <span
                          className="order-expand-chevron"
                          aria-hidden="true"
                        >
                          ›
                        </span>
                      </button>
                      <span className="order-label">{label}</span>
                    </td>
                    <td>{order.buyerName ?? '—'}</td>
                    <td className="quantity">{order.itemCount}</td>
                    <td className="price">
                      {formatCents(order.productSubtotalCents)}
                    </td>
                    <td className="price">
                      {formatCents(order.shippingCollectedCents)}
                    </td>
                    <td className="price">{formatCents(order.totalCents)}</td>
                    <td>
                      {onStatusChange ? (
                        <OrderStatusSelect
                          currentStatus={order.orderStatus}
                          onChange={(next) =>
                            onStatusChange(order.representativeSaleId, next)
                          }
                          ariaLabel={`Change order status for ${label}`}
                        />
                      ) : (
                        <span
                          className={`sales-status sales-status-${order.orderStatus}`}
                        >
                          {order.orderStatus}
                        </span>
                      )}
                    </td>
                    <td className="tracking-cell">{tracking}</td>
                    <td className="actions">
                      <div
                        className="action-menu-container"
                        ref={
                          openActionMenuKey === order.orderKey
                            ? actionMenuRef
                            : null
                        }
                      >
                        <button
                          type="button"
                          className="action-menu-trigger"
                          ref={
                            openActionMenuKey === order.orderKey
                              ? actionMenuTriggerRef
                              : null
                          }
                          aria-label={`Actions for ${label}`}
                          aria-haspopup="menu"
                          aria-expanded={openActionMenuKey === order.orderKey}
                          aria-controls={`sale-actions-${order.orderKey}`}
                          onClick={() =>
                            setOpenActionMenuKey((current) =>
                              current === order.orderKey
                                ? null
                                : order.orderKey,
                            )
                          }
                        >
                          …
                        </button>
                        {openActionMenuKey === order.orderKey && (
                          <div
                            id={`sale-actions-${order.orderKey}`}
                            className="action-menu"
                            role="menu"
                            aria-label={`Actions for ${label}`}
                          >
                            {onShip &&
                              shippableStatuses.includes(order.orderStatus) && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    closeActionMenu();
                                    onShip(order);
                                  }}
                                >
                                  Record shipment
                                </button>
                              )}
                            {!isCancelled && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  closeActionMenu();
                                  window.open(
                                    api.getInvoiceUrl(
                                      order.representativeSaleId,
                                    ),
                                    '_blank',
                                    'noopener,noreferrer',
                                  );
                                }}
                              >
                                Open invoice
                              </button>
                            )}
                            {shippableStatuses.includes(order.orderStatus) && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  closeActionMenu();
                                  window.open(
                                    api.getPackingSlipUrl(
                                      order.representativeSaleId,
                                    ),
                                    '_blank',
                                    'noopener,noreferrer',
                                  );
                                }}
                              >
                                Open packing slip
                              </button>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => openStatusHistory(order)}
                            >
                              View status history
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  <tr
                    className={`history-row ${
                      isExpanded
                        ? 'history-row-expanded'
                        : 'history-row-collapsed'
                    }`}
                    id={`order-items-${order.orderKey}`}
                    aria-hidden={!isExpanded}
                  >
                    <td colSpan={colCount} className="history-cell">
                      <MeasuredHeight
                        open={isExpanded}
                        className={`order-details ${
                          isExpanded
                            ? 'order-details-expanded'
                            : 'order-details-collapsed'
                        }`}
                        contentClassName="order-details-content"
                        inert={!isExpanded}
                      >
                        <div className="order-details-inner">
                          <table
                            className="order-line-items"
                            aria-label={`${label} line items`}
                          >
                            <thead>
                              <tr>
                                <th>Card</th>
                                <th>Set</th>
                                <th>Condition</th>
                                <th>Qty</th>
                                <th>Type</th>
                                <th>Unit price</th>
                                <th>Line total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.lineItems.map((line) => (
                                <tr key={line.id}>
                                  <td>{line.cardProductName ?? '—'}</td>
                                  <td>{line.cardSetName ?? '—'}</td>
                                  <td>{line.cardCondition ?? '—'}</td>
                                  <td>{line.quantitySold}</td>
                                  <td>
                                    {line.lineItemType === 'gift'
                                      ? 'Gift'
                                      : 'Paid'}
                                  </td>
                                  <td>
                                    {formatCents(
                                      line.quantitySold > 0
                                        ? Math.round(
                                            line.salePriceCents /
                                              line.quantitySold,
                                          )
                                        : line.salePriceCents,
                                    )}
                                  </td>
                                  <td>{formatCents(line.salePriceCents)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </MeasuredHeight>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
        </tbody>
      </table>
      {statusHistoryOrder && (
        <OrderStatusHistoryModal
          representativeSaleId={statusHistoryOrder.representativeSaleId}
          orderLabel={orderLabel(statusHistoryOrder)}
          onClose={closeStatusHistory}
        />
      )}
    </div>
  );
}
