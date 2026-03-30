import type { Card } from '../api/types';

interface StatusBadgeProps {
  status: Card['status'];
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: '#6b7280' },
  matched: { label: 'Ready to List', color: '#8b5cf6' },
  listed: { label: 'Listed', color: '#10b981' },
  gift: { label: 'Gift', color: '#3b82f6' },
  needs_attention: { label: 'Needs Attention', color: '#f59e0b' },
  error: { label: 'Error', color: '#ef4444' },
} as const;

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        color: 'white',
        backgroundColor: config.color,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {config.label}
    </span>
  );
}
