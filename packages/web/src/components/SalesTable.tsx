import type { Sale } from '../api/types';

interface SalesTableProps {
  sales: Sale[];
  loading: boolean;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function SalesTable({ sales, loading }: SalesTableProps) {
  return (
    <div className="table-container">
      <table className="card-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Card</th>
            <th>Set</th>
            <th className="quantity">Qty</th>
            <th className="price">Price</th>
            <th>Buyer</th>
            <th>Order ID</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={8} className="table-loading">
                Loading sales…
              </td>
            </tr>
          )}
          {!loading && sales.length === 0 && (
            <tr>
              <td colSpan={8} className="table-empty">
                No sales recorded yet.
              </td>
            </tr>
          )}
          {!loading &&
            sales.map((sale) => (
              <tr key={sale.id}>
                <td
                  className="date"
                  title={new Date(sale.soldAt).toLocaleString()}
                >
                  {formatDate(sale.soldAt)}
                </td>
                <td className="card-name">{sale.cardProductName ?? '—'}</td>
                <td>{sale.cardSetName ?? '—'}</td>
                <td className="quantity">{sale.quantitySold}</td>
                <td className="price">{formatCents(sale.salePriceCents)}</td>
                <td>{sale.buyerName ?? '—'}</td>
                <td>{sale.tcgplayerOrderId ?? '—'}</td>
                <td>
                  <span
                    className={`sales-status sales-status-${sale.orderStatus}`}
                  >
                    {sale.orderStatus}
                  </span>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
