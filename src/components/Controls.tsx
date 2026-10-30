import { addDays, daysBetween } from "../lib/stats.ts";
import { md } from "../lib/format.ts";
import type { CSSProperties } from "react";
import { useSite } from "../lib/store.tsx";
import type { TurnoutView } from "../lib/data.ts";

/** 橫桿上第 frac（0–1）的位置，對齊滑塊中心（滑塊寬 22px） */
const at = (frac: number) => `calc(11px + ${frac.toFixed(4)} * (100% - 22px))`;

/** 時光機：拖回過去，看當時的民調會算出什麼結果 */
export function TimeMachine({ from = "2026-06-01" }: { from?: string }) {
  const { asOf, setAsOf, data, setDragging } = useSite();
  const today = data.meta.asOf;
  const span = daysBetween(from, today);
  const v = daysBetween(from, asOf);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="tm" className="text-sm font-medium">時光機：回到 <span className="num">{md(asOf)}</span></label>
        {asOf !== today && <button className="text-xs text-accent underline underline-offset-2" onClick={() => setAsOf(today)}>回到今天</button>}
      </div>
      <input
        id="tm" type="range" className="slider mt-1" min={0} max={span} step={1} value={v}
        style={{ "--lo": "0%", "--hi": at(span ? v / span : 1) } as CSSProperties}
        onChange={(e) => setAsOf(addDays(from, Number(e.target.value)))}
        onPointerDown={() => setDragging(true)} onPointerUp={() => setDragging(false)}
        onKeyUp={() => setDragging(false)}
        aria-valuetext={asOf}
      />
      <div className="flex justify-between text-[11px] text-ink-3 num"><span>{md(from)}</span><span>今天 {md(today)}</span></div>
      <p className="mt-1.5 text-sm text-ink-2">
        {asOf === today ? "拖回去看預測怎麼一路變過來" : `只用 ${md(asOf)} 以前的民調重算，距投票 ${daysBetween(asOf, data.meta.electionDay)} 天`}
      </p>
    </div>
  );
}

const MIN = -10, MAX = 15;
export const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "±0");

/** 投票率拉桿：只改票數，不改得票率與當選機率。t 給了就順便顯示這個縣市的投票率 */
export function TurnoutSlider({ t }: { t?: TurnoutView | null }) {
  const { turnoutAdd, setTurnoutAdd, data } = useSite();
  const preset = data.meta.turnoutAddPoints ?? 0;
  // 強調色從「跟 2022 一樣」畫到目前的值
  const zero = -MIN / (MAX - MIN), frac = (turnoutAdd - MIN) / (MAX - MIN);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="turnout" className="text-sm font-medium">
          投票率：2022 <span className="num">{signed(turnoutAdd)}</span> 個百分點
          {t && <span className="ml-1.5 font-normal text-ink-2">（這裡 <span className="num">{t.turnout.toFixed(1)}%</span>）</span>}
        </label>
        {turnoutAdd !== preset && (
          <button className="shrink-0 text-xs text-accent underline underline-offset-2" onClick={() => setTurnoutAdd(preset)}>回到預設 {signed(preset)}</button>
        )}
      </div>
      <input id="turnout" type="range" className="slider mt-1" min={MIN} max={MAX} step={1} value={turnoutAdd}
        style={{ "--lo": at(Math.min(zero, frac)), "--hi": at(Math.max(zero, frac)) } as CSSProperties}
        onChange={(e) => setTurnoutAdd(Number(e.target.value))} aria-valuetext={`2022 投票率${signed(turnoutAdd)} 個百分點`} />
      {/* 「跟 2022 一樣」要對準 0 的位置（扣掉滑塊半徑 11px），不是正中間 */}
      <div className="relative h-4 text-[11px] text-ink-3 num">
        <span className="absolute left-0">{signed(MIN)}</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: at(zero) }}>跟 2022 一樣</span>
        <span className="absolute right-0">{signed(MAX)}</span>
      </div>
    </div>
  );
}
