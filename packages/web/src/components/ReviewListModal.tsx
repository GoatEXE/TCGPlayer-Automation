import type { Card } from '../api/types';

interface ReviewListModalProps {
  cards: Card[];
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ReviewListModal({
  cards,
  onConfirm,
  onCancel,
  loading,
}: ReviewListModalProps) {
  const totalValue = cards.reduce((sum, card) => {
    const price = card.listingPrice ? parseFloat(card.listingPrice) : 0;
    return sum + price * card.quantity;
  }, 0);

  const totalQuantity = cards.reduce((sum, card) => sum + card.quantity, 0);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading) {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !loading) {
      onCancel();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Review cards to mark as listed"
      tabIndex={-1}
    >
      <div className="modal-content review-modal">
        <div className="modal-header">
          <h2>📋 Review Listing</h2>
          <button
            className="modal-close"
            onClick={onCancel}
            disabled={loading}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="review-summary-text">
          Mark{' '}
          <strong>
            {cards.length} card{cards.length !== 1 ? 's' : ''}
          </strong>{' '}
          ({totalQuantity} total qty) as listed on TCGPlayer
        </p>

        <div className="review-table-wrapper">
          <table className="review-table">
            <thead>
              <tr>
                <th>Card Name</th>
                <th className="review-col-right">Qty</th>
                <th className="review-col-right">Listing Price</th>
                <th className="review-col-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => {
                const price = card.listingPrice
                  ? parseFloat(card.listingPrice)
                  : 0;
                const subtotal = price * card.quantity;
                return (
                  <tr key={card.id}>
                    <td className="review-card-name">
                      {card.title || card.productName}
                    </td>
                    <td className="review-col-right">{card.quantity}</td>
                    <td className="review-col-right">
                      {card.listingPrice ? `$${price.toFixed(2)}` : '—'}
                    </td>
                    <td className="review-col-right">
                      {card.listingPrice ? `$${subtotal.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="review-total">
          <span>Estimated Total Value</span>
          <strong>${totalValue.toFixed(2)}</strong>
        </div>

        <div className="modal-actions">
          <button
            className="button-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="button-primary"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '⏳ Marking...' : `✅ Confirm Mark as Listed`}
          </button>
        </div>
      </div>
    </div>
  );
}
