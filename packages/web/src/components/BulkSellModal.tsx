import { useEffect, useRef, useState } from 'react';
import type { Card, CreateBulkOrderRequest, OrderStatus } from '../api/types';

interface BulkSellModalProps {
  cards: Card[];
  onSubmit: (order: CreateBulkOrderRequest) => Promise<void>;
  onClose: () => void;
  defaultShippingCollectedCents?: number;
}

interface PerCardState {
  quantity: number;
  salePrice: number;
  lineItemType: 'sale' | 'gift';
}

export function BulkSellModal({
  cards,
  onSubmit,
  onClose,
  defaultShippingCollectedCents = 149,
}: BulkSellModalProps) {
  const [buyerName, setBuyerName] = useState('');
  const [tcgplayerOrderId, setTcgplayerOrderId] = useState('');
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('confirmed');
  const [soldAt, setSoldAt] = useState(() => toDatetimeLocal(new Date()));
  const [notes, setNotes] = useState('');
  const [shippingCollected, setShippingCollected] = useState(
    (defaultShippingCollectedCents / 100).toFixed(2),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perCard, setPerCard] = useState<PerCardState[]>(() =>
    cards.map((card) => ({
      quantity: card.quantity,
      salePrice: card.listingPrice ? parseFloat(card.listingPrice) : 0,
      lineItemType: 'sale',
    })),
  );
  const backdropRef = useRef<HTMLDivElement>(null);
  const hasPaidLine = perCard.some((line) => line.lineItemType === 'sale');
  const paidLineCount = perCard.filter(
    (line) => line.lineItemType === 'sale',
  ).length;
  const giftLineCount = perCard.length - paidLineCount;

  useEffect(() => {
    backdropRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!hasPaidLine) {
      setShippingCollected('0.00');
    }
  }, [hasPaidLine]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, saving]);

  const updatePerCard = (
    index: number,
    field: keyof Pick<PerCardState, 'quantity' | 'salePrice'>,
    value: number,
  ) => {
    setPerCard((previous) => {
      const next = [...previous];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const updateLineItemType = (
    index: number,
    card: Card,
    lineItemType: 'sale' | 'gift',
  ) => {
    setPerCard((previous) => {
      const next = [...previous];
      const originalPrice = card.listingPrice
        ? parseFloat(card.listingPrice)
        : 0;
      next[index] = {
        ...next[index],
        lineItemType,
        salePrice:
          lineItemType === 'gift'
            ? 0
            : next[index].salePrice > 0
              ? next[index].salePrice
              : originalPrice,
      };
      return next;
    });
  };

  const grandTotal = perCard.reduce(
    (sum, line) =>
      sum + (line.lineItemType === 'sale' ? line.quantity * line.salePrice : 0),
    0,
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const orderId = tcgplayerOrderId.trim();
    if (!orderId) {
      setError('TCGPlayer Order ID is required');
      return;
    }

    const shippingCollectedCents = hasPaidLine
      ? parseDollarsToCents(shippingCollected)
      : 0;
    if (shippingCollectedCents === null) {
      setError('Shipping collected must be a valid non-negative dollar amount');
      return;
    }

    const lines = cards.map((card, index) => {
      const line = perCard[index];
      return {
        cardId: card.id,
        quantitySold: line.quantity,
        salePriceCents:
          line.lineItemType === 'gift' ? 0 : Math.round(line.salePrice * 100),
        lineItemType: line.lineItemType,
      };
    });

    setSaving(true);
    try {
      await onSubmit({
        buyerName: buyerName || null,
        tcgplayerOrderId: orderId,
        orderStatus,
        soldAt: soldAt ? new Date(soldAt).toISOString() : undefined,
        notes: notes || null,
        shippingCollectedCents,
        lines,
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to record order',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !saving) {
      onClose();
    }
  };

  const recommendedPrice = (card: Card): string => {
    if (!card.marketPrice) return '—';
    const parsed = parseFloat(card.marketPrice);
    if (!Number.isFinite(parsed)) return '—';
    const recommendation = Math.round(parsed * 98) / 100;
    return `$${recommendation.toFixed(2)}`;
  };

  return (
    <div
      ref={backdropRef}
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Bulk sell"
      tabIndex={-1}
    >
      <div className="modal-content bulk-sell-modal-content">
        <div className="modal-header">
          <h2>
            📦 Attach to Order — {cards.length} selected card
            {cards.length === 1 ? '' : 's'}
          </h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="sale-form" noValidate>
          <div className="bulk-sell-shared-fields">
            <div className="sale-field">
              <label htmlFor="bulk-buyer">Buyer Name</label>
              <input
                id="bulk-buyer"
                type="text"
                value={buyerName}
                onChange={(event) => setBuyerName(event.target.value)}
                disabled={saving}
                className="sale-input"
                placeholder="Optional"
              />
            </div>
            <div className="sale-field">
              <label htmlFor="bulk-order-id">TCGPlayer Order ID *</label>
              <input
                id="bulk-order-id"
                type="text"
                value={tcgplayerOrderId}
                onChange={(event) => setTcgplayerOrderId(event.target.value)}
                disabled={saving}
                className="sale-input"
                placeholder="Required for Attach to Order"
                aria-required="true"
              />
            </div>
            <div className="sale-field">
              <label htmlFor="bulk-order-status">Order Status</label>
              <select
                id="bulk-order-status"
                value={orderStatus}
                onChange={(event) =>
                  setOrderStatus(event.target.value as OrderStatus)
                }
                disabled={saving}
                className="sale-input"
              >
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
            <div className="sale-field">
              <label htmlFor="bulk-sold-date">Sold Date</label>
              <input
                id="bulk-sold-date"
                type="datetime-local"
                value={soldAt}
                onChange={(event) => setSoldAt(event.target.value)}
                disabled={saving}
                className="sale-input"
              />
            </div>
            <div className="sale-field">
              <label htmlFor="bulk-shipping-collected">
                Shipping Collected ($)
              </label>
              <input
                id="bulk-shipping-collected"
                type="number"
                min={0}
                step={0.01}
                value={shippingCollected}
                onChange={(event) => setShippingCollected(event.target.value)}
                disabled={saving || !hasPaidLine}
                className="sale-input"
              />
            </div>
            <div className="sale-field">
              <label htmlFor="bulk-notes">Notes</label>
              <textarea
                id="bulk-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={saving}
                className="sale-textarea"
                rows={2}
                placeholder="Optional"
              />
            </div>
          </div>

          <h3>Order items</h3>
          <p className="bulk-gift-note">
            Choose Paid or Gift/freebie for each selected listing. Gift lines
            are recorded at $0.00.
          </p>
          <div className="bulk-sell-table-wrap">
            <table className="bulk-sell-table">
              <thead>
                <tr>
                  <th scope="col">Card Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Market</th>
                  <th scope="col">Rec&apos;d</th>
                  <th scope="col">Listed</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Sale Price</th>
                  <th scope="col">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card, index) => {
                  const cardName = card.title || card.productName;
                  const line = perCard[index];
                  const isGift = line.lineItemType === 'gift';
                  const marketDisplay = card.marketPrice
                    ? `$${parseFloat(card.marketPrice).toFixed(2)}`
                    : '—';
                  const listedDisplay = card.listingPrice
                    ? `$${parseFloat(card.listingPrice).toFixed(2)}`
                    : '—';
                  const subtotal = isGift ? 0 : line.quantity * line.salePrice;
                  return (
                    <tr key={card.id}>
                      <td>{cardName}</td>
                      <td>
                        <select
                          aria-label={`Line type for ${cardName}`}
                          value={line.lineItemType}
                          onChange={(event) =>
                            updateLineItemType(
                              index,
                              card,
                              event.target.value as 'sale' | 'gift',
                            )
                          }
                          disabled={saving}
                          className="sale-input bulk-sell-type-input"
                        >
                          <option value="sale">Paid</option>
                          <option value="gift">Gift / freebie</option>
                        </select>
                      </td>
                      <td>{marketDisplay}</td>
                      <td>{recommendedPrice(card)}</td>
                      <td>{listedDisplay}</td>
                      <td>
                        <input
                          type="number"
                          aria-label={`Quantity for ${cardName}`}
                          min={1}
                          max={card.quantity}
                          value={line.quantity}
                          onChange={(event) =>
                            updatePerCard(
                              index,
                              'quantity',
                              parseInt(event.target.value, 10) || 0,
                            )
                          }
                          disabled={saving}
                          className="sale-input bulk-sell-qty-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          aria-label={`Sale price for ${cardName}`}
                          min={isGift ? 0 : 0.01}
                          step={0.01}
                          value={line.salePrice}
                          onChange={(event) =>
                            updatePerCard(
                              index,
                              'salePrice',
                              parseFloat(event.target.value) || 0,
                            )
                          }
                          disabled={saving || isGift}
                          className="sale-input bulk-sell-price-input"
                        />
                      </td>
                      <td>
                        {isGift ? '$0.00 / Freebie' : `$${subtotal.toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bulk-sell-footer">
            <span className="bulk-sell-card-count">
              {paidLineCount} paid / {giftLineCount} gift
            </span>
            <span className="bulk-sell-grand-total">
              Paid Total: <strong>${grandTotal.toFixed(2)}</strong>
            </span>
          </div>

          {error && (
            <span className="interval-error" role="alert">
              {error}
            </span>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? '⏳ Saving…' : '📦 Attach to Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function parseDollarsToCents(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function toDatetimeLocal(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
