import { useState } from "react";
import type { PublicPoll } from "../lib/data.ts";
import { METHOD_LABEL, PARTY_FILL, PARTY_SOFT, PARTY_VAR, md } from "../lib/format.ts";
import { isPartisan } from "../lib/calibration.ts";
import { RACE_BY_ID } from "../lib/types.ts";
import { useSite } from "../lib/store.tsx";
import { CandName } from "./RaceBits.tsx";

const KIND_LABEL = { general: "", primary: "初選／整合", internal: "內參" } as const;

/**
 * 一筆民調：標題列是縣市、日期、機構與領先幅度，下面是得票條、候選人與來源。
 * 預設整張連到縣市頁；expandable 時點一下展開抽樣細節與原始報導。
 */
export function PollCard({ p, showRace = true, expandable = false }: { p: PublicPoll; showRace?: boolean; expandable?: boolean }) {
  const { data } = useSite();
  const [open, setOpen] = useState(false);
  const rs = [...p.results].sort((a, b) => b.pct - a.pct);
  const [a, b] = rs;
  const lead = a && b ? Math.round((a.pct - b.pct) * 10) / 10 : null;
  const undecided = p.undecided ?? Math.max(0, 100 - rs.reduce((s, r) => s + r.pct, 0));
  // 媒體自己做的不重複寫委託；陣營或政黨委託另外標出來
  const sponsor = p.sponsor && !p.sponsor.includes(p.pollster) && !p.pollster.includes(p.sponsor) ? p.sponsor.replace(/（.*?）/g, "") : null;
  const meta = [
    p.sampleSize && `${p.sampleSize.toLocaleString()} 人`,
    p.method !== "unknown" && METHOD_LABEL[p.method],
    sponsor && (/公布$/.test(sponsor) ? sponsor : `${sponsor}委託`),
  ].filter(Boolean).join("・");
  const tags = [
    !!p.sponsor && isPartisan(p.sponsor) && "陣營委託",
    KIND_LABEL[p.kind],
    p.variant > 0 && "其他組合",
    p.excluded && "不採用",
  ].filter((t): t is string => !!t);
  // 跨年的民調要看得出年份
  const year = p.fieldEnd.slice(0, 4) !== data.meta.electionDay.slice(0, 4) ? `${p.fieldEnd.slice(0, 4)}/` : "";
  const dim = p.excluded || p.kind !== "general";

  const body = (
    <>
      <div className="flex items-center gap-2.5">
        {showRace && <span className="shrink-0 font-serif text-xl font-black leading-none">{RACE_BY_ID[p.raceId].short}</span>}
        <span className="num shrink-0 text-sm text-ink-3">{year}{md(p.fieldEnd)}</span>
        <span className="truncate text-base text-ink-2">{p.pollster}</span>
        {lead != null && (
          <span className="num ml-auto shrink-0 rounded-full px-2.5 text-xs font-semibold leading-6"
            style={{ background: PARTY_SOFT[a.party], color: PARTY_VAR[a.party] }}>
            {lead === 0 ? "平手" : `領先 ${lead}`}
          </span>
        )}
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-rule" title={`未表態 ${undecided.toFixed(1)}%`}>
        {rs.map((r) => (
          <div key={r.name} className="h-full border-r-2 border-card" style={{ width: `${r.pct}%`, background: PARTY_FILL[r.party] }} />
        ))}
      </div>
      {/* 手機上一人一行、數字靠右；寬一點就排成一列 */}
      <div className="mt-2.5 grid gap-y-1 text-base sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1.5">
        {rs.filter((r, i) => i < 2 || r.pct >= 1).slice(0, 4).map((r) => (
          <span key={r.name} className="flex items-center gap-1.5">
            <CandName raceId={p.raceId} name={r.name} size="md" />
            <span className="num ml-auto font-semibold sm:ml-0" style={{ color: PARTY_VAR[r.party] }}>{r.pct}%</span>
          </span>
        ))}
        {undecided >= 1 && <span className="num flex justify-between text-sm text-ink-3 sm:block">未表態 <span>{Math.round(undecided)}%</span></span>}
      </div>
      {(meta || tags.length > 0 || expandable) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-ink-3" title={p.sponsor ?? meta}>
          {tags.map((t) => <span key={t} className="shrink-0 rounded border hairline px-1.5 text-xs leading-5">{t}</span>)}
          <span className="truncate">{meta}</span>
          {expandable && <span className="ml-auto shrink-0 text-xs">{open ? "收起 ▴" : "細節 ▾"}</span>}
        </div>
      )}
    </>
  );

  const cls = `lift block min-w-0 rounded-lg border hairline bg-card px-4 py-3.5 hover:bg-wash ${dim ? "opacity-70" : ""}`;
  if (!expandable) return <a href={`#/race/${p.raceId}`} className={cls}>{body}</a>;
  return (
    <div className={`${cls} ${open ? "md:col-span-2" : ""}`}>
      <button type="button" className="block w-full cursor-pointer text-left" onClick={() => setOpen(!open)} aria-expanded={open}>{body}</button>
      {open && <div className="mt-3 border-t hairline pt-3"><PollDetail p={p} /></div>}
    </div>
  );
}

/** 卡片列表：一次顯示一部分，按鈕再載入 */
export function PollCards({ polls, showRace = true, step = 24 }: { polls: PublicPoll[]; showRace?: boolean; step?: number }) {
  const [n, setN] = useState(step);
  if (!polls.length) return <p className="text-sm text-ink-3">沒有符合條件的民調。</p>;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {polls.slice(0, n).map((p) => <PollCard key={p.id} p={p} showRace={showRace} expandable />)}
      </div>
      {polls.length > n && (
        <button className="mt-4 rounded-md border hairline px-4 py-2 text-sm hover:bg-wash" onClick={() => setN(n + step)}>
          再顯示 {Math.min(step, polls.length - n)} 筆（共 {polls.length}）
        </button>
      )}
    </>
  );
}

/** 抽樣細節與原始報導連結 */
export function PollDetail({ p }: { p: PublicPoll }) {
  return (
    <div className="text-sm leading-relaxed text-ink-2">
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <Item k="調查期間" v={`${p.fieldStart}${p.fieldStart !== p.fieldEnd ? ` 至 ${p.fieldEnd}` : ""}`} />
        {p.scenario && <Item k="對決組合" v={p.scenario} />}
        <Item k="委託單位" v={p.sponsor ?? "未載明／機構自辦"} />
        <Item k="調查方式" v={METHOD_LABEL[p.method]} />
        <Item k="樣本數" v={p.sampleSize ? `${p.sampleSize.toLocaleString()} 人` : "未載明"} />
        <Item k="抽樣誤差" v={p.moe ? `±${p.moe} 個百分點` : "未載明"} />
        {p.population && <Item k="母體" v={p.population} />}
        {p.published && <Item k="發布日" v={p.published} />}
        {p.likelyVoters && <Item k="定投票者" v={p.likelyVoters.results.map((r) => `${r.name} ${r.pct}%`).join("／") + (p.likelyVoters.sampleSize ? `（n=${p.likelyVoters.sampleSize}）` : "")} />}
        {p.excludeReason && <Item k="不採用原因" v={p.excludeReason} />}
        {p.qualityNote && <Item k="權重" v={`${p.qualityNote}（×${p.quality}）`} />}
        {p.kind !== "general" && <Item k="說明" v="初選、整合或內參民調，不進當選機率模型" />}
        {p.origin === "extra" && <Item k="來源" v="維基百科未列，從新聞補進來" />}
      </dl>
      {p.notes && <p className="mt-2">{p.notes}</p>}
      <div className="mt-2 flex flex-wrap gap-3">
        {p.sources.map((s, i) => (
          <a key={s} href={s} target="_blank" rel="noreferrer" className="underline underline-offset-2">原始報導{p.sources.length > 1 ? ` ${i + 1}` : ""}（{host(s)}）</a>
        ))}
      </div>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-3">{k}</dt><dd>{v}</dd></div>;
}

const host = (u: string) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return "連結"; } };
