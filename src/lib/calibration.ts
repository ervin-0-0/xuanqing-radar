// 用歷屆選前民調對照開票結果：算各機構的偏差與誤差，並把整套模型拿去回測。

import { computePrior, relativeLean, type MayorResults, type PresidentialResults } from "./fundamentals.ts";
import { forecast, type Candidate, type Method, type ModelRace, type Poll } from "./model.ts";
import { canonicalPollster } from "./pollsters.ts";
import { addDays } from "./stats.ts";
import { RACES, type Party, type RaceId } from "./types.ts";

export interface HistPoll {
  raceId: RaceId;
  pollster: string;
  sponsor: string | null;
  fieldStart: string | null;
  fieldEnd: string;
  published: string | null;
  method: Method | null;
  sampleSize: number | null;
  results: { name: string; party: Party; pct: number }[];
  undecided: number | null;
  source: string;
}
export interface HistFile { year: number; electionDay: string; polls: HistPoll[] }

/** 中選會與維基的異體字 */
export const normName = (n: string) => n.replace(/黄/g, "黃").replace(/\s+/g, "");

export interface PollError {
  year: number;
  raceId: RaceId;
  pollster: string;
  fieldEnd: string;
  daysOut: number;
  /** 實際前兩名的差距：民調減開票（正＝民調高估實際第一名） */
  error: number;
  /** 藍綠差距：民調減開票（正＝民調偏藍）；沒有藍綠對決為 null */
  blocError: number | null;
  calledWinner: boolean;
}

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** 每筆民調跟開票比：都換算成「民調裡有列到的候選人之間」的得票率再比，未表態不算 */
export function pollErrors(file: HistFile, results: MayorResults): PollError[] {
  const out: PollError[] = [];
  for (const p of file.polls) {
    const r = results.races[p.raceId];
    if (!r) continue;
    const actual = r.candidates.map((c) => ({ ...c, key: normName(c.name) }));
    const listed = p.results.map((x) => ({ ...x, key: normName(x.name) })).filter((x) => actual.some((a) => a.key === x.key));
    if (listed.length < 2) continue;
    const pollSum = listed.reduce((s, x) => s + x.pct, 0);
    const actSum = listed.reduce((s, x) => s + (actual.find((a) => a.key === x.key)!.pct ?? 0), 0);
    if (!pollSum || !actSum) continue;
    const ps = (k: string) => ((listed.find((x) => x.key === k)?.pct ?? 0) / pollSum) * 100;
    const as = (k: string) => ((actual.find((a) => a.key === k)?.pct ?? 0) / actSum) * 100;

    const top = [...actual].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
    const [w, second] = top;
    if (!listed.some((x) => x.key === w.key) || !listed.some((x) => x.key === second.key)) continue;

    const k = listed.find((x) => x.party === "kmt")?.key;
    const d = listed.find((x) => x.party === "dpp")?.key;
    const leader = [...listed].sort((a, b) => b.pct - a.pct)[0].key;
    out.push({
      year: file.year,
      raceId: p.raceId,
      pollster: canonicalPollster(p.pollster),
      fieldEnd: p.fieldEnd,
      daysOut: days(p.fieldEnd, file.electionDay),
      error: (ps(w.key) - ps(second.key)) - (as(w.key) - as(second.key)),
      blocError: k && d ? (ps(k) - ps(d)) - (as(k) - as(d)) : null,
      calledWinner: leader === w.key,
    });
  }
  return out;
}

export interface PollsterRecord {
  pollster: string;
  n: number;
  /** 藍綠偏差，已扣掉當年整個業界一起偏的部分（正＝偏藍） */
  bias: number | null;
  biasN: number;
  /** 前兩名差距的均方根誤差 */
  rmse: number;
  hitRate: number;
}

export function pollsterAccuracy(errors: PollError[]): { pollsters: PollsterRecord[]; industryBias: Record<string, number>; rmse: number; rmseLast3Weeks: number; hitRate: number } {
  // 當年業界平均偏差（藍綠）
  const industryBias: Record<string, number> = {};
  for (const y of new Set(errors.map((e) => e.year))) {
    const xs = errors.filter((e) => e.year === y && e.blocError != null).map((e) => e.blocError!);
    industryBias[y] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  }
  const by = new Map<string, PollError[]>();
  for (const e of errors) by.set(e.pollster, [...(by.get(e.pollster) ?? []), e]);
  const pollsters = [...by].map(([pollster, es]) => {
    const b = es.filter((e) => e.blocError != null).map((e) => e.blocError! - industryBias[e.year]);
    return {
      pollster,
      n: es.length,
      bias: b.length ? b.reduce((x, y) => x + y, 0) / b.length : null,
      biasN: b.length,
      rmse: Math.sqrt(es.reduce((s, e) => s + e.error ** 2, 0) / es.length),
      hitRate: es.filter((e) => e.calledWinner).length / es.length,
    };
  }).sort((a, b) => b.n - a.n);
  const rms = (es: PollError[]) => (es.length ? Math.sqrt(es.reduce((s, e) => s + e.error ** 2, 0) / es.length) : 0);
  return {
    pollsters,
    industryBias,
    rmse: rms(errors),
    rmseLast3Weeks: rms(errors.filter((e) => e.daysOut <= 21)),
    hitRate: errors.length ? errors.filter((e) => e.calledWinner).length / errors.length : 0,
  };
}

export interface BacktestRace {
  id: RaceId;
  predicted: string;
  predictedParty: Party;
  prob: number;
  winner: string;
  winnerParty: Party;
  correct: boolean;
  pollCount: number;
}

/**
 * 回測：只用當年選前就有的資料（上一屆縣市長、前兩屆總統、上一屆不分區、當年民調），
 * 在封關前一天（投票日前 11 天）跑模型，跟開票結果比。
 */
export function backtest(opts: {
  file: HistFile;
  results: MayorResults;
  mayorPrev: MayorResults | null;
  pres: PresidentialResults | null;
  presWeights: Record<string, number>;
  partyList?: { national: Record<string, number>; byRace: Record<string, Record<string, number | null>> };
  house?: Record<string, { bias: number; n: number }>;
}) {
  const { file, results } = opts;
  const races: ModelRace[] = [];
  for (const meta of RACES) {
    if (meta.tier === "township") continue;
    const r = results.races[meta.id];
    if (!r) continue;
    const candidates: Candidate[] = r.candidates
      .filter((c) => (c.pct ?? 0) >= 0.5)
      .map((c) => ({ name: normName(c.name), party: c.party, incumbent: c.incumbent, ballotNumber: null }));
    const leans = [{ label: "不分區政黨票", lean: relativeLean(opts.partyList?.byRace, opts.partyList?.national, meta.id), weight: 0.8 }];
    const prior = computePrior(meta.id, candidates, { mayorPrev: opts.mayorPrev, pres: opts.pres, presWeights: opts.presWeights, leans });
    races.push({ id: meta.id, tier: meta.tier, candidates, priorShares: prior.priorShares, priorSigma: prior.priorSigma });
  }
  const polls: Poll[] = file.polls.map((p, i) => ({
    id: `h${file.year}-${i}`,
    raceId: p.raceId,
    pollster: canonicalPollster(p.pollster),
    sponsor: p.sponsor,
    method: p.method ?? "unknown",
    sampleSize: p.sampleSize,
    fieldEnd: p.fieldEnd,
    published: p.published,
    results: p.results.map((x) => ({ ...x, name: normName(x.name) })),
    undecided: p.undecided,
    excluded: false,
    kind: "general",
  }));
  const asOf = addDays(file.electionDay, -11);
  const f = forecast(races, polls, { asOf, electionDay: file.electionDay, sims: 6000, houseHistory: opts.house });
  const out: BacktestRace[] = f.races.map((fr) => {
    const r = results.races[fr.id]!;
    const w = [...r.candidates].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
    return {
      id: fr.id,
      predicted: fr.leader,
      predictedParty: fr.leaderParty,
      prob: fr.winProb[fr.leader],
      winner: normName(w.name),
      winnerParty: w.party,
      correct: fr.leader === normName(w.name),
      pollCount: fr.pollCount,
    };
  });
  const brier = out.reduce((s, r) => s + (r.correct ? (1 - r.prob) ** 2 : r.prob ** 2), 0) / out.length;
  return { year: file.year, asOf, races: out, correct: out.filter((r) => r.correct).length, total: out.length, brier };
}

