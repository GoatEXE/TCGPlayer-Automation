import type { CardStats } from '../api/types';

interface StatsBarProps {
  stats: CardStats | null;
  loading?: boolean;
}

export function StatsBar({ stats, loading }: StatsBarProps) {
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
      <span className="stat-item">
        <strong>{stats.total}</strong> total cards
      </span>
      {stats.matched > 0 && (
        <>
          <span className="stat-divider">·</span>
          <span className="stat-item stat-matched">
            <strong>{stats.matched}</strong> ready to list
          </span>
        </>
      )}
      {stats.listed > 0 && (
        <>
          <span className="stat-divider">·</span>
          <span className="stat-item stat-listed">
            <strong>{stats.listed}</strong> listed
          </span>
        </>
      )}
      <span className="stat-divider">·</span>
      <span className="stat-item stat-gift">
        <strong>{stats.gift}</strong> gift
      </span>
      {stats.needs_attention > 0 && (
        <>
          <span className="stat-divider">·</span>
          <span className="stat-item stat-attention">
            <strong>{stats.needs_attention}</strong> needs attention
          </span>
        </>
      )}
      {stats.pending > 0 && (
        <>
          <span className="stat-divider">·</span>
          <span className="stat-item">
            <strong>{stats.pending}</strong> pending
          </span>
        </>
      )}
      {stats.error > 0 && (
        <>
          <span className="stat-divider">·</span>
          <span className="stat-item stat-error">
            <strong>{stats.error}</strong> error
          </span>
        </>
      )}
    </div>
  );
}
