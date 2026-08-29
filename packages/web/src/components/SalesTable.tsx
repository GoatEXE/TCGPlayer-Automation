import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  ChevronRight,
  ClipboardList,
  FileText,
  History,
  MoreHorizontal,
  PackageCheck,
} from 'lucide-react';
import type { OrderStatus, SalesOrder } from '../api/types';
import { api } from '../api/client';
import { useContainerResponsiveMode } from '../hooks/useContainerResponsiveMode';
import { BlueprintPanel, BlueprintRegistrationMarks } from '../ui';
import '../styles/commerce.css';
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

function formatTracking(order: SalesOrder): string {
  if (!order.shipment) return '—';

  return (
    [order.shipment.carrier, order.shipment.trackingNumber]
      .filter(Boolean)
      .join(' · ') || '—'
  );
}

function formatUnitPrice(quantity: number, salePriceCents: number): string {
  return formatCents(
    quantity > 0 ? Math.round(salePriceCents / quantity) : salePriceCents,
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mode = useContainerResponsiveMode(containerRef);
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

  const renderStatus = (order: SalesOrder, label: string) =>
    onStatusChange ? (
      <OrderStatusSelect
        currentStatus={order.orderStatus}
        onChange={(next) => onStatusChange(order.representativeSaleId, next)}
        ariaLabel={`Change order status for ${label}`}
      />
    ) : (
      <span className={`sales-status sales-status-${order.orderStatus}`}>
        {order.orderStatus}
      </span>
    );

  const renderActionMenu = (
    order: SalesOrder,
    label: string,
    isCancelled: boolean,
  ) => (
    <div
      className="action-menu-container"
      ref={openActionMenuKey === order.orderKey ? actionMenuRef : null}
    >
      <button
        type="button"
        className="industry-blueprint industry-button action-menu-trigger commerce-icon-button"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={openActionMenuKey === order.orderKey}
        aria-controls={`sale-actions-${order.orderKey}`}
        onClick={() =>
          setOpenActionMenuKey((current) =>
            current === order.orderKey ? null : order.orderKey,
          )
        }
        ref={
          openActionMenuKey === order.orderKey ? actionMenuTriggerRef : null
        }
      >
        <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
        <BlueprintRegistrationMarks />
      </button>
      {openActionMenuKey === order.orderKey && (
        <div
          id={`sale-actions-${order.orderKey}`}
          className="action-menu"
          role="menu"
          aria-label={`Actions for ${label}`}
        >
          {onShip && shippableStatuses.includes(order.orderStatus) && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeActionMenu();
                onShip(order);
              }}
            >
              <PackageCheck
                className="commerce-action-menu-icon"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
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
                  api.getInvoiceUrl(order.representativeSaleId),
                  '_blank',
                  'noopener,noreferrer',
                );
              }}
            >
              <FileText
                className="commerce-action-menu-icon"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
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
                  api.getPackingSlipUrl(order.representativeSaleId),
                  '_blank',
                  'noopener,noreferrer',
                );
              }}
            >
              <ClipboardList
                className="commerce-action-menu-icon"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Open packing slip
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => openStatusHistory(order)}
          >
            <History
              className="commerce-action-menu-icon"
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            View status history
          </button>
        </div>
      )}
    </div>
  );

  const renderMobileOrder = (order: SalesOrder) => {
    const isCancelled = order.orderStatus === 'cancelled';
    const isExpanded = expandedOrderKey === order.orderKey;
    const label = orderLabel(order);
    const tracking = formatTracking(order);

    return (
      <article
        key={order.orderKey}
        className="industry-blueprint commerce-mobile-order"
        aria-label={`${label} order`}
      >
        <div className="commerce-mobile-order-header">
          <div className="commerce-mobile-order-identity">
            <span className="commerce-mobile-order-label">{label}</span>
            <span className="commerce-mobile-order-buyer">
              {order.buyerName ?? 'No buyer name'} · {formatDate(order.soldAt)}
            </span>
          </div>
          <strong className="commerce-mobile-total" data-numeric>
            {formatCents(order.totalCents)}
          </strong>
        </div>

        <dl className="commerce-mobile-grid">
          <div>
            <dt>Items</dt>
            <dd data-numeric>{order.itemCount}</dd>
          </div>
          <div>
            <dt>Product subtotal</dt>
            <dd data-numeric>{formatCents(order.productSubtotalCents)}</dd>
          </div>
          <div>
            <dt>Shipping</dt>
            <dd data-numeric>{formatCents(order.shippingCollectedCents)}</dd>
          </div>
          <div>
            <dt>Tracking</dt>
            <dd>{tracking}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{renderStatus(order, label)}</dd>
          </div>
        </dl>

        <div className="commerce-mobile-order-actions">
          <button
            type="button"
            className="commerce-mobile-order-expand"
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label} items`}
            aria-expanded={isExpanded}
            aria-controls={`order-items-${order.orderKey}`}
            onClick={() => toggleExpand(order)}
          >
            {isExpanded ? 'Hide items' : 'View items'}
            <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {renderActionMenu(order, label, isCancelled)}
        </div>

        <div
          id={`order-items-${order.orderKey}`}
          aria-hidden={!isExpanded}
        >
          <MeasuredHeight
            open={isExpanded}
            className="commerce-mobile-details"
            contentClassName="commerce-mobile-details-content"
            inert={!isExpanded}
          >
            <ul
              className="commerce-mobile-line-items"
              aria-label={`${label} line items`}
            >
              {order.lineItems.map((line) => (
                <li key={line.id} className="commerce-mobile-line-item">
                  <div className="commerce-mobile-line-heading">
                    <strong>{line.cardProductName ?? '—'}</strong>
                    <span className="commerce-line-type">
                      {line.lineItemType === 'gift' ? 'Gift' : 'Paid'}
                    </span>
                  </div>
                  <p className="commerce-mobile-line-meta">
                    {line.cardSetName ?? '—'} · {line.cardCondition ?? '—'}
                  </p>
                  <dl className="commerce-mobile-line-values">
                    <div>
                      <dt>Qty</dt>
                      <dd data-numeric>{line.quantitySold}</dd>
                    </div>
                    <div>
                      <dt>Unit price</dt>
                      <dd data-numeric>
                        {formatUnitPrice(line.quantitySold, line.salePriceCents)}
                      </dd>
                    </div>
                    <div>
                      <dt>Line total</dt>
                      <dd data-numeric>{formatCents(line.salePriceCents)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </MeasuredHeight>
        </div>
        <BlueprintRegistrationMarks />
      </article>
    );
  };

  return (
    <div ref={containerRef} className="commerce-sales">
      {mode === 'phone' ? (
        <div className="commerce-mobile-list">
          {loading && (
            <BlueprintPanel className="commerce-metric-loading">
              Loading sales…
            </BlueprintPanel>
          )}
          {!loading && orders.length === 0 && (
            <BlueprintPanel className="commerce-metric-loading">
              No sales recorded yet.
            </BlueprintPanel>
          )}
          {!loading && orders.map(renderMobileOrder)}
        </div>
      ) : (
        <BlueprintPanel className="commerce-sales-panel">
          <div className="table-container">
            <table className="card-table commerce-sales-table">
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
                    const tracking = formatTracking(order);
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
                              <ChevronRight
                                className="order-expand-chevron"
                                size={16}
                                strokeWidth={1.75}
                                aria-hidden="true"
                              />
                            </button>
                            <span className="order-label">{label}</span>
                          </td>
                          <td>{order.buyerName ?? '—'}</td>
                          <td className="quantity" data-numeric>
                            {order.itemCount}
                          </td>
                          <td className="price" data-numeric>
                            {formatCents(order.productSubtotalCents)}
                          </td>
                          <td className="price" data-numeric>
                            {formatCents(order.shippingCollectedCents)}
                          </td>
                          <td className="price" data-numeric>
                            {formatCents(order.totalCents)}
                          </td>
                          <td>{renderStatus(order, label)}</td>
                          <td className="tracking-cell">{tracking}</td>
                          <td className="actions">
                            {renderActionMenu(order, label, isCancelled)}
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
                                        <td data-numeric>{line.quantitySold}</td>
                                        <td>
                                          {line.lineItemType === 'gift'
                                            ? 'Gift'
                                            : 'Paid'}
                                        </td>
                                        <td data-numeric>
                                          {formatUnitPrice(
                                            line.quantitySold,
                                            line.salePriceCents,
                                          )}
                                        </td>
                                        <td data-numeric>
                                          {formatCents(line.salePriceCents)}
                                        </td>
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
          </div>
        </BlueprintPanel>
      )}
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
