import { useState } from "react";
import { useTween } from "../lib/motion.ts";
import type { Forecast } from "../lib/model.ts";
import { PARTY_FILL, PARTY_VAR } from "../lib/format.ts";
import { PARTY_NAME, type Party } from "../lib/types.ts";

const SHOW: Party[] = ["kmt", "dpp", "tpp", "ind"];

/** 22 席橫條：各黨期望席次，中間標 11 席線 */
export function SeatBar({ f }: { f: Forecast }) {
  const total = 22;
  const parts = SHOW.map((p) => ({ p, v: f.seats.expected[p] })).filter((x) => x.v > 0.05);
  const order: Party[] = ["kmt", "tpp", "ind", "dpp"];
  parts.sort((a, b) => order.indexOf(a.p) - order.indexOf(b.p));
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        {(["kmt", "dpp"] as const).map((p) => (
          <div key={p} className={p === "dpp" ? "text-right" : ""}>
            <div className="text-xs text-ink-3">{PARTY_NAME[p]} 期望席次</div>
            <div className="font-serif text-5xl font-black leading-none num" style={{ color: PARTY_VAR[p] }}><Tweened v={f.seats.expected[p]} /></div>
          </div>
        ))}
      </div>
      <div className="relative mt-3 flex h-4 gap-[2px]">
        {parts.map(({ p, v }) => (
          <div key={p} className="h-full first:rounded-l last:rounded-r transition-[width] duration-300" style={{ width: `${(v / total) * 100}%`, background: PARTY_FILL[p] }} title={`${PARTY_NAME[p]} ${v.toFixed(1)} 席`} />
        ))}
        <div className="absolute -top-1 -bottom-1 left-1/2 w-px bg-ink" aria-hidden />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-3">
        <span>0</span><span>11 席（半數）</span><span>22</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {parts.map(({ p, v }) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PARTY_FILL[p] }} />{PARTY_NAME[p]} <span className="num">{v.toFixed(1)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 席次分布：藍綠各一排小長條（small multiples），共用 0–22 軸 */
export function SeatHistogram({ f }: { f: Forecast }) {
  const [hover, setHover] = useState<{ p: Party; k: number } | null>(null);
  const rows: Party[] = ["kmt", "dpp"];
  const max = Math.max(...rows.flatMap((p) => f.seats.histogram[p]));
  return (
    <div>
      {rows.map((p) => (
        <div key={p} className="mb-2 flex items-end gap-2">
          <div className="w-12 shrink-0 pb-0.5 text-xs text-ink-2">{PARTY_NAME[p]}</div>
          <div className="flex h-12 w-full items-end gap-[2px]">
            {f.seats.histogram[p].map((v, k) => (
              <div key={k} className="flex-1 rounded-t-[3px] transition-[height,opacity] duration-500 ease-out"
                style={{ height: `${Math.max(1, (v / max) * 100)}%`, background: PARTY_FILL[p], opacity: hover && (hover.p !== p || hover.k !== k) ? 0.45 : 1 }}
                onPointerEnter={() => setHover({ p, k })} onPointerLeave={() => setHover(null)} />
            ))}
          </div>
        </div>
      ))}
      <div className="ml-14 flex justify-between text-[11px] text-ink-3 num"><span>0</span><span>11</span><span>22 席</span></div>
      <div className="mt-2 h-5 text-sm text-ink-2">
        {hover ? (
          <>{PARTY_NAME[hover.p]}剛好拿 <b className="num">{hover.k}</b> 席的機率 <b className="num">{(f.seats.histogram[hover.p][hover.k] * 100).toFixed(1)}%</b></>
        ) : (
          <span className="text-ink-3">滑過長條看各席次的機率</span>
        )}
      </div>
    </div>
  );
}

function Tweened({ v, digits = 1 }: { v: number; digits?: number }) {
  return <>{useTween(v).toFixed(digits)}</>;
}

export function atLeast(f: Forecast, p: Party, k: number) {
  return f.seats.histogram[p].slice(k).reduce((a, b) => a + b, 0);
}
