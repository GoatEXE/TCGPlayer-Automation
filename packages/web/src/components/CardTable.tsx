import { useState } from 'react';
import type { Card } from '../api/types';
import { StatusBadge } from './StatusBadge';
import { ReviewListModal } from './ReviewListModal';
import { PriceHistoryModal } from './PriceHistoryModal';

interface CardTableProps {
  cards: Card[];
  loading?: boolean;
  onReprice: (id: number) => void;
  onDelete: (id: number) => void;
  onMarkListed: (cardIds: number[]) => void;
  onUnlist: (id: number) => void;
}

type SortField = keyof Card | null;
type SortDirection = 'asc' | 'desc';

export function CardTable({
  cards,
  loading,
  onReprice,
  onDelete,
  onMarkListed,
  onUnlist,
}: CardTableProps) {
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [repricingId, setRepricingId] = useState<number | null>(null);
  const [unlistingId, setUnlistingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [markingListed, setMarkingListed] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [historyCardId, setHistoryCardId] = useState<number | null>(null);
  const [historyCardName, setHistoryCardName] = useState<string>('');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedCards = [...cards].sort((a, b) => {
    if (!sortField) return 0;

    const aVal = a[sortField];
    const bVal = b[sortField];

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this card?')) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleReprice = async (id: number) => {
    setRepricingId(id);
    try {
      await onReprice(id);
    } finally {
      setRepricingId(null);
    }
  };

  const handleUnlist = async (id: number) => {
    setUnlistingId(id);
    try {
      await onUnlist(id);
    } finally {
      setUnlistingId(null);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === matchedCards.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all matched cards
      const matchedIds = matchedCards.map((card) => card.id);
      setSelectedIds(new Set(matchedIds));
    }
  };

  const handleSelectCard = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleOpenReview = () => {
    if (selectedIds.size === 0) return;
    setShowReviewModal(true);
  };

  const handleConfirmMarkListed = async () => {
    setMarkingListed(true);
    try {
      await onMarkListed(Array.from(selectedIds));
      setSelectedIds(new Set()); // Clear selection on success
      setShowReviewModal(false);
    } finally {
      setMarkingListed(false);
    }
  };

  const handleCancelReview = () => {
    if (!markingListed) {
      setShowReviewModal(false);
    }
  };

  // Filter cards that can be selected (only matched status)
  const matchedCards = sortedCards.filter((card) => card.status === 'matched');

  const formatPrice = (price: string | null, isFoil?: boolean) => {
    if (!price) return '—';
    const formattedPrice = `$${parseFloat(price).toFixed(2)}`;
    if (isFoil) {
      return (
        <span title="Price based on Foil variant (no Normal pricing available)">
          {formattedPrice} ✨
        </span>
      );
    }
    return formattedPrice;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const SortableHeader = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => (
    <th onClick={() => handleSort(field)} className="sortable">
      {children}
      {sortField === field && (
        <span className="sort-indicator">
          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
        </span>
      )}
    </th>
  );

  if (loading) {
    return (
      <div className="table-loading">
        <p>⏳ Loading cards...</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="table-empty">
        <p>No cards found. Import some cards to get started!</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      {selectedIds.size > 0 && (
        <div className="selection-actions">
          <button
            onClick={handleOpenReview}
            disabled={markingListed}
            className="button-primary mark-listed"
          >
            {markingListed
              ? '⏳ Marking...'
              : `📋 Mark ${selectedIds.size} as Listed`}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="button-secondary"
          >
            Clear Selection
          </button>
        </div>
      )}
      <table className="card-table">
        <thead>
          <tr>
            <th className="checkbox-column">
              <input
                type="checkbox"
                checked={
                  selectedIds.size === matchedCards.length &&
                  matchedCards.length > 0
                }
                onChange={handleSelectAll}
                disabled={matchedCards.length === 0}
                title="Select all matched cards"
              />
            </th>
            <SortableHeader field="status">Status</SortableHeader>
            <SortableHeader field="productName">Name</SortableHeader>
            <SortableHeader field="setName">Set</SortableHeader>
            <SortableHeader field="number">Number</SortableHeader>
            <SortableHeader field="rarity">Rarity</SortableHeader>
            <SortableHeader field="condition">Condition</SortableHeader>
            <SortableHeader field="quantity">Qty</SortableHeader>
            <SortableHeader field="marketPrice">Market</SortableHeader>
            <SortableHeader field="listingPrice">Listing</SortableHeader>
            <SortableHeader field="updatedAt">Updated</SortableHeader>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedCards.map((card) => {
            const isMatched = card.status === 'matched';
            const isListed = card.status === 'listed';
            const isSelected = selectedIds.has(card.id);

            return (
              <tr key={card.id} className={isListed ? 'listed-row' : ''}>
                <td className="checkbox-column">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) =>
                      handleSelectCard(card.id, e.target.checked)
                    }
                    disabled={!isMatched}
                    title={
                      isMatched
                        ? 'Select for bulk listing'
                        : 'Only matched cards can be selected'
                    }
                  />
                </td>
                <td>
                  <StatusBadge status={card.status} />
                </td>
                <td className="card-name">
                  {card.title || card.productName}
                  {card.photoUrl && (
                    <a
                      href={card.photoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="photo-link"
                      title="View photo"
                    >
                      🖼️
                    </a>
                  )}
                </td>
                <td>{card.setName || '—'}</td>
                <td>{card.number || '—'}</td>
                <td>{card.rarity || '—'}</td>
                <td>{card.condition}</td>
                <td className="quantity">{card.quantity}</td>
                <td className="price">
                  {formatPrice(card.marketPrice, card.isFoilPrice)}
                </td>
                <td className="price">{formatPrice(card.listingPrice)}</td>
                <td className="date">{formatDate(card.updatedAt)}</td>
                <td className="actions">
                  {isListed ? (
                    <button
                      onClick={() => handleUnlist(card.id)}
                      disabled={unlistingId === card.id}
                      className="action-button unlist"
                      title="Remove from listing"
                    >
                      {unlistingId === card.id ? '⏳' : '↩️'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReprice(card.id)}
                      disabled={repricingId === card.id}
                      className="action-button reprice"
                      title="Re-price this card"
                    >
                      {repricingId === card.id ? '⏳' : '💰'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setHistoryCardId(card.id);
                      setHistoryCardName(card.title || card.productName);
                    }}
                    className="action-button history"
                    title="View price history"
                  >
                    📈
                  </button>
                  <button
                    onClick={() => handleDelete(card.id)}
                    disabled={deletingId === card.id}
                    className="action-button delete"
                    title="Delete this card"
                  >
                    {deletingId === card.id ? '⏳' : '🗑️'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {showReviewModal && (
        <ReviewListModal
          cards={sortedCards.filter((card) => selectedIds.has(card.id))}
          onConfirm={handleConfirmMarkListed}
          onCancel={handleCancelReview}
          loading={markingListed}
        />
      )}
      {historyCardId !== null && (
        <PriceHistoryModal
          cardId={historyCardId}
          cardName={historyCardName}
          onClose={() => setHistoryCardId(null)}
        />
      )}
    </div>
  );
}
