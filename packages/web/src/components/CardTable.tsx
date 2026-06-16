import { useEffect, useRef, useState } from 'react';
import type { Card, CreateBulkOrderRequest, CreateSaleRequest } from '../api/types';
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
  onBulkSell?: (order: CreateBulkOrderRequest) => Promise<void>;
  giftCards?: Card[];
  onPrepareBulkSell?: () => Promise<void>;
  bulkMode?: 'list' | 'sell';
  enableSellFlow?: boolean;
  defaultShippingCollectedCents?: number;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField, direction: SortDirection) => void;
}

export type SortField = keyof Card | null;
export type SortDirection = 'asc' | 'desc';

const CONDITION_OPTIONS = [
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
  'Near Mint Foil',
  'Lightly Played Foil',
  'Moderately Played Foil',
  'Heavily Played Foil',
  'Damaged Foil',
];

function buildTcgplayerInventoryUrl(card: Card): string | null {
  if (card.tcgProductId == null) return null;

  const displayName = card.title || card.productName;
  const searchValue = encodeURIComponent(displayName);
  return `https://store.tcgplayer.com/admin/product/manage/${card.tcgProductId}?OnlyMyInventory=false&SearchValue=${searchValue}&CategoryId=0&SetNameId=0&Rarity=0&DidSearch=true`;
}

function openExternalUrl(url: string, target = '_blank') {
  window.open(url, target, 'noopener,noreferrer');
}

function getAttentionReasonLabel(reason: Card['attentionReason']) {
  switch (reason) {
    case 'listed_price_drift':
      return 'Listed price drift';
    case 'listed_missing_price':
      return 'Listed card missing market price';
    case 'listed_below_threshold':
      return 'Listed card below gift threshold';
    default:
      return 'Needs attention';
  }
}

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
  giftCards = [],
  onPrepareBulkSell,
  bulkMode,
  enableSellFlow,
  defaultShippingCollectedCents = 149,
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
  const [editDetailsCardId, setEditDetailsCardId] = useState<number | null>(null);
  const [editDetailsQuantity, setEditDetailsQuantity] = useState<string>('');
  const [editDetailsCondition, setEditDetailsCondition] = useState<string>('');
  const [editDetailsSaving, setEditDetailsSaving] = useState(false);
  const [editDetailsError, setEditDetailsError] = useState<string | null>(null);
  const [showBulkSellModal, setShowBulkSellModal] = useState(false);
  const [preparingBulkSell, setPreparingBulkSell] = useState(false);
  const [needsAttentionReviewQueue, setNeedsAttentionReviewQueue] = useState<Card[] | null>(null);
  const [needsAttentionReviewIndex, setNeedsAttentionReviewIndex] = useState(0);
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

  const handleOpenEditDetails = (card: Card) => {
    setEditDetailsCardId(card.id);
    setEditDetailsQuantity(String(card.quantity));
    setEditDetailsCondition(card.condition);
    setEditDetailsError(null);
  };

  const handleCloseEditDetails = () => {
    if (editDetailsSaving) return;
    setEditDetailsCardId(null);
    setEditDetailsError(null);
  };

  const handleSaveEditDetails = async (id: number) => {
    setEditDetailsError(null);
    const quantity = Number(editDetailsQuantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setEditDetailsError('Quantity must be a non-negative whole number');
      return;
    }

    const condition = editDetailsCondition.trim();
    if (!condition) {
      setEditDetailsError('Condition is required');
      return;
    }

    setEditDetailsSaving(true);
    try {
      await onUpdateCard(id, { quantity, condition } as Partial<Card>);
      setEditDetailsCardId(null);
    } catch (err) {
      setEditDetailsError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setEditDetailsSaving(false);
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

  const handleOpenBulkSell = async () => {
    setPreparingBulkSell(true);
    try {
      await onPrepareBulkSell?.();
      setShowBulkSellModal(true);
    } finally {
      setPreparingBulkSell(false);
    }
  };

  const effectiveBulkMode = bulkMode ?? (enableSellFlow ? 'sell' : 'list');
  const isListedOriginAttention = (card: Card) =>
    card.attentionReason === 'listed_price_drift' ||
    card.attentionReason === 'listed_missing_price' ||
    card.attentionReason === 'listed_below_threshold';
  const isSellEligible = (card: Card) =>
    card.status === 'listed' ||
    (card.status === 'needs_attention' && isListedOriginAttention(card));

  // Filter cards that can be selected
  const matchedCards = sortedCards.filter((card) => card.status === 'matched');
  const sellableCards = sortedCards.filter(isSellEligible);
  const selectableCards = effectiveBulkMode === 'sell' ? sellableCards : matchedCards;
  const needsAttentionReviewCards = sortedCards.filter(
    (card) => card.status === 'needs_attention',
  );

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

  const getRecommendedPrice = (card: Card) => {
    const parsedMarketPrice = parsePriceValue(card.marketPrice);
    if (parsedMarketPrice === null) return null;
    const marketRecommended = Math.round(parsedMarketPrice * 98) / 100;
    const floorPrice = card.floorPriceCents == null ? null : card.floorPriceCents / 100;
    return floorPrice == null
      ? marketRecommended
      : Math.max(marketRecommended, floorPrice);
  };

  const formatRecommendedPrice = (card: Card) => {
    const recommended = getRecommendedPrice(card);
    if (recommended === null) return '\u2014';
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

  const handleStartNeedsAttentionReview = () => {
    if (needsAttentionReviewCards.length === 0) return;
    setNeedsAttentionReviewQueue(needsAttentionReviewCards);
    setNeedsAttentionReviewIndex(0);
  };

  const handleCloseNeedsAttentionReview = () => {
    setNeedsAttentionReviewQueue(null);
    setNeedsAttentionReviewIndex(0);
  };

  const handleAdvanceNeedsAttentionReview = () => {
    setNeedsAttentionReviewIndex((current) => current + 1);
  };

  const handleCopyRecommendedPrice = async (card: Card) => {
    const recommended = getRecommendedPrice(card);
    if (recommended === null) return;
    await navigator.clipboard.writeText(recommended.toFixed(2));
  };

  const handleSaveRecommendedListing = async (card: Card) => {
    const recommended = getRecommendedPrice(card);
    if (recommended === null) return;
    await onUpdateCard(card.id, { listingPrice: recommended } as unknown as Partial<Card>);
    handleAdvanceNeedsAttentionReview();
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
      {needsAttentionReviewCards.length > 0 && (
        <div className="selection-actions needs-attention-review-actions">
          <button
            type="button"
            className="button-primary"
            onClick={handleStartNeedsAttentionReview}
          >
            Review Pricing ({needsAttentionReviewCards.length} on this page)
          </button>
        </div>
      )}
      {selectedIds.size > 0 && (
        <div className="selection-actions">
          {effectiveBulkMode === 'sell' ? (
            <button
              onClick={handleOpenBulkSell}
              disabled={preparingBulkSell}
              className="button-primary"
            >
              {preparingBulkSell
                ? '⏳ Loading gifts…'
                : `💰 Attach ${selectedIds.size} to Order`}
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
                title={effectiveBulkMode === 'sell' ? 'Select all order-eligible cards' : 'Select all matched cards'}
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
            const tcgplayerInventoryUrl =
              card.status === 'needs_attention'
                ? buildTcgplayerInventoryUrl(card)
                : null;

            return (
              <tr key={card.id} className={isListed ? 'listed-row' : ''}>
                <td className="checkbox-column">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) =>
                      handleSelectCard(card.id, e.target.checked)
                    }
                    disabled={effectiveBulkMode === 'sell' ? !isSellEligible(card) : !isMatched}
                    title={
                      effectiveBulkMode === 'sell'
                        ? isSellEligible(card)
                          ? 'Select for attach to order'
                          : 'Only listed or listed-origin attention cards can be selected'
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
                  {formatRecommendedPrice(card)}
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
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenActionMenuId(null);
                            handleOpenEditDetails(card);
                          }}
                        >
                          Edit details
                        </button>
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
                        {tcgplayerInventoryUrl && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenActionMenuId(null);
                              openExternalUrl(tcgplayerInventoryUrl);
                            }}
                          >
                            Open TCGPlayer inventory
                          </button>
                        )}
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
      {needsAttentionReviewQueue && (() => {
        const card = needsAttentionReviewQueue[needsAttentionReviewIndex];
        const isComplete = needsAttentionReviewIndex >= needsAttentionReviewQueue.length;
        const displayName = card ? card.title || card.productName : '';
        const recommended = card ? getRecommendedPrice(card) : null;
        const tcgplayerInventoryUrl = card ? buildTcgplayerInventoryUrl(card) : null;
        return (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Pricing review"
            onClick={handleCloseNeedsAttentionReview}
          >
            <div
              className="modal-content needs-attention-review-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2>Review Pricing</h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={handleCloseNeedsAttentionReview}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {isComplete ? (
                <>
                  <div className="sale-card-info">
                    <p className="sale-card-name">All cards on this page reviewed</p>
                    <p className="sale-card-details">
                      You have reached the end of this pricing review queue.
                    </p>
                  </div>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="button-primary"
                      onClick={handleCloseNeedsAttentionReview}
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : card ? (
                <>
                  <div className="sale-card-info">
                    <p className="sale-card-name">{displayName}</p>
                    <p className="sale-card-details">
                      {card.setName && <span>{card.setName}</span>}
                      {card.setName && ' · '}
                      <span>{card.condition}</span>
                    </p>
                    <p className="sale-card-details">
                      Reason: {getAttentionReasonLabel(card.attentionReason)}
                    </p>
                  </div>

                  <dl className="needs-attention-review-prices">
                    <div>
                      <dt>Market</dt>
                      <dd>{formatPrice(card.marketPrice)}</dd>
                    </div>
                    <div>
                      <dt>Listing</dt>
                      <dd>{formatPrice(card.listingPrice)}</dd>
                    </div>
                    <div>
                      <dt>Rec’d</dt>
                      <dd>{recommended === null ? '—' : `$${recommended.toFixed(2)}`}</dd>
                    </div>
                  </dl>

                  {recommended === null && (
                    <p className="form-help">
                      No valid Rec’d price is available yet, so copy and save are disabled.
                    </p>
                  )}
                  {!tcgplayerInventoryUrl && (
                    <p className="form-help">
                      No TCGPlayer Product ID is available, so the seller inventory link is disabled.
                    </p>
                  )}

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => handleCopyRecommendedPrice(card)}
                      disabled={recommended === null}
                    >
                      Copy Rec’d
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => {
                        if (tcgplayerInventoryUrl) {
                          openExternalUrl(tcgplayerInventoryUrl, 'tcgplayer-inventory');
                        }
                      }}
                      disabled={!tcgplayerInventoryUrl}
                    >
                      Open TCGPlayer
                    </button>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => handleSaveRecommendedListing(card)}
                      disabled={recommended === null}
                    >
                      I updated TCGPlayer — save Listing to Rec’d
                    </button>
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() =>
                        setNeedsAttentionReviewIndex((current) => Math.max(0, current - 1))
                      }
                      disabled={needsAttentionReviewIndex === 0}
                    >
                      Previous
                    </button>
                    <span className="form-help">
                      {needsAttentionReviewIndex + 1} of {needsAttentionReviewQueue.length} on this page
                    </span>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={handleAdvanceNeedsAttentionReview}
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() =>
                        setNeedsAttentionReviewIndex((current) =>
                          Math.min(needsAttentionReviewQueue.length - 1, current + 1),
                        )
                      }
                      disabled={needsAttentionReviewIndex >= needsAttentionReviewQueue.length - 1}
                    >
                      Next
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        );
      })()}
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
      {editDetailsCardId !== null && (() => {
        const card = cards.find((c) => c.id === editDetailsCardId);
        if (!card) return null;
        const conditionOptions = CONDITION_OPTIONS.includes(card.condition)
          ? CONDITION_OPTIONS
          : [card.condition, ...CONDITION_OPTIONS];
        return (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit details for ${card.title || card.productName}`}
            onClick={handleCloseEditDetails}
          >
            <form
              className="modal-content edit-details-modal"
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                handleSaveEditDetails(card.id);
              }}
            >
              <div className="modal-header">
                <h2>Edit details</h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={handleCloseEditDetails}
                  aria-label="Close"
                  disabled={editDetailsSaving}
                >
                  ×
                </button>
              </div>
              <div className="edit-details-body">
                <p className="edit-details-card-name">
                  {card.title || card.productName}
                </p>
                <label className="edit-details-field">
                  <span>Quantity</span>
                  <input
                    type="number"
                    value={editDetailsQuantity}
                    onChange={(event) => {
                      setEditDetailsQuantity(event.target.value);
                      setEditDetailsError(null);
                    }}
                    step="1"
                    disabled={editDetailsSaving}
                  />
                </label>
                <label className="edit-details-field">
                  <span>Condition</span>
                  <select
                    value={editDetailsCondition}
                    onChange={(event) => {
                      setEditDetailsCondition(event.target.value);
                      setEditDetailsError(null);
                    }}
                    disabled={editDetailsSaving}
                  >
                    {conditionOptions.map((condition) => (
                      <option key={condition} value={condition}>
                        {condition}
                      </option>
                    ))}
                  </select>
                </label>
                {editDetailsError && (
                  <div className="edit-details-error" role="alert">
                    {editDetailsError}
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleCloseEditDetails}
                  disabled={editDetailsSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={editDetailsSaving}
                >
                  {editDetailsSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        );
      })()}
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
            defaultShippingCollectedCents={defaultShippingCollectedCents}
          />
        );
      })()}
      {showBulkSellModal && onBulkSell && (
        <BulkSellModal
          cards={cards.filter((c) => selectedIds.has(c.id))}
          giftCards={giftCards}
          onSubmit={async (order) => {
            await onBulkSell(order);
            setShowBulkSellModal(false);
            setSelectedIds(new Set());
          }}
          onClose={() => {
            setShowBulkSellModal(false);
          }}
          defaultShippingCollectedCents={defaultShippingCollectedCents}
        />
      )}
    </div>
  );
}
