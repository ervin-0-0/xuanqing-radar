import type { Candidate, RaceForecast } from "../lib/model.ts";
import { useTween } from "../lib/motion.ts";
import { PARTY_FILL, PARTY_SOFT, PARTY_VAR, prob, ratingText, METHOD_LABEL, md, pct } from "../lib/format.ts";
import { PARTY_NAME, RACE_BY_ID, type Party } from "../lib/types.ts";
import { isPartisan } from "../lib/calibration.ts";
import type { PublicPoll } from "../lib/data.ts";
import { useSite } from "../lib/store.tsx";

export function PartyChip({ party, name, className = "" }: { party: Party; name?: string | null; className?: string }) {
  return (
    <span className={`inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-medium ${className}`}
      style={{ background: PARTY_SOFT[party], color: PARTY_VAR[party] }}>
      {party === "other" && name ? name : PARTY_NAME[party]}
    </span>
  );
}

/** 抽籤號次：小圓圈數字，放在候選人名字前面 */
export function BallotNo({ n, size = "sm" }: { n: number | null | undefined; size?: "sm" | "md" }) {
  if (n == null) return null;
  const cls = size === "md" ? "h-6 w-6 text-xs" : "h-[18px] w-[18px] text-[10px]";
  return (
    <span className={`num inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-semibold text-paper ${cls}`} title={`${n} 號`} aria-label={`${n} 號`}>
      {n}
    </span>
  );
}

/** 號次＋名字 */
export function CandName({ raceId, name, className = "" }: { raceId: string; name: string; className?: string }) {
  const { ballot } = useSite();
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <BallotNo n={ballot(raceId, name)} />
      <span>{name}</span>
    </span>
  );
}

export function RatingBadge({ f }: { f: RaceForecast }) {
  const tossup = f.rating === "tossup";
  return (
    <span className="inline-flex h-6 items-center rounded px-2 text-xs font-bold"
      style={tossup ? { background: "var(--accent)", color: "var(--card)" } : { background: PARTY_SOFT[f.leaderParty], color: PARTY_VAR[f.leaderParty] }}>
      {ratingText(f.rating, f.leaderParty)}
    </span>
  );
}

/** 候選人當選機率條，依機率排序；機率 <1% 的併成一行 */
export function ProbBars({ f, candidates, compact = false }: { f: RaceForecast; candidates: Candidate[]; compact?: boolean }) {
  // 依當選機率排，機率一樣（例如都 <1%）再依預估得票
  const sorted = [...candidates].sort((a, b) =>
    (f.winProb[b.name] ?? 0) - (f.winProb[a.name] ?? 0) || (f.shares[b.name] ?? 0) - (f.shares[a.name] ?? 0));
  const main = sorted.filter((c, i) => i < 2 || (f.winProb[c.name] ?? 0) >= 0.01);
  const rest = sorted.filter((c) => !main.includes(c));
  return (
    <div className="space-y-2.5">
      {main.map((c) => {
        const p = f.winProb[c.name] ?? 0;
        return (
          <div key={c.name}>
            <div className="flex items-center gap-2">
              <BallotNo n={c.ballotNumber} size="md" />
              <span className="font-medium">{c.name}</span>
              <PartyChip party={c.party} name={c.partyName} />
              {c.incumbent && <span className="text-[11px] text-ink-3">現任</span>}
              <span className="ml-auto num text-lg font-semibold" style={{ color: PARTY_VAR[c.party] }}><TweenProb p={p} /></span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-wash">
              <div className="h-2 rounded-full transition-[width] duration-300" style={{ width: `${Math.max(1, p * 100)}%`, background: PARTY_FILL[c.party] }} />
            </div>
            {!compact && (
              <div className="mt-0.5 text-[11px] text-ink-3">預估得票 <span className="num">{pct(f.shares[c.name], 1)}</span></div>
            )}
          </div>
        );
      })}
      {rest.length > 0 && <div className="text-xs text-ink-3">其他：{rest.map((c) => c.name).join("、")}（當選機率 &lt;1%）</div>}
    </div>
  );
}

function TweenProb({ p }: { p: number }) {
  const v = useTween(p, 500);
  return <>{prob(v)}</>;
}

/** 一筆民調：標題列是縣市、日期、機構與領先幅度，下面是得票條、候選人與來源；縣市頁內可省略縣市名 */
export function PollCard({ p, showRace = true }: { p: PublicPoll; showRace?: boolean }) {
  const rs = [...p.results].sort((a, b) => b.pct - a.pct);
  const [a, b] = rs;
  const lead = a && b ? Math.round((a.pct - b.pct) * 10) / 10 : null;
  const undecided = p.undecided ?? Math.max(0, 100 - rs.reduce((s, r) => s + r.pct, 0));
  // 媒體自己做的不重複寫委託；陣營或政黨委託另外標出來
  const sponsor = p.sponsor && !p.sponsor.includes(p.pollster) && !p.pollster.includes(p.sponsor) ? p.sponsor.replace(/（.*?）/g, "") : null;
  const partisan = !!p.sponsor && isPartisan(p.sponsor);
  const meta = [
    p.sampleSize && `${p.sampleSize.toLocaleString()} 人`,
    p.method !== "unknown" && METHOD_LABEL[p.method],
    sponsor && (/公布$/.test(sponsor) ? sponsor : `${sponsor}委託`),
  ].filter(Boolean).join("・");
  return (
    <a href={`#/race/${p.raceId}`} className="lift block min-w-0 rounded-lg border hairline bg-card px-4 py-3 hover:bg-wash">
      <div className="flex items-center gap-2">
        {showRace && <span className="shrink-0 font-serif text-lg font-black leading-none">{RACE_BY_ID[p.raceId].short}</span>}
        <span className="num shrink-0 text-xs text-ink-3">{md(p.fieldEnd)}</span>
        <span className="truncate text-sm text-ink-2">{p.pollster}</span>
        {lead != null && (
          <span className="num ml-auto shrink-0 rounded-full px-2 text-[11px] font-semibold leading-5"
            style={{ background: PARTY_SOFT[a.party], color: PARTY_VAR[a.party] }}>
            {lead === 0 ? "平手" : `領先 ${lead}`}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-rule" title={`未表態 ${undecided.toFixed(1)}%`}>
        {rs.map((r) => (
          <div key={r.name} className="h-full border-r-2 border-card" style={{ width: `${r.pct}%`, background: PARTY_FILL[r.party] }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {rs.filter((r, i) => i < 2 || r.pct >= 1).slice(0, 4).map((r) => (
          <span key={r.name} className="inline-flex items-center gap-1.5">
            <CandName raceId={p.raceId} name={r.name} />
            <span className="num font-semibold" style={{ color: PARTY_VAR[r.party] }}>{r.pct}%</span>
          </span>
        ))}
        {undecided >= 1 && <span className="num text-xs text-ink-3">未表態 {Math.round(undecided)}%</span>}
      </div>
      {(meta || partisan) && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3" title={p.sponsor ?? meta}>
          {partisan && <span className="shrink-0 rounded border hairline px-1 leading-4">陣營委託</span>}
          <span className="truncate">{meta}</span>
        </div>
      )}
    </a>
  );
}
