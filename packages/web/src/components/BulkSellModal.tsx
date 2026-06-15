import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card, CreateBulkOrderRequest, OrderStatus } from '../api/types';

interface BulkSellModalProps {
  cards: Card[];
  giftCards?: Card[];
  onSubmit: (order: CreateBulkOrderRequest) => Promise<void>;
  onClose: () => void;
  defaultShippingCollectedCents?: number;
}

interface PerCardState {
  quantity: number;
  salePrice: number;
}

interface GiftLineState {
  quantity: number;
}

export function BulkSellModal({
  cards,
  giftCards = [],
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
  const [giftSearch, setGiftSearch] = useState('');
  const [selectedGifts, setSelectedGifts] = useState<Map<number, GiftLineState>>(
    new Map(),
  );

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

  const filteredGiftCards = useMemo(() => {
    const query = giftSearch.trim().toLowerCase();
    if (!query) return giftCards;
    return giftCards.filter((card) =>
      (card.title || card.productName).toLowerCase().includes(query),
    );
  }, [giftCards, giftSearch]);

  const updatePerCard = (index: number, field: keyof PerCardState, value: number) => {
    setPerCard((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const updateGiftSelection = (card: Card, checked: boolean) => {
    setSelectedGifts((prev) => {
      const next = new Map(prev);
      if (checked) {
        next.set(card.id, { quantity: Math.min(1, card.quantity) });
      } else {
        next.delete(card.id);
      }
      return next;
    });
  };

  const updateGiftQuantity = (cardId: number, quantity: number) => {
    setSelectedGifts((prev) => {
      const next = new Map(prev);
      const current = next.get(cardId);
      if (current) next.set(cardId, { ...current, quantity });
      return next;
    });
  };

  const giftLines = giftCards.filter((card) => selectedGifts.has(card.id));
  const grandTotal = perCard.reduce((sum, pc) => sum + pc.quantity * pc.salePrice, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const orderId = tcgplayerOrderId.trim();
    if (!orderId) {
      setError('TCGPlayer Order ID is required');
      return;
    }

    const shippingCollectedCents = parseDollarsToCents(shippingCollected);
    if (shippingCollectedCents === null) {
      setError('Shipping collected must be a valid non-negative dollar amount');
      return;
    }

    const lines = [
      ...cards.map((card, i) => ({
        cardId: card.id,
        quantitySold: perCard[i].quantity,
        salePriceCents: Math.round(perCard[i].salePrice * 100),
        lineItemType: 'sale' as const,
      })),
      ...giftLines.map((card) => ({
        cardId: card.id,
        quantitySold: selectedGifts.get(card.id)?.quantity ?? 1,
        salePriceCents: 0,
        lineItemType: 'gift' as const,
      })),
    ];

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record order');
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
    const parsed = parseFloat(card.marketPrice);
    if (!Number.isFinite(parsed)) return '—';
    const rec = Math.round(parsed * 98) / 100;
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
      <div className="modal-content bulk-sell-modal-content">
        <div className="modal-header">
          <h2>📦 Attach to Order — {cards.length} paid card{cards.length === 1 ? '' : 's'}</h2>
          <button className="modal-close" onClick={onClose} disabled={saving} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="sale-form" noValidate>
          <div className="bulk-sell-shared-fields">
            <div className="sale-field">
              <label htmlFor="bulk-buyer">Buyer Name</label>
              <input id="bulk-buyer" type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} disabled={saving} className="sale-input" placeholder="Optional" />
            </div>
            <div className="sale-field">
              <label htmlFor="bulk-order-id">TCGPlayer Order ID *</label>
              <input id="bulk-order-id" type="text" value={tcgplayerOrderId} onChange={(e) => setTcgplayerOrderId(e.target.value)} disabled={saving} className="sale-input" placeholder="Required for Attach to Order" aria-required="true" />
            </div>
            <div className="sale-field">
              <label htmlFor="bulk-order-status">Order Status</label>
              <select id="bulk-order-status" value={orderStatus} onChange={(e) => setOrderStatus(e.target.value as OrderStatus)} disabled={saving} className="sale-input">
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
            <div className="sale-field">
              <label htmlFor="bulk-sold-date">Sold Date</label>
              <input id="bulk-sold-date" type="datetime-local" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} disabled={saving} className="sale-input" />
            </div>
            <div className="sale-field">
              <label htmlFor="bulk-shipping-collected">Shipping Collected ($)</label>
              <input id="bulk-shipping-collected" type="number" min={0} step={0.01} value={shippingCollected} onChange={(e) => setShippingCollected(e.target.value)} disabled={saving} className="sale-input" />
            </div>
            <div className="sale-field">
              <label htmlFor="bulk-notes">Notes</label>
              <textarea id="bulk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} className="sale-textarea" rows={2} placeholder="Optional" />
            </div>
          </div>

          <h3>Paid items</h3>
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
                  const marketDisplay = card.marketPrice ? `$${parseFloat(card.marketPrice).toFixed(2)}` : '—';
                  const listedDisplay = card.listingPrice ? `$${parseFloat(card.listingPrice).toFixed(2)}` : '—';
                  const subtotal = perCard[i].quantity * perCard[i].salePrice;
                  return (
                    <tr key={card.id}>
                      <td>{cardName}</td>
                      <td>{marketDisplay}</td>
                      <td>{recommendedPrice(card)}</td>
                      <td>{listedDisplay}</td>
                      <td><input type="number" aria-label={`Quantity for ${cardName}`} min={1} max={card.quantity} value={perCard[i].quantity} onChange={(e) => updatePerCard(i, 'quantity', parseInt(e.target.value, 10) || 0)} disabled={saving} className="sale-input bulk-sell-qty-input" /></td>
                      <td><input type="number" aria-label={`Sale price for ${cardName}`} min={0.01} step={0.01} value={perCard[i].salePrice} onChange={(e) => updatePerCard(i, 'salePrice', parseFloat(e.target.value) || 0)} disabled={saving} className="sale-input bulk-sell-price-input" /></td>
                      <td>${subtotal.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <section className="bulk-gift-section" aria-labelledby="bulk-gift-heading">
            <div className="bulk-gift-header">
              <h3 id="bulk-gift-heading">Gifts / freebies</h3>
              <span className="bulk-gift-note">Gift lines are recorded as $0.00 freebies.</span>
            </div>
            <label className="sale-field" htmlFor="bulk-gift-search">
              Search gift pool
            </label>
            <input id="bulk-gift-search" type="text" value={giftSearch} onChange={(e) => setGiftSearch(e.target.value)} disabled={saving} className="sale-input" placeholder="Find gift-pool cards..." />
            {filteredGiftCards.length === 0 ? (
              <p className="table-empty">No gift-pool cards found.</p>
            ) : (
              <div className="bulk-sell-table-wrap">
                <table className="bulk-sell-table">
                  <thead>
                    <tr>
                      <th scope="col">Add</th>
                      <th scope="col">Gift Card</th>
                      <th scope="col">Available</th>
                      <th scope="col">Gift Qty</th>
                      <th scope="col">Line</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGiftCards.map((card) => {
                      const cardName = card.title || card.productName;
                      const selected = selectedGifts.has(card.id);
                      return (
                        <tr key={card.id}>
                          <td><input type="checkbox" aria-label={`Add ${cardName} as gift`} checked={selected} onChange={(e) => updateGiftSelection(card, e.target.checked)} disabled={saving} /></td>
                          <td>{cardName}</td>
                          <td>{card.quantity}</td>
                          <td><input type="number" aria-label={`Gift quantity for ${cardName}`} min={1} max={card.quantity} value={selectedGifts.get(card.id)?.quantity ?? 1} onChange={(e) => updateGiftQuantity(card.id, parseInt(e.target.value, 10) || 0)} disabled={saving || !selected} className="sale-input bulk-sell-qty-input" /></td>
                          <td>$0.00 / Freebie</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="bulk-sell-footer">
            <span className="bulk-sell-card-count">{cards.length} paid / {selectedGifts.size} gift</span>
            <span className="bulk-sell-grand-total">Paid Total: <strong>${grandTotal.toFixed(2)}</strong></span>
          </div>

          {error && <span className="interval-error" role="alert">{error}</span>}

          <div className="modal-actions">
            <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="button-primary" disabled={saving}>{saving ? '⏳ Saving…' : '📦 Attach to Order'}</button>
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

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
