import type { PriceHistoryEntry } from '../api/types';

interface PriceHistoryChartProps {
  history: PriceHistoryEntry[];
}

interface ChartPoint {
  date: Date;
  price: number;
}

const SVG_WIDTH = 560;
const SVG_HEIGHT = 140;
const PADDING = { top: 16, right: 16, bottom: 24, left: 48 };
const MAX_POINTS = 10;
const DOT_RADIUS = 4;

function toChartPoints(history: PriceHistoryEntry[]): ChartPoint[] {
  return history
    .filter((e) => e.newMarketPrice !== null)
    .map((e) => ({
      date: new Date(e.checkedAt),
      price: parseFloat(e.newMarketPrice!),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(-MAX_POINTS);
}

function formatPrice(cents: number): string {
  return `$${cents.toFixed(2)}`;
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function PriceHistoryChart({ history }: PriceHistoryChartProps) {
  const points = toChartPoints(history);

  if (points.length === 0) {
    return (
      <div className="price-chart-empty">
        <p>No chart data available</p>
      </div>
    );
  }

  const prices = points.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  // Add 10% padding to y range, or a small fixed amount if flat
  const yRange = maxPrice - minPrice;
  const yPad = yRange > 0 ? yRange * 0.1 : 0.01;
  const yMin = minPrice - yPad;
  const yMax = maxPrice + yPad;

  const plotW = SVG_WIDTH - PADDING.left - PADDING.right;
  const plotH = SVG_HEIGHT - PADDING.top - PADDING.bottom;

  const xScale = (i: number) =>
    PADDING.left +
    (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yScale = (price: number) =>
    PADDING.top + plotH - ((price - yMin) / (yMax - yMin)) * plotH;

  const coords = points.map((p, i) => ({
    x: xScale(i),
    y: yScale(p.price),
    price: p.price,
    date: p.date,
  }));

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');

  // Y-axis labels: min and max (plus mid if enough room)
  const yLabels: { price: number; y: number }[] = [
    { price: minPrice, y: yScale(minPrice) },
    { price: maxPrice, y: yScale(maxPrice) },
  ];
  if (yRange > 0) {
    const mid = (minPrice + maxPrice) / 2;
    yLabels.splice(1, 0, { price: mid, y: yScale(mid) });
  }

  // X-axis: first and last date labels
  const xLabels: { label: string; x: number }[] = [];
  if (points.length >= 1) {
    xLabels.push({ label: formatDateLabel(points[0].date), x: coords[0].x });
  }
  if (points.length >= 2) {
    xLabels.push({
      label: formatDateLabel(points[points.length - 1].date),
      x: coords[coords.length - 1].x,
    });
  }

  return (
    <div className="price-chart-container">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="price-chart-svg"
        role="img"
        aria-label="Market price trend chart"
      >
        {/* Grid lines */}
        {yLabels.map((yl, i) => (
          <line
            key={i}
            x1={PADDING.left}
            y1={yl.y}
            x2={SVG_WIDTH - PADDING.right}
            y2={yl.y}
            className="chart-grid-line"
          />
        ))}

        {/* Polyline */}
        {coords.length > 1 && (
          <polyline points={polylinePoints} className="chart-line" />
        )}

        {/* Dots */}
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={DOT_RADIUS}
            className="chart-dot"
          >
            <title>
              {formatPrice(c.price)} — {formatDateLabel(c.date)}
            </title>
          </circle>
        ))}

        {/* Y-axis labels */}
        {yLabels.map((yl, i) => (
          <text
            key={`y-${i}`}
            x={PADDING.left - 6}
            y={yl.y}
            className="chart-y-label"
            textAnchor="end"
            dominantBaseline="middle"
          >
            {formatPrice(yl.price)}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((xl, i) => (
          <text
            key={`x-${i}`}
            x={xl.x}
            y={SVG_HEIGHT - 4}
            className="chart-x-label"
            textAnchor="middle"
          >
            {xl.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
