import { useState } from 'react';
import type { Card, CreateSaleRequest } from '../api/types';
import { StatusBadge } from './StatusBadge';
import { ReviewListModal } from './ReviewListModal';
import { PriceHistoryModal } from './PriceHistoryModal';
import { RecordSaleModal } from './RecordSaleModal';
import { BulkSellModal } from './BulkSellModal';

interface CardTableProps {
  cards: Card[];
  loading?: boolean;
  onReprice: (id: number) => void;
  onDelete: (id: number) => void;
  onMarkListed: (cardIds: number[]) => void;
  onUnlist: (id: number) => void;
  onUpdateCard: (id: number, data: Partial<Card>) => Promise<Card>;
  onRecordSale?: (data: CreateSaleRequest) => Promise<void>;
  onBulkSell?: (sales: CreateSaleRequest[]) => Promise<void>;
  enableSellFlow?: boolean;
  defaultApplyExpenses?: boolean;
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
  onUpdateCard,
  onRecordSale,
  onBulkSell,
  enableSellFlow,
  defaultApplyExpenses = false,
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
  const [editingFloorId, setEditingFloorId] = useState<number | null>(null);
  const [floorEditValue, setFloorEditValue] = useState<string>('');
  const [editingListingId, setEditingListingId] = useState<number | null>(null);
  const [listingEditValue, setListingEditValue] = useState<string>('');
  const [recordSaleCardId, setRecordSaleCardId] = useState<number | null>(null);
  const [showBulkSellModal, setShowBulkSellModal] = useState(false);

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
    if (selectedIds.size === selectableCards.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all selectable cards
      const selectableIds = selectableCards.map((card) => card.id);
      setSelectedIds(new Set(selectableIds));
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

  // Filter cards that can be selected
  const matchedCards = sortedCards.filter((card) => card.status === 'matched');
  const selectableCards = enableSellFlow
    ? sortedCards.filter((card) => card.status === 'listed')
    : matchedCards;

  const handleFloorEdit = (card: Card) => {
    setEditingFloorId(card.id);
    setFloorEditValue(
      card.floorPriceCents != null
        ? (card.floorPriceCents / 100).toFixed(2)
        : '',
    );
  };

  const handleFloorSave = async (id: number) => {
    const trimmed = floorEditValue.trim();
    const cents = trimmed === '' ? null : Math.round(parseFloat(trimmed) * 100);
    if (cents !== null && (isNaN(cents) || cents < 0)) return;
    setEditingFloorId(null);
    await onUpdateCard(id, { floorPriceCents: cents } as Partial<Card>);
  };

  const handleListingEdit = (card: Card) => {
    setEditingListingId(card.id);
    setListingEditValue(
      card.listingPrice != null
        ? parseFloat(card.listingPrice).toFixed(2)
        : '',
    );
  };

  const handleListingSave = async (id: number) => {
    const trimmed = listingEditValue.trim();
    if (trimmed === '') return setEditingListingId(null);
    const num = parseFloat(trimmed);
    if (isNaN(num) || num < 0) return;
    setEditingListingId(null);
    await onUpdateCard(id, { listingPrice: num } as unknown as Partial<Card>);
  };

  const handleListingKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    id: number,
  ) => {
    if (e.key === 'Enter') {
      handleListingSave(id);
    } else if (e.key === 'Escape') {
      setEditingListingId(null);
    }
  };

  const formatRecommendedPrice = (marketPrice: string | null) => {
    if (!marketPrice) return '\u2014';
    const recommended = Math.round(parseFloat(marketPrice) * 98) / 100;
    return `$${recommended.toFixed(2)}`;
  };

  const handleFloorKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    id: number,
  ) => {
    if (e.key === 'Enter') {
      handleFloorSave(id);
    } else if (e.key === 'Escape') {
      setEditingFloorId(null);
    }
  };

  const formatFloorPrice = (cents: number | null) => {
    if (cents == null) return '—';
    return `$${(cents / 100).toFixed(2)}`;
  };

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
          {enableSellFlow ? (
            <button
              onClick={() => setShowBulkSellModal(true)}
              className="button-primary"
            >
              💰 Attach {selectedIds.size} to Order
            </button>
          ) : (
            <button
              onClick={handleOpenReview}
              disabled={markingListed}
              className="button-primary mark-listed"
            >
              {markingListed
                ? '⏳ Marking...'
                : `📋 Mark ${selectedIds.size} as Listed`}
            </button>
          )}
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
                  selectedIds.size === selectableCards.length &&
                  selectableCards.length > 0
                }
                onChange={handleSelectAll}
                disabled={selectableCards.length === 0}
                title={enableSellFlow ? 'Select all listed cards' : 'Select all matched cards'}
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
            <th>Rec'd</th>
            <SortableHeader field="listingPrice">Listing</SortableHeader>
            <SortableHeader field="floorPriceCents">Floor</SortableHeader>
            <SortableHeader field="lastCheckedAt">Last Checked</SortableHeader>
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
                    disabled={enableSellFlow ? !isListed : !isMatched}
                    title={
                      enableSellFlow
                        ? isListed
                          ? 'Select for bulk sell'
                          : 'Only listed cards can be selected'
                        : isMatched
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
                <td className="price">
                  {formatRecommendedPrice(card.marketPrice)}
                </td>
                <td className="price listing-price-cell">
                  {isListed ? (
                    editingListingId === card.id ? (
                      <input
                        type="number"
                        className="listing-price-input"
                        value={listingEditValue}
                        onChange={(e) => setListingEditValue(e.target.value)}
                        onKeyDown={(e) => handleListingKeyDown(e, card.id)}
                        onBlur={() => handleListingSave(card.id)}
                        min="0"
                        step="0.01"
                        placeholder="\u2014"
                        autoFocus
                      />
                    ) : (
                      <button
                        className="listing-price-display"
                        onClick={() => handleListingEdit(card)}
                        title="Click to edit listing price"
                      >
                        {formatPrice(card.listingPrice)}
                      </button>
                    )
                  ) : (
                    formatPrice(card.listingPrice)
                  )}
                </td>
                <td className="price floor-price-cell">
                  {editingFloorId === card.id ? (
                    <input
                      type="number"
                      className="floor-price-input"
                      value={floorEditValue}
                      onChange={(e) => setFloorEditValue(e.target.value)}
                      onKeyDown={(e) => handleFloorKeyDown(e, card.id)}
                      onBlur={() => handleFloorSave(card.id)}
                      min="0"
                      step="0.01"
                      placeholder="—"
                      autoFocus
                    />
                  ) : (
                    <button
                      className="floor-price-display"
                      onClick={() => handleFloorEdit(card)}
                      title="Click to set floor price"
                    >
                      {formatFloorPrice(card.floorPriceCents)}
                    </button>
                  )}
                </td>
                <td className="date">
                  {card.lastCheckedAt ? formatDate(card.lastCheckedAt) : '—'}
                </td>
                <td className="date">{formatDate(card.updatedAt)}</td>
                <td className="actions">
                  {isListed ? (
                    <>
                      <button
                        onClick={() => setRecordSaleCardId(card.id)}
                        className="action-button"
                        title="Record sale"
                      >
                        💵
                      </button>
                      <button
                        onClick={() => handleUnlist(card.id)}
                        disabled={unlistingId === card.id}
                        className="action-button unlist"
                        title="Remove from listing"
                      >
                        {unlistingId === card.id ? '⏳' : '↩️'}
                      </button>
                    </>
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
      {recordSaleCardId !== null && onRecordSale && (() => {
        const card = cards.find((c) => c.id === recordSaleCardId);
        if (!card) return null;
        return (
          <RecordSaleModal
            card={card}
            onSubmit={async (data) => {
              await onRecordSale(data);
              setRecordSaleCardId(null);
            }}
            onClose={() => setRecordSaleCardId(null)}
            defaultApplyExpenses={defaultApplyExpenses}
          />
        );
      })()}
      {showBulkSellModal && onBulkSell && (
        <BulkSellModal
          cards={cards.filter((c) => selectedIds.has(c.id))}
          onSubmit={async (sales) => {
            await onBulkSell(sales);
            setShowBulkSellModal(false);
            setSelectedIds(new Set());
          }}
          onClose={() => {
            setShowBulkSellModal(false);
          }}
          defaultApplyExpenses={defaultApplyExpenses}
        />
      )}
    </div>
  );
}
