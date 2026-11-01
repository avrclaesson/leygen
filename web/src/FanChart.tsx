import { useState } from 'react';
import type { YearPoint } from './lib/projection';
import { formatKr } from './lib/format';

const W = 720;
const H = 300;
const M = { top: 16, right: 96, bottom: 32, left: 64 };
const BLUE = '#256abf';

function niceTicks(max: number, count = 5) {
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** Solfjädersdiagram: median som linje, 10–90-percentil som band. */
export function FanChart({ data }: { data: YearPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxYear = data[data.length - 1].year;
  const ticks = niceTicks(Math.max(...data.map((d) => d.p90)) * 1.05);
  const yMax = ticks[ticks.length - 1];
  const x = (year: number) => M.left + (year / maxYear) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - (v / yMax) * (H - M.top - M.bottom);
  const line = (k: 'p10' | 'p50' | 'p90') => data.map((d, i) => `${i ? 'L' : 'M'}${x(d.year)},${y(d[k])}`).join(' ');
  const band = `${line('p90')} ${[...data].reverse().map((d) => `L${x(d.year)},${y(d.p10)}`).join(' ')} Z`;
  const last = data[data.length - 1];
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Månadskostnad över tid: median och 10–90-percentil">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#e6e9f0" strokeWidth={1} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="axis">
              {Math.round(t / 1000)} tkr
            </text>
          </g>
        ))}
        {data.map((d) => (
          <text key={d.year} x={x(d.year)} y={H - M.bottom + 18} textAnchor="middle" className="axis">
            {d.year === 0 ? 'Idag' : d.year}
          </text>
        ))}
        <path d={band} fill={BLUE} opacity={0.12} />
        <path d={line('p50')} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <text x={x(maxYear) + 8} y={y(last.p90)} dy="0.32em" className="label">Hög (90 %)</text>
        <text x={x(maxYear) + 8} y={y(last.p50)} dy="0.32em" className="label strong">Median</text>
        <text x={x(maxYear) + 8} y={y(last.p10)} dy="0.32em" className="label">Låg (10 %)</text>
        {h && (
          <g>
            <line x1={x(h.year)} x2={x(h.year)} y1={M.top} y2={H - M.bottom} stroke="#8a93a6" strokeWidth={1} />
            <circle cx={x(h.year)} cy={y(h.p50)} r={4} fill={BLUE} stroke="#fff" strokeWidth={2} />
          </g>
        )}
        <rect
          x={M.left}
          y={M.top}
          width={W - M.left - M.right}
          height={H - M.top - M.bottom}
          fill="transparent"
          onMouseMove={(e) => {
            const rect = (e.target as SVGRectElement).getBoundingClientRect();
            const rel = (e.clientX - rect.left) / rect.width;
            setHover(Math.max(0, Math.min(data.length - 1, Math.round(rel * maxYear))));
          }}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {h && (
        <div className="tooltip" style={{ left: `${(x(h.year) / W) * 100}%` }}>
          <strong>{h.year === 0 ? 'Idag' : `År ${h.year}`}</strong>
          <div>Hög: {formatKr(h.p90)}</div>
          <div>Median: {formatKr(h.p50)}</div>
          <div>Låg: {formatKr(h.p10)}</div>
        </div>
      )}
    </div>
  );
}
