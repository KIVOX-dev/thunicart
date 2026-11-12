import { formatPaise } from '@thunikart/shared';

/** A plain SVG line for daily sales. It has a text summary for screen readers. */
export function LineChart({ points, height = 120 }: { points: Array<{ date: string; total: number }>; height?: number }) {
  const w = 600;
  const max = Math.max(1, ...points.map((p) => p.total));
  const x = (i: number) => (points.length <= 1 ? 0 : (i / (points.length - 1)) * w);
  const y = (v: number) => height - 8 - (v / max) * (height - 20);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const total = points.reduce((a, p) => a + p.total, 0);
  return (
    <figure className="m-0">
      <svg role="img" aria-label={`Sales for the last ${points.length} days, ${formatPaise(total)} in all`} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        <line x1="0" x2={w} y1={height - 8} y2={height - 8} stroke="var(--color-line)" />
        <path d={`${path} L${w},${height - 8} L0,${height - 8} Z`} fill="var(--color-mist)" />
        <path d={path} fill="none" stroke="var(--color-orange)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-muted"><span>{points[0]?.date}</span><span>Best day {formatPaise(max)}</span><span>{points[points.length - 1]?.date}</span></figcaption>
    </figure>
  );
}
