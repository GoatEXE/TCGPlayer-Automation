import { Pencil, PlusCircle, Save, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CreateExpenseRequest,
  Expense,
  ExpenseCategory,
  UpdateExpenseRequest,
} from '../api/types';
import {
  BlueprintButton,
  BlueprintDialog,
  BlueprintInput,
  BlueprintRegistrationMarks,
} from '../ui';

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

/** Convert a Date to `YYYY-MM-DDTHH:mm` for datetime-local input. */
function toDatetimeLocal(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

  useEffect(() => {
    setAmount(expense ? (expense.amountCents / 100).toFixed(2) : '');
    setCategory(expense?.category ?? '');
    setSubcategory(expense?.subcategory ?? '');
    setDescription(expense?.description ?? '');
    setQuantity(expense?.quantity?.toString() ?? '');
    setUnit(expense?.unit ?? '');
    setOccurredAt(
      expense
        ? toDatetimeLocal(new Date(expense.occurredAt))
        : toDatetimeLocal(new Date()),
    );
    setIsEstimate(expense?.isEstimate ?? false);
  }, [expense]);

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

  const requestClose = useCallback(() => {
    if (!saving) onClose();
  }, [onClose, saving]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      const parsed = Number.parseInt(quantity, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setError('Quantity must be a positive integer');
        return;
      }
      parsedQuantity = parsed;
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
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to save expense',
      );
    } finally {
      setSaving(false);
    }
  };

  const title = (
    <>
      {isEdit ? (
        <Pencil size={19} strokeWidth={1.6} aria-hidden="true" />
      ) : (
        <PlusCircle size={19} strokeWidth={1.6} aria-hidden="true" />
      )}{' '}
      {isEdit ? 'Edit Expense' : 'Create Expense'}
    </>
  );

  return (
    <BlueprintDialog
      open
      title={title}
      onClose={requestClose}
      closeLabel="Close expense form"
      className={`commerce-expense-dialog${saving ? ' commerce-dialog-saving' : ''}`}
      footer={
        <>
          <BlueprintButton
            variant="secondary"
            onClick={requestClose}
            disabled={saving}
            icon={<X size={16} strokeWidth={1.75} />}
          >
            Cancel
          </BlueprintButton>
          <BlueprintButton
            type="submit"
            form="expense-form"
            variant="primary"
            disabled={saving}
            icon={<Save size={16} strokeWidth={1.75} />}
          >
            {saving ? 'Saving…' : 'Save Expense'}
          </BlueprintButton>
        </>
      }
    >
      <form
        id="expense-form"
        onSubmit={handleSubmit}
        className="commerce-expense-form"
        noValidate
      >
        <BlueprintInput
          id="expense-amount"
          label="Amount ($)"
          type="number"
          min={0.01}
          step={0.01}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          disabled={saving}
          inputMode="decimal"
        />

        <div className="commerce-dialog-field">
          <label htmlFor="expense-category">Category</label>
          <div className="industry-blueprint commerce-dialog-select-frame">
            <select
              id="expense-category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as ExpenseCategory | '')
              }
              disabled={saving}
            >
              <option value="">— Select Category —</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <BlueprintRegistrationMarks />
          </div>
        </div>

        <BlueprintInput
          id="expense-subcategory"
          label="Subcategory"
          type="text"
          value={subcategory}
          onChange={(event) => setSubcategory(event.target.value)}
          disabled={saving}
          placeholder="Optional"
        />

        <div className="commerce-dialog-field commerce-dialog-field--wide">
          <label htmlFor="expense-description">Description</label>
          <div className="industry-blueprint commerce-dialog-select-frame">
            <textarea
              id="expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
              rows={2}
              placeholder="Optional"
            />
            <BlueprintRegistrationMarks />
          </div>
        </div>

        <BlueprintInput
          id="expense-quantity"
          label="Quantity"
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          disabled={saving}
          placeholder="Optional"
          inputMode="numeric"
        />

        <BlueprintInput
          id="expense-unit"
          label="Unit"
          type="text"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          disabled={saving}
          placeholder="Optional"
        />

        <BlueprintInput
          id="expense-date"
          label="Date"
          type="datetime-local"
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.target.value)}
          disabled={saving}
        />

        <label className="commerce-expense-estimate" htmlFor="expense-estimate">
          <input
            id="expense-estimate"
            type="checkbox"
            checked={isEstimate}
            onChange={(event) => setIsEstimate(event.target.checked)}
            disabled={saving}
          />
          Mark as estimate
        </label>

        {computedUnitCost !== null && (
          <div className="commerce-expense-unit-cost">
            <span>Per-unit cost:</span>
            <strong data-numeric>{formatCents(computedUnitCost)}</strong>
          </div>
        )}

        {error && (
          <p className="industry-field__error commerce-expense-form-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </BlueprintDialog>
  );
}
