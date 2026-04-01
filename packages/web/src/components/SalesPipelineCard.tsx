import type { OrderStatus, SalesPipelineEntry } from '../api/types';

interface SalesPipelineCardProps {
  pipeline: SalesPipelineEntry[];
  activeStatus?: OrderStatus;
  onSelectStatus?: (status: OrderStatus) => void;
}

const allStatuses: OrderStatus[] = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function SalesPipelineCard({
  pipeline,
  activeStatus,
  onSelectStatus,
}: SalesPipelineCardProps) {
  const dataByStatus = new Map(pipeline.map((e) => [e.status, e]));

  return (
    <div className="pipeline-grid" aria-label="Sales pipeline">
      {allStatuses.map((status) => {
        const entry = dataByStatus.get(status);
        const count = entry?.count ?? 0;
        const totalCents = entry?.totalCents ?? 0;
        const isActive = activeStatus === status;

        return (
          <button
            key={status}
            type="button"
            className={`pipeline-card pipeline-card-${status}${isActive ? ' pipeline-card-active' : ''}`}
            onClick={() => onSelectStatus?.(status)}
          >
            <span className="pipeline-count">{count}</span>
            <span className="pipeline-label">{status}</span>
            <span className="pipeline-total">{formatCents(totalCents)}</span>
          </button>
        );
      })}
    </div>
  );
}
