import type { CardStats } from '../api/types';
import { BlueprintPanel } from '../ui';

interface StatsBarProps {
  stats: CardStats | null;
  loading?: boolean;
}

interface StatPlate {
  label: string;
  value: number;
  detail?: string;
  tone?: 'default' | 'accent' | 'attention' | 'error';
}

function getStatPlates(stats: CardStats): StatPlate[] {
  return [
    { label: 'Total cards', value: stats.total, tone: 'default' },
    { label: 'Ready to list', value: stats.matched, tone: 'accent' },
    { label: 'Listed', value: stats.listed, tone: 'accent' },
    {
      label: 'Needs review',
      value: stats.needs_attention,
      tone: 'attention',
    },
    { label: 'Pending', value: stats.pending, tone: 'default' },
    {
      label: 'Sold',
      value: stats.sold,
      detail: stats.gifted > 0 ? `${stats.gifted} gifted` : undefined,
      tone: 'default',
    },
    { label: 'Exceptions', value: stats.error, tone: 'error' },
  ];
}

export function StatsBar({ stats, loading = false }: StatsBarProps) {
  if (loading || !stats) {
    return (
      <section
        className="stats-bar stats-bar-loading"
        aria-label="Inventory metrics"
        aria-busy="true"
      >
        <span>Loading inventory metrics…</span>
      </section>
    );
  }

  return (
    <section className="stats-bar" aria-label="Inventory metrics">
      {getStatPlates(stats).map((plate) => (
        <BlueprintPanel
          key={plate.label}
          className={`stats-plate stats-plate-${plate.tone ?? 'default'}`}
          tone="surface"
        >
          <span className="stats-plate-label">{plate.label}</span>
          <strong className="stats-plate-value" data-numeric>
            {plate.value}
          </strong>
          {plate.detail ? (
            <span className="stats-plate-detail">{plate.detail}</span>
          ) : null}
        </BlueprintPanel>
      ))}
    </section>
  );
}
