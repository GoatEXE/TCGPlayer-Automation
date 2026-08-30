import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Expense, ExpenseCategory, ExpenseSource } from '../api/types';
import { useContainerResponsiveMode } from '../hooks/useContainerResponsiveMode';
import {
  BlueprintButton,
  BlueprintPanel,
  BlueprintRegistrationMarks,
} from '../ui';
import { MeasuredHeight } from './MeasuredHeight';
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
  const containerRef = useRef<HTMLElement>(null);
  const mode = useContainerResponsiveMode(containerRef);
  const [expandedExpenseId, setExpandedExpenseId] = useState<number | null>(
    null,
  );

  const renderActions = (expense: Expense) => (
    <div className="commerce-expense-actions">
      <BlueprintButton
        className="action-button"
        title="Edit expense"
        aria-label="Edit expense"
        icon={<Pencil size={15} strokeWidth={1.75} />}
        onClick={() => onEdit(expense)}
      />
      <BlueprintButton
        className="action-button delete commerce-delete-button"
        title="Delete expense"
        aria-label="Delete expense"
        icon={<Trash2 size={15} strokeWidth={1.75} />}
        onClick={() => onDelete(expense)}
      />
    </div>
  );

  return (
    <section ref={containerRef} className="commerce-expense-table">
      {mode === 'phone' ? (
        <div className="commerce-mobile-list">
          {expenses.length === 0 ? (
            <BlueprintPanel className="commerce-metric-loading">
              No expenses recorded yet.
            </BlueprintPanel>
          ) : (
            expenses.map((expense) => {
              const isExpanded = expandedExpenseId === expense.id;
              const label = categoryLabels[expense.category];

              return (
                <article
                  key={expense.id}
                  className="industry-blueprint commerce-mobile-expense"
                  aria-label={`${label} expense`}
                >
                  <div className="commerce-mobile-expense-header">
                    <div className="commerce-mobile-expense-identity">
                      <span className="commerce-mobile-expense-category">
                        {label}
                      </span>
                      <span className="commerce-mobile-expense-date">
                        {formatDate(expense.occurredAt)}
                      </span>
                    </div>
                    <strong className="commerce-mobile-total" data-numeric>
                      {formatCents(expense.amountCents)}
                    </strong>
                  </div>

                  <p className="commerce-mobile-expense-description">
                    {expense.description ?? expense.subcategory ?? 'No description'}
                  </p>

                  <button
                    type="button"
                    className="commerce-mobile-order-expand"
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label} expense details`}
                    aria-expanded={isExpanded}
                    aria-controls={`expense-details-${expense.id}`}
                    onClick={() =>
                      setExpandedExpenseId((current) =>
                        current === expense.id ? null : expense.id,
                      )
                    }
                  >
                    {isExpanded ? 'Hide details' : 'View details'}
                    <ChevronRight
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </button>

                  <div
                    id={`expense-details-${expense.id}`}
                    aria-hidden={!isExpanded}
                  >
                    <MeasuredHeight
                      open={isExpanded}
                      className="commerce-mobile-details"
                      contentClassName="commerce-mobile-details-content"
                      inert={!isExpanded}
                    >
                      <dl className="commerce-mobile-grid">
                        <div>
                          <dt>Subcategory</dt>
                          <dd>{expense.subcategory ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Quantity</dt>
                          <dd data-numeric>{formatQuantity(expense)}</dd>
                        </div>
                        <div>
                          <dt>Unit cost</dt>
                          <dd data-numeric>{formatUnitCost(expense)}</dd>
                        </div>
                        <div>
                          <dt>Source</dt>
                          <dd>
                            <span
                              className={`sales-status expense-source-badge expense-source-${expense.source}`}
                            >
                              {sourceLabels[expense.source]}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt>Order ID</dt>
                          <dd>{expense.tcgplayerOrderId ?? '—'}</dd>
                        </div>
                      </dl>
                    </MeasuredHeight>
                  </div>

                  {renderActions(expense)}
                  <BlueprintRegistrationMarks />
                </article>
              );
            })
          )}
        </div>
      ) : (
        <BlueprintPanel className="commerce-expense-table-panel">
          <div className="table-container">
            <table className="card-table expense-table commerce-expenses-table">
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
                    <td className="quantity" data-numeric>
                      {formatQuantity(expense)}
                    </td>
                    <td className="price" data-numeric>
                      {formatUnitCost(expense)}
                    </td>
                    <td className="price" data-numeric>
                      {formatCents(expense.amountCents)}
                    </td>
                    <td>
                      <span
                        className={`sales-status expense-source-badge expense-source-${expense.source}`}
                      >
                        {sourceLabels[expense.source]}
                      </span>
                    </td>
                    <td>{expense.tcgplayerOrderId ?? '—'}</td>
                    <td className="actions">{renderActions(expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BlueprintPanel>
      )}

      <Pagination
        currentPage={page}
        totalItems={total}
        itemsPerPage={limit}
        onPageChange={onPageChange}
      />
    </section>
  );
}
