import {
  ChartNoAxesCombined,
  CircleDollarSign,
  ListChecks,
  RadioTower,
} from 'lucide-react';
import type { SalesStats } from '../api/types';
import { BlueprintPanel } from '../ui';

interface SalesStatsBarProps {
  stats: SalesStats | null;
  loading?: boolean;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function SalesStatsBar({ stats, loading }: SalesStatsBarProps) {
  if (loading) {
    return (
      <BlueprintPanel className="stats-bar commerce-sales-metrics">
        <span className="commerce-metric-loading">Loading stats...</span>
      </BlueprintPanel>
    );
  }

  if (!stats) {
    return null;
  }

  const metrics = [
    {
      icon: <ListChecks size={19} strokeWidth={1.6} aria-hidden="true" />,
      label: 'total listed',
      value: stats.totalListedCount,
    },
    {
      icon: (
        <CircleDollarSign size={19} strokeWidth={1.6} aria-hidden="true" />
      ),
      label: 'revenue',
      value: formatCents(stats.totalRevenueCents),
    },
    {
      icon: (
        <ChartNoAxesCombined size={19} strokeWidth={1.6} aria-hidden="true" />
      ),
      label: 'avg sale',
      value: formatCents(stats.averageSaleCents),
    },
    {
      icon: <RadioTower size={19} strokeWidth={1.6} aria-hidden="true" />,
      label: 'active listings',
      value: stats.activeListingCount,
    },
  ];

  return (
    <BlueprintPanel className="stats-bar commerce-sales-metrics">
      {metrics.map((metric) => (
        <span key={metric.label} className="stat-item commerce-sales-metric">
          <span className="commerce-sales-metric__icon">{metric.icon}</span>
          <span>
            <strong data-numeric>{metric.value}</strong>
            <span className="commerce-sales-metric__label">
              {metric.label}
            </span>
          </span>
        </span>
      ))}
    </BlueprintPanel>
  );
}
