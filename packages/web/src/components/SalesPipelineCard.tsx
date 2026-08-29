import {
  Ban,
  BadgeCheck,
  Clock3,
  PackageCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { OrderStatus, SalesPipelineEntry } from '../api/types';
import { BlueprintButton } from '../ui';

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

const statusIcons: Record<OrderStatus, LucideIcon> = {
  pending: Clock3,
  confirmed: BadgeCheck,
  shipped: Truck,
  delivered: PackageCheck,
  cancelled: Ban,
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function SalesPipelineCard({
  pipeline,
  activeStatus,
  onSelectStatus,
}: SalesPipelineCardProps) {
  const dataByStatus = new Map(pipeline.map((entry) => [entry.status, entry]));

  return (
    <div className="pipeline-grid commerce-pipeline" aria-label="Sales pipeline">
      {allStatuses.map((status) => {
        const entry = dataByStatus.get(status);
        const count = entry?.count ?? 0;
        const totalCents = entry?.totalCents ?? 0;
        const isActive = activeStatus === status;
        const Icon = statusIcons[status];

        return (
          <BlueprintButton
            key={status}
            className={`pipeline-card pipeline-card-${status}${isActive ? ' pipeline-card-active' : ''}`}
            icon={<Icon size={18} strokeWidth={1.6} />}
            onClick={() => onSelectStatus?.(status)}
            aria-pressed={isActive}
          >
            <span className="pipeline-count" data-numeric>
              {count}
            </span>
            <span className="pipeline-label">{status}</span>
            <span className="pipeline-total" data-numeric>
              {formatCents(totalCents)}
            </span>
          </BlueprintButton>
        );
      })}
    </div>
  );
}
