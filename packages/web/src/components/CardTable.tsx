import { useEffect, useRef, useState } from 'react';
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
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField, direction: SortDirection) => void;
}

export type SortField = keyof Card | null;
export type SortDirection = 'asc' | 'desc';

function isValidPhotoUrl(photoUrl: string | null | undefined) {
  if (!photoUrl) return false;

  try {
    const url = new URL(photoUrl);
    const isHttpImage =
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      /\.(jpe?g|png|gif|webp)$/i.test(url.pathname);
    return isHttpImage;
  } catch {
    return false;
  }
}

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
  sortField: controlledSortField,
  sortDirection: controlledSortDirection,
  onSortChange,
}: CardTableProps) {
  const [localSortField, setLocalSortField] = useState<SortField>('updatedAt');
  const [localSortDirection, setLocalSortDirection] =
    useState<SortDirection>('desc');
  const sortField = controlledSortField ?? localSortField;
  const sortDirection = controlledSortDirection ?? localSortDirection;
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [repricingId, setRepricingId] = useState<number | null>(null);
  const [unlistingId, setUnlistingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [markingListed, setMarkingListed] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [historyCardId, setHistoryCardId] = useState<number | null>(null);
  const [historyCardName, setHistoryCardName] = useState<string>('');
  const [editingListingId, setEditingListingId] = useState<number | null>(null);
  const [listingEditValue, setListingEditValue] = useState<string>('');
  const [recordSaleCardId, setRecordSaleCardId] = useState<number | null>(null);
  const [showBulkSellModal, setShowBulkSellModal] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<{
    url: string;
    cardName: string;
  } | null>(null);

  useEffect(() => {
    if (openActionMenuId === null) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        actionMenuRef.current &&
        !actionMenuRef.current.contains(event.target as Node)
      ) {
        setOpenActionMenuId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenActionMenuId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openActionMenuId]);

  const handleSort = (field: SortField) => {
    const nextDirection =
      sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';

    if (onSortChange) {
      onSortChange(field, nextDirection);
      return;
    }

    if (sortField === field) {
      setLocalSortDirection(nextDirection);
    } else {
      setLocalSortField(field);
      setLocalSortDirection('asc');
    }
  };

  const sortedCards = onSortChange ? cards : [...cards].sort((a, b) => {
    if (!sortField) return 0;

    const aVal =
      sortField === 'productName' ? a.title || a.productName : a[sortField];
    const bVal =
      sortField === 'productName' ? b.title || b.productName : b[sortField];

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

  const parsePriceValue = (price: string | null | undefined) => {
    if (!price) return null;
    const parsed = Number.parseFloat(price);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleListingEdit = (card: Card) => {
    setEditingListingId(card.id);
    const listingPrice = parsePriceValue(card.listingPrice);
    setListingEditValue(listingPrice !== null ? listingPrice.toFixed(2) : '');
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
    const parsedMarketPrice = parsePriceValue(marketPrice);
    if (parsedMarketPrice === null) return '\u2014';
    const recommended = Math.round(parsedMarketPrice * 98) / 100;
    return `$${recommended.toFixed(2)}`;
  };

  const formatPrice = (price: string | null, isFoil?: boolean) => {
    const parsedPrice = parsePriceValue(price);
    if (parsedPrice === null) return '—';
    const formattedPrice = `$${parsedPrice.toFixed(2)}`;
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
            <SortableHeader field="lastCheckedAt">Last Checked</SortableHeader>
            <SortableHeader field="updatedAt">Updated</SortableHeader>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedCards.map((card) => {
            const isMatched = card.status === 'matched';
            const isListed = card.status === 'listed';
            const canEditListingPrice =
              card.status === 'listed' || card.status === 'needs_attention';
            const isSelected = selectedIds.has(card.id);
            const photoUrl = isValidPhotoUrl(card.photoUrl) ? card.photoUrl : null;

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
                  {photoUrl && (
                    <button
                      type="button"
                      className="photo-link"
                      title="View photo"
                      aria-label={`View photo for ${card.title || card.productName}`}
                      onClick={() =>
                        setSelectedPhoto({
                          url: photoUrl,
                          cardName: card.title || card.productName,
                        })
                      }
                    >
                      🖼️
                    </button>
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
                  {canEditListingPrice ? (
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
                <td className="date">
                  {card.lastCheckedAt ? formatDate(card.lastCheckedAt) : '—'}
                </td>
                <td className="date">{formatDate(card.updatedAt)}</td>
                <td className="actions">
                  <div
                    className="action-menu-container"
                    ref={openActionMenuId === card.id ? actionMenuRef : null}
                  >
                    <button
                      type="button"
                      className="action-menu-trigger"
                      aria-label={`Actions for ${card.title || card.productName}`}
                      aria-haspopup="menu"
                      aria-expanded={openActionMenuId === card.id}
                      onClick={() =>
                        setOpenActionMenuId((current) =>
                          current === card.id ? null : card.id,
                        )
                      }
                    >
                      …
                    </button>
                    {openActionMenuId === card.id && (
                      <div className="action-menu" role="menu">
                        {isListed ? (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                setRecordSaleCardId(card.id);
                              }}
                            >
                              Record sale
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                handleUnlist(card.id);
                              }}
                              disabled={unlistingId === card.id}
                            >
                              {unlistingId === card.id
                                ? 'Removing…'
                                : 'Remove from listing'}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenActionMenuId(null);
                              handleReprice(card.id);
                            }}
                            disabled={repricingId === card.id}
                          >
                            {repricingId === card.id ? 'Re-pricing…' : 'Re-price'}
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenActionMenuId(null);
                            setHistoryCardId(card.id);
                            setHistoryCardName(card.title || card.productName);
                          }}
                        >
                          View price history
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenActionMenuId(null);
                            handleDelete(card.id);
                          }}
                          disabled={deletingId === card.id}
                          className="danger-menu-item"
                        >
                          {deletingId === card.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selectedPhoto && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Card photo: ${selectedPhoto.cardName}`}
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="modal-content photo-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2>{selectedPhoto.cardName}</h2>
              <button
                className="modal-close"
                onClick={() => setSelectedPhoto(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="photo-modal-body">
              <img src={selectedPhoto.url} alt={selectedPhoto.cardName} />
            </div>
          </div>
        </div>
      )}
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
