import type { SalesStats } from '../api/types';

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
      <div className="stats-bar">
        <span>Loading stats...</span>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="stats-bar">
      <span className="stat-item stat-listed">
        <strong>{stats.totalListedCount}</strong> total listed
      </span>
      <span className="stat-divider">·</span>
      <span className="stat-item stat-listed">
        <strong>{formatCents(stats.totalRevenueCents)}</strong> revenue
      </span>
      <span className="stat-divider">·</span>
      <span className="stat-item">
        <strong>{formatCents(stats.averageSaleCents)}</strong> avg sale
      </span>
      <span className="stat-divider">·</span>
      <span className="stat-item stat-gift">
        <strong>{stats.activeListingCount}</strong> active listings
      </span>
    </div>
  );
}
