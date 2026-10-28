import { useMemo, useState } from "react";
import { Card } from "../components/Layout.tsx";
import { LineChart, type Dot, type Series } from "../components/LineChart.tsx";
import { BallotNo, CandName, PartyChip, ProbBars, RatingBadge } from "../components/RaceBits.tsx";
import { PollTable } from "../components/PollTable.tsx";
import { useSite } from "../lib/store.tsx";
import { usablePolls, pollAverage, PARAMS } from "../lib/model.ts";
import { PARTY_FILL, PARTY_VAR, md, pct, prob } from "../lib/format.ts";
import { addDays } from "../lib/stats.ts";
import { RACE_BY_ID, PARTY_NAME, type RaceId } from "../lib/types.ts";
import { pviText, tierLabel } from "./Overview.tsx";

export function RacePage({ id }: { id: RaceId }) {
  const { data, live, modelRaces, modelPolls, asOf } = useSite();
  const race = data.races.find((r) => r.id === id);
  const f = live.races.find((r) => r.id === id);
  const model = modelRaces.find((r) => r.id === id);
  const [adjust, setAdjust] = useState(true);
  const [phoneOnly, setPhoneOnly] = useState(false);

  const allPolls = data.polls.filter((p) => p.raceId === id);

  // 民調走勢：每 3 天算一次加權平均（跟模型同一套算法）
  const trend = useMemo(() => {
    if (!model) return null;
    const polls = phoneOnly ? modelPolls.filter((p) => p.method !== "online") : modelPolls;
    const usable = usablePolls(model, polls, asOf);
    if (!usable.length) return { usable, series: [] as Series[] };
    const start = usable[0].fieldEnd;
    const house = adjust ? live.house : {};
    const pts: Record<string, { x: string; y: number }[]> = {};
    for (let d = addDays(start, 7); d <= asOf; d = addDays(d, 3)) {
      const u = usable.filter((p) => p.fieldEnd <= d);
      const a = pollAverage(model, u, house, d);
      if (!a) continue;
      for (const c of model.candidates) (pts[c.name] ??= []).push({ x: d, y: a.shares[c.name] });
    }
    const main = model.candidates.filter((c) => (f?.shares[c.name] ?? 0) >= 3);
    return {
      usable,
      series: main.map((c) => ({ key: c.name, label: c.name, color: PARTY_VAR[c.party], points: pts[c.name] ?? [] })),
    };
  }, [model, modelPolls, asOf, adjust, phoneOnly, live.house, f]);

  if (!race || !f || !model) {
    return <Card title="找不到這個選區"><a href="#/" className="underline">回總覽</a></Card>;
  }

  const hist = data.history.filter((h) => h.races[id] && h.date <= asOf);
  const probSeries: Series[] = race.candidates
    .filter((c) => hist.some((h) => (h.races[id].winProb[c.name] ?? 0) >= 0.03))
    .map((c) => ({ key: c.name, label: c.name, color: PARTY_VAR[c.party], points: hist.map((h) => ({ x: h.date, y: (h.races[id].winProb[c.name] ?? 0) * 100 })) }));

  const dots: Dot[] = (trend?.usable ?? []).flatMap((p) =>
    model.candidates.filter((c) => (p.shares[c.name] ?? 0) >= 3 && p.results.some((r) => r.name === c.name)).map((c) => ({
      key: `${p.id}-${c.name}`, x: p.fieldEnd, y: p.shares[c.name], color: PARTY_VAR[c.party], hollow: p.method === "online" || !!p.sponsor,
      title: (
        <div className="text-sm">
          <div className="font-medium">{p.pollster}・<span className="num">{md(p.fieldEnd)}</span></div>
          {p.results.map((r) => <div key={r.name}>{r.name} <span className="num">{r.pct}%</span></div>)}
          <div className="text-xs text-ink-3">換算兩人得票率 {c.name} <span className="num">{p.shares[c.name].toFixed(1)}%</span></div>
        </div>
      ),
    })),
  );

  const meta = RACE_BY_ID[id];
  const leaderP = f.winProb[f.leader];
  const runner = Object.entries(f.shares).sort((a, b) => b[1] - a[1])[1];
  const lead = f.shares[f.leader] - (runner?.[1] ?? 0);

  return (
    <div className="space-y-6">
      <a href="#/" className="text-sm text-ink-2 hover:underline">← 回總覽</a>
      <section className="rise">
        <div className="kicker">{tierLabel(meta.tier)}{race.pvi != null && ` · 總統選舉基本盤 ${pviText(race.pvi)}`}{race.incumbent && ` · 現任 ${race.incumbent.name}${race.incumbent.running ? "（尋求連任）" : "（不連任）"}`}</div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-black sm:text-4xl">{meta.name}長選舉</h1>
          <RatingBadge f={f} />
        </div>
        <p className="mt-3 max-w-2xl leading-relaxed text-ink-2">
          {PARTY_NAME[f.leaderParty]} <b style={{ color: PARTY_VAR[f.leaderParty] }}><CandName raceId={id} name={f.leader} /></b> 當選機率 <b className="num">{prob(leaderP)}</b>，
          預估得票領先 <span className="num">{lead.toFixed(1)}</span> 個百分點。
          {f.pollCount > 0
            ? <>預測有 <b className="num">{Math.round(f.pollWeight * 100)}%</b> 來自 {f.pollCount} 筆民調（最新 {md(f.latestPoll)}），其餘來自歷屆選舉基本盤。</>
            : <>這裡還沒有可用的公開民調，預測完全靠歷屆選舉基本盤和全國風向，不確定性很大。</>}
        </p>
        {race.candidatesFromWiki && <p className="mt-2 text-xs text-accent">候選人名單暫依維基民調表，正式登記資料整理中。</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card kicker="候選人" title="當選機率">
          <ProbBars f={f} candidates={race.candidates} />
          <div className="mt-5 space-y-3 border-t hairline pt-4">
            {race.candidates.map((c) => (
              <div key={c.name} className="flex gap-3 text-sm">
                <div className="pt-0.5"><BallotNo n={c.ballotNumber} size="md" />{c.ballotNumber == null && <span className="inline-block h-6 w-6" />}</div>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><b>{c.name}</b><PartyChip party={c.party} name={c.partyName} />
                    {c.endorsedBy && c.endorsedBy.filter((p) => p !== c.party).length > 0 && <span className="text-[11px] text-ink-3">{c.endorsedBy.filter((p) => p !== c.party).map((p) => PARTY_NAME[p]).join("、")}共同推薦</span>}
                  </div>
                  {(c.currentRole || c.bio) && <div className="mt-0.5 text-ink-2">{[c.currentRole, c.bio].filter(Boolean).join("；")}</div>}
                </div>
              </div>
            ))}
          </div>
          {race.withdrawn.length > 0 && (
            <div className="mt-4 text-xs text-ink-3">已退出：{race.withdrawn.map((w) => `${w.name}（${PARTY_NAME[w.party]}${w.reason ? `，${w.reason}` : ""}）`).join("、")}</div>
          )}
        </Card>

        <Card kicker="每 3 天重算" title="當選機率走勢">
          {probSeries.length ? (
            <LineChart series={probSeries} yDomain={[0, 100]} yTicks={[0, 25, 50, 75, 100]} refY={50} yFormat={(v) => `${v}%`}
              xDomain={["2026-06-01", data.meta.electionDay]} markers={[{ x: data.meta.electionDay, label: "投票日" }]} />
          ) : <p className="text-sm text-ink-3">資料不足。</p>}
          <Legend items={probSeries} />
        </Card>
      </div>

      <Card kicker="加權平均 vs. 每一筆民調" title="民調走勢"
        right={
          <div className="flex flex-col items-end gap-1 text-xs">
            <Toggle on={adjust} set={setAdjust} label="扣掉機構偏差" />
            <Toggle on={phoneOnly} set={setPhoneOnly} label="排除網路民調" />
          </div>
        }>
        {trend && trend.series.length ? (
          <>
            <LineChart series={trend.series} dots={dots} yDomain={[0, 80]} yTicks={[0, 20, 40, 60, 80]} yFormat={(v) => `${v}%`}
              xDomain={[trend.usable[0].fieldEnd, data.meta.electionDay]} markers={[{ x: data.meta.electionDay, label: "投票日" }]} height={260} />
            <p className="mt-2 text-xs leading-relaxed text-ink-3">
              點＝每筆民調換算成「候選人之間」的得票率（未表態按比例分配），空心點是網路民調或候選人委託。線＝模型用的加權平均：
              半衰期 {PARAMS.halfLifeDays} 天、樣本數開根號、網路民調權重 {PARAMS.methodWeight.online}、委託民調 {PARAMS.sponsoredWeight}。
            </p>
          </>
        ) : <p className="text-sm text-ink-3">目前沒有包含現有候選人的民調。</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card kicker="模型怎麼算的" title="民調 × 基本盤">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-3"><th className="py-1 font-normal">候選人</th><th className="font-normal text-right">民調平均</th><th className="font-normal text-right">基本盤</th><th className="font-normal text-right">預估</th></tr></thead>
            <tbody className="divide-y divide-rule">
              {race.candidates.filter((c) => f.shares[c.name] >= 1).map((c) => (
                <tr key={c.name}>
                  <td className="py-1.5"><CandName raceId={id} name={c.name} /></td>
                  <td className="num text-right">{f.pollShares ? pct(f.pollShares[c.name], 1) : "—"}</td>
                  <td className="num text-right text-ink-2">{pct(f.priorShares[c.name], 1)}</td>
                  <td className="num text-right font-semibold" style={{ color: PARTY_VAR[c.party] }}>{pct(f.shares[c.name], 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            民調佔 <span className="num">{Math.round(f.pollWeight * 100)}%</span>。基本盤＝2020／2024 總統選舉這裡比全國偏藍或偏綠多少、2022 縣市長結果，
            加上現任優勢，再加上模型從各地民調估出的全國風向（目前 {live.environment >= 0 ? "偏藍" : "偏綠"} <span className="num">{Math.abs(live.environment).toFixed(1)}</span> 點）。
            預估的不確定度約 ±<span className="num">{(f.sigma * 1.28).toFixed(1)}</span> 個百分點（80% 區間）。
          </p>
        </Card>

        <PastResults race={race} />
      </div>

      <BaselineCard race={race} />

      {race.keyEvents.length > 0 && (
        <Card kicker="時間軸" title="選情大事">
          <ol className="space-y-2">
            {race.keyEvents.map((e, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="num w-20 shrink-0 text-ink-3">{e.date}</span>
                <span>{e.text}{e.source && <a href={e.source} target="_blank" rel="noreferrer" className="ml-1 text-ink-3 underline">來源</a>}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card kicker={`${allPolls.length} 筆，含各種假設情境`} title={`${meta.short}民調庫`}>
        <PollTable polls={allPolls} showRace={false} />
      </Card>
    </div>
  );
}

function PastResults({ race }: { race: ReturnType<typeof useSite>["data"]["races"][number] }) {
  const rows = [
    { label: "2022 縣市長", r: race.result2022 },
    { label: "2018 縣市長", r: race.result2018 },
  ].filter((x) => x.r);
  const pres = ["2024", "2020", "2016"].filter((y) => race.presidential[y]);
  if (!rows.length && !pres.length) return null;
  return (
    <Card kicker="中選會" title="歷屆結果">
      <div className="space-y-4">
        {rows.map(({ label, r }) => (
          <div key={label}>
            <div className="mb-1 text-xs text-ink-3">{label}{r!.turnout != null && `・投票率 ${r!.turnout}%`}</div>
            {r!.candidates.filter((c) => (c.pct ?? 0) >= 2).map((c) => (
              <div key={c.name} className="flex items-center gap-2 text-sm">
                <span className="w-16 truncate">{c.name}</span>
                <div className="h-2 flex-1 rounded-full bg-wash"><div className="h-2 rounded-full" style={{ width: `${c.pct}%`, background: PARTY_FILL[c.party] }} /></div>
                <span className="num w-14 text-right">{c.pct}%</span>
                {c.elected && <span className="text-[11px] text-accent">當選</span>}
              </div>
            ))}
            {r!.note && <div className="mt-1 text-[11px] text-ink-3">{r!.note}</div>}
          </div>
        ))}
        {pres.length > 0 && (
          <div>
            <div className="mb-1 text-xs text-ink-3">總統選舉在這裡的得票率</div>
            <table className="w-full text-sm num">
              <tbody>
                {pres.map((y) => {
                  const v = race.presidential[y]!;
                  return (
                    <tr key={y}>
                      <td className="py-0.5 text-ink-3">{y}</td>
                      <td style={{ color: "var(--dpp)" }}>綠 {v.dpp?.toFixed(1)}</td>
                      <td style={{ color: "var(--kmt)" }}>藍 {v.kmt?.toFixed(1)}</td>
                      <td style={{ color: v.tpp != null ? "var(--tpp)" : "var(--ind)" }}>{v.tpp != null ? `白 ${v.tpp.toFixed(1)}` : v.pfp != null ? `橘 ${v.pfp.toFixed(1)}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

const leanText = (m: number) => (Math.abs(m) < 0.5 ? "持平" : m > 0 ? `藍 +${m.toFixed(1)}` : `綠 +${(-m).toFixed(1)}`);

/** 基本盤由哪些投票組成，以及近期投票、各縣市政黨支持度 */
function BaselineCard({ race }: { race: ReturnType<typeof useSite>["data"]["races"][number] }) {
  const comps = race.prior.components.filter((c) => c.margin != null);
  const r = race.recent;
  const ps = race.partySupport;
  const lp = race.localPartyId;
  if (!comps.length && !ps && !r.recall2025 && !r.referendum2025) return null;
  const maxAbs = Math.max(20, ...comps.map((c) => Math.abs(c.margin!)));
  return (
    <Card kicker="不看民調的話" title="基本盤從哪來">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="mb-3 text-xs leading-relaxed text-ink-3">
            每一項都換算成「地方選舉的藍綠差距」，再依權重平均。
            {race.prior.baseMargin != null && <>加權結果 <b className="num text-ink">{leanText(race.prior.baseMargin)}</b>（未計現任優勢與全國風向）。</>}
          </p>
          <div className="space-y-1.5">
            {comps.map((c) => (
              <div key={c.label} className="grid grid-cols-[10.5rem_1fr_4.5rem] items-center gap-2 text-sm">
                <span className="truncate text-ink-2">{c.label}<span className="ml-1 text-[11px] text-ink-3">×{c.weight}</span></span>
                <div className="relative h-3">
                  <div className="absolute left-1/2 top-0 h-3 w-px bg-rule" />
                  <div className="absolute top-0.5 h-2 rounded-sm" style={{
                    left: c.margin! >= 0 ? "50%" : `${50 + (c.margin! / maxAbs) * 50}%`,
                    width: `${(Math.abs(c.margin!) / maxAbs) * 50}%`,
                    background: c.margin! >= 0 ? "var(--kmt-fill)" : "var(--dpp-fill)",
                  }} />
                </div>
                <span className="num text-right text-xs">{leanText(c.margin!)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3 text-sm">
          {ps && <SupportLine label={`${ps.pollster}：今年縣市長支持哪一黨（${ps.fieldEnd.slice(0, 7)}）`} v={ps} />}
          {lp && <SupportLine label={`${lp.pollster}民調受訪者的政黨傾向（${lp.fieldEnd.slice(0, 7)}，只參考）`} v={lp} />}
          {r.council2022 && <VoteLine label="2022 議員政黨票" v={r.council2022} />}
          {r.legislative2024 && <VoteLine label="2024 區域立委" v={r.legislative2024} />}
          {r.referendum2025?.agreePct != null && (
            <div>
              <div className="text-xs text-ink-3">2025 核三延役公投</div>
              <div className="num">同意 {r.referendum2025.agreePct}%{r.referendum2025.turnout != null && <span className="text-ink-3">・投票率 {r.referendum2025.turnout}%</span>}</div>
            </div>
          )}
          {r.recall2025 && r.recall2025.agreePct != null && (
            <div>
              <div className="text-xs text-ink-3">2025 立委罷免（{r.recall2025.districts} 個選區合計）</div>
              <div className="num">同意罷免 {r.recall2025.agreePct.toFixed(1)}%{r.recall2025.turnout != null && <span className="text-ink-3">・投票率 {r.recall2025.turnout.toFixed(1)}%</span>}</div>
              <div className="text-[11px] text-ink-3">只在國民黨立委選區投票、不能代表全縣市，所以不放進基本盤</div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function SupportLine({ label, v }: { label: string; v: NonNullable<ReturnType<typeof useSite>["data"]["races"][number]["partySupport"]> }) {
  return (
    <div>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="num mt-0.5">
        <span style={{ color: "var(--kmt)" }}>藍 {v.kmt ?? "—"}%</span>　<span style={{ color: "var(--dpp)" }}>綠 {v.dpp ?? "—"}%</span>
        {v.tpp != null && <>　<span style={{ color: "var(--tpp)" }}>白 {v.tpp}%</span></>}
        {v.none != null && <>　<span className="text-ink-3">都不支持／未表態 {v.none}%</span></>}
      </div>
      <a className="text-[11px] text-ink-3 underline" href={v.source} target="_blank" rel="noreferrer">來源</a>
    </div>
  );
}

function VoteLine({ label, v }: { label: string; v: Record<string, number | null> }) {
  return (
    <div>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="num">
        <span style={{ color: "var(--kmt)" }}>藍 {v.kmt?.toFixed(1) ?? "—"}%</span>　<span style={{ color: "var(--dpp)" }}>綠 {v.dpp?.toFixed(1) ?? "—"}%</span>
        {v.tpp != null && v.tpp > 0 && <>　<span style={{ color: "var(--tpp)" }}>白 {v.tpp.toFixed(1)}%</span></>}
        {v.ind != null && <>　<span className="text-ink-3">無黨 {v.ind.toFixed(1)}%</span></>}
      </div>
    </div>
  );
}

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-ink-2">
      <span>{label}</span>
      <button role="switch" aria-checked={on} onClick={() => set(!on)} className={`relative h-5 w-9 rounded-full transition ${on ? "bg-ink" : "bg-rule"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-card transition ${on ? "left-4.5" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function Legend({ items }: { items: Series[] }) {
  if (items.length < 2) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-2">
      {items.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: s.color }} />{s.label}</span>)}
    </div>
  );
}
