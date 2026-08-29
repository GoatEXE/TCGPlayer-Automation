import { ChevronDown, MoreHorizontal, MoveRight, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useContainerResponsiveMode } from '../hooks/useContainerResponsiveMode';
import { BlueprintButton, BlueprintInput, BlueprintPanel } from '../ui';
import { CollectionImportUpload } from './CollectionImportUpload';
import {
  CollectionRowAdjustModal,
  CollectionRowDeleteModal,
  type CollectionRowSourceItem,
} from './CollectionRowActionModals';
import { Pagination } from './Pagination';
import '../styles/collection.css';
import type {
  CardKind,
  CollectionSellabilityRow,
  CollectionSummary,
  CollectionTransferMessage,
  CollectionTransferPreviewResponse,
  CollectionTransferRequest,
  GetCollectionSellabilityResponse,
} from '../api/types';

const CARD_KIND_OPTIONS: CardKind[] = [
  'normal',
  'legend',
  'battlefield',
  'rune',
  'token',
  'unknown',
];
const COLLECTION_ITEMS_PER_PAGE = 50;

function recommendationRank(row: CollectionSellabilityRow) {
  if (row.sellNormalQty > 0 || row.sellFoilQty > 0) return 0;
  if (row.opportunityType === 'foil_swap') return 1;
  if (row.needsClassification) return 2;
  if (row.excluded) return 4;
  return 3;
}

function formatKind(kind: string) {
  return kind.replace(/_/g, ' ');
}

function recommendedSellQty(row: CollectionSellabilityRow) {
  return row.sellNormalQty + row.sellFoilQty;
}

function rowToneClass(row: CollectionSellabilityRow) {
  const sellQty = recommendedSellQty(row);
  if (row.needsClassification) return 'collection-row-needs-classification';
  if (sellQty > 0 || row.opportunityType === 'foil_swap') {
    return 'collection-row-sellable';
  }
  return row.excluded ? 'collection-row-excluded' : undefined;
}

const TRANSFER_WARNING_COPY: Record<string, string> = {
  listed_inventory_row_exists_not_merged:
    'Some selected cards already have listed inventory rows. To avoid changing live listing quantities, this move will create separate Ready-to-List staging rows instead of merging into listed rows.',
};

function transferMessageCode(message: CollectionTransferMessage) {
  if (typeof message === 'string') return message;
  return message.warning ?? message.blocker ?? message.message ?? '';
}

function formatTransferMessage(message: CollectionTransferMessage) {
  const code = transferMessageCode(message);
  const text = TRANSFER_WARNING_COPY[code] ?? code;
  if (!text) return '';
  if (TRANSFER_WARNING_COPY[code]) return text;
  return typeof message === 'object' && message.collectionItemId
    ? `Item ${message.collectionItemId}: ${text}`
    : text;
}

function formatTransferMessages(messages: CollectionTransferMessage[] | undefined) {
  const formatted = (messages ?? []).map(formatTransferMessage).filter(Boolean);
  return [...new Set(formatted)].join('; ');
}

function recommendationLabel(row: CollectionSellabilityRow) {
  if (row.excluded) return row.excludedReason ?? 'Excluded';
  if (row.needsClassification) return 'Needs Classification';
  if (row.opportunityType === 'foil_swap') return 'Foil swap opportunity';
  if (recommendedSellQty(row) > 0) return 'Set aside to sell';
  return 'Keep';
}

type TransferSelection = Record<number, number>;

function finishKind(value: string | null | undefined) {
  return (value || '').toLowerCase().includes('foil') ? 'foil' : 'normal';
}

function itemId(item: NonNullable<CollectionSellabilityRow['sourceItems']>[number]) {
  return item.collectionItemId ?? item.id ?? null;
}

function itemFinishKind(item: NonNullable<CollectionSellabilityRow['sourceItems']>[number]) {
  return item.finishKind === 'foil' || finishKind(item.finish) === 'foil'
    ? 'foil'
    : 'normal';
}

function itemForFinish(row: CollectionSellabilityRow, finish: 'normal' | 'foil') {
  const sourceItems = row.sourceItems ?? row.items ?? [];
  return sourceItems.find((item) => itemFinishKind(item) === finish) ?? null;
}

function recommendedTransferItems(row: CollectionSellabilityRow) {
  if (row.transferItems && row.transferItems.length > 0) {
    return row.transferItems
      .map((item) => {
        const id = itemId(item);
        const quantity = item.recommendedSellQuantity ?? 0;
        const transferQuantity = Math.min(quantity, item.quantity);
        return id && transferQuantity > 0
          ? { collectionItemId: id, quantity: transferQuantity }
          : null;
      })
      .filter(
        (entry): entry is { collectionItemId: number; quantity: number } =>
          entry !== null,
      );
  }

  return [
    { item: itemForFinish(row, 'normal'), quantity: row.sellNormalQty },
    { item: itemForFinish(row, 'foil'), quantity: row.sellFoilQty },
  ]
    .map(({ item, quantity }) => {
      const id = item ? itemId(item) : null;
      const maxQuantity = item?.quantity ?? quantity;
      const transferQuantity = Math.min(quantity, maxQuantity);
      return id && transferQuantity > 0
        ? { collectionItemId: id, quantity: transferQuantity }
        : null;
    })
    .filter(
      (entry): entry is { collectionItemId: number; quantity: number } =>
        entry !== null,
    );
}

function canTransferRow(row: CollectionSellabilityRow) {
  if (row.excluded || (row.blockers?.length ?? 0) > 0) return false;
  return recommendedTransferItems(row).length > 0;
}

function collectionRowSourceItems(row: CollectionSellabilityRow): CollectionRowSourceItem[] {
  const sourceItems = row.sourceItems ?? row.items ?? [];
  const items = sourceItems.flatMap((item) => {
    const collectionItemId = item.collectionItemId ?? item.id;
    return Number.isInteger(collectionItemId) && (collectionItemId as number) > 0
      ? [{ ...item, collectionItemId: collectionItemId as number }]
      : [];
  });

  return items.sort((left, right) => {
    const leftFinish = left.finishKind === 'foil' || /foil/i.test(left.finish ?? '') ? 1 : 0;
    const rightFinish = right.finishKind === 'foil' || /foil/i.test(right.finish ?? '') ? 1 : 0;
    if (leftFinish !== rightFinish) return leftFinish - rightFinish;
    return [left.condition ?? '', left.language ?? '', left.collectionItemId].join('|').localeCompare(
      [right.condition ?? '', right.language ?? '', right.collectionItemId].join('|'),
    );
  });
}

function buildTransferRequest(selection: TransferSelection): CollectionTransferRequest {
  return {
    items: Object.entries(selection)
      .map(([collectionItemId, quantity]) => ({
        collectionItemId: Number(collectionItemId),
        quantity,
      }))
      .filter((item) => item.quantity > 0),
  };
}

function rowSetAndNumber(row: CollectionSellabilityRow) {
  return `${row.setCode ?? row.setName ?? '-'} · ${
    row.collectorNumber ?? row.normalizedNumber ?? '-'
  }`;
}

interface CollectionViewProps {
  onCatalogMetadataUpdated?: () => void;
  onInventoryChanged?: () => void | Promise<void>;
}

export function CollectionView({
  onCatalogMetadataUpdated,
  onInventoryChanged,
}: CollectionViewProps) {
  const collectionViewRef = useRef<HTMLElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const layout = useContainerResponsiveMode(collectionViewRef);
  const [ownedCollection, setOwnedCollection] = useState<CollectionSummary | null>(
    null,
  );
  const [sellability, setSellability] =
    useState<GetCollectionSellabilityResponse | null>(null);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [loadingSellability, setLoadingSellability] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingCatalogId, setUpdatingCatalogId] = useState<number | null>(null);
  const [transferSelection, setTransferSelection] = useState<TransferSelection>({});
  const [transferPreview, setTransferPreview] =
    useState<CollectionTransferPreviewResponse | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [collectionPage, setCollectionPage] = useState(1);
  const [collectionSearchQuery, setCollectionSearchQuery] = useState('');
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [adjustingRow, setAdjustingRow] = useState<CollectionSellabilityRow | null>(
    null,
  );
  const [deletingRow, setDeletingRow] = useState<CollectionSellabilityRow | null>(
    null,
  );
  const [rowActionSuccess, setRowActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadCollections() {
      setLoadingCollections(true);
      setError(null);
      try {
        const response = await api.getCollections();
        if (ignore) return;
        setOwnedCollection(
          response.collections.find((collection) => collection.purpose === 'owned') ??
            null,
        );
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load collections');
        }
      } finally {
        if (!ignore) setLoadingCollections(false);
      }
    }

    loadCollections();
    return () => {
      ignore = true;
    };
  }, []);

  const loadSellability = async (collectionId: number) => {
    setCollectionPage(1);
    setOpenActionMenuId(null);
    setExpandedRowId(null);
    setLoadingSellability(true);
    setError(null);
    try {
      const response = await api.getCollectionSellability(collectionId);
      setSellability(response);
      setTransferSelection({});
      setTransferPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sellability');
      setSellability(null);
    } finally {
      setLoadingSellability(false);
    }
  };

  const ownedCollectionId = ownedCollection?.id ?? null;

  useEffect(() => {
    if (ownedCollectionId === null) return;
    void loadSellability(ownedCollectionId);
  }, [ownedCollectionId]);

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
      if (event.key === 'Escape') setOpenActionMenuId(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openActionMenuId]);

  const filteredRows = useMemo(() => {
    const query = collectionSearchQuery.trim().toLowerCase();
    if (!query) return sellability?.rows ?? [];

    return (sellability?.rows ?? []).filter((row) =>
      [
        row.productName,
        row.title,
        row.setName,
        row.setCode,
        row.collectorNumber,
        row.normalizedNumber,
      ].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [collectionSearchQuery, sellability]);

  // Sort the entire filtered result set before slicing it into pages.
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const rankDiff = recommendationRank(a) - recommendationRank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.productName.localeCompare(b.productName);
    });
  }, [filteredRows]);
  const collectionTotalPages = Math.max(
    1,
    Math.ceil(sortedRows.length / COLLECTION_ITEMS_PER_PAGE),
  );
  const activeCollectionPage =
    collectionPage > collectionTotalPages ? 1 : collectionPage;
  const paginatedRows = useMemo(() => {
    const start = (activeCollectionPage - 1) * COLLECTION_ITEMS_PER_PAGE;
    return sortedRows.slice(start, start + COLLECTION_ITEMS_PER_PAGE);
  }, [activeCollectionPage, sortedRows]);

  useEffect(() => {
    setCollectionPage((currentPage) =>
      currentPage > collectionTotalPages ? 1 : currentPage,
    );
  }, [collectionTotalPages]);

  const transferRequest = buildTransferRequest(transferSelection);
  const transferSelectedQuantity = transferRequest.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const handleCollectionPageChange = (page: number) => {
    setCollectionPage(Math.max(1, Math.min(page, collectionTotalPages)));
    setOpenActionMenuId(null);
    setExpandedRowId(null);
    setTransferSelection({});
    setTransferPreview(null);
    setTransferSuccess(null);
  };

  const handleCollectionSearchChange = (value: string) => {
    setCollectionSearchQuery(value);
    setCollectionPage(1);
    setOpenActionMenuId(null);
    setExpandedRowId(null);
    setTransferSelection({});
    setTransferPreview(null);
    setTransferSuccess(null);
  };

  const handleToggleTransferRow = (row: CollectionSellabilityRow, checked: boolean) => {
    setTransferPreview(null);
    setTransferSuccess(null);
    setTransferSelection((current) => {
      const next = { ...current };
      for (const item of recommendedTransferItems(row)) {
        if (checked) {
          next[item.collectionItemId] = item.quantity;
        } else {
          delete next[item.collectionItemId];
        }
      }
      return next;
    });
  };

  const handleTransferItemQuantity = (
    collectionItemId: number,
    quantity: number,
    maximum: number,
  ) => {
    setTransferPreview(null);
    setTransferSuccess(null);
    setTransferSelection((current) => ({
      ...current,
      [collectionItemId]: Math.min(
        maximum,
        Math.max(0, Math.floor(quantity) || 0),
      ),
    }));
  };

  const clearRowTransferState = (row: CollectionSellabilityRow) => {
    const sourceItemIds = new Set(
      collectionRowSourceItems(row).map((item) => item.collectionItemId),
    );
    setTransferSelection((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([collectionItemId]) => !sourceItemIds.has(Number(collectionItemId)),
        ),
      ),
    );
    setTransferPreview(null);
    setTransferSuccess(null);
  };

  const handleAdjustCollectionRow = async (
    row: CollectionSellabilityRow,
    data: { items: Array<{ collectionItemId: number; quantity: number }> },
  ) => {
    if (ownedCollectionId === null) {
      throw new Error('Owned Collection is unavailable.');
    }

    setError(null);
    await api.adjustCollectionRow(ownedCollectionId, row.catalogCardId, data);
    clearRowTransferState(row);
    setRowActionSuccess(`Updated counts for ${row.productName}.`);
    await loadSellability(ownedCollectionId);
    setAdjustingRow(null);
  };

  const handleDeleteCollectionRow = async (row: CollectionSellabilityRow) => {
    if (ownedCollectionId === null) {
      throw new Error('Owned Collection is unavailable.');
    }

    const collectionItemIds = collectionRowSourceItems(row).map(
      (item) => item.collectionItemId,
    );
    if (collectionItemIds.length === 0) {
      throw new Error('Collection item details are unavailable. Refresh and try again.');
    }

    setError(null);
    await api.deleteCollectionRow(ownedCollectionId, row.catalogCardId, {
      collectionItemIds,
    });
    clearRowTransferState(row);
    setRowActionSuccess(`Deleted ${row.productName} from Owned Collection.`);
    await loadSellability(ownedCollectionId);
    setDeletingRow(null);
  };

  const handleTransferPreview = async () => {
    if (ownedCollectionId === null || transferRequest.items.length === 0) return;
    setTransferLoading(true);
    setError(null);
    setTransferSuccess(null);
    try {
      const response = await api.previewCollectionTransferToInventory(
        ownedCollectionId,
        transferRequest,
      );
      setTransferPreview(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview transfer');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleTransferCommit = async () => {
    if (ownedCollectionId === null || transferRequest.items.length === 0) return;
    setTransferLoading(true);
    setError(null);
    try {
      const response = await api.commitCollectionTransferToInventory(
        ownedCollectionId,
        transferRequest,
      );
      setTransferPreview(response);
      setTransferSuccess(
        `Moved ${response.summary.transferQuantity ?? 0} card(s) to Selling Inventory.`,
      );
      await loadSellability(ownedCollectionId);
      await onInventoryChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move to Selling Inventory');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleKindChange = async (
    row: CollectionSellabilityRow,
    nextKind: CardKind,
  ) => {
    setUpdatingCatalogId(row.catalogCardId);
    setError(null);
    try {
      await api.updateCatalogCardMetadata(row.catalogCardId, { cardKind: nextKind });
      if (ownedCollectionId !== null) {
        await loadSellability(ownedCollectionId);
      }
      onCatalogMetadataUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update card kind');
    } finally {
      setUpdatingCatalogId(null);
    }
  };

  const renderTransferCheckbox = (row: CollectionSellabilityRow) => (
    <label className="collection-transfer-checkbox">
      <input
        type="checkbox"
        aria-label={`Move ${row.productName} to Selling Inventory`}
        disabled={!canTransferRow(row)}
        checked={recommendedTransferItems(row).some(
          (item) => transferSelection[item.collectionItemId] > 0,
        )}
        onChange={(event) => handleToggleTransferRow(row, event.target.checked)}
      />
      <span>
        {row.excluded
          ? 'Excluded'
          : row.opportunityType === 'foil_swap'
            ? 'Move foil'
            : 'Move recommended'}
      </span>
    </label>
  );

  const renderTransferQuantityInputs = (row: CollectionSellabilityRow) =>
    recommendedTransferItems(row).map((item, index) => {
      const inputId = `collection-transfer-${row.catalogCardId}-${item.collectionItemId}`;
      return (
        <div className="collection-transfer-qty-wrap" key={item.collectionItemId}>
          <label htmlFor={inputId}>
            {recommendedTransferItems(row).length > 1 ? `Move qty ${index + 1}` : 'Move qty'}
          </label>
          <input
            id={inputId}
            type="number"
            min="0"
            max={item.quantity}
            className="collection-transfer-qty"
            aria-label={`Move quantity for ${row.productName}`}
            value={transferSelection[item.collectionItemId] ?? item.quantity}
            onChange={(event) =>
              handleTransferItemQuantity(
                item.collectionItemId,
                Number(event.target.value),
                item.quantity,
              )
            }
          />
        </div>
      );
    });

  const renderRowActions = (row: CollectionSellabilityRow) => (
    <div
      className="action-menu-container"
      ref={openActionMenuId === row.catalogCardId ? actionMenuRef : null}
    >
      <BlueprintButton
        variant="ghost"
        className="collection-action-menu-trigger"
        aria-label={`Actions for ${row.productName}`}
        aria-haspopup="menu"
        aria-expanded={openActionMenuId === row.catalogCardId}
        onClick={() =>
          setOpenActionMenuId((current) =>
            current === row.catalogCardId ? null : row.catalogCardId,
          )
        }
        icon={<MoreHorizontal aria-hidden="true" strokeWidth={1.75} />}
      />
      {openActionMenuId === row.catalogCardId && (
        <div className="action-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenActionMenuId(null);
              if (collectionRowSourceItems(row).length === 0) {
                setError('Collection item details are unavailable. Refresh and try again.');
                return;
              }
              setRowActionSuccess(null);
              setAdjustingRow(row);
            }}
          >
            Adjust count
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger-menu-item"
            onClick={() => {
              setOpenActionMenuId(null);
              if (collectionRowSourceItems(row).length === 0) {
                setError('Collection item details are unavailable. Refresh and try again.');
                return;
              }
              setRowActionSuccess(null);
              setDeletingRow(row);
            }}
          >
            Delete row
          </button>
        </div>
      )}
    </div>
  );

  const renderKindControl = (row: CollectionSellabilityRow) => {
    const isUpdating = updatingCatalogId === row.catalogCardId;
    return (
      <>
        <label className="sr-only" htmlFor={`kind-${row.catalogCardId}`}>
          Card kind for {row.productName}
        </label>
        <select
          id={`kind-${row.catalogCardId}`}
          className="collection-kind-select"
          value={row.kind}
          disabled={isUpdating}
          onChange={(event) => handleKindChange(row, event.target.value as CardKind)}
        >
          {CARD_KIND_OPTIONS.map((kind) => (
            <option key={kind} value={kind}>
              {formatKind(kind)}
            </option>
          ))}
        </select>
        {row.needsClassification && (
          <span className="collection-badge badge-warning">Needs Classification</span>
        )}
      </>
    );
  };

  const renderDesktopRows = () => (
    <div className="table-container collection-table-wrap">
      <table className="card-table collection-table">
        <thead>
          <tr>
            <th>Move</th>
            <th>Card</th>
            <th>Set / #</th>
            <th>Kind</th>
            <th>Normal Qty</th>
            <th>Foil Qty</th>
            <th>Keep Target</th>
            <th>Recommended Sell</th>
            <th>Reason</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {paginatedRows.map((row) => {
            const sellQty = recommendedSellQty(row);
            return (
              <tr key={row.catalogCardId} className={rowToneClass(row)}>
                <td className="collection-transfer-cell">
                  <div className="collection-transfer-control">
                    {renderTransferCheckbox(row)}
                    {renderTransferQuantityInputs(row)}
                  </div>
                </td>
                <td className="card-name">
                  <div className="collection-card-title">{row.productName}</div>
                  {row.title && (
                    <span className="collection-card-title__subtitle">{row.title}</span>
                  )}
                </td>
                <td>{rowSetAndNumber(row)}</td>
                <td>{renderKindControl(row)}</td>
                <td>{row.normalQty}</td>
                <td>{row.foilQty}</td>
                <td>{row.keepTarget ?? '—'}</td>
                <td>
                  <strong>{sellQty}</strong>
                  {(row.sellNormalQty > 0 || row.sellFoilQty > 0) && (
                    <span className="collection-muted">
                      {row.sellNormalQty} normal / {row.sellFoilQty} foil
                    </span>
                  )}
                </td>
                <td>
                  <span>{recommendationLabel(row)}</span>
                  {row.opportunityType === 'foil_swap' && (
                    <span className="collection-badge badge-success">Foil swap</span>
                  )}
                  {row.excluded && (
                    <span className="collection-badge badge-muted">Token/Rune excluded</span>
                  )}
                  {row.reasons.length > 0 && (
                    <div className="collection-muted">{row.reasons.join('; ')}</div>
                  )}
                </td>
                <td className="actions">{renderRowActions(row)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderPhoneRows = () => (
    <div className="collection-mobile-list" aria-label="Collection cards">
      {paginatedRows.map((row) => {
        const sellQty = recommendedSellQty(row);
        const expanded = expandedRowId === row.catalogCardId;
        return (
          <article key={row.catalogCardId} className={`collection-mobile-card ${rowToneClass(row) ?? ''}`}>
            <div className="collection-mobile-card__header">
              <div className="collection-mobile-card__identity">
                <p className="collection-mobile-card__eyebrow">{rowSetAndNumber(row)}</p>
                <h3 className="collection-mobile-card__name">{row.productName}</h3>
                {row.title && <p className="collection-mobile-card__set">{row.title}</p>}
              </div>
              <BlueprintButton
                variant="secondary"
                className="collection-mobile-card__toggle"
                aria-label={`${expanded ? 'Hide' : 'Show'} details for ${row.productName}`}
                aria-expanded={expanded}
                aria-controls={`collection-card-details-${row.catalogCardId}`}
                onClick={() =>
                  setExpandedRowId((current) =>
                    current === row.catalogCardId ? null : row.catalogCardId,
                  )
                }
                icon={<ChevronDown aria-hidden="true" strokeWidth={1.5} />}
              />
            </div>

            <div className="collection-mobile-card__summary">
              <div>
                <span>Normal</span>
                <strong>{row.normalQty}</strong>
              </div>
              <div>
                <span>Foil</span>
                <strong>{row.foilQty}</strong>
              </div>
              <div>
                <span>Sell</span>
                <strong>{sellQty}</strong>
              </div>
            </div>

            <div className="collection-mobile-card__move-row">
              {renderTransferCheckbox(row)}
              {row.opportunityType === 'foil_swap' && (
                <span className="collection-badge badge-success">Foil swap</span>
              )}
              {row.excluded && (
                <span className="collection-badge badge-muted">Excluded</span>
              )}
            </div>

            {expanded && (
              <div
                id={`collection-card-details-${row.catalogCardId}`}
                className="collection-mobile-card__details"
              >
                <div className="collection-mobile-card__detail-grid">
                  <div>
                    <span className="collection-quantity__label">Kind</span>
                    {renderKindControl(row)}
                  </div>
                  <div>
                    <span className="collection-quantity__label">Keep target</span>
                    <strong>{row.keepTarget ?? '—'}</strong>
                  </div>
                  <div>
                    <span className="collection-quantity__label">Recommended sell</span>
                    <strong>
                      {sellQty} ({row.sellNormalQty} normal / {row.sellFoilQty} foil)
                    </strong>
                  </div>
                </div>
                <div className="collection-mobile-card__reason">
                  <span className="collection-quantity__label">Reason</span>
                  <strong>{recommendationLabel(row)}</strong>
                  {row.reasons.length > 0 && <p>{row.reasons.join('; ')}</p>}
                </div>
                {recommendedTransferItems(row).length > 0 && (
                  <div className="collection-transfer-control">
                    <span className="collection-quantity__label">Transfer quantity</span>
                    {renderTransferQuantityInputs(row)}
                  </div>
                )}
                <div className="collection-mobile-card__details-footer">
                  <span className="collection-muted">
                    Adjusting a row only changes Owned Collection source counts.
                  </span>
                  {renderRowActions(row)}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );

  return (
    <section
      ref={collectionViewRef}
      className="cards-section collection-section collection-workflow"
      data-layout={layout}
    >
      <header className="collection-workflow__header">
        <p className="collection-workflow__eyebrow">Inventory decision map</p>
        <h2 className="collection-workflow__title">Owned Collection</h2>
        <p className="collection-workflow__description">
          Keep personal copies first, review practical duplicates, then explicitly move selected cards to Selling Inventory.
        </p>
      </header>

      <div className="collection-stepper" aria-label="Owned Collection workflow">
        <div className="collection-stepper__item">
          <span className="collection-stepper__number">01</span>
          <div className="collection-stepper__copy">
            <strong>Import</strong>
            <span>Add CSV quantities without changing selling inventory.</span>
          </div>
        </div>
        <div className="collection-stepper__item">
          <span className="collection-stepper__number">02</span>
          <div className="collection-stepper__copy">
            <strong>Review</strong>
            <span>Search and inspect sellability recommendations.</span>
          </div>
        </div>
        <div className="collection-stepper__item">
          <span className="collection-stepper__number">03</span>
          <div className="collection-stepper__copy">
            <strong>Transfer</strong>
            <span>Preview the selected move before committing it.</span>
          </div>
        </div>
      </div>

      {ownedCollection && (
        <div className="collection-step">
          <div className="collection-step__header">
            <p className="collection-step__eyebrow">Step 01 · Import</p>
            <h3 className="collection-step__heading">Add a collection export</h3>
            <p className="collection-step__description">
              The preview is automatic and additive. Review it before making any collection change.
            </p>
          </div>
          <CollectionImportUpload
            collectionId={ownedCollection.id}
            layout={layout}
            onImportCommitted={async () => {
              await loadSellability(ownedCollection.id);
            }}
          />
        </div>
      )}

      {error && (
        <div className="collection-result-notice collection-result-notice--error" role="alert">
          {error}
        </div>
      )}
      {rowActionSuccess && (
        <div className="collection-result-notice collection-result-notice--success" role="status">
          {rowActionSuccess}
        </div>
      )}

      {sellability && (
        <div className="collection-step">
          <div className="collection-step__header">
            <p className="collection-step__eyebrow">Step 02 · Review</p>
            <h3 className="collection-step__heading">Review sellability</h3>
            <p className="collection-step__description">
              Recommendations favor your keep target. Token and rune rows stay excluded, while unknown card kinds remain visible for classification.
            </p>
          </div>
          <div className="collection-summary-grid" aria-label="Sellability summary">
            <div className="collection-summary-card">
              <span>Sell Normal</span>
              <strong>{sellability.summary.sellNormalQty}</strong>
            </div>
            <div className="collection-summary-card">
              <span>Sell Foil</span>
              <strong>{sellability.summary.sellFoilQty}</strong>
            </div>
            <div className="collection-summary-card warning">
              <span>Needs Classification</span>
              <strong>{sellability.summary.needsClassificationCards}</strong>
            </div>
            <div className="collection-summary-card muted">
              <span>Excluded Token/Rune</span>
              <strong>{sellability.summary.excludedCards}</strong>
            </div>
          </div>

          <BlueprintPanel className="collection-review-panel" aria-label="Collection review">
            <div className="collection-review-panel__header">
              <div>
                <p className="collection-step__eyebrow">Owned cards</p>
                <h3 className="collection-step__heading">Select recommended extras</h3>
              </div>
              <p className="collection-review-panel__status">
                {sortedRows.length} card group{sortedRows.length === 1 ? '' : 's'} in view
              </p>
            </div>
            <div className="collection-toolbar">
              <BlueprintInput
                type="search"
                label="Search collection"
                placeholder="Search by card, set, or number..."
                value={collectionSearchQuery}
                onChange={(event) => handleCollectionSearchChange(event.target.value)}
                className="collection-search"
                fieldClassName="collection-search"
              />
            </div>

            {loadingCollections || loadingSellability ? (
              <div className="table-loading">
                <p>Loading collection recommendations...</p>
              </div>
            ) : sortedRows.length === 0 ? (
              <div className="table-empty collection-search-empty" role="status">
                {collectionSearchQuery.trim()
                  ? `No collection cards match "${collectionSearchQuery.trim()}".`
                  : 'No collection cards found.'}
              </div>
            ) : (
              <>
                {layout === 'phone' ? renderPhoneRows() : renderDesktopRows()}
                <Pagination
                  currentPage={activeCollectionPage}
                  totalItems={sortedRows.length}
                  itemsPerPage={COLLECTION_ITEMS_PER_PAGE}
                  onPageChange={handleCollectionPageChange}
                />
              </>
            )}
          </BlueprintPanel>
        </div>
      )}

      {sellability && (
        <div className="collection-step">
          <div className="collection-step__header">
            <p className="collection-step__eyebrow">Step 03 · Transfer</p>
            <h3 className="collection-step__heading">Preview and move selected cards</h3>
            <p className="collection-step__description">
              The move decreases Owned Collection quantities and creates separate Ready-to-List rows when needed. It does not post listings to TCGPlayer.
            </p>
          </div>
          <BlueprintPanel className="collection-transfer-panel" aria-label="Move to Selling Inventory">
            <div className="collection-transfer-panel__intro">
              <h3>Move to Selling Inventory</h3>
              <p>
                Select recommended cards above, preview the exact internal inventory change, and then commit it deliberately.
              </p>
            </div>
            <div className="collection-transfer-actions">
              <span className="collection-transfer-actions__count">
                {transferSelectedQuantity} card(s) selected
              </span>
              <BlueprintButton
                variant="secondary"
                onClick={handleTransferPreview}
                disabled={transferSelectedQuantity === 0 || transferLoading}
                icon={<Search aria-hidden="true" strokeWidth={1.5} />}
              >
                {transferLoading ? 'Working…' : 'Preview Move'}
              </BlueprintButton>
              <BlueprintButton
                variant="primary"
                onClick={handleTransferCommit}
                disabled={
                  transferSelectedQuantity === 0 ||
                  transferLoading ||
                  !transferPreview ||
                  (transferPreview.summary.blockedItems ?? 0) > 0
                }
                icon={<MoveRight aria-hidden="true" strokeWidth={1.5} />}
              >
                Move to Selling Inventory
              </BlueprintButton>
            </div>

            {transferPreview && (
              <div className="collection-transfer-preview" aria-label="Transfer preview">
                <div className="collection-summary-grid collection-transfer-summary">
                  <div className="collection-summary-card">
                    <span>Transfer Qty</span>
                    <strong>{transferPreview.summary.transferQuantity ?? 0}</strong>
                  </div>
                  <div className="collection-summary-card">
                    <span>Create / Update</span>
                    <strong>
                      {transferPreview.summary.createRows ?? 0}/
                      {transferPreview.summary.updateRows ?? 0}
                    </strong>
                  </div>
                  <div className="collection-summary-card warning">
                    <span>Blocked</span>
                    <strong>{transferPreview.summary.blockedItems ?? 0}</strong>
                  </div>
                </div>
                {transferPreview.summary.blockers.length > 0 && (
                  <div className="collection-result-notice collection-result-notice--error">
                    {formatTransferMessages(transferPreview.summary.blockers)}
                  </div>
                )}
                {transferPreview.summary.warnings.length > 0 && (
                  <div className="collection-result-notice collection-result-notice--error">
                    {formatTransferMessages(transferPreview.summary.warnings)}
                  </div>
                )}
                {layout === 'phone' ? (
                  <div className="collection-mobile-preview-list" aria-label="Transfer preview rows">
                    {(transferPreview.items ?? []).map((item) => (
                      <article className="collection-mobile-preview-card" key={item.collectionItemId}>
                        <div className="collection-mobile-preview-card__header">
                          <strong>{item.card?.productName ?? `Catalog #${item.catalogCardId}`}</strong>
                          <span className={`collection-import-status status-${item.status ?? 'matched'}`}>
                            {item.status === 'matched' ? 'Ready to List' : (item.status ?? '-')}
                          </span>
                        </div>
                        <p className="collection-mobile-preview-card__meta">
                          Qty {item.quantity} · {item.inventoryCondition ?? item.finish}
                        </p>
                        <p>Action: {item.action}</p>
                        {formatTransferMessages([
                          ...(item.warnings ?? []),
                          ...(item.blockers ?? []),
                        ]) && (
                          <p>
                            {formatTransferMessages([
                              ...(item.warnings ?? []),
                              ...(item.blockers ?? []),
                            ])}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="table-container collection-transfer-table">
                    <table className="card-table">
                      <thead>
                        <tr>
                          <th>Card</th>
                          <th>Qty</th>
                          <th>Finish</th>
                          <th>Inventory Status</th>
                          <th>Action</th>
                          <th>Warnings / Blockers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(transferPreview.items ?? []).map((item) => (
                          <tr key={item.collectionItemId}>
                            <td>{item.card?.productName ?? `Catalog #${item.catalogCardId}`}</td>
                            <td>{item.quantity}</td>
                            <td>{item.inventoryCondition ?? item.finish}</td>
                            <td>{item.status === 'matched' ? 'Ready to List' : (item.status ?? '-')}</td>
                            <td>{item.action}</td>
                            <td>
                              {formatTransferMessages([
                                ...(item.warnings ?? []),
                                ...(item.blockers ?? []),
                              ]) || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {transferSuccess && (
              <div className="collection-result-notice collection-result-notice--success" role="status">
                {transferSuccess}
              </div>
            )}
          </BlueprintPanel>
        </div>
      )}

      {loadingCollections || loadingSellability ? null : ownedCollectionId === null ? (
        <div className="table-empty" role="status">
          Owned Collection is unavailable. Create or restore an Owned collection before importing or moving cards.
        </div>
      ) : null}

      {adjustingRow && (
        <CollectionRowAdjustModal
          row={adjustingRow}
          sourceItems={collectionRowSourceItems(adjustingRow)}
          onSave={(data) => handleAdjustCollectionRow(adjustingRow, data)}
          onClose={() => setAdjustingRow(null)}
        />
      )}
      {deletingRow && (
        <CollectionRowDeleteModal
          row={deletingRow}
          onDelete={() => handleDeleteCollectionRow(deletingRow)}
          onClose={() => setDeletingRow(null)}
        />
      )}
    </section>
  );
}
