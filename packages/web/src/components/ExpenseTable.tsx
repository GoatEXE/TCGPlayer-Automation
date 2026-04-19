import type { Expense, ExpenseCategory, ExpenseSource } from '../api/types';
import { Pagination } from './Pagination';

interface ExpenseTableProps {
  expenses: Expense[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}

const categoryLabels: Record<ExpenseCategory, string> = {
  supplies: 'Supplies',
  shipping: 'Shipping',
  tcgplayer_fees: 'TCGplayer Fees',
  inventory_acquisition: 'Inventory Acquisition',
  other: 'Other',
};

const sourceLabels: Record<ExpenseSource, string> = {
  manual: 'Manual',
  sale_auto_estimate: 'Auto-estimate',
};

function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = `$${(abs / 100).toFixed(2)}`;
  return cents < 0 ? `-${formatted}` : formatted;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatUnitCost(expense: Expense): string {
  if (!expense.quantity || expense.quantity <= 0) {
    return '—';
  }

  const unitCostCents =
    expense.unitCostCents ?? Math.round(expense.amountCents / expense.quantity);
  const suffix = expense.unit ? ` / ${expense.unit}` : '';
  return `${formatCents(unitCostCents)}${suffix}`;
}

function formatQuantity(expense: Expense): string {
  if (!expense.quantity) {
    return '—';
  }
  return String(expense.quantity);
}

export function ExpenseTable({
  expenses,
  total,
  page,
  limit,
  onPageChange,
  onEdit,
  onDelete,
}: ExpenseTableProps) {
  return (
    <section>
      <div className="table-container">
        <table className="card-table expense-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Subcategory</th>
              <th>Description</th>
              <th className="quantity">Qty</th>
              <th className="price">Unit Cost</th>
              <th className="price">Amount</th>
              <th>Source</th>
              <th>Order ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 && (
              <tr>
                <td colSpan={10} className="table-empty">
                  No expenses recorded yet.
                </td>
              </tr>
            )}
            {expenses.map((expense) => (
              <tr key={expense.id}>
                <td
                  className="date"
                  title={new Date(expense.occurredAt).toLocaleString()}
                >
                  {formatDate(expense.occurredAt)}
                </td>
                <td>{categoryLabels[expense.category]}</td>
                <td>{expense.subcategory ?? '—'}</td>
                <td>{expense.description ?? '—'}</td>
                <td className="quantity">{formatQuantity(expense)}</td>
                <td className="price">{formatUnitCost(expense)}</td>
                <td className="price">{formatCents(expense.amountCents)}</td>
                <td>
                  <span
                    className={`sales-status expense-source-badge expense-source-${expense.source}`}
                  >
                    {sourceLabels[expense.source]}
                  </span>
                </td>
                <td>{expense.tcgplayerOrderId ?? '—'}</td>
                <td className="actions">
                  <button
                    type="button"
                    className="action-button"
                    title="Edit expense"
                    onClick={() => onEdit(expense)}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="action-button delete"
                    title="Delete expense"
                    onClick={() => onDelete(expense)}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={page}
        totalItems={total}
        itemsPerPage={limit}
        onPageChange={onPageChange}
      />
    </section>
  );
}
