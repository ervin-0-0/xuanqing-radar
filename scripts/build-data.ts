// 把 data/ 底下各來源合併成網站讀的 public/data/*.json，並先算好今天的預測與走勢。
// 用法：npm run data（AS_OF=2026-10-01 可指定基準日）

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import { computePrior, pvi, relativeLean, type MayorResults, type PresidentialResults } from "../src/lib/fundamentals.ts";
import { forecast, forecastHistory, type Candidate, type Method, type ModelRace } from "../src/lib/model.ts";
import { canonicalPollster, classifyPoll, EXCLUDED_POLLSTERS, POLLSTER_QUALITY } from "../src/lib/pollsters.ts";
import { RACES, type Party, type RaceId } from "../src/lib/types.ts";
import { RACE_BY_HEADING, type WikiPollRow, type WikiSection } from "../src/lib/wikitable.ts";
import type { PublicPoll } from "../src/lib/data.ts";
import { backtest, pollErrors, pollsterAccuracy, type HistFile } from "../src/lib/calibration.ts";

const ELECTION_DAY = "2026-11-28";
const HISTORY_FROM = "2026-06-01";
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date());
const AS_OF = process.env.AS_OF ?? (today < ELECTION_DAY ? today : ELECTION_DAY);

const read = <T>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null);
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 10);

function normUrl(u: string) {
  try {
    const x = new URL(u.trim());
    return (x.host.replace(/^(www|m)\./, "") + x.pathname.replace(/\/$/, "") + x.search).toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

// ── 讀來源 ────────────────────────────────────────────────
interface DetailResult { name: string; party?: Party; pct: number }
interface Detail {
  source: string; extraSources?: string[]; pollster?: string; sponsor?: string | null;
  fieldStart?: string | null; fieldEnd?: string | null; published?: string | null;
  method?: Method | null; sampleSize?: number | null; moe?: number | null; confidence?: number | null;
  population?: string | null; weighting?: string | null;
  results?: DetailResult[]; undecided?: number | null;
  /** 一篇報導有多組對比時，各組都列在這裡 */
  scenarios?: { label?: string; results: DetailResult[]; undecided?: number | null }[];
  likelyVoters?: { sampleSize?: number | null; results: DetailResult[] } | null;
  notes?: string | null; excluded?: boolean; excludeReason?: string | null; scenario?: string | null;
}
interface DetailFile { raceId: RaceId; details?: Detail[]; extraPolls?: Detail[] }
interface RaceFileCandidate {
  name: string; party: Party; partyName?: string | null; status: string; ballotNumber?: number | null;
  endorsedBy?: Party[]; incumbent?: boolean; born?: number | null; currentRole?: string | null; bio?: string | null; source?: string;
}
interface RaceFile {
  raceId: RaceId;
  incumbent?: { name: string; party: Party; running: boolean; termLimited?: boolean };
  candidates: RaceFileCandidate[];
  withdrawn?: { name: string; party: Party; reason?: string; date?: string; source?: string }[];
  keyEvents?: { date: string; text: string; source?: string }[];
  notes?: string | null;
  updated?: string;
}

const wiki = read<{ rows: WikiPollRow[]; sections?: WikiSection[]; fetched: string; source: string }>("data/polls/wiki.json");
if (!wiki) throw new Error("缺 data/polls/wiki.json，先跑 npm run data:wiki");
const mayor2022 = read<MayorResults & { source?: string }>("data/base/results-mayor-2022.json");
const mayor2018 = read<MayorResults & { source?: string }>("data/base/results-mayor-2018.json");
const pres = read<PresidentialResults>("data/base/presidential-by-county.json");
type ByRace = Record<string, Record<string, number | null>>;
const partyList = read<{ elections: Record<string, { national: Record<string, number>; byRace: ByRace }> }>("data/base/party-list-by-county.json");
interface RecentVotes {
  council2022?: { national: Record<string, number>; byRace: ByRace; source?: string };
  legislative2024?: { national: Record<string, number>; byRace: ByRace; source?: string };
  recall2025?: { districts: unknown[]; byRace: Record<string, { agreePct: number | null; turnout: number | null; districts: number }>; rounds?: unknown[] };
  referendum2025?: { date: string; question: string; national: { agreePct: number; turnout: number }; byRace: Record<string, { agreePct: number | null; turnout: number | null }>; source?: string };
}
const recent = read<RecentVotes>("data/base/recent-votes.json");
interface PartySupportSurvey {
  pollster: string; title?: string; fieldStart?: string | null; fieldEnd: string; published?: string | null; source: string;
  byRace: Record<string, { kmt: number | null; dpp: number | null; tpp?: number | null; none?: number | null; sampleSize?: number | null }>;
}
const partySupport = read<{ surveys: PartySupportSurvey[] }>("data/base/party-support-county.json");
const national = Object.fromEntries(
  ["approval", "party-favorability", "party-id", "party-id-nccu"].map((k) => [k, read<{ series: unknown[] }>(`data/national/${k}.json`)?.series ?? []]),
);
const details = new Map<RaceId, DetailFile>();
const raceFiles = new Map<RaceId, RaceFile>();
for (const r of RACES) {
  const d = read<DetailFile>(`data/polls/details/${r.id}.json`);
  if (d) details.set(r.id, d);
  const f = read<RaceFile>(`data/races/${r.id}.json`);
  if (f) raceFiles.set(r.id, f);
}

// ── 民調：維基為主，補上細節，再加維基沒有的 ─────────────────
const polls: PublicPoll[] = [];
const usedDetails = new Set<Detail>();

for (const row of wiki.rows) {
  const pollster = canonicalPollster(row.pollster);
  const urls = new Set(row.sources.map(normUrl));
  const cands = (details.get(row.raceId)?.details ?? []).filter((d) =>
    [d.source, ...(d.extraSources ?? [])].some((u) => u && urls.has(normUrl(u))),
  );
  // 同一篇報導可能涵蓋好幾次調查：取日期最接近的
  const detail = cands.sort((a, b) => dateGap(a, row) - dateGap(b, row))[0];
  if (detail) usedDetails.add(detail);

  const names = row.results.map((r) => r.name).sort().join("|");
  // 細節檔的主結果或任一組對比，候選人組合跟維基這一列相同，就用原始報導的數字
  const key = (rs: DetailResult[] | undefined | null) => rs?.map((r) => r.name).sort().join("|");
  const match = detail
    ? [{ results: detail.results ?? undefined, undecided: detail.undecided }, ...(detail.scenarios ?? [])].find((sc) => key(sc.results) === names)
    : undefined;
  const sameScenario = !!match;
  // 黨籍以選區檔（中選會登記）為準，維基常把小黨標成無黨籍
  const officialParty = (name: string, fallback: Party) => raceFiles.get(row.raceId)?.candidates.find((c) => c.name === name)?.party ?? fallback;
  const results = (match
    ? match.results!.map((r) => ({ name: r.name, party: row.results.find((x) => x.name === r.name)!.party, pct: r.pct }))
    : row.results).map((r) => ({ ...r, party: officialParty(r.name, r.party) }));
  const kind = classifyPoll(pollster, row.scenario);
  // 細節檔明確寫 results: null ＝ 查證後發現不是全市對決（例如分區民調），不能當成全市數字
  const notCitywide = detail && detail.results === null;
  const excludeReason = EXCLUDED_POLLSTERS[pollster]
    ?? (detail?.excluded ? detail.excludeReason ?? "來源不採用" : null)
    ?? (notCitywide ? "查證原始報導後，這不是全市候選人對決（例如分區民調），詳見備註" : null);

  polls.push({
    id: hash(`${row.raceId}|${pollster}|${row.fieldEnd}|${row.variant}|${names}`),
    raceId: row.raceId,
    pollster,
    sponsor: detail?.sponsor ?? null,
    method: detail?.method ?? "unknown",
    sampleSize: detail?.sampleSize ?? null,
    moe: detail?.moe ?? null,
    fieldStart: row.fieldStart ?? row.fieldEnd!,
    fieldEnd: row.fieldEnd!,
    published: detail?.published ?? null,
    results,
    undecided: match && match.undecided != null ? match.undecided : row.undecided,
    likelyVoters: match && match.results === detail?.results ? detail?.likelyVoters ?? null : null,
    population: detail?.population ?? null,
    notes: detail?.notes ?? null,
    scenario: row.scenario,
    variant: row.variant,
    sources: row.sources,
    origin: "wiki",
    kind,
    excluded: !!excludeReason,
    excludeReason,
    quality: POLLSTER_QUALITY[pollster]?.weight ?? 1,
    qualityNote: POLLSTER_QUALITY[pollster]?.note ?? null,
  });
}

function dateGap(d: Detail, row: WikiPollRow) {
  if (!d.fieldEnd || !row.fieldEnd) return 999;
  return Math.abs(Date.parse(d.fieldEnd) - Date.parse(row.fieldEnd)) / 86_400_000;
}

for (const [raceId, file] of details) {
  for (const x of file.extraPolls ?? []) {
    if (!x.fieldEnd || !x.results?.length) continue;
    const pollster = canonicalPollster(x.pollster ?? "不詳");
    const dup = polls.some((p) => p.raceId === raceId && p.pollster === pollster && Math.abs(Date.parse(p.fieldEnd) - Date.parse(x.fieldEnd!)) <= 2 * 86_400_000);
    if (dup) continue;
    const party = (name: string, given?: Party): Party =>
      given ?? raceFiles.get(raceId)?.candidates.find((c) => c.name === name)?.party ?? "ind";
    const excludeReason = EXCLUDED_POLLSTERS[pollster] ?? (x.excluded ? x.excludeReason ?? "來源不採用" : null);
    polls.push({
      id: hash(`${raceId}|${pollster}|${x.fieldEnd}|extra|${x.results.map((r) => r.name).sort().join("|")}`),
      raceId, pollster,
      sponsor: x.sponsor ?? null, method: x.method ?? "unknown", sampleSize: x.sampleSize ?? null, moe: x.moe ?? null,
      fieldStart: x.fieldStart ?? x.fieldEnd, fieldEnd: x.fieldEnd, published: x.published ?? null,
      results: x.results.map((r) => ({ name: r.name, party: party(r.name, r.party), pct: r.pct })),
      undecided: x.undecided ?? null, likelyVoters: x.likelyVoters ?? null, population: x.population ?? null,
      notes: x.notes ?? null, scenario: x.scenario ?? "", variant: 0,
      sources: [x.source, ...(x.extraSources ?? [])].filter(Boolean),
      origin: "extra", kind: classifyPoll(pollster, x.scenario ?? x.notes ?? ""),
      excluded: !!excludeReason, excludeReason,
      quality: POLLSTER_QUALITY[pollster]?.weight ?? 1,
      qualityNote: POLLSTER_QUALITY[pollster]?.note ?? null,
    });
  }
}
polls.sort((a, b) => b.fieldEnd.localeCompare(a.fieldEnd) || a.raceId.localeCompare(b.raceId) || a.variant - b.variant);

// ── 候選人：選區檔為主，沒有的話用維基最後一個情境的欄位 ───────────
function candidatesFor(id: RaceId): Candidate[] {
  const f = raceFiles.get(id);
  if (f?.candidates?.length) {
    return f.candidates
      .filter((c) => c.status !== "withdrawn")
      .map((c) => ({
        name: c.name, party: c.party, partyName: c.partyName ?? null, incumbent: !!c.incumbent, ballotNumber: c.ballotNumber ?? null,
        currentRole: c.currentRole ?? null, bio: c.bio ?? null, endorsedBy: c.endorsedBy ?? [],
      }))
      .sort((a, b) => (a.ballotNumber ?? 99) - (b.ballotNumber ?? 99));
  }
  // 沒有選區檔：用維基該縣市最後一張民調表的表頭（通常就是最終對決），現任＝2022 當選且同名
  const section = (wiki!.sections ?? []).filter((x) => x.raceId === id).at(-1);
  const elected22 = mayor2022?.races[id]?.candidates.find((c) => c.elected)?.name;
  return (section?.candidates ?? []).map((c) => ({ name: c.name, party: c.party, incumbent: c.name === elected22, ballotNumber: null }));
}

// ── 基本盤的近期指標：各項都換成「比全國偏藍幾點」 ─────────────────
// 各縣市政黨支持度：跟同一份調查的全國平均比（用 2022 有效票加權），再依未表態比例放大成選票尺度
const latestSupport = (id: RaceId) =>
  [...(partySupport?.surveys ?? [])].filter((s) => s.byRace[id]?.kmt != null && s.byRace[id]?.dpp != null).sort((a, b) => b.fieldEnd.localeCompare(a.fieldEnd))[0];
function supportLean(id: RaceId): { lean: number | null; label: string } {
  const sv = latestSupport(id);
  if (!sv) return { lean: null, label: "政黨支持度" };
  let k = 0, d = 0, w = 0;
  for (const [rid, v] of Object.entries(sv.byRace)) {
    const wt = mayor2022?.races[rid as RaceId]?.validVotes ?? 0;
    if (rid === "zhubei" || v.kmt == null || v.dpp == null || !wt) continue;
    k += v.kmt * wt; d += v.dpp * wt; w += wt;
  }
  if (w === 0) return { lean: null, label: "政黨支持度" };
  const r = sv.byRace[id]!;
  const scale = Math.min(2, Math.max(1, 1 / (1 - (r.none ?? 0) / 100)));
  return { lean: relativeLean({ [id]: r as Record<string, number> }, { kmt: k / w, dpp: d / w }, id, scale), label: `${sv.fieldEnd.slice(0, 4)} ${sv.pollster}政黨支持度` };
}
const leansFor = (id: RaceId) => {
  const sup = supportLean(id);
  const ref = recent?.referendum2025;
  return [
    { label: "2024 不分區政黨票", lean: relativeLean(partyList?.elections["2024"]?.byRace, partyList?.elections["2024"]?.national, id), weight: 0.8 },
    { label: "2022 議員政黨票", lean: relativeLean(recent?.council2022?.byRace, recent?.council2022?.national, id), weight: 0.6 },
    { label: "2024 區域立委", lean: relativeLean(recent?.legislative2024?.byRace, recent?.legislative2024?.national, id), weight: 0.6 },
    { label: sup.label, lean: sup.lean, weight: 0.8 },
    // 核三延役公投「同意」跟藍營立場一致；只當弱指標
    { label: "2025 核三公投", lean: ref?.byRace[id]?.agreePct != null ? ref.byRace[id].agreePct! - ref.national.agreePct : null, weight: 0.3 },
  ];
};

const races = RACES.map((meta) => {
  const candidates = candidatesFor(meta.id);
  const prior = computePrior(meta.id, candidates, { mayorPrev: mayor2022, pres, leans: leansFor(meta.id) });
  const file = raceFiles.get(meta.id);
  return {
    ...meta,
    candidates,
    prior,
    incumbent: file?.incumbent ?? null,
    withdrawn: file?.withdrawn ?? [],
    keyEvents: (file?.keyEvents ?? []).sort((a, b) => b.date.localeCompare(a.date)),
    notes: file?.notes ?? null,
    candidatesFromWiki: !file?.candidates?.length,
    result2022: mayor2022?.races[meta.id] ?? null,
    result2018: mayor2018?.races[meta.id] ?? null,
    pvi: pvi(pres, meta.id),
    presidential: Object.fromEntries(Object.entries(pres?.elections ?? {}).map(([y, e]) => [y, e.byRace[meta.id] ?? null])),
    partyList: Object.fromEntries(Object.entries(partyList?.elections ?? {}).map(([y, e]) => [y, e.byRace[meta.id] ?? null])),
    recent: {
      council2022: recent?.council2022?.byRace[meta.id] ?? null,
      legislative2024: recent?.legislative2024?.byRace[meta.id] ?? null,
      recall2025: recent?.recall2025?.byRace[meta.id] ?? null,
      referendum2025: recent?.referendum2025?.byRace[meta.id] ?? null,
    },
    partySupport: latestSupport(meta.id)
      ? { ...latestSupport(meta.id)!.byRace[meta.id], pollster: latestSupport(meta.id)!.pollster, fieldEnd: latestSupport(meta.id)!.fieldEnd, source: latestSupport(meta.id)!.source }
      : null,
  };
});

// ── 校準：歷屆選前民調 vs 開票 ──────────────────────────────
const hist2018 = read<HistFile>("data/history/polls-2018.json");
const hist2022 = read<HistFile>("data/history/polls-2022.json");
const errors2018 = hist2018 && mayor2018 ? pollErrors(hist2018, mayor2018) : [];
const errors2022 = hist2022 && mayor2022 ? pollErrors(hist2022, mayor2022) : [];
const toHouse = (a: ReturnType<typeof pollsterAccuracy> | null) =>
  Object.fromEntries((a?.pollsters ?? []).filter((p) => p.bias != null && p.biasN > 0).map((p) => [p.pollster, { bias: p.bias!, n: p.biasN }]));
const accuracy = errors2018.length + errors2022.length ? pollsterAccuracy([...errors2018, ...errors2022]) : null;
const houseHistory = toHouse(accuracy);
// 回測 2022：只能用 2018 以前就有的資料（2018 縣市長、2016／2020 總統、2020 不分區、2018 的機構紀錄）
const backtests = hist2022 && mayor2022
  ? [backtest({
      file: hist2022, results: mayor2022, mayorPrev: mayor2018, pres, presWeights: { "2016": 0.4, "2020": 0.6 },
      partyList: partyList?.elections["2020"], house: toHouse(errors2018.length ? pollsterAccuracy(errors2018) : null),
    })]
  : [];

// ── 預測 ─────────────────────────────────────────────────
const modelRaces: ModelRace[] = races
  .filter((r) => r.candidates.length >= 2)
  .map((r) => ({ id: r.id, tier: r.tier, candidates: r.candidates, priorShares: r.prior.priorShares, priorSigma: r.prior.priorSigma, priorKnown: r.prior.known }));
const modelPolls = polls.map((p) => ({ ...p, published: p.published }));
const today_ = forecast(modelRaces, modelPolls, { asOf: AS_OF, electionDay: ELECTION_DAY, houseHistory });
const history = forecastHistory(modelRaces, modelPolls, HISTORY_FROM, AS_OF, ELECTION_DAY, 3, 2000, houseHistory);

// ── 地圖：用 taiwan-atlas 已投影好的版本（金門、連江、澎湖已排成插圖），瀏覽器端不用再投影 ──
const counties = JSON.parse(readFileSync("node_modules/taiwan-atlas/counties-mercator-10t.json", "utf8")) as Topology;
const towns = JSON.parse(readFileSync("node_modules/taiwan-atlas/towns-mercator-10t.json", "utf8")) as Topology;
const countyFc = feature(counties, counties.objects.counties as GeometryCollection);
const townFc = feature(towns, towns.objects.towns as GeometryCollection);
const borders = feature(counties, counties.objects.compBorders as GeometryCollection);
const round = (c: unknown): unknown => (Array.isArray(c) ? (typeof c[0] === "number" ? c.map((v: number) => Math.round(v * 10) / 10) : c.map(round)) : c);
const slim = (id: string, g: GeoJSON.Geometry) => ({ type: "Feature", id, properties: {}, geometry: { ...g, coordinates: round((g as { coordinates: unknown }).coordinates) } });
const mapFeatures = [
  ...countyFc.features.map((f) => slim(RACE_BY_HEADING[(f.properties as { COUNTYNAME: string }).COUNTYNAME], f.geometry)),
  ...townFc.features.filter((f) => (f.properties as { TOWNNAME: string }).TOWNNAME === "竹北市").map((f) => slim("zhubei", f.geometry)),
  ...borders.features.map((f) => slim("_borders", f.geometry)),
];

// ── 輸出 ─────────────────────────────────────────────────
mkdirSync("public/data", { recursive: true });
const out = (name: string, data: unknown) => writeFileSync(`public/data/${name}.json`, JSON.stringify(data));
out("races", races);
out("polls", polls);
out("national", national);
out("forecast", today_);
out("history", history);
out("map", { type: "FeatureCollection", features: mapFeatures });
out("calibration", {
  years: { "2018": errors2018.length, "2022": errors2022.length },
  accuracy,
  houseHistory,
  backtests,
});
const latest = polls.filter((p) => !p.excluded).map((p) => p.fieldEnd).sort().at(-1);
out("meta", {
  built: new Date().toISOString(),
  asOf: AS_OF,
  electionDay: ELECTION_DAY,
  latestPoll: latest,
  wikiFetched: wiki.fetched,
  wikiSource: wiki.source,
  counts: { polls: polls.length, extraPolls: polls.filter((p) => p.origin === "extra").length, detailed: usedDetails.size, races: races.length },
  sources: { mayor2022: mayor2022?.source ?? null, mayor2018: mayor2018?.source ?? null },
});

const missing = RACES.filter((r) => !raceFiles.has(r.id)).map((r) => r.name);
console.log(`民調 ${polls.length} 筆（細節 ${usedDetails.size}、維基外 ${polls.filter((p) => p.origin === "extra").length}），最新 ${latest}；基準日 ${AS_OF}`);
console.log(`席次期望：藍 ${today_.seats.expected.kmt.toFixed(1)}／綠 ${today_.seats.expected.dpp.toFixed(1)}／白 ${today_.seats.expected.tpp.toFixed(1)}／無 ${today_.seats.expected.ind.toFixed(1)}`);
if (missing.length) console.log(`尚無選區檔（候選人暫用維基）：${missing.join("、")}`);
if (!mayor2022 || !pres) console.log("尚無歷屆結果，基本盤暫用預設值");
if (accuracy) console.log(`校準：2018 ${errors2018.length} 筆、2022 ${errors2022.length} 筆，前兩名差距 RMSE ${accuracy.rmse.toFixed(1)}（最後三週 ${accuracy.rmseLast3Weeks.toFixed(1)}），業界偏差 ${JSON.stringify(Object.fromEntries(Object.entries(accuracy.industryBias).map(([y, v]) => [y, +v.toFixed(1)])))}`);
for (const b of backtests) console.log(`回測 ${b.year}：猜中 ${b.correct}/${b.total}，Brier ${b.brier.toFixed(3)}`);
