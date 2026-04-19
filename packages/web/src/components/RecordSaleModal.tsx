import { useEffect, useRef, useState } from 'react';
import type { Card, CreateSaleRequest } from '../api/types';

interface RecordSaleModalProps {
  card: Card;
  onSubmit: (data: CreateSaleRequest) => Promise<void>;
  onClose: () => void;
  defaultApplyExpenses?: boolean;
}

export function RecordSaleModal({
  card,
  onSubmit,
  onClose,
  defaultApplyExpenses = false,
}: RecordSaleModalProps) {
  const defaultPrice = card.listingPrice ? parseFloat(card.listingPrice) : 0;

  const [quantity, setQuantity] = useState(card.quantity);
  const [salePrice, setSalePrice] = useState(defaultPrice);
  const [buyerName, setBuyerName] = useState('');
  const [tcgplayerOrderId, setTcgplayerOrderId] = useState('');
  const [soldAt, setSoldAt] = useState(() => toDatetimeLocal(new Date()));
  const [notes, setNotes] = useState('');
  const [applyEstimatedExpenses, setApplyEstimatedExpenses] = useState(
    defaultApplyExpenses,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backdropRef = useRef<HTMLDivElement>(null);

  // Auto-focus the dialog on mount
  useEffect(() => {
    backdropRef.current?.focus();
  }, []);

  // Document-level Escape listener
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, saving]);

  const total = quantity * salePrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (quantity < 1 || quantity > card.quantity) {
      setError(`Quantity cannot exceed ${card.quantity}`);
      return;
    }

    if (salePrice <= 0) {
      setError('Price must be greater than 0');
      return;
    }

    setSaving(true);

    const payload: CreateSaleRequest = {
      cardId: card.id,
      quantitySold: quantity,
      salePriceCents: Math.round(salePrice * 100),
      buyerName: buyerName || null,
      tcgplayerOrderId: tcgplayerOrderId || null,
      soldAt: soldAt ? new Date(soldAt).toISOString() : undefined,
      notes: notes || null,
      applyEstimatedExpenses,
    };

    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record sale');
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !saving) {
      onClose();
    }
  };

  const marketPriceDisplay = card.marketPrice
    ? `$${parseFloat(card.marketPrice).toFixed(2)}`
    : '—';
  const listingPriceDisplay = card.listingPrice
    ? `$${parseFloat(card.listingPrice).toFixed(2)}`
    : '—';
  const cardDisplayName = card.title || card.productName;

  return (
    <div
      ref={backdropRef}
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Record sale"
      tabIndex={-1}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2>💰 Record Sale</h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="sale-card-info">
          <p className="sale-card-name">{cardDisplayName}</p>
          <p className="sale-card-details">
            {card.setName && <span>{card.setName}</span>}
            {card.setName && ' · '}
            <span>{card.condition}</span>
            {' · '}
            <span>Qty: {card.quantity}</span>
          </p>
          <p className="sale-card-prices">
            Market: {marketPriceDisplay} · Listing: {listingPriceDisplay}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="sale-form" noValidate>
          <div className="sale-field">
            <label htmlFor="sale-quantity">Quantity</label>
            <input
              id="sale-quantity"
              type="number"
              min={1}
              max={card.quantity}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
              disabled={saving}
              className="sale-input"
            />
          </div>

          <div className="sale-field">
            <label htmlFor="sale-price">Sale Price ($)</label>
            <input
              id="sale-price"
              type="number"
              min={0.01}
              step={0.01}
              value={salePrice}
              onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
              disabled={saving}
              className="sale-input"
            />
          </div>

          <div className="sale-total">
            <span>Total</span>
            <strong>${total.toFixed(2)}</strong>
          </div>

          <div className="sale-field">
            <label htmlFor="sale-buyer">Buyer Name</label>
            <input
              id="sale-buyer"
              type="text"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              disabled={saving}
              className="sale-input"
              placeholder="Optional"
            />
          </div>

          <div className="sale-field">
            <label htmlFor="sale-order-id">TCGPlayer Order ID</label>
            <input
              id="sale-order-id"
              type="text"
              value={tcgplayerOrderId}
              onChange={(e) => setTcgplayerOrderId(e.target.value)}
              disabled={saving}
              className="sale-input"
              placeholder="Optional"
            />
          </div>

          <div className="sale-field">
            <label htmlFor="sale-date">Sold Date</label>
            <input
              id="sale-date"
              type="datetime-local"
              value={soldAt}
              onChange={(e) => setSoldAt(e.target.value)}
              disabled={saving}
              className="sale-input"
            />
          </div>

          <div className="sale-field">
            <label htmlFor="sale-notes">Notes</label>
            <textarea
              id="sale-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
              className="sale-textarea"
              rows={2}
              placeholder="Optional"
            />
          </div>

          <div className="sale-field">
            <label htmlFor="sale-apply-estimated-expenses">
              <input
                id="sale-apply-estimated-expenses"
                type="checkbox"
                checked={applyEstimatedExpenses}
                onChange={(e) => setApplyEstimatedExpenses(e.target.checked)}
                disabled={saving}
              />{' '}
              Apply estimated expenses
            </label>
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
              {saving ? '⏳ Saving…' : '💰 Record Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Convert a Date to `YYYY-MM-DDTHH:mm` for datetime-local input */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
