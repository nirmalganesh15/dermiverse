import { format, parseISO } from "date-fns";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { rupees, rupeesShort } from "../lib/format";

const MARK = "var(--color-gold-600)"; // validated: passes 3:1 against white
const MARK_SOFT = "var(--color-gold-300)";

function niceMax(v: number) {
  if (v <= 0) return 1000;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}
const compact = (v: number) =>
  v >= 1e5 ? `₹${(v / 1e5).toFixed(v % 1e5 ? 1 : 0)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `₹${v}`;

/** Single-series daily column chart with per-column hover tooltip and an accessible table equivalent. */
export function DailyColumns({
  data,
  label,
  height = 220,
  highlightLast = true,
}: {
  data: { date: string; value: number }[];
  label: string;
  height?: number;
  highlightLast?: boolean;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 0)), [data]);
  // Draw at the container's real width so text and bar sizes stay constant (no viewBox scaling).
  const boxRef = useRef<HTMLElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const padL = 46, padR = 8, padT = 22, padB = 26;
  const plotW = W - padL - padR;
  const plotH = height - padT - padB;
  const band = plotW / Math.max(data.length, 1);
  const barW = Math.min(24, band * 0.62);
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(4, Math.floor(plotW / 56))));
  const last = data.length - 1;

  return (
    <figure ref={boxRef} className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} className="block max-w-full" role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>{label}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-ink-3)" className="t-num">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + band * i + band / 2;
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * plotH);
          const top = padT + plotH - h;
          const r = Math.min(4, h);
          const isLast = highlightLast && i === last;
          const fill = hover === null || hover === i ? MARK : MARK_SOFT;
          return (
            <g key={d.date}>
              {h > 0 && (
                <path
                  d={`M${cx - barW / 2},${padT + plotH} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${padT + plotH} Z`}
                  fill={fill}
                />
              )}
              {isLast && d.value > 0 && hover === null && (
                <text x={cx} y={top - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-ink)" className="t-num">
                  {compact(Math.round(d.value))}
                </text>
              )}
              {i % labelEvery === (last % labelEvery) && (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={isLast ? "var(--color-ink)" : "var(--color-ink-3)"} fontWeight={isLast ? 600 : 400}>
                  {isLast && highlightLast ? "Today" : format(parseISO(d.date), data.length > 16 ? "d MMM" : "d")}
                </text>
              )}
              {/* Hit target: the whole band, taller than the mark */}
              <rect
                x={padL + band * i}
                y={padT}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-white px-3 py-2 text-[0.82rem] shadow-[var(--shadow-pop)]"
          style={{ left: `${((padL + band * hover + band / 2) / W) * 100}%`, top: 0 }}
        >
          <div className="text-ink-3">{format(parseISO(data[hover].date), "EEE, d MMM")}</div>
          <div className="t-num font-semibold text-ink">{rupees(data[hover].value)}</div>
        </div>
      )}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{format(parseISO(d.date), "d MMM yyyy")}</td>
              <td>{rupeesShort(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Horizontal magnitude bars with the value at the tip (single hue, text in ink). */
export function HBars({ rows, empty = "Nothing to show yet." }: { rows: { label: string; value: number; note?: string }[]; empty?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (max <= 0) return <p className="text-[0.92rem] text-ink-3">{empty}</p>;
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[0.9rem]">
            <span className="truncate font-medium">{r.label}</span>
            <span className="t-num shrink-0 font-semibold">
              {rupees(r.value)}
              {r.note && <span className="ml-1.5 font-normal text-ink-3">{r.note}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-cream" aria-hidden>
            <div className="h-2 rounded-full" style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%`, background: MARK }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
