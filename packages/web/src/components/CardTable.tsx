import { useEffect, useRef, useState } from 'react';
import type { Card, CreateBulkOrderRequest, CreateSaleRequest } from '../api/types';
import { StatusBadge } from './StatusBadge';
import { ReviewListModal } from './ReviewListModal';
import { PriceHistoryModal } from './PriceHistoryModal';
import { RecordSaleModal } from './RecordSaleModal';
import { BulkSellModal } from './BulkSellModal';

interface ReviewPricingGroup {
  key: string;
  displayName: string;
  productId: number | null;
  setNames: string[];
  cards: Card[];
}

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
  bulkMode?: 'all' | 'list' | 'sell';
  enableSellFlow?: boolean;
  defaultShippingCollectedCents?: number;
  needsAttentionCount?: number;
  onLoadNeedsAttentionReviewCards?: () => Promise<Card[]>;
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

function normalizeGroupValue(value: string | null | undefined) {
  return (value ?? '').trim().toLocaleLowerCase();
}

function buildReviewPricingGroups(cards: Card[]): ReviewPricingGroup[] {
  const groups = new Map<string, ReviewPricingGroup>();

  for (const card of cards) {
    const displayName = card.title || card.productName;
    const key = card.tcgProductId != null
      ? `product:${card.tcgProductId}`
      : `fallback:${normalizeGroupValue(card.setName)}|${normalizeGroupValue(displayName)}`;
    const existing = groups.get(key);

    if (existing) {
      existing.cards.push(card);
      if (card.setName && !existing.setNames.includes(card.setName)) {
        existing.setNames.push(card.setName);
      }
      continue;
    }

    groups.set(key, {
      key,
      displayName,
      productId: card.tcgProductId,
      setNames: card.setName ? [card.setName] : [],
      cards: [card],
    });
  }

  return Array.from(groups.values());
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('Copy command failed');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

const TCGPLAYER_INVENTORY_WINDOW_TARGET = 'tcgplayer-inventory';

function openTcgplayerInventoryUrl(url: string) {
  const openedWindow = window.open(url, TCGPLAYER_INVENTORY_WINDOW_TARGET);
  openedWindow?.focus();
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
  needsAttentionCount,
  onLoadNeedsAttentionReviewCards,
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
  const [manualListingCardId, setManualListingCardId] = useState<number | null>(null);
  const [manualListingValue, setManualListingValue] = useState<string>('');
  const [manualListingSaving, setManualListingSaving] = useState(false);
  const [manualListingError, setManualListingError] = useState<string | null>(null);
  const [showBulkSellModal, setShowBulkSellModal] = useState(false);
  const [preparingBulkSell, setPreparingBulkSell] = useState(false);
  const [needsAttentionReviewQueue, setNeedsAttentionReviewQueue] = useState<ReviewPricingGroup[] | null>(null);
  const [needsAttentionReviewIndex, setNeedsAttentionReviewIndex] = useState(0);
  const [needsAttentionReviewLoading, setNeedsAttentionReviewLoading] = useState(false);
  const [needsAttentionReviewError, setNeedsAttentionReviewError] = useState<string | null>(null);
  const [needsAttentionCopyStatus, setNeedsAttentionCopyStatus] = useState<string | null>(null);
  const [needsAttentionSelectedIds, setNeedsAttentionSelectedIds] = useState<Set<number>>(new Set());
  const [needsAttentionSavedIds, setNeedsAttentionSavedIds] = useState<Set<number>>(new Set());
  const [needsAttentionSaveError, setNeedsAttentionSaveError] = useState<string | null>(null);
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

  const handleOpenManualListing = (card: Card) => {
    setManualListingCardId(card.id);
    const listingPrice = parsePriceValue(card.listingPrice);
    setManualListingValue(listingPrice !== null ? listingPrice.toFixed(2) : '');
    setManualListingError(null);
  };

  const handleCloseManualListing = () => {
    if (manualListingSaving) return;
    setManualListingCardId(null);
    setManualListingError(null);
  };

  const handleSaveManualListing = async (id: number) => {
    setManualListingError(null);
    const listingPrice = Number.parseFloat(manualListingValue);
    if (!Number.isFinite(listingPrice) || listingPrice <= 0) {
      setManualListingError('Listing price must be a positive dollar amount');
      return;
    }

    setManualListingSaving(true);
    try {
      await onUpdateCard(id, { listingPrice } as unknown as Partial<Card>);
      setManualListingCardId(null);
    } catch (err) {
      setManualListingError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setManualListingSaving(false);
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
    if (selectedMatchedCards.length === 0) return;
    setShowReviewModal(true);
  };

  const handleConfirmMarkListed = async () => {
    setMarkingListed(true);
    try {
      await onMarkListed(selectedMatchedCards.map((card) => card.id));
      const markedIds = new Set(selectedMatchedCards.map((card) => card.id));
      setSelectedIds(
        (current) => new Set([...current].filter((id) => !markedIds.has(id))),
      );
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
    if (selectedSellableCards.length === 0) return;
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

  // Filter cards that can be selected.
  const matchedCards = sortedCards.filter((card) => card.status === 'matched');
  const sellableCards = sortedCards.filter(isSellEligible);
  const selectableCards =
    effectiveBulkMode === 'list'
      ? matchedCards
      : effectiveBulkMode === 'sell'
        ? sellableCards
        : sortedCards.filter(
            (card) => card.status === 'matched' || isSellEligible(card),
          );
  const selectedCards = sortedCards.filter((card) => selectedIds.has(card.id));
  const selectedMatchedCards = selectedCards.filter(
    (card) => card.status === 'matched',
  );
  const selectedSellableCards = selectedCards.filter(isSellEligible);
  const needsAttentionReviewCards = sortedCards.filter(
    (card) => card.status === 'needs_attention',
  );
  const reviewPricingCount = needsAttentionCount ?? needsAttentionReviewCards.length;

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

  const handleStartNeedsAttentionReview = async () => {
    if (reviewPricingCount === 0) return;
    setNeedsAttentionReviewLoading(true);
    setNeedsAttentionReviewError(null);
    setNeedsAttentionCopyStatus(null);
    try {
      const cardsToReview = onLoadNeedsAttentionReviewCards
        ? await onLoadNeedsAttentionReviewCards()
        : needsAttentionReviewCards;
      const queue = buildReviewPricingGroups(cardsToReview);
      setNeedsAttentionReviewQueue(queue);
      setNeedsAttentionReviewIndex(0);
      setNeedsAttentionSelectedIds(new Set(
        queue[0]?.cards
          .filter((card) => getRecommendedPrice(card) !== null)
          .map((card) => card.id) ?? [],
      ));
      setNeedsAttentionSaveError(null);
      setNeedsAttentionSavedIds(new Set());
      if (queue.length === 0) {
        setNeedsAttentionReviewError('No Needs Attention cards are available to review.');
      }
    } catch (err) {
      setNeedsAttentionReviewError(
        err instanceof Error ? err.message : 'Failed to load pricing review cards',
      );
    } finally {
      setNeedsAttentionReviewLoading(false);
    }
  };

  const handleCloseNeedsAttentionReview = () => {
    setNeedsAttentionReviewQueue(null);
    setNeedsAttentionReviewIndex(0);
    setNeedsAttentionCopyStatus(null);
    setNeedsAttentionSaveError(null);
    setNeedsAttentionSelectedIds(new Set());
    setNeedsAttentionSavedIds(new Set());
  };

  const getValidReviewIds = (group: ReviewPricingGroup | undefined) =>
    new Set(
      group?.cards
        .filter((card) => getRecommendedPrice(card) !== null)
        .map((card) => card.id) ?? [],
    );

  const setReviewGroupIndex = (nextIndex: number) => {
    setNeedsAttentionCopyStatus(null);
    setNeedsAttentionSaveError(null);
    setNeedsAttentionReviewIndex(nextIndex);
    setNeedsAttentionSelectedIds(getValidReviewIds(needsAttentionReviewQueue?.[nextIndex]));
  };

  const handleAdvanceNeedsAttentionReview = () => {
    setReviewGroupIndex(needsAttentionReviewIndex + 1);
  };

  const handleCopyRecommendedPrices = async (group: ReviewPricingGroup) => {
    const lines = group.cards
      .map((card) => {
        const recommended = getRecommendedPrice(card);
        if (recommended === null) return null;
        return `${card.condition}: $${recommended.toFixed(2)}`;
      })
      .filter((line): line is string => line !== null);

    if (lines.length === 0) return;

    try {
      await copyTextToClipboard(lines.join('\n'));
      setNeedsAttentionCopyStatus('Copied Rec’d prices');
    } catch {
      setNeedsAttentionCopyStatus('Copy failed. Select and copy the Rec’d prices manually.');
    }
  };

  const handleToggleReviewRow = (id: number, checked: boolean) => {
    setNeedsAttentionSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSaveRecommendedListings = async (group: ReviewPricingGroup) => {
    const selectedCards = group.cards.filter((card) => needsAttentionSelectedIds.has(card.id));
    if (selectedCards.length === 0) return;

    setNeedsAttentionSaveError(null);
    try {
      for (const card of selectedCards) {
        const recommended = getRecommendedPrice(card);
        if (recommended === null) continue;
        await onUpdateCard(card.id, { listingPrice: recommended } as unknown as Partial<Card>);
        setNeedsAttentionSavedIds((current) => new Set(current).add(card.id));
      }
      handleAdvanceNeedsAttentionReview();
    } catch (err) {
      setNeedsAttentionSaveError(
        err instanceof Error ? err.message : 'Failed to save selected listings',
      );
    }
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
      {reviewPricingCount > 0 && (
        <div className="selection-actions needs-attention-review-actions">
          <button
            type="button"
            className="button-primary"
            onClick={handleStartNeedsAttentionReview}
            disabled={needsAttentionReviewLoading}
          >
            {needsAttentionReviewLoading
              ? 'Loading pricing review…'
              : `Review Pricing (${reviewPricingCount} Needs Attention)`}
          </button>
          {needsAttentionReviewError && (
            <span className="form-help" role="alert">
              {needsAttentionReviewError}
            </span>
          )}
        </div>
      )}
      {selectedIds.size > 0 && (
        <div className="selection-actions">
          {(effectiveBulkMode === 'sell' ||
            (effectiveBulkMode === 'all' && selectedSellableCards.length > 0)) && (
            <button
              onClick={handleOpenBulkSell}
              disabled={preparingBulkSell}
              className="button-primary"
            >
              {preparingBulkSell
                ? '⏳ Loading gifts…'
                : `💰 Attach ${selectedSellableCards.length} to Order`}
            </button>
          )}
          {(effectiveBulkMode === 'list' ||
            (effectiveBulkMode === 'all' && selectedMatchedCards.length > 0)) && (
            <button
              onClick={handleOpenReview}
              disabled={markingListed}
              className="button-primary mark-listed"
            >
              {markingListed
                ? '⏳ Marking...'
                : `📋 Mark ${selectedMatchedCards.length} as Listed`}
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
                title={
                  effectiveBulkMode === 'all'
                    ? 'Select all eligible cards'
                    : effectiveBulkMode === 'sell'
                      ? 'Select all order-eligible cards'
                      : 'Select all matched cards'
                }
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
            const isSelectable =
              effectiveBulkMode === 'list'
                ? isMatched
                : effectiveBulkMode === 'sell'
                  ? isSellEligible(card)
                  : isMatched || isSellEligible(card);
            const selectionTitle = isMatched
              ? 'Select for bulk listing'
              : isSellEligible(card)
                ? 'Select for attach to order'
                : effectiveBulkMode === 'all'
                  ? 'Only Ready to List, listed, or listed-origin attention cards can be selected'
                  : effectiveBulkMode === 'sell'
                    ? 'Only listed or listed-origin attention cards can be selected'
                    : 'Only Ready to List cards can be selected';
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
                    disabled={!isSelectable}
                    title={selectionTitle}
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
                        {card.status === 'needs_attention' && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenActionMenuId(null);
                              handleOpenManualListing(card);
                            }}
                          >
                            Set manual listing price
                          </button>
                        )}
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
                              openTcgplayerInventoryUrl(tcgplayerInventoryUrl);
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
        const group = needsAttentionReviewQueue[needsAttentionReviewIndex];
        const isComplete = needsAttentionReviewIndex >= needsAttentionReviewQueue.length;
        const representativeCard = group?.cards[0];
        const tcgplayerInventoryUrl = representativeCard
          ? buildTcgplayerInventoryUrl(representativeCard)
          : null;
        const hasSelectedRows = group?.cards.some((card) =>
          needsAttentionSelectedIds.has(card.id) && getRecommendedPrice(card) !== null,
        ) ?? false;
        const groupSaveableCards = group?.cards.filter(
          (card) => getRecommendedPrice(card) !== null,
        ) ?? [];
        const isGroupUpdated =
          groupSaveableCards.length > 0 &&
          groupSaveableCards.every((card) => needsAttentionSavedIds.has(card.id));
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
                    <p className="sale-card-name">All Needs Attention cards reviewed</p>
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
              ) : group ? (
                <>
                  <div className="sale-card-info">
                    <p className="sale-card-name">
                      {group.displayName}, {group.cards.length} {group.cards.length === 1 ? 'variant' : 'variants'}
                      {isGroupUpdated && (
                        <span className="review-updated-badge">✓ Updated</span>
                      )}
                    </p>
                    <p className="sale-card-details">
                      {group.setNames.length > 0 ? group.setNames.join(', ') : 'Set unknown'}
                      {group.productId != null && ` · Product ID: ${group.productId}`}
                    </p>
                  </div>

                  {!tcgplayerInventoryUrl && (
                    <p className="form-help">
                      No TCGPlayer Product ID is available, so the seller inventory link is disabled.
                    </p>
                  )}
                  {needsAttentionCopyStatus && (
                    <p className="form-help" role="status">
                      {needsAttentionCopyStatus}
                    </p>
                  )}
                  {needsAttentionSaveError && (
                    <p className="form-help" role="alert">
                      {needsAttentionSaveError}
                    </p>
                  )}

                  <table className="needs-attention-review-table">
                    <thead>
                      <tr>
                        <th>Save</th>
                        <th>Condition</th>
                        <th>Qty</th>
                        <th>Market</th>
                        <th>Listing</th>
                        <th>Rec’d</th>
                        <th>SKU</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.cards.map((card) => {
                        const recommended = getRecommendedPrice(card);
                        const disabled = recommended === null;
                        const isSaved = needsAttentionSavedIds.has(card.id);
                        const rowClassName = [
                          disabled ? 'review-row-disabled' : '',
                          isSaved ? 'review-row-updated' : '',
                        ].filter(Boolean).join(' ');
                        return (
                          <tr key={card.id} className={rowClassName}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Save ${card.condition}`}
                                checked={needsAttentionSelectedIds.has(card.id)}
                                onChange={(event) =>
                                  handleToggleReviewRow(card.id, event.target.checked)
                                }
                                disabled={disabled}
                              />
                            </td>
                            <td>
                              {card.condition}
                              {isSaved && (
                                <span className="review-updated-badge">✓ Updated</span>
                              )}
                            </td>
                            <td>{card.quantity}</td>
                            <td>{formatPrice(card.marketPrice)}</td>
                            <td>{formatPrice(card.listingPrice)}</td>
                            <td>
                              {recommended === null
                                ? 'No valid Rec’d price'
                                : `$${recommended.toFixed(2)}`}
                            </td>
                            <td>{card.tcgplayerId ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => handleCopyRecommendedPrices(group)}
                      disabled={!group.cards.some((card) => getRecommendedPrice(card) !== null)}
                    >
                      Copy all Rec’d
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => {
                        if (tcgplayerInventoryUrl) {
                          openTcgplayerInventoryUrl(tcgplayerInventoryUrl);
                        }
                      }}
                      disabled={!tcgplayerInventoryUrl}
                    >
                      Open TCGPlayer
                    </button>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => handleSaveRecommendedListings(group)}
                      disabled={!hasSelectedRows}
                    >
                      I updated TCGPlayer — save selected Listings to Rec’d
                    </button>
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setReviewGroupIndex(Math.max(0, needsAttentionReviewIndex - 1))}
                      disabled={needsAttentionReviewIndex === 0}
                    >
                      Previous
                    </button>
                    <span className="form-help">
                      {needsAttentionReviewIndex + 1} of {needsAttentionReviewQueue.length} groups
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
                        setReviewGroupIndex(
                          Math.min(needsAttentionReviewQueue.length - 1, needsAttentionReviewIndex + 1),
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
      {manualListingCardId !== null && (() => {
        const card = cards.find((c) => c.id === manualListingCardId);
        if (!card) return null;
        return (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={`Set manual listing price for ${card.title || card.productName}`}
            onClick={handleCloseManualListing}
          >
            <form
              className="modal-content edit-details-modal"
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                handleSaveManualListing(card.id);
              }}
            >
              <div className="modal-header">
                <h2>Set manual listing price</h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={handleCloseManualListing}
                  aria-label="Close"
                  disabled={manualListingSaving}
                >
                  ×
                </button>
              </div>
              <div className="edit-details-body">
                <p className="edit-details-card-name">
                  {card.title || card.productName}
                </p>
                <p className="form-help">
                  Use this to mirror a TCGPlayer listing even when source Market
                  and Rec’d prices are missing. This saves only your local Listing
                  price and does not create Market or Rec’d pricing.
                </p>
                <label className="edit-details-field">
                  <span>Listing price ($)</span>
                  <input
                    type="number"
                    value={manualListingValue}
                    onChange={(event) => setManualListingValue(event.target.value)}
                    min="0.01"
                    step="0.01"
                    disabled={manualListingSaving}
                    autoFocus
                  />
                </label>
                {manualListingError && (
                  <span className="interval-error" role="alert">
                    {manualListingError}
                  </span>
                )}
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleCloseManualListing}
                  disabled={manualListingSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={manualListingSaving}
                >
                  {manualListingSaving ? 'Saving…' : 'Save listing price'}
                </button>
              </div>
            </form>
          </div>
        );
      })()}
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
          cards={selectedMatchedCards}
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
          cards={selectedSellableCards}
          giftCards={giftCards}
          onSubmit={async (order) => {
            await onBulkSell(order);
            const soldIds = new Set(
              selectedSellableCards.map((card) => card.id),
            );
            setSelectedIds(
              (current) => new Set([...current].filter((id) => !soldIds.has(id))),
            );
            setShowBulkSellModal(false);
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
