import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreateExpenseRequest,
  Expense,
  ExpenseCategory,
  UpdateExpenseRequest,
} from '../api/types';

interface ExpenseFormModalProps {
  expense?: Expense;
  onSubmit: (data: CreateExpenseRequest | UpdateExpenseRequest) => Promise<void>;
  onClose: () => void;
}

const categoryOptions: Array<{ value: ExpenseCategory; label: string }> = [
  { value: 'supplies', label: 'Supplies' },
  { value: 'shipping', label: 'Shipping' },
  { value: 'tcgplayer_fees', label: 'TCGplayer Fees' },
  { value: 'inventory_acquisition', label: 'Inventory Acquisition' },
  { value: 'other', label: 'Other' },
];

function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = `$${(abs / 100).toFixed(2)}`;
  return cents < 0 ? `-${formatted}` : formatted;
}

/** Convert a Date to `YYYY-MM-DDTHH:mm` for datetime-local input */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ExpenseFormModal({
  expense,
  onSubmit,
  onClose,
}: ExpenseFormModalProps) {
  const isEdit = Boolean(expense);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [subcategory, setSubcategory] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => toDatetimeLocal(new Date()));
  const [isEstimate, setIsEstimate] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    backdropRef.current?.focus();
  }, []);

  useEffect(() => {
    setAmount(expense ? (expense.amountCents / 100).toFixed(2) : '');
    setCategory(expense?.category ?? '');
    setSubcategory(expense?.subcategory ?? '');
    setDescription(expense?.description ?? '');
    setQuantity(expense?.quantity?.toString() ?? '');
    setUnit(expense?.unit ?? '');
    setOccurredAt(
      expense ? toDatetimeLocal(new Date(expense.occurredAt)) : toDatetimeLocal(new Date()),
    );
    setIsEstimate(expense?.isEstimate ?? false);
  }, [expense]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, saving]);

  const computedUnitCost = useMemo(() => {
    const parsedAmount = Number.parseFloat(amount);
    const parsedQuantity = Number.parseInt(quantity, 10);

    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity <= 0
    ) {
      return null;
    }

    return Math.round((parsedAmount * 100) / parsedQuantity);
  }, [amount, quantity]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !saving) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    if (!category) {
      setError('Category is required');
      return;
    }

    let parsedQuantity: number | undefined;
    if (quantity.trim() !== '') {
      const q = Number.parseInt(quantity, 10);
      if (!Number.isInteger(q) || q <= 0) {
        setError('Quantity must be a positive integer');
        return;
      }
      parsedQuantity = q;
    }

    setSaving(true);

    const payload: CreateExpenseRequest = {
      amountCents: Math.round(parsedAmount * 100),
      category,
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      description: description.trim() ? description.trim() : null,
      subcategory: subcategory.trim() ? subcategory.trim() : null,
      quantity: parsedQuantity,
      unit: unit.trim() ? unit.trim() : null,
      isEstimate,
    };

    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={backdropRef}
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit expense' : 'Create expense'}
      tabIndex={-1}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2>{isEdit ? '✏️ Edit Expense' : '➕ Create Expense'}</h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="sale-form" noValidate>
          <div className="sale-field">
            <label htmlFor="expense-amount">Amount ($)</label>
            <input
              id="expense-amount"
              type="number"
              min={0.01}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saving}
              className="sale-input"
            />
          </div>

          <div className="sale-field">
            <label htmlFor="expense-category">Category</label>
            <select
              id="expense-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')}
              disabled={saving}
              className="shipment-select"
            >
              <option value="">— Select Category —</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sale-field">
            <label htmlFor="expense-subcategory">Subcategory</label>
            <input
              id="expense-subcategory"
              type="text"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              disabled={saving}
              className="sale-input"
              placeholder="Optional"
            />
          </div>

          <div className="sale-field">
            <label htmlFor="expense-description">Description</label>
            <textarea
              id="expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              className="sale-textarea"
              rows={2}
              placeholder="Optional"
            />
          </div>

          <div className="sale-field">
            <label htmlFor="expense-quantity">Quantity</label>
            <input
              id="expense-quantity"
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={saving}
              className="sale-input"
              placeholder="Optional"
            />
          </div>

          <div className="sale-field">
            <label htmlFor="expense-unit">Unit</label>
            <input
              id="expense-unit"
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={saving}
              className="sale-input"
              placeholder="Optional"
            />
          </div>

          <div className="sale-field">
            <label htmlFor="expense-date">Date</label>
            <input
              id="expense-date"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              disabled={saving}
              className="sale-input"
            />
          </div>

          <div className="sale-field">
            <label htmlFor="expense-estimate">
              <input
                id="expense-estimate"
                type="checkbox"
                checked={isEstimate}
                onChange={(e) => setIsEstimate(e.target.checked)}
                disabled={saving}
              />{' '}
              Mark as estimate
            </label>
          </div>

          {computedUnitCost !== null && (
            <div className="sale-total">
              <span>Per-unit cost:</span>
              <strong>{formatCents(computedUnitCost)}</strong>
            </div>
          )}

          {error && (
            <span className="interval-error" role="alert">
              {error}
            </span>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? '⏳ Saving…' : '💾 Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
