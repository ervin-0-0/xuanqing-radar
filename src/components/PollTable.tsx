import { Fragment, useState } from "react";
import type { PublicPoll } from "../lib/data.ts";
import { METHOD_LABEL, PARTY_VAR, md } from "../lib/format.ts";
import { RACE_BY_ID } from "../lib/types.ts";
import { CandName } from "./RaceBits.tsx";
import { PollDetail } from "./PollCard.tsx";

const KIND_LABEL = { general: "", primary: "初選／整合", internal: "內參" } as const;

export function PollTable({ polls, showRace = true, limit = 60 }: { polls: PublicPoll[]; showRace?: boolean; limit?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const [n, setN] = useState(limit);
  if (!polls.length) return <p className="text-sm text-ink-3">沒有符合條件的民調。</p>;
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b hairline text-left text-xs text-ink-3">
            <th className="px-2 py-2 font-normal">調查日期</th>
            {showRace && <th className="px-2 font-normal">縣市</th>}
            <th className="px-2 font-normal">機構</th>
            <th className="px-2 font-normal">結果</th>
            <th className="px-2 text-right font-normal">未表態</th>
            <th className="px-2 font-normal">樣本・方式</th>
          </tr>
        </thead>
        <tbody>
          {polls.slice(0, n).map((p) => {
            const isOpen = open === p.id;
            const tags = [KIND_LABEL[p.kind], p.sponsor && "委託", p.excluded && "不採用", p.origin === "extra" && "維基未列"].filter(Boolean);
            return (
              <Fragment key={p.id}>
                <tr className={`cursor-pointer border-b hairline align-top hover:bg-wash ${p.excluded || p.kind !== "general" ? "text-ink-3" : ""}`}
                  onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}>
                  <td className="num whitespace-nowrap px-2 py-2 text-xs">{md(p.fieldStart)}{p.fieldStart !== p.fieldEnd && `–${md(p.fieldEnd)}`}<div className="text-ink-3">{p.fieldEnd.slice(0, 4)}</div></td>
                  {showRace && <td className="whitespace-nowrap px-2 py-2"><a href={`#/race/${p.raceId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{RACE_BY_ID[p.raceId].short}</a></td>}
                  <td className="px-2 py-2">
                    {p.pollster}
                    {tags.length > 0 && <div className="text-[11px] text-ink-3">{tags.join("・")}</div>}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {[...p.results].sort((a, b) => b.pct - a.pct).map((r) => (
                        <span key={r.name} className="whitespace-nowrap">
                          <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: PARTY_VAR[r.party] }} />
                          <CandName raceId={p.raceId} name={r.name} /> <b className="num">{r.pct}%</b>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="num px-2 py-2 text-right">{p.undecided != null ? `${p.undecided}%` : "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs text-ink-2">
                    {p.sampleSize ? <span className="num">n={p.sampleSize.toLocaleString()}</span> : "—"}
                    <div className="text-ink-3">{METHOD_LABEL[p.method]}</div>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b hairline bg-wash/60">
                    <td colSpan={showRace ? 6 : 5} className="px-3 py-3">
                      <PollDetail p={p} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {polls.length > n && (
        <button className="mx-2 mt-3 rounded-md border hairline px-3 py-1.5 text-sm hover:bg-wash" onClick={() => setN(n + 60)}>
          再顯示 {Math.min(60, polls.length - n)} 筆（共 {polls.length}）
        </button>
      )}
    </div>
  );
}
