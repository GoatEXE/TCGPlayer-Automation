import { AlertTriangle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type {
  AdjustCollectionRowRequest,
  CollectionSellabilityItemRef,
  CollectionSellabilityRow,
} from '../api/types';
import { BlueprintButton, BlueprintDialog, BlueprintInput } from '../ui';

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
  const formId = `collection-row-adjust-${row.catalogCardId}`;

  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
    <BlueprintDialog
      open
      title={`Adjust count for ${row.productName}`}
      closeLabel="Close adjust count"
      onClose={handleClose}
      className="collection-dialog"
      footer={
        <>
          <BlueprintButton variant="secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </BlueprintButton>
          <BlueprintButton
            variant="primary"
            type="submit"
            form={formId}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save counts'}
          </BlueprintButton>
        </>
      }
    >
      <form id={formId} className="collection-dialog__form" noValidate onSubmit={handleSubmit}>
        <p className="collection-dialog__card-name">{row.productName}</p>
        <p className="collection-dialog__help">
          Normal: {row.normalQty} · Foil: {row.foilQty}. Each source record is
          saved independently; entering 0 removes that Owned Collection item.
        </p>
        <div className="collection-dialog__fields">
          {sourceItems.map((item) => {
            const inputId = `collection-row-count-${item.collectionItemId}`;
            return (
              <BlueprintInput
                key={item.collectionItemId}
                id={inputId}
                label={sourceItemLabel(item)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
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
            );
          })}
        </div>
        {error && (
          <p className="collection-dialog__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </BlueprintDialog>
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

  const handleClose = () => {
    if (!deleting) onClose();
  };

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
    <BlueprintDialog
      open
      title={`Delete ${row.productName}`}
      closeLabel="Close delete row"
      onClose={handleClose}
      className="collection-dialog"
      footer={
        <>
          <BlueprintButton variant="secondary" onClick={handleClose} disabled={deleting}>
            Cancel
          </BlueprintButton>
          <BlueprintButton
            variant="primary"
            onClick={handleDelete}
            disabled={deleting}
            icon={<Trash2 aria-hidden="true" strokeWidth={1.5} />}
          >
            {deleting ? 'Deleting…' : 'Delete row'}
          </BlueprintButton>
        </>
      }
    >
      <p className="collection-dialog__card-name">{row.productName}</p>
      <p className="collection-dialog__danger-note">
        <AlertTriangle aria-hidden="true" size={16} strokeWidth={1.5} />{' '}
        This removes all Normal and Foil source counts represented by this Owned
        Collection row. It does not delete catalog data, Selling Inventory, sales,
        or price history.
      </p>
      {error && (
        <p className="collection-dialog__error" role="alert">
          {error}
        </p>
      )}
    </BlueprintDialog>
  );
}
