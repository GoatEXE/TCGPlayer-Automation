import { useEffect, useRef, useState } from 'react';
import type { Card, CreateSaleRequest } from '../api/types';

interface BulkSellModalProps {
  cards: Card[];
  onSubmit: (sales: CreateSaleRequest[]) => Promise<void>;
  onClose: () => void;
}

interface PerCardState {
  quantity: number;
  salePrice: number;
}

export function BulkSellModal({ cards, onSubmit, onClose }: BulkSellModalProps) {
  const [buyerName, setBuyerName] = useState('');
  const [tcgplayerOrderId, setTcgplayerOrderId] = useState('');
  const [soldAt, setSoldAt] = useState(() => toDatetimeLocal(new Date()));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-card editable state
  const [perCard, setPerCard] = useState<PerCardState[]>(() =>
    cards.map((c) => ({
      quantity: c.quantity,
      salePrice: c.listingPrice ? parseFloat(c.listingPrice) : 0,
    })),
  );

  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    backdropRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, saving]);

  const updatePerCard = (index: number, field: keyof PerCardState, value: number) => {
    setPerCard((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const grandTotal = perCard.reduce((sum, pc) => sum + pc.quantity * pc.salePrice, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const sales: CreateSaleRequest[] = cards.map((card, i) => ({
      cardId: card.id,
      quantitySold: perCard[i].quantity,
      salePriceCents: Math.round(perCard[i].salePrice * 100),
      buyerName: buyerName || null,
      tcgplayerOrderId: tcgplayerOrderId || null,
      soldAt: soldAt ? new Date(soldAt).toISOString() : undefined,
      notes: notes || null,
    }));

    try {
      await onSubmit(sales);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record sales');
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !saving) {
      onClose();
    }
  };

  const recommendedPrice = (card: Card): string => {
    if (!card.marketPrice) return '—';
    const rec = Math.round(parseFloat(card.marketPrice) * 98) / 100;
    return `$${rec.toFixed(2)}`;
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
      <div className="modal-content" style={{ maxWidth: 900 }}>
        <div className="modal-header">
          <h2>📦 Bulk Sell — {cards.length} cards</h2>
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
          {/* Shared order fields */}
          <div className="bulk-sell-shared-fields">
            <div className="sale-field">
              <label htmlFor="bulk-buyer">Buyer Name</label>
              <input
                id="bulk-buyer"
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                disabled={saving}
                className="sale-input"
                placeholder="Optional"
              />
            </div>

            <div className="sale-field">
              <label htmlFor="bulk-order-id">TCGPlayer Order ID</label>
              <input
                id="bulk-order-id"
                type="text"
                value={tcgplayerOrderId}
                onChange={(e) => setTcgplayerOrderId(e.target.value)}
                disabled={saving}
                className="sale-input"
                placeholder="Optional"
              />
            </div>

            <div className="sale-field">
              <label htmlFor="bulk-sold-date">Sold Date</label>
              <input
                id="bulk-sold-date"
                type="datetime-local"
                value={soldAt}
                onChange={(e) => setSoldAt(e.target.value)}
                disabled={saving}
                className="sale-input"
              />
            </div>

            <div className="sale-field">
              <label htmlFor="bulk-notes">Notes</label>
              <textarea
                id="bulk-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={saving}
                className="sale-textarea"
                rows={2}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Per-card table */}
          <div className="bulk-sell-table-wrap">
            <table className="bulk-sell-table">
              <thead>
                <tr>
                  <th scope="col">Card Name</th>
                  <th scope="col">Market</th>
                  <th scope="col">Rec'd</th>
                  <th scope="col">Listed</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Sale Price</th>
                  <th scope="col">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card, i) => {
                  const cardName = card.title || card.productName;
                  const marketDisplay = card.marketPrice
                    ? `$${parseFloat(card.marketPrice).toFixed(2)}`
                    : '—';
                  const listedDisplay = card.listingPrice
                    ? `$${parseFloat(card.listingPrice).toFixed(2)}`
                    : '—';
                  const subtotal = perCard[i].quantity * perCard[i].salePrice;

                  return (
                    <tr key={card.id}>
                      <td>{cardName}</td>
                      <td>{marketDisplay}</td>
                      <td>{recommendedPrice(card)}</td>
                      <td>{listedDisplay}</td>
                      <td>
                        <input
                          type="number"
                          aria-label={`Quantity for ${cardName}`}
                          min={1}
                          max={card.quantity}
                          value={perCard[i].quantity}
                          onChange={(e) =>
                            updatePerCard(i, 'quantity', parseInt(e.target.value, 10) || 0)
                          }
                          disabled={saving}
                          className="sale-input bulk-sell-qty-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          aria-label={`Sale price for ${cardName}`}
                          min={0.01}
                          step={0.01}
                          value={perCard[i].salePrice}
                          onChange={(e) =>
                            updatePerCard(i, 'salePrice', parseFloat(e.target.value) || 0)
                          }
                          disabled={saving}
                          className="sale-input bulk-sell-price-input"
                        />
                      </td>
                      <td>${subtotal.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="bulk-sell-footer">
            <span className="bulk-sell-card-count">{cards.length} cards</span>
            <span className="bulk-sell-grand-total">
              Grand Total: <strong>${grandTotal.toFixed(2)}</strong>
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
              {saving ? '⏳ Saving…' : `📦 Attach to Order`}
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
