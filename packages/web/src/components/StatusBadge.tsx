import type { Card } from '../api/types';

interface StatusBadgeProps {
  status: Card['status'];
}

const STATUS_CONFIG = {
  pending: { label: 'Pending' },
  matched: { label: 'Ready to List' },
  listed: { label: 'Listed' },
  gifted: { label: 'Gifted' },
  needs_attention: { label: 'Needs Attention' },
  sold: { label: 'Sold' },
  error: { label: 'Error' },
} as const;

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <span
      className={`inventory-status-badge inventory-status-badge--${status}`}
      data-status={status}
    >
      {config.label}
    </span>
  );
}
