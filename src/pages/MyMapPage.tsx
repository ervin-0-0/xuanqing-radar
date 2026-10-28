import { useEffect, useMemo, useState } from "react";
import { Card } from "../components/Layout.tsx";
import { TaiwanMap } from "../components/TaiwanMap.tsx";
import { BallotNo, PartyChip } from "../components/RaceBits.tsx";
import { useSite } from "../lib/store.tsx";
import { PARTY_VAR, probFill, prob } from "../lib/format.ts";
import { PARTY_NAME, RACE_BY_ID, RACES, type Party, type RaceId } from "../lib/types.ts";

// 網址：#/mymap/taipei.1,new-taipei.0 —— 數字是候選人在名單裡的位置
const encode = (picks: Partial<Record<RaceId, number>>) =>
  Object.entries(picks).map(([k, v]) => `${k}.${v}`).join(",");
const decode = (s: string): Partial<Record<RaceId, number>> =>
  Object.fromEntries(s.split(",").filter(Boolean).map((x) => x.split(".")).filter(([k]) => RACE_BY_ID[k as RaceId]).map(([k, v]) => [k, Number(v)]));

export function MyMapPage({ arg }: { arg: string }) {
  const { data, live } = useSite();
  const races = useMemo(() => Object.fromEntries(data.races.map((r) => [r.id, r])), [data]);
  const fById = useMemo(() => Object.fromEntries(live.races.map((r) => [r.id, r])), [live]);
  // 候選人順序固定用今天的預測，拖時光機時網址裡的編號才不會對到別人
  const baseById = useMemo(() => Object.fromEntries(data.forecast.races.map((r) => [r.id, r])), [data]);
  const [picks, setPicks] = useState<Partial<Record<RaceId, number>>>(() => decode(decodeURIComponent(arg)));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const h = `#/mymap/${encode(picks)}`;
    if (window.location.hash !== h) history.replaceState(null, "", h);
  }, [picks]);

  // 依當選機率排序的候選人（只列機率 >0 或主要政黨）
  const options = (id: RaceId) => {
    const f = baseById[id];
    const cands = races[id]?.candidates ?? [];
    return [...cands].sort((a, b) => (f?.winProb[b.name] ?? 0) - (f?.winProb[a.name] ?? 0) || (f?.shares[b.name] ?? 0) - (f?.shares[a.name] ?? 0)).slice(0, 4);
  };
  const winner = (id: RaceId) => {
    const i = picks[id];
    return i == null ? null : options(id)[i] ?? null;
  };
  const cycle = (id: RaceId) => {
    const n = options(id).length;
    setPicks((p) => {
      const cur = p[id];
      const next = cur == null ? 0 : cur + 1 >= n ? undefined : cur + 1;
      const copy = { ...p };
      if (next == null) delete copy[id]; else copy[id] = next;
      return copy;
    });
  };
  const fillFromModel = () => setPicks(Object.fromEntries(RACES.filter((r) => fById[r.id]).map((r) => [r.id, 0])));

  const seats: Partial<Record<Party, number>> = {};
  let decided = 0;
  for (const r of RACES) {
    if (r.tier === "township") continue;
    const w = winner(r.id);
    if (!w) continue;
    decided++;
    seats[w.party] = (seats[w.party] ?? 0) + 1;
  }

  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* 不支援剪貼簿就算了 */ }
  };

  return (
    <div className="space-y-6">
      <section className="rise">
        <div className="kicker">YOUR CALL</div>
        <h1 className="mt-2 font-serif text-3xl font-black">換你預測：點縣市決定誰當選</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-ink-2">
          每點一次換下一位候選人，點到底回到未決定。灰底的是還沒選的縣市。選完把網址分享出去，朋友打開就是你的版本。
        </p>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Card>
          <TaiwanMap
            map={data.map}
            onSelect={cycle}
            fill={(id) => { const w = winner(id); return w ? probFill(w.party, 0.95) : "var(--wash)"; }}
            label={(id) => { const w = winner(id); return w ? `${RACE_BY_ID[id].short}・${w.ballotNumber != null ? `${w.ballotNumber}號 ` : ""}${w.name}` : RACE_BY_ID[id].short; }}
            tooltip={(id) => {
              const w = winner(id);
              const f = fById[id];
              return (
                <div className="text-sm">
                  <div className="font-medium">{RACE_BY_ID[id].name}</div>
                  <div className="flex items-center gap-1">你的預測：{w ? <><BallotNo n={w.ballotNumber} />{w.name}</> : "未決定"}</div>
                  {f && <div className="text-xs text-ink-3">模型：{f.leader} {prob(f.winProb[f.leader])}</div>}
                </div>
              );
            }}
          />
        </Card>
        <div className="space-y-6">
          <Card title="你的席次">
            <div className="flex flex-wrap gap-6">
              {(["kmt", "dpp", "tpp", "ind"] as Party[]).map((p) => (
                <div key={p}>
                  <div className="text-xs text-ink-3">{PARTY_NAME[p]}</div>
                  <div className="font-serif text-4xl font-black num" style={{ color: PARTY_VAR[p] }}>{seats[p] ?? 0}</div>
                </div>
              ))}
              <div>
                <div className="text-xs text-ink-3">未決定</div>
                <div className="font-serif text-4xl font-black num text-ink-3">{22 - decided}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={fillFromModel} className="rounded-md border hairline px-3 py-1.5 text-sm hover:bg-wash">從模型預測開始</button>
              <button onClick={() => setPicks({})} className="rounded-md border hairline px-3 py-1.5 text-sm hover:bg-wash">全部清空</button>
              <button onClick={share} className="rounded-md bg-ink px-3 py-1.5 text-sm text-paper">{copied ? "已複製網址" : "複製分享網址"}</button>
            </div>
          </Card>
          <Card title="逐縣市">
            <ul className="divide-y hairline text-sm">
              {RACES.map((r) => {
                const w = winner(r.id);
                const f = fById[r.id];
                const differs = w && f && w.name !== f.leader;
                return (
                  <li key={r.id} className="flex items-center gap-2 py-1.5">
                    <button onClick={() => cycle(r.id)} className="w-14 text-left font-medium hover:underline">{r.short}</button>
                    {w ? <><BallotNo n={w.ballotNumber} /><span>{w.name}</span><PartyChip party={w.party} name={w.partyName} /></> : <span className="text-ink-3">未決定</span>}
                    {differs && <span className="ml-auto text-[11px] text-accent">跟模型不同（模型 {f.leader} {prob(f.winProb[f.leader])}）</span>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
