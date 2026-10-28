import { addDays, daysBetween } from "../lib/stats.ts";
import { md } from "../lib/format.ts";
import { useSite } from "../lib/store.tsx";

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
