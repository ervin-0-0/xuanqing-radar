import { useMemo, useRef, useState, type ReactNode } from "react";
import { useInView } from "../lib/motion.ts";

export interface Series {
  key: string;
  label: string;
  color: string;
  points: { x: string; y: number }[];
  dashed?: boolean;
  /** 不確定區間（上下界） */
  band?: { x: string; lo: number; hi: number }[];
}
export interface Dot { x: string; y: number; color: string; key: string; hollow?: boolean; title?: ReactNode }

interface Props {
  series: Series[];
  dots?: Dot[];
  yDomain: [number, number];
  yTicks: number[];
  yFormat?: (v: number) => string;
  xDomain?: [string, string];
  height?: number;
  /** 垂直參考線，例如投票日、今天 */
  markers?: { x: string; label: string }[];
  /** 水平參考線，例如 50% */
  refY?: number;
  onDotClick?: (key: string) => void;
}

const t = (d: string) => Date.parse(d);
const M = { l: 36, r: 12, t: 10, b: 24 };

export function LineChart({ series, dots = [], yDomain, yTicks, yFormat = (v) => `${v}`, xDomain, height = 220, markers = [], refY, onDotClick }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const view = useInView<HTMLDivElement>();
  const [hx, setHx] = useState<number | null>(null);
  const [hDot, setHDot] = useState<Dot | null>(null);
  const W = 640, H = height;

  const { x0, x1, xs, ys, yearly, xTicks } = useMemo(() => {
    const all = [...series.flatMap((s) => s.points.map((p) => t(p.x))), ...dots.map((d) => t(d.x)), ...markers.map((m) => t(m.x))];
    const x0 = xDomain ? t(xDomain[0]) : Math.min(...all);
    const x1 = xDomain ? t(xDomain[1]) : Math.max(...all);
    const xs = (v: number) => M.l + ((v - x0) / Math.max(1, x1 - x0)) * (W - M.l - M.r);
    const ys = (v: number) => M.t + (1 - (v - yDomain[0]) / (yDomain[1] - yDomain[0])) * (H - M.t - M.b);
    // 跨三年以上用年份刻度，否則每月 1 號一個；太擠就間隔
    const yearly = x1 - x0 > 3 * 365 * 86_400_000;
    const ticks: number[] = [];
    const d = new Date(x0); d.setUTCDate(1);
    if (yearly) { d.setUTCMonth(0); d.setUTCFullYear(d.getUTCFullYear() + 1); } else d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() <= x1) {
      ticks.push(d.getTime());
      if (yearly) d.setUTCFullYear(d.getUTCFullYear() + 1); else d.setUTCMonth(d.getUTCMonth() + 1);
    }
    const step = Math.ceil(ticks.length / 7);
    return { x0, x1, xs, ys, yearly, xTicks: ticks.filter((_, i) => i % step === 0) };
  }, [series, dots, markers, xDomain, yDomain, H]);

  const line = (pts: { x: string; y: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${xs(t(p.x)).toFixed(1)},${ys(p.y).toFixed(1)}`).join("");
  const band = (b: NonNullable<Series["band"]>) =>
    b.map((p, i) => `${i ? "L" : "M"}${xs(t(p.x)).toFixed(1)},${ys(p.hi).toFixed(1)}`).join("") +
    [...b].reverse().map((p) => `L${xs(t(p.x)).toFixed(1)},${ys(p.lo).toFixed(1)}`).join("") + "Z";

  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const v = x0 + ((px - M.l) / (W - M.l - M.r)) * (x1 - x0);
    setHx(v >= x0 && v <= x1 ? v : null);
  };

  // 十字線：每條線取最接近 hx 的點
  const nearest = hx == null ? [] : series.map((s) => {
    let best = s.points[0], bd = Infinity;
    for (const p of s.points) { const dd = Math.abs(t(p.x) - hx); if (dd < bd) { bd = dd; best = p; } }
    return best ? { s, p: best } : null;
  }).filter((x): x is { s: Series; p: { x: string; y: number } } => !!x);
  const hxSnap = nearest[0] ? t(nearest[0].p.x) : hx;

  return (
    <div className="relative" ref={view.ref}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-pan-y" onPointerMove={move} onPointerLeave={() => setHx(null)}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={ys(v)} y2={ys(v)} stroke="var(--rule)" strokeWidth={v === refY ? 1.2 : 0.7} strokeDasharray={v === refY ? undefined : "2 3"} />
            <text x={M.l - 6} y={ys(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--ink-3)" className="num">{yFormat(v)}</text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={v} x={xs(v)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--ink-3)" className="num">{tickLabel(v, yearly, x1 - x0 > 300 * 86_400_000)}</text>
        ))}
        {markers.map((m) => (
          <g key={m.label}>
            <line x1={xs(t(m.x))} x2={xs(t(m.x))} y1={M.t} y2={H - M.b} stroke="var(--ink-3)" strokeDasharray="3 3" strokeWidth={0.8} />
            <text x={xs(t(m.x)) - 4} y={M.t + 8} textAnchor="end" fontSize={10} fill="var(--ink-3)">{m.label}</text>
          </g>
        ))}
        {series.map((s) => s.band && <path key={`b-${s.key}`} d={band(s.band)} fill={s.color} opacity={0.12} />)}
        {dots.map((d) => (
          <circle key={d.key} cx={xs(t(d.x))} cy={ys(d.y)} r={4.5} fill={d.hollow ? "var(--card)" : d.color} fillOpacity={d.hollow ? 1 : 0.55}
            stroke={d.color} strokeWidth={1.4} onPointerEnter={() => setHDot(d)} onPointerLeave={() => setHDot(null)}
            onClick={() => onDotClick?.(d.key)} style={{ cursor: onDotClick ? "pointer" : "default" }} />
        ))}
        {series.map((s) => (
          <path key={s.key} d={line(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            strokeDasharray={s.dashed ? "5 4" : undefined} className={!s.dashed ? (view.seen ? "draw-in" : "draw-wait") : undefined} pathLength={s.dashed ? undefined : 1} />
        ))}
        {hxSnap != null && !hDot && (
          <g pointerEvents="none">
            <line x1={xs(hxSnap)} x2={xs(hxSnap)} y1={M.t} y2={H - M.b} stroke="var(--ink-2)" strokeWidth={0.8} />
            {nearest.map(({ s, p }) => <circle key={s.key} cx={xs(t(p.x))} cy={ys(p.y)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hDot?.title ? (
        <Tip x={(xs(t(hDot.x)) / W) * 100} y={(ys(hDot.y) / H) * 100}>{hDot.title}</Tip>
      ) : hxSnap != null && nearest.length ? (
        <Tip x={(xs(hxSnap) / W) * 100} y={10}>
          <div className="mb-1 text-xs text-ink-3 num">{nearest[0].p.x}</div>
          {[...nearest].sort((a, b) => b.p.y - a.p.y).map(({ s, p }) => (
            <div key={s.key} className="flex items-center gap-2 text-sm">
              <span className="inline-block h-0.5 w-3" style={{ background: s.color }} />
              <span className="text-ink-2">{s.label}</span>
              <span className="num ml-auto font-semibold text-ink">{yFormat(Math.round(p.y * 10) / 10)}</span>
            </div>
          ))}
        </Tip>
      ) : null}
    </div>
  );
}

/** 跨年的月刻度在 1 月標年份，避免 2025、2026 的同月份看不出差別 */
function tickLabel(v: number, yearly: boolean, multiYear: boolean) {
  const d = new Date(v);
  if (yearly) return `${d.getUTCFullYear()}`;
  return multiYear && d.getUTCMonth() === 0 ? `${d.getUTCFullYear()}` : `${d.getUTCMonth() + 1}月`;
}

function Tip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 min-w-36 rounded-lg border hairline bg-card px-3 py-2 shadow-lg"
      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(${x > 60 ? "calc(-100% - 12px)" : "12px"}, 0)` }}>
      {children}
    </div>
  );
}
