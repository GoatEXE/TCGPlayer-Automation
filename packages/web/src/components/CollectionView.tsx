import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { CollectionImportUpload } from './CollectionImportUpload';
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

function chooseDefaultCollection(collections: CollectionSummary[]) {
  return (
    collections.find((collection) => collection.purpose === 'owned') ??
    collections.find((collection) => collection.isDefault) ??
    collections.find((collection) => collection.name.toLowerCase() === 'default') ??
    collections[0] ??
    null
  );
}

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

function rowMoveQuantity(row: CollectionSellabilityRow, isToBeSold: boolean) {
  return recommendedTransferItems(row, isToBeSold).reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
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

function recommendedTransferItems(
  row: CollectionSellabilityRow,
  isToBeSold: boolean,
) {
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

  const hasRecommendation = row.sellNormalQty > 0 || row.sellFoilQty > 0;
  const normalTarget = hasRecommendation || !isToBeSold ? row.sellNormalQty : row.normalQty;
  const foilTarget = hasRecommendation || !isToBeSold ? row.sellFoilQty : row.foilQty;

  return [
    { item: itemForFinish(row, 'normal'), quantity: normalTarget },
    { item: itemForFinish(row, 'foil'), quantity: foilTarget },
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

function canTransferRow(row: CollectionSellabilityRow, isToBeSold: boolean) {
  if (row.excluded || (row.blockers?.length ?? 0) > 0) return false;
  return recommendedTransferItems(row, isToBeSold).length > 0;
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

interface CollectionViewProps {
  onCatalogMetadataUpdated?: () => void;
  onInventoryChanged?: () => void | Promise<void>;
}

export function CollectionView({
  onCatalogMetadataUpdated,
  onInventoryChanged,
}: CollectionViewProps) {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(
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
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearLoading, setClearLoading] = useState(false);
  const [clearSuccess, setClearSuccess] = useState<string | null>(null);
  const [collectionRefreshKey, setCollectionRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function loadCollections() {
      setLoadingCollections(true);
      setError(null);
      try {
        const response = await api.getCollections();
        if (ignore) return;
        setCollections(response.collections);
        const defaultCollection = chooseDefaultCollection(response.collections);
        setSelectedCollectionId((current) => current ?? defaultCollection?.id ?? null);
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

  useEffect(() => {
    if (selectedCollectionId === null) return;
    loadSellability(selectedCollectionId);
  }, [selectedCollectionId]);

  const sortedRows = useMemo(() => {
    return [...(sellability?.rows ?? [])].sort((a, b) => {
      const rankDiff = recommendationRank(a) - recommendationRank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.productName.localeCompare(b.productName);
    });
  }, [sellability]);

  const toBeSoldCollection = collections.find(
    (collection) =>
      collection.purpose === 'to_be_sold' ||
      collection.name.toLowerCase() === 'to be sold',
  );
  const selectedCollection = collections.find(
    (collection) => collection.id === selectedCollectionId,
  );
  const selectedIsToBeSold =
    selectedCollection?.purpose === 'to_be_sold' ||
    selectedCollection?.name.toLowerCase() === 'to be sold';
  const transferRequest = buildTransferRequest(transferSelection);
  const transferSelectedQuantity = transferRequest.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const handleToggleTransferRow = (row: CollectionSellabilityRow, checked: boolean) => {
    setTransferPreview(null);
    setTransferSuccess(null);
    setTransferSelection((current) => {
      const next = { ...current };
      for (const item of recommendedTransferItems(row, selectedIsToBeSold)) {
        if (checked) {
          next[item.collectionItemId] = item.quantity;
        } else {
          delete next[item.collectionItemId];
        }
      }
      return next;
    });
  };

  const handleTransferItemQuantity = (collectionItemId: number, quantity: number) => {
    setTransferPreview(null);
    setTransferSuccess(null);
    setTransferSelection((current) => ({
      ...current,
      [collectionItemId]: Math.max(0, Math.floor(quantity) || 0),
    }));
  };

  const handleTransferPreview = async () => {
    if (selectedCollectionId === null || transferRequest.items.length === 0) return;
    setTransferLoading(true);
    setError(null);
    setTransferSuccess(null);
    try {
      const response = await api.previewCollectionTransferToInventory(
        selectedCollectionId,
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
    if (selectedCollectionId === null || transferRequest.items.length === 0) return;
    setTransferLoading(true);
    setError(null);
    try {
      const response = await api.commitCollectionTransferToInventory(
        selectedCollectionId,
        transferRequest,
      );
      setTransferPreview(response);
      setTransferSuccess(
        `Moved ${response.summary.transferQuantity ?? 0} card(s) to Selling Inventory.`,
      );
      await loadSellability(selectedCollectionId);
      await onInventoryChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move to Selling Inventory');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleClearCollection = async () => {
    if (selectedCollectionId === null || clearConfirmText !== 'CLEAR COLLECTION') return;

    const collectionName = selectedCollection?.name ?? 'this collection';
    if (
      !confirm(
        `Clear ${collectionName}? This removes rows from this collection only and cannot be undone.`,
      )
    ) {
      return;
    }

    setClearLoading(true);
    setError(null);
    setClearSuccess(null);
    try {
      const response = await api.clearCollection(
        selectedCollectionId,
        clearConfirmText,
      );
      const removed = response.deleted ?? response.removed ?? 0;
      setClearSuccess(`Cleared ${removed} collection row(s) from ${collectionName}.`);
      setClearConfirmText('');
      setCollectionRefreshKey((key) => key + 1);
      await loadSellability(selectedCollectionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear collection');
    } finally {
      setClearLoading(false);
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
      if (selectedCollectionId !== null) {
        await loadSellability(selectedCollectionId);
      }
      onCatalogMetadataUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update card kind');
    } finally {
      setUpdatingCatalogId(null);
    }
  };

  return (
    <section className="cards-section collection-section">
      {selectedIsToBeSold && (
        <div className="section-header collection-header">
          <div>
            <h2>To Be Sold Collection</h2>
            <p className="section-subtitle">
              To Be Sold staging cards ready to move into internal Selling Inventory. This does not list anything on TCGPlayer.
            </p>
          </div>
        </div>
      )}

      <CollectionImportUpload
        key={collectionRefreshKey}
        collectionId={selectedCollectionId}
        onImportCommitted={async () => {
          if (selectedCollectionId !== null) {
            await loadSellability(selectedCollectionId);
          }
        }}
      />

      <div className="collection-toolbar">
        <label className="collection-selector" htmlFor="collection-select">
          Collection
          <select
            id="collection-select"
            className="shipment-select"
            value={selectedCollectionId ?? ''}
            disabled={loadingCollections || collections.length === 0}
            onChange={(event) => setSelectedCollectionId(Number(event.target.value))}
          >
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
                {collection.purpose ? ` (${collection.purpose.replace(/_/g, ' ')})` : ''}
              </option>
            ))}
          </select>
        </label>

        {toBeSoldCollection && (
          <div className="collection-pill" aria-label="To Be Sold collection">
            To Be Sold: {toBeSoldCollection.name}
          </div>
        )}
      </div>

      {selectedCollection && (
        <div className="collection-clear-panel" aria-label="Clear selected collection">
          <div>
            <h3>Clear {selectedIsToBeSold ? 'To Be Sold Collection' : 'Owned Collection'}</h3>
            <p>
              Destructive: removes rows from {selectedCollection.name} only. It does not delete catalog data, Selling Inventory, listed cards, sales, or TCGPlayer listings.
            </p>
          </div>
          <div className="collection-clear-controls">
            <label htmlFor="collection-clear-confirm">
              Type <strong>CLEAR COLLECTION</strong> to enable clearing
            </label>
            <input
              id="collection-clear-confirm"
              className="shipment-input"
              value={clearConfirmText}
              onChange={(event) => setClearConfirmText(event.target.value)}
              placeholder="CLEAR COLLECTION"
            />
            <button
              type="button"
              className="button-danger"
              disabled={clearConfirmText !== 'CLEAR COLLECTION' || clearLoading}
              onClick={handleClearCollection}
            >
              {clearLoading ? 'Clearing…' : `Clear ${selectedCollection.name}`}
            </button>
          </div>
          {clearSuccess && <div className="import-result success">{clearSuccess}</div>}
        </div>
      )}

      {sellability && (
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
      )}

      {sellability && (
        <div className="collection-transfer-panel" aria-label="Move to Selling Inventory">
          <div>
            <h3>Move to Selling Inventory</h3>
            <p>
              {selectedIsToBeSold
                ? 'Select staged cards to move into internal Selling Inventory as Ready to List. This decreases To Be Sold quantities and does not list anything on TCGPlayer.'
                : 'Select recommended cards to move into internal Selling Inventory as Ready to List. This decreases the source collection quantity and does not list anything on TCGPlayer.'}
            </p>
          </div>
          <div className="collection-transfer-actions">
            <span>{transferSelectedQuantity} card(s) selected</span>
            <button
              type="button"
              className="button-primary"
              onClick={handleTransferPreview}
              disabled={transferSelectedQuantity === 0 || transferLoading}
            >
              {transferLoading ? 'Working…' : 'Preview Move'}
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={handleTransferCommit}
              disabled={
                transferSelectedQuantity === 0 ||
                transferLoading ||
                !transferPreview ||
                (transferPreview.summary.blockedItems ?? 0) > 0
              }
            >
              Move to Selling Inventory
            </button>
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
                <div className="import-result error">
                  {formatTransferMessages(transferPreview.summary.blockers)}
                </div>
              )}
              {transferPreview.summary.warnings.length > 0 && (
                <div className="import-result error">
                  {formatTransferMessages(transferPreview.summary.warnings)}
                </div>
              )}
              <div className="table-container">
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
            </div>
          )}
          {transferSuccess && (
            <div className="import-result success">{transferSuccess}</div>
          )}
        </div>
      )}

      {error && <div className="import-result error">{error}</div>}

      {loadingCollections || loadingSellability ? (
        <div className="table-loading">
          <p>⏳ Loading collection recommendations...</p>
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="table-empty">No collection cards found.</div>
      ) : (
        <div className="table-container">
          <table className="card-table collection-table">
            <thead>
              <tr>
                <th>Move</th>
                <th>Card</th>
                <th>Set / #</th>
                <th>Kind</th>
                <th>Normal Qty</th>
                <th>Foil Qty</th>
                <th>{selectedIsToBeSold ? 'Available' : 'Keep Target'}</th>
                <th>{selectedIsToBeSold ? 'Move Qty' : 'Recommended Sell'}</th>
                <th>{selectedIsToBeSold ? 'Transfer State' : 'Reason'}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const sellQty = recommendedSellQty(row);
                const isUpdating = updatingCatalogId === row.catalogCardId;
                return (
                  <tr
                    key={row.catalogCardId}
                    className={
                      row.needsClassification
                        ? 'collection-row-needs-classification'
                        : sellQty > 0 || row.opportunityType === 'foil_swap'
                          ? 'collection-row-sellable'
                          : row.excluded
                            ? 'collection-row-excluded'
                            : undefined
                    }
                  >
                    <td>
                      <label className="collection-transfer-checkbox">
                        <input
                          type="checkbox"
                          aria-label={`Move ${row.productName} to Selling Inventory`}
                          disabled={!canTransferRow(row, selectedIsToBeSold)}
                          checked={recommendedTransferItems(row, selectedIsToBeSold).some(
                            (item) => transferSelection[item.collectionItemId] > 0,
                          )}
                          onChange={(event) =>
                            handleToggleTransferRow(row, event.target.checked)
                          }
                        />
                        <span className="collection-muted">
                          {row.excluded ? 'Excluded' : row.opportunityType === 'foil_swap' ? 'Foil' : 'Move'}
                        </span>
                      </label>
                      {recommendedTransferItems(row, selectedIsToBeSold).map((item) => (
                        <input
                          key={item.collectionItemId}
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
                            )
                          }
                        />
                      ))}
                    </td>
                    <td className="card-name">
                      <div>{row.productName}</div>
                      {row.title && <span className="collection-muted">{row.title}</span>}
                    </td>
                    <td>
                      <div>{row.setCode ?? row.setName ?? '-'}</div>
                      <span className="collection-muted">
                        {row.collectorNumber ?? row.normalizedNumber ?? '-'}
                      </span>
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`kind-${row.catalogCardId}`}>
                        Card kind for {row.productName}
                      </label>
                      <select
                        id={`kind-${row.catalogCardId}`}
                        className="shipment-select collection-kind-select"
                        value={row.kind}
                        disabled={isUpdating}
                        onChange={(event) =>
                          handleKindChange(row, event.target.value as CardKind)
                        }
                      >
                        {CARD_KIND_OPTIONS.map((kind) => (
                          <option key={kind} value={kind}>
                            {formatKind(kind)}
                          </option>
                        ))}
                      </select>
                      {row.needsClassification && (
                        <span className="collection-badge badge-warning">
                          Needs Classification
                        </span>
                      )}
                    </td>
                    <td>{row.normalQty}</td>
                    <td>{row.foilQty}</td>
                    <td>{selectedIsToBeSold ? row.totalQty : (row.keepTarget ?? '—')}</td>
                    <td>
                      <strong>{selectedIsToBeSold ? rowMoveQuantity(row, selectedIsToBeSold) : sellQty}</strong>
                      {!selectedIsToBeSold && (row.sellNormalQty > 0 || row.sellFoilQty > 0) && (
                        <span className="collection-muted">
                          {' '}
                          ({row.sellNormalQty} normal / {row.sellFoilQty} foil)
                        </span>
                      )}
                    </td>
                    <td>
                      <span>{selectedIsToBeSold ? (canTransferRow(row, selectedIsToBeSold) ? 'Ready to move' : 'Not transferable') : recommendationLabel(row)}</span>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
