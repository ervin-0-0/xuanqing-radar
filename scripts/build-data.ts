// 把 data/ 底下各來源合併成網站讀的 public/data/*.json，並先算好今天的預測與走勢。
// 用法：npm run data（AS_OF=2026-10-01 可指定基準日）

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import { computePrior, pvi, type MayorResults, type PresidentialResults } from "../src/lib/fundamentals.ts";
import { forecast, forecastHistory, type Candidate, type Method, type ModelRace } from "../src/lib/model.ts";
import { canonicalPollster, classifyPoll, EXCLUDED_POLLSTERS, POLLSTER_QUALITY } from "../src/lib/pollsters.ts";
import { RACES, type Party, type RaceId } from "../src/lib/types.ts";
import { RACE_BY_HEADING, type WikiPollRow, type WikiSection } from "../src/lib/wikitable.ts";
import type { PublicPoll } from "../src/lib/data.ts";

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
const partyList = read<{ elections: Record<string, { byRace: Record<string, Record<string, number>> }> }>("data/base/party-list-by-county.json");
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

const races = RACES.map((meta) => {
  const candidates = candidatesFor(meta.id);
  const prior = computePrior(meta.id, candidates, { mayor2022, pres });
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
  };
});

// ── 預測 ─────────────────────────────────────────────────
const modelRaces: ModelRace[] = races
  .filter((r) => r.candidates.length >= 2)
  .map((r) => ({ id: r.id, tier: r.tier, candidates: r.candidates, priorShares: r.prior.priorShares, priorSigma: r.prior.priorSigma }));
const modelPolls = polls.map((p) => ({ ...p, published: p.published }));
const today_ = forecast(modelRaces, modelPolls, { asOf: AS_OF, electionDay: ELECTION_DAY });
const history = forecastHistory(modelRaces, modelPolls, HISTORY_FROM, AS_OF, ELECTION_DAY, 3);

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
