// 網站讀的 public/data/*.json 型別，以及載入函式。

import type { Candidate, Forecast, Method, PollResult } from "./model.ts";
import type { Prior, ResultCandidate } from "./fundamentals.ts";
import type { Party, RaceId, RaceMeta } from "./types.ts";

export interface PublicPoll {
  id: string;
  raceId: RaceId;
  pollster: string;
  sponsor: string | null;
  method: Method;
  sampleSize: number | null;
  moe: number | null;
  fieldStart: string;
  fieldEnd: string;
  published: string | null;
  results: PollResult[];
  undecided: number | null;
  likelyVoters: { sampleSize?: number | null; results: { name: string; pct: number }[] } | null;
  population: string | null;
  notes: string | null;
  scenario: string;
  variant: number;
  sources: string[];
  origin: "wiki" | "extra";
  kind: "general" | "primary" | "internal";
  excluded: boolean;
  excludeReason: string | null;
  quality: number;
  qualityNote: string | null;
}

export interface PastRace { candidates: ResultCandidate[]; turnout: number | null; electorate?: number | null; validVotes?: number | null; note?: string; source?: string }

export interface RaceData extends RaceMeta {
  candidates: Candidate[];
  prior: Prior;
  incumbent: { name: string; party: Party; running: boolean; termLimited?: boolean } | null;
  withdrawn: { name: string; party: Party; reason?: string; date?: string; source?: string }[];
  keyEvents: { date: string; text: string; source?: string }[];
  notes: string | null;
  candidatesFromWiki: boolean;
  result2022: PastRace | null;
  result2018: PastRace | null;
  pvi: number | null;
  presidential: Record<string, Record<string, number> | null>;
  partyList: Record<string, Record<string, number> | null>;
  recent: {
    council2022: Record<string, number | null> | null;
    legislative2024: Record<string, number | null> | null;
    recall2025: { agreePct: number | null; turnout: number | null; districts: number } | null;
    referendum2025: { agreePct: number | null; turnout: number | null } | null;
  };
  /** 跨縣市調查（遠見）的政黨支持，進基本盤 */
  partySupport: PartySupportView | null;
  /** 最近一次本地民調的受訪者政黨傾向，只參考 */
  localPartyId: PartySupportView | null;
}

export interface PartySupportView {
  kmt: number | null; dpp: number | null; tpp?: number | null; none?: number | null; sampleSize?: number | null;
  pollster: string; fieldEnd: string; source: string;
}

export interface SeriesPoint {
  fieldStart: string | null;
  fieldEnd: string;
  published?: string | null;
  pollster: string;
  sampleSize?: number | null;
  method?: Method;
  values: Record<string, number | null>;
  source: string;
}

export interface NationalData {
  approval: SeriesPoint[];
  "party-favorability": SeriesPoint[];
  "party-id": SeriesPoint[];
  "party-id-nccu": SeriesPoint[];
}

export interface HistoryPoint {
  date: string;
  races: Record<string, { winProb: Record<string, number>; shares: Record<string, number> }>;
  seats: Record<Party, number>;
}

export interface Meta {
  built: string;
  asOf: string;
  electionDay: string;
  latestPoll: string;
  /** 縣市政黨支持度換算成投票尺度的係數 */
  supportScale?: number;
  wikiFetched: string;
  wikiSource: string;
  counts: { polls: number; extraPolls: number; detailed: number; races: number };
}

export interface Calibration {
  years: Record<string, number>;
  accuracy: {
    pollsters: { pollster: string; n: number; bias: number | null; biasN: number; rmse: number; hitRate: number }[];
    industryBias: Record<string, number>;
    rmse: number;
    rmseLast3Weeks: number;
    medianAbs: number;
    hitRate: number;
  } | null;
  houseHistory: Record<string, { bias: number; n: number }>;
  backtests: {
    year: number; asOf: string; correct: number; total: number; brier: number;
    races: { id: RaceId; predicted: string; predictedParty: Party; prob: number; winner: string; winnerParty: Party; correct: boolean; pollCount: number }[];
  }[];
}

export interface SiteData {
  races: RaceData[];
  polls: PublicPoll[];
  national: NationalData;
  forecast: Forecast;
  history: HistoryPoint[];
  map: GeoJSON.FeatureCollection;
  calibration: Calibration;
  meta: Meta;
}

const BASE = import.meta.env?.VITE_DATA_BASE ?? `${import.meta.env?.BASE_URL ?? "/"}data/`;

/** 封關期間部署的版本只有 meta.json（blackout: true），其餘民調檔案都不上線 */
export async function loadSiteData(): Promise<SiteData | { blackout: true }> {
  const bust = `?t=${Math.floor(Date.now() / 600_000)}`; // 每 10 分鐘換一次，避免 CDN 快取太久
  const get = async (n: string) => {
    const r = await fetch(`${BASE}${n}.json${bust}`);
    if (!r.ok) throw new Error(`${n}.json 載入失敗（${r.status}）`);
    return r.json();
  };
  const meta = await get("meta");
  if (meta.blackout) return { blackout: true };
  const names = ["races", "polls", "national", "forecast", "history", "map", "calibration"] as const;
  const parts = await Promise.all(names.map(get));
  return { ...(Object.fromEntries(names.map((n, i) => [n, parts[i]])) as unknown as SiteData), meta };
}
