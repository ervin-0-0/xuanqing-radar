import { geoIdentity, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { useMemo, useState, type ReactNode } from "react";
import { RACE_BY_ID, type RaceId } from "../lib/types.ts";

interface Props {
  map: GeoJSON.FeatureCollection;
  fill: (id: RaceId) => string;
  selected?: RaceId | null;
  onSelect?: (id: RaceId) => void;
  tooltip?: (id: RaceId) => ReactNode;
  label?: (id: RaceId) => string | null;
}

const W = 420, H = 470;
// 小選區的標籤往外拉，避免擠在一起
const LABEL_NUDGE: Partial<Record<RaceId, [number, number]>> = {
  "hsinchu-city": [-30, -6], zhubei: [-34, -22], "chiayi-city": [-30, 0], keelung: [18, -10],
  taipei: [6, -2], "new-taipei": [18, 18], penghu: [0, 22], yilan: [14, 0], taoyuan: [-6, 0],
};

export function TaiwanMap({ map, fill, selected, onSelect, tooltip, label }: Props) {
  const [hover, setHover] = useState<{ id: RaceId; x: number; y: number; w: number } | null>(null);

  // 圖資已經是投影好的平面座標（金門、連江、澎湖排在左上），用恆等投影縮放即可
  const geo = useMemo(() => {
    const areas = map.features.filter((f) => f.id !== "_borders");
    const proj = geoIdentity().fitExtent([[6, 6], [W - 6, H - 6]], { type: "FeatureCollection", features: areas } as GeoPermissibleObjects);
    const path = geoPath(proj);
    const shapes = areas.map((f) => ({ id: f.id as RaceId, d: path(f) ?? "", c: path.centroid(f) }));
    shapes.sort((a, b) => (a.id === "zhubei" ? 1 : b.id === "zhubei" ? -1 : 0)); // 竹北畫在新竹縣上面
    const borders = map.features.filter((f) => f.id === "_borders").map((f) => path(f) ?? "");
    return { shapes, borders };
  }, [map]);

  const enter = (id: RaceId) => (e: React.PointerEvent | React.FocusEvent) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const r = svg.getBoundingClientRect();
    const pt = "clientX" in e ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: r.width / 2, y: 40 };
    setHover({ id, ...pt, w: r.width });
  };
  const common = (id: RaceId) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": RACE_BY_ID[id].name,
    onPointerMove: enter(id),
    onFocus: enter(id),
    onPointerLeave: () => setHover(null),
    onBlur: () => setHover(null),
    onClick: () => onSelect?.(id),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(id); } },
    style: { cursor: onSelect ? "pointer" : "default", outline: "none" },
  });
  const stroke = (id: RaceId) => (id === selected ? "var(--ink)" : "var(--card)");
  const sw = (id: RaceId) => (id === selected ? 2.2 : id === hover?.id ? 1.6 : 0.9);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="group" aria-label="台灣縣市地圖">
        {geo.borders.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--rule)" strokeWidth={1} />)}
        {geo.shapes.map((s) => (
          <path key={s.id} d={s.d} fill={fill(s.id)} stroke={stroke(s.id)} strokeWidth={sw(s.id)} strokeLinejoin="round" {...common(s.id)} />
        ))}
        {label &&
          geo.shapes.map((s) => {
            const t = label(s.id);
            if (!t || !Number.isFinite(s.c[0])) return null;
            const [dx, dy] = LABEL_NUDGE[s.id] ?? [0, 0];
            const x = s.c[0] + dx, y = s.c[1] + dy;
            return (
              <g key={`l-${s.id}`} pointerEvents="none">
                {(dx || dy) && Math.hypot(dx, dy) > 14 ? <line x1={s.c[0]} y1={s.c[1]} x2={x} y2={y} stroke="var(--ink-3)" strokeWidth={0.6} /> : null}
                <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={10.5} fontWeight={500}
                  fill="var(--ink)" stroke="var(--card)" strokeWidth={3} paintOrder="stroke">{t}</text>
              </g>
            );
          })}
      </svg>
      {hover && tooltip && (
        <div
          className="pointer-events-none absolute z-10 min-w-40 rounded-lg border hairline bg-card px-3 py-2 text-sm shadow-lg"
          style={{ left: hover.x + 14, top: hover.y + 14, transform: hover.x > hover.w * 0.55 ? "translateX(calc(-100% - 28px))" : undefined }}
        >
          {tooltip(hover.id)}
        </div>
      )}
    </div>
  );
}
