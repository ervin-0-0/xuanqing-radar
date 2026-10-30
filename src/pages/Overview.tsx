import { useMemo, useRef, useState } from "react";
import { TaiwanMap } from "../components/TaiwanMap.tsx";
import { Card } from "../components/Layout.tsx";
import { SeatBar, SeatHistogram, atLeast } from "../components/Seats.tsx";
import { TimeMachine, TurnoutSlider, signed } from "../components/Controls.tsx";
import { CandName, PartyChip, ProbBars, RatingBadge } from "../components/RaceBits.tsx";
import { PollCard } from "../components/PollCard.tsx";
import { LineChart } from "../components/LineChart.tsx";
import { useSite } from "../lib/store.tsx";
import { PARTY_VAR, probFill, prob, expectedVotes, votesText } from "../lib/format.ts";
import { RACE_BY_ID, RACES, PARTY_NAME, type Party, type RaceId } from "../lib/types.ts";
import type { RaceForecast } from "../lib/model.ts";

export function Overview() {
  const { data, live, asOf, withTurnout, turnoutAdd } = useSite();
  const [selected, setSelected] = useState<RaceId>(() => mostContested(data.forecast.races));
  const panel = useRef<HTMLDivElement>(null);
  // 手機上地圖跟縣市卡片是上下排，點了要捲過去才看得到
  const select = (id: RaceId) => {
    setSelected(id);
    if (window.innerWidth < 1024) setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };
  const byId = useMemo(() => Object.fromEntries(live.races.map((r) => [r.id, r])) as Record<RaceId, RaceForecast>, [live]);
  const raceData = useMemo(() => Object.fromEntries(data.races.map((r) => [r.id, r])), [data]);
  const sel = byId[selected];
  const usable = data.polls.filter((p) => !p.excluded && p.kind === "general");
  const recent = usable.filter((p) => p.variant === 0 && p.fieldEnd <= asOf).slice(0, 8);

  // 22 縣市合計預估得票（竹北市長不算）
  const totals = useMemo(() => {
    const t: Partial<Record<Party, number>> = {};
    for (const f of live.races) {
      const r = raceData[f.id];
      const tv = withTurnout(r?.turnout ?? null);
      if (!tv || r.tier === "township") continue;
      for (const c of r.candidates) t[c.party] = (t[c.party] ?? 0) + expectedVotes(tv, f.shares[c.name] ?? 0);
    }
    return t;
  }, [live, raceData, withTurnout]);
  const otherVotes = Object.entries(totals).filter(([p]) => !["kmt", "dpp", "tpp"].includes(p)).reduce((s, [, v]) => s + (v ?? 0), 0);

  const sorted = [...live.races].sort((a, b) => a.winProb[a.leader] - b.winProb[b.leader]);
  const flips = live.races
    .map((f) => ({ f, w: raceData[f.id]?.result2022?.candidates.find((c) => c.elected) }))
    .filter(({ f, w }) => w && w.party !== f.leaderParty && w.name !== f.leader);

  return (
    <div className="space-y-6">
      <section className="rise">
        <div className="kicker">LIVE DESK · 11.28 投票 · 每日更新</div>
        <h1 className="mt-2 font-serif text-3xl font-black leading-tight sm:text-4xl">2026 九合一，點地圖看誰比較可能當選。</h1>
        <p className="mt-3 max-w-2xl text-ink-2 leading-relaxed">
          把 <b className="num">{usable.length}</b> 筆公開民調放進同一套模型，扣掉各家機構的固定偏差、按新舊與樣本數加權，
          再加上歷屆選舉的基本盤，模擬一萬次開票。拖地圖下方的時光機，可以看預測從 6 月一路怎麼變過來。
        </p>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Card kicker="點選縣市" title="當選機率地圖" right={<Legend />}>
          <TaiwanMap
            map={data.map}
            selected={selected}
            onSelect={select}
            fill={(id) => (byId[id] ? probFill(byId[id].leaderParty, byId[id].winProb[byId[id].leader]) : "var(--wash)")}
            label={(id) => RACE_BY_ID[id].short}
            tooltip={(id) => {
              const f = byId[id];
              if (!f) return <div>{RACE_BY_ID[id].name}：資料不足</div>;
              return (
                <div>
                  <div className="font-medium">{RACE_BY_ID[id].name}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span style={{ color: PARTY_VAR[f.leaderParty] }}><CandName raceId={id} name={f.leader} /></span>
                    <span className="num font-semibold">{prob(f.winProb[f.leader])}</span>
                  </div>
                  <div className="text-xs text-ink-3">民調 {f.pollCount} 筆・點一下看細節</div>
                </div>
              );
            }}
          />
          <div className="mt-4 border-t hairline pt-4">
            <TimeMachine />
          </div>
        </Card>

        <div className="scroll-mt-28 space-y-6" ref={panel}>
          {sel && (
            <Card kicker={`${tierLabel(RACE_BY_ID[selected].tier)}${raceData[selected]?.pvi != null ? ` · 基本盤 ${pviText(raceData[selected].pvi)}` : ""}`}
              title={RACE_BY_ID[selected].name} right={<RatingBadge f={sel} />}>
              <ProbBars f={sel} candidates={raceData[selected].candidates} turnout={withTurnout(raceData[selected].turnout)} />
              {raceData[selected].turnout && (
                <div className="mt-4 rounded-lg bg-wash px-3 py-3">
                  <TurnoutSlider t={withTurnout(raceData[selected].turnout)} />
                  <p className="mt-1 text-xs text-ink-3">只改票數，不改得票率和當選機率。</p>
                  {raceData[selected].turnout!.note && <p className="mt-1 text-xs text-accent">{raceData[selected].turnout!.note}</p>}
                </div>
              )}
              <div className="mt-4 space-y-2 border-t hairline pt-3">
                <div className="text-xs text-ink-3">最近民調</div>
                {usable.filter((p) => p.raceId === selected && p.variant === 0 && p.fieldEnd <= asOf).slice(0, 3).map((p) => <PollCard key={p.id} p={p} showRace={false} />)}
                {sel.pollCount === 0 && <div className="text-sm text-ink-3">還沒有公開民調，預測完全靠基本盤。</div>}
              </div>
              <a href={`#/race/${selected}`} className="mt-4 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90">
                看{RACE_BY_ID[selected].short}完整民調與走勢 →
              </a>
            </Card>
          )}

          <Card kicker={`蒙地卡羅 ${live.seats.sims.toLocaleString()} 次`} title="22 縣市席次">
            <SeatBar f={live} />
            <div className="mt-5"><SeatHistogram f={live} /></div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Stat label="國民黨拿到 12 席以上" value={atLeast(live, "kmt", 12)} party="kmt" />
              <Stat label="民進黨拿到 12 席以上" value={atLeast(live, "dpp", 12)} party="dpp" />
            </div>
            {Object.keys(totals).length > 0 && (
              <div className="mt-4 border-t hairline pt-3">
                <div className="text-xs text-ink-3">22 縣市合計預估得票（投票率＝2022 <span className="num">{signed(turnoutAdd)}</span> 個百分點，在上方縣市卡片調整）</div>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  {(["kmt", "dpp", "tpp"] as const).filter((p) => totals[p]).map((p) => (
                    <span key={p}><span className="font-medium" style={{ color: PARTY_VAR[p] }}>{PARTY_NAME[p]}</span> <span className="num font-semibold">{votesText(totals[p]!)}</span></span>
                  ))}
                  {otherVotes > 0 && <span><span className="font-medium text-ink-2">無黨籍及其他</span> <span className="num font-semibold">{votesText(otherVotes)}</span></span>}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card kicker="由膠著到穩健" title="選情一覽">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((f) => (
            <a key={f.id} href={`#/race/${f.id}`} className="lift flex items-center gap-3 rounded-lg border hairline bg-card px-3 py-2.5 hover:bg-wash">
              <RatingBadge f={f} />
              <div className="min-w-0">
                <div className="font-medium">{RACE_BY_ID[f.id].name}{RACE_BY_ID[f.id].tier === "township" && <span className="ml-1 text-[11px] text-ink-3">縣轄市</span>}</div>
                <div className="flex items-center gap-1 truncate text-xs text-ink-3"><CandName raceId={f.id} name={f.leader} />・民調 {f.pollCount} 筆</div>
              </div>
              <div className="ml-auto num text-lg font-semibold" style={{ color: PARTY_VAR[f.leaderParty] }}>{prob(f.winProb[f.leader])}</div>
            </a>
          ))}
        </div>
      </Card>

      <Card kicker="跟 2022 當選人不同黨" title="模型預估變天">
        {flips.length === 0 ? <p className="text-sm text-ink-3">目前沒有預估換黨的縣市。</p> : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {flips.map(({ f, w }) => (
              <a key={f.id} href={`#/race/${f.id}`} className="lift flex items-center gap-2 rounded-lg border hairline bg-card px-3 py-2.5 hover:bg-wash">
                <span className="w-10 shrink-0 font-medium">{RACE_BY_ID[f.id].short}</span>
                <span className="shrink-0 text-xs text-ink-3">{PARTY_NAME[w!.party]}</span>
                <span className="text-ink-3">→</span>
                <PartyChip party={f.leaderParty} />
                <CandName raceId={f.id} name={f.leader} className="shrink-0 whitespace-nowrap text-sm" />
                <span className="num ml-auto font-semibold" style={{ color: PARTY_VAR[f.leaderParty] }}>{prob(f.winProb[f.leader])}</span>
              </a>
            ))}
          </div>
        )}
      </Card>

      <Card kicker="依調查結束日" title="最新入庫民調" right={<a href="#/polls" className="text-sm text-ink-2 underline underline-offset-2">全部民調</a>}>
        <div className="grid gap-3 md:grid-cols-2">
          {recent.map((p) => <PollCard key={p.id} p={p} />)}
        </div>
      </Card>

      <NationalCharts />
    </div>
  );
}

function NationalCharts() {
  const { data } = useSite();
  const approval = data.national.approval;
  const fav = data.national["party-favorability"];
  if (!approval.length && !fav.length) return null;
  const byPollster = (pts: typeof approval, key: string) => pts.filter((p) => p.values[key] != null);
  const main = mostCommon(approval.map((p) => p.pollster));
  // 同一家機構才能連成線：不同機構題目不同
  const favMain = mostCommon(fav.map((p) => p.pollster));
  const favSeries = fav.filter((p) => p.pollster === favMain);
  const support = data.national["party-id"];
  const supMain = mostCommon(support.map((p) => p.pollster));
  const supSeries = support.filter((p) => p.pollster === supMain);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {approval.length > 0 && (
        <Card kicker={`${main}・每月`} title="施政滿意度">
          <LineChart
            yDomain={[25, 65]} yTicks={[30, 40, 50, 60]} yFormat={(v) => `${v}%`} lineWidth={3.5}
            series={[
              { key: "s", label: "滿意", color: "var(--approve)", points: byPollster(approval.filter((p) => p.pollster === main), "satisfied").map((p) => ({ x: p.fieldEnd, y: p.values.satisfied! })) },
              { key: "d", label: "不滿意", color: "var(--disapprove)", dashed: true, points: byPollster(approval.filter((p) => p.pollster === main), "dissatisfied").map((p) => ({ x: p.fieldEnd, y: p.values.dissatisfied! })) },
            ]}
          />
          <p className="mt-2 text-xs text-ink-3">青色實線是滿意，紫色虛線是不滿意。其他機構的數字在模型說明頁。</p>
        </Card>
      )}
      {supSeries.length > 0 && (
        <Card kicker={`${supMain}・每月`} title="政黨支持度">
          <LineChart
            yDomain={[0, 45]} yTicks={[10, 20, 30, 40]} yFormat={(v) => `${v}%`} lineWidth={3.5}
            markers={supMain === "美麗島電子報" ? [{ x: "2026-07-10", label: "換調查團隊" }] : []}
            series={[
              { key: "d", label: "民進黨", color: "var(--dpp)", points: byPollster(supSeries, "dpp").map((p) => ({ x: p.fieldEnd, y: p.values.dpp! })) },
              { key: "k", label: "國民黨", color: "var(--kmt)", points: byPollster(supSeries, "kmt").map((p) => ({ x: p.fieldEnd, y: p.values.kmt! })) },
              { key: "t", label: "民眾黨", color: "var(--tpp)", points: byPollster(supSeries, "tpp").map((p) => ({ x: p.fieldEnd, y: p.values.tpp! })) },
              { key: "n", label: "中立／未表態", color: "var(--ind)", dashed: true, points: byPollster(supSeries, "neutral").map((p) => ({ x: p.fieldEnd, y: p.values.neutral! })) },
            ].filter((s) => s.points.length)}
          />
          <p className="mt-2 text-xs text-ink-3">
            題目是「平常哪一黨的主張比較接近您的想法」。綠線民進黨、藍線國民黨、青線民眾黨，灰色虛線是中立或未表態。
            2026 年 7 月起改由別的團隊執行，前後不完全可比；7 月以後原文沒寫這題，是從交叉分析表的樣本數換算的。
          </p>
        </Card>
      )}
      {fav.length > 0 && (
        <Card kicker={`${favMain}・每月`} title="政黨好感度">
          <LineChart
            yDomain={[10, 60]} yTicks={[20, 30, 40, 50]} yFormat={(v) => `${v}%`} lineWidth={3.5}
            series={[
              { key: "d", label: "民進黨好感", color: "var(--dpp)", points: byPollster(favSeries, "dppLike").map((p) => ({ x: p.fieldEnd, y: p.values.dppLike! })) },
              { key: "k", label: "國民黨好感", color: "var(--kmt)", points: byPollster(favSeries, "kmtLike").map((p) => ({ x: p.fieldEnd, y: p.values.kmtLike! })) },
              { key: "t", label: "民眾黨好感", color: "var(--tpp)", points: byPollster(favSeries, "tppLike").map((p) => ({ x: p.fieldEnd, y: p.values.tppLike! })) },
            ].filter((s) => s.points.length)}
          />
          <p className="mt-2 text-xs text-ink-3">綠線民進黨、藍線國民黨、青線民眾黨。2026 年 8 月起題目改為「喜歡／不喜歡」，跟之前的好感度不完全可比。</p>
        </Card>
      )}
      {supSeries.length > 0 && <SupportExplainer />}
    </div>
  );
}

/** 政黨支持度不等於得票：用政大歷年政黨偏好對照當年縣市長席次 */
function SupportExplainer() {
  const { data } = useSite();
  const nccu = (y: string) => data.national["party-id-nccu"].find((p) => p.fieldEnd.startsWith(y))?.values;
  const seats = (k: "result2018" | "result2022") => {
    const c: Partial<Record<Party, number>> = {};
    for (const r of data.races) {
      const w = r.tier !== "township" ? r[k]?.candidates.find((x) => x.elected) : null;
      if (w) c[w.party] = (c[w.party] ?? 0) + 1;
    }
    return c;
  };
  const rows = (["2018", "2022"] as const).map((y) => ({ y, v: nccu(y), s: seats(y === "2018" ? "result2018" : "result2022") }));
  return (
    <Card kicker="怎麼解讀" title="支持度不等於選票">
      <p className="text-sm leading-relaxed text-ink-2">
        「支持哪一黨」量的是長期的政黨認同，比較像各黨有多少鐵票，不是會投給誰。最大的一群是中立選民，地方選舉又很看候選人、投票率也比較低，
        所以支持度領先的黨，縣市長不一定贏：
      </p>
      <table className="mt-3 w-full text-sm">
        <thead><tr className="border-b hairline text-left text-xs text-ink-3"><th className="py-1.5 font-normal">年份</th><th className="font-normal">政黨支持（政大）</th><th className="font-normal">縣市長席次</th></tr></thead>
        <tbody className="divide-y divide-rule">
          {rows.filter((r) => r.v).map(({ y, v, s }) => (
            <tr key={y}>
              <td className="num py-2">{y}</td>
              <td className="num"><span style={{ color: PARTY_VAR.dpp }}>綠 {v!.dpp}</span>・<span style={{ color: PARTY_VAR.kmt }}>藍 {v!.kmt}</span></td>
              <td className="num"><span style={{ color: PARTY_VAR.dpp }}>綠 {s.dpp ?? 0}</span>・<span style={{ color: PARTY_VAR.kmt }}>藍 {s.kmt ?? 0}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">
        所以模型只用各縣市的政黨支持度看「哪裡比全國偏藍或偏綠」，換算成投票傾向時再乘上 <span className="num">{data.meta.supportScale ?? 1}</span>；全國整體偏哪一黨，交給當年的民調決定。
      </p>
    </Card>
  );
}

function Legend() {
  return (
    <div className="flex flex-col items-end gap-1 text-[11px] text-ink-2">
      {(["kmt", "dpp", "ind"] as const).map((p) => (
        <span key={p} className="inline-flex items-center gap-1.5">
          <span className="flex">{[0.55, 0.75, 0.95].map((v) => <span key={v} className="h-2.5 w-2.5" style={{ background: probFill(p, v) }} />)}</span>
          {PARTY_NAME[p]}領先
        </span>
      ))}
      <span className="text-ink-3">顏色越深＝越穩</span>
    </div>
  );
}

function Stat({ label, value, party }: { label: string; value: number; party: "kmt" | "dpp" }) {
  return (
    <div className="rounded-lg bg-wash px-3 py-2">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="num text-xl font-semibold" style={{ color: PARTY_VAR[party] }}>{prob(value)}</div>
    </div>
  );
}

export const tierLabel = (t: string) => (t === "metro" ? "直轄市" : t === "township" ? "縣轄市（不計入 22 席）" : "縣市");
export const pviText = (v: number) => (Math.abs(v) < 0.5 ? "持平" : v > 0 ? `偏藍 ${v.toFixed(1)}` : `偏綠 ${(-v).toFixed(1)}`);

function mostContested(races: RaceForecast[]): RaceId {
  const metro = races.filter((r) => RACES.find((x) => x.id === r.id)?.tier === "metro");
  return [...(metro.length ? metro : races)].sort((a, b) => a.winProb[a.leader] - b.winProb[b.leader])[0]?.id ?? "taipei";
}

function mostCommon(xs: string[]) {
  const c: Record<string, number> = {};
  for (const x of xs) c[x] = (c[x] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

