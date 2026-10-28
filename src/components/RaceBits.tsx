import type { Candidate, RaceForecast } from "../lib/model.ts";
import { useTween } from "../lib/motion.ts";
import { PARTY_FILL, PARTY_SOFT, PARTY_VAR, prob, ratingText, METHOD_LABEL, md, pct } from "../lib/format.ts";
import { PARTY_NAME, type Party } from "../lib/types.ts";
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

export function PollLine({ p }: { p: PublicPoll }) {
  const top = [...p.results].sort((a, b) => b.pct - a.pct).slice(0, 3);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="num text-xs text-ink-3 w-10">{md(p.fieldEnd)}</span>
      <span className="text-ink-2">{p.pollster}</span>
      <span className="text-ink">
        {top.map((r, i) => (
          <span key={r.name}>{i > 0 && "／"}<CandName raceId={p.raceId} name={r.name} /> <span className="num" style={{ color: PARTY_VAR[r.party] }}>{r.pct}%</span></span>
        ))}
      </span>
      {(p.sponsor || p.method === "online" || p.excluded) && (
        <span className="text-[11px] text-ink-3">
          {[p.sponsor && `${p.sponsor}委託`, p.method === "online" && METHOD_LABEL.online, p.excluded && "不採用"].filter(Boolean).join("・")}
        </span>
      )}
    </div>
  );
}
