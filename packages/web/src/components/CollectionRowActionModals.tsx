import { useRef, useState } from 'react';
import type {
  AdjustCollectionRowRequest,
  CollectionSellabilityItemRef,
  CollectionSellabilityRow,
} from '../api/types';
import { useModalFocusTrap } from './useModalFocusTrap';

export interface CollectionRowSourceItem extends CollectionSellabilityItemRef {
  collectionItemId: number;
}

interface CollectionRowAdjustModalProps {
  row: CollectionSellabilityRow;
  sourceItems: CollectionRowSourceItem[];
  onSave: (data: AdjustCollectionRowRequest) => Promise<void>;
  onClose: () => void;
}

function sourceItemLabel(item: CollectionRowSourceItem) {
  return [
    item.finish || 'Normal',
    item.condition || 'Near Mint',
    item.language || 'EN',
  ].join(' · ');
}

export function CollectionRowAdjustModal({
  row,
  sourceItems,
  onSave,
  onClose,
}: CollectionRowAdjustModalProps) {
  const [counts, setCounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      sourceItems.map((item) => [item.collectionItemId, String(item.quantity)]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleClose = () => {
    if (!saving) onClose();
  };

  useModalFocusTrap({
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    onClose: handleClose,
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const items = sourceItems.map((item) => {
      const value = counts[item.collectionItemId]?.trim() ?? '';
      return {
        collectionItemId: item.collectionItemId,
        value,
        quantity: Number(value),
      };
    });
    if (
      items.some(
        (item) =>
          item.value === '' ||
          !/^\d+$/.test(item.value) ||
          !Number.isSafeInteger(item.quantity),
      )
    ) {
      setError('Each count must be a non-negative whole number.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        items: items.map(({ collectionItemId, quantity }) => ({
          collectionItemId,
          quantity,
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update counts');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Adjust count for ${row.productName}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <form
        ref={dialogRef}
        className="modal-content edit-details-modal"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="modal-header">
          <h2 id="collection-row-adjust-title">Adjust count</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="modal-close"
            onClick={handleClose}
            aria-label="Close adjust count"
            disabled={saving}
          >
            ×
          </button>
        </div>
        <div className="edit-details-body">
          <p className="edit-details-card-name">{row.productName}</p>
          <p className="form-help">
            Normal: {row.normalQty} · Foil: {row.foilQty}. Each source record is
            saved independently; entering 0 removes that Owned Collection item.
          </p>
          {sourceItems.map((item) => {
            const inputId = `collection-row-count-${item.collectionItemId}`;
            return (
              <label
                key={item.collectionItemId}
                className="edit-details-field"
                htmlFor={inputId}
              >
                <span>{sourceItemLabel(item)}</span>
                <input
                  id={inputId}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={counts[item.collectionItemId] ?? ''}
                  onChange={(event) => {
                    setCounts((current) => ({
                      ...current,
                      [item.collectionItemId]: event.target.value,
                    }));
                    setError(null);
                  }}
                  disabled={saving}
                />
              </label>
            );
          })}
          {error && (
            <div className="edit-details-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save counts'}
          </button>
        </div>
      </form>
    </div>
  );
}

interface CollectionRowDeleteModalProps {
  row: CollectionSellabilityRow;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export function CollectionRowDeleteModal({
  row,
  onDelete,
  onClose,
}: CollectionRowDeleteModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const handleClose = () => {
    if (!deleting) onClose();
  };

  useModalFocusTrap({
    containerRef: dialogRef,
    initialFocusRef: cancelButtonRef,
    onClose: handleClose,
  });

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete collection row',
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Delete ${row.productName}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div ref={dialogRef} className="modal-content edit-details-modal">
        <div className="modal-header">
          <h2 id="collection-row-delete-title">Delete row</h2>
          <button
            type="button"
            className="modal-close"
            onClick={handleClose}
            aria-label="Close delete row"
            disabled={deleting}
          >
            ×
          </button>
        </div>
        <div className="edit-details-body">
          <p className="edit-details-card-name">{row.productName}</p>
          <p className="form-help">
            This removes all Normal and Foil source counts represented by this
            Owned Collection row. It does not delete catalog data, Selling
            Inventory, sales, or price history.
          </p>
          {error && (
            <div className="edit-details-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="button-secondary"
            onClick={handleClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button-danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete row'}
          </button>
        </div>
      </div>
    </div>
  );
}
