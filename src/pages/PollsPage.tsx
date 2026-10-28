import { useMemo, useState } from "react";
import { Card } from "../components/Layout.tsx";
import { PollCards } from "../components/PollCard.tsx";
import { useSite } from "../lib/store.tsx";
import { METHOD_LABEL } from "../lib/format.ts";
import { RACES, type RaceId, type Region } from "../lib/types.ts";

const REGIONS: { id: Region | "all"; label: string }[] = [
  { id: "all", label: "全部" }, { id: "north", label: "北部" }, { id: "central", label: "中部" },
  { id: "south", label: "南部" }, { id: "east", label: "東部" }, { id: "islands", label: "離島" },
];

export function PollsPage() {
  const { data } = useSite();
  const [region, setRegion] = useState<Region | "all">("all");
  const [race, setRace] = useState<RaceId | "">("");
  const [pollster, setPollster] = useState("");
  const [method, setMethod] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [since, setSince] = useState("2026-01-01");

  const pollsters = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of data.polls) c[p.pollster] = (c[p.pollster] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const filtered = data.polls.filter((p) => {
    const meta = RACES.find((r) => r.id === p.raceId)!;
    if (region !== "all" && meta.region !== region) return false;
    if (race && p.raceId !== race) return false;
    if (pollster && p.pollster !== pollster) return false;
    if (method && p.method !== method) return false;
    if (!showAll && (p.excluded || p.kind !== "general")) return false;
    if (p.fieldEnd < since) return false;
    return true;
  });

  const detailed = data.polls.filter((p) => p.sampleSize).length;
  return (
    <div className="space-y-6">
      <section className="rise">
        <div className="kicker">POLL FILE</div>
        <h1 className="mt-2 font-serif text-3xl font-black">把報導裡的支持率，全部攤開來</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-ink-2">
          共 <b className="num">{data.polls.length}</b> 筆（含同一次調查的不同假設情境），其中 <b className="num">{detailed}</b> 筆已從原始報導補上樣本數、調查方式與委託單位。
          點任一張卡片看細節與原始連結。未表態另外列，不把「不知道」當成中立。
        </p>
      </section>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {REGIONS.map((r) => (
            <button key={r.id} onClick={() => { setRegion(r.id); setRace(""); }}
              className={`rounded-full border px-3 py-1 text-sm ${region === r.id ? "border-ink bg-ink text-paper" : "hairline text-ink-2 hover:bg-wash"}`}>{r.label}</button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Select value={race} onChange={(v) => setRace(v as RaceId | "")} label="縣市">
            <option value="">所有縣市</option>
            {RACES.filter((r) => region === "all" || r.region === region).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Select value={pollster} onChange={setPollster} label="機構">
            <option value="">所有機構</option>
            {pollsters.map(([p, n]) => <option key={p} value={p}>{p}（{n}）</option>)}
          </Select>
          <Select value={method} onChange={setMethod} label="方式">
            <option value="">所有方式</option>
            {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={since} onChange={setSince} label="期間">
            <option value="2026-09-01">9 月以後</option>
            <option value="2026-07-01">7 月以後</option>
            <option value="2026-01-01">2026 年</option>
            <option value="2000-01-01">全部（含 2025）</option>
          </Select>
          <label className="inline-flex items-center gap-1.5 text-ink-2">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[var(--ink)]" />
            含初選、內參與不採用
          </label>
          <span className="ml-auto text-xs text-ink-3">顯示 <span className="num">{filtered.length}</span> 筆</span>
        </div>
      </Card>

      <Card><PollCards key={`${region}|${race}|${pollster}|${method}|${since}|${showAll}`} polls={filtered} /></Card>
    </div>
  );
}

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-md border hairline bg-card px-2 py-1.5 text-sm">{children}</select>
  );
}
