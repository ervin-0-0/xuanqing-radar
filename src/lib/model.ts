// 當選機率模型：民調加權平均 ＋ 基本盤，再用蒙地卡羅模擬全國連動誤差。
// 全部是純函式，瀏覽器裡的風向滑桿、時光機都直接重跑這支。

import { addDays, daysBetween, rng } from "./stats.ts";
import type { Party, RaceId, Tier } from "./types.ts";

export type Method = "phone" | "phone+mobile" | "mobile" | "online" | "mixed" | "unknown";

export interface Candidate {
  name: string;
  party: Party;
  /** party 為 other 時的實際黨名，例如「台灣麻將最大黨」 */
  partyName?: string | null;
  incumbent: boolean;
  ballotNumber: number | null;
  currentRole?: string | null;
  bio?: string | null;
  endorsedBy?: Party[];
}

export interface ModelRace {
  id: RaceId;
  tier: Tier;
  candidates: Candidate[];
  /** 基本盤估的得票率（已含現任優勢、不含 2026 全國風向），合計 100 */
  priorShares: Record<string, number>;
  /** 基本盤的不確定度（得票率百分點） */
  priorSigma: number;
}

export interface PollResult { name: string; party: Party; pct: number }

export interface Poll {
  id: string;
  raceId: RaceId;
  pollster: string;
  sponsor: string | null;
  method: Method;
  sampleSize: number | null;
  fieldEnd: string;
  published: string | null;
  results: PollResult[];
  undecided: number | null;
  excluded: boolean;
  kind: "general" | "primary" | "internal";
  /** 機構品質權重，預設 1 */
  quality?: number;
}

export interface ModelOptions {
  asOf: string;
  electionDay: string;
  /** 全國誤差平均值的位移（預設 0）：正值＝國民黨陣營每人多拿幾個百分點、民進黨陣營少拿同樣多 */
  swing?: number;
  sims?: number;
  seed?: number;
}

export const PARAMS = {
  halfLifeDays: 18,
  methodWeight: { "phone+mobile": 1, phone: 0.85, mobile: 0.9, mixed: 0.85, online: 0.45, unknown: 0.7 } as Record<Method, number>,
  sponsoredWeight: 0.6,
  defaultSample: 800,
  /** 單筆民調的非抽樣誤差（得票率百分點） */
  pollError: 3.4,
  /** 整個民調業界一起偏的部分，多看幾筆也消不掉 */
  industryError: 1.5,
  /** 民調平均每過 30 天會漂多少 */
  driftPer30: 1.2,
  /** 單一選區開票前額外誤差 */
  raceError: 1.0,
  /** 未表態越多越不確定：每 10% 未表態加 0.8 個百分點誤差 */
  undecidedError: 0.08,
  /** 全國連動誤差（所有選區一起往同一邊偏） */
  nationalError: 1.5,
  houseShrink: 6,
  houseClamp: 5,
  /** 全國風向估計的縮減：選區數少時不要全信 */
  environmentShrink: 2,
};

/**
 * 藍綠陣營：政黨提名，或政黨正式共同推薦的無黨籍（例如國民黨支持的高虹安）。
 * 全國風向、機構效應、基本盤都是用陣營算，席次仍照候選人的登記黨籍。
 */
export function bloc(c: Candidate): "kmt" | "dpp" | null {
  if (c.party === "kmt") return "kmt";
  if (c.party === "dpp") return "dpp";
  if (c.endorsedBy?.includes("kmt")) return "kmt";
  if (c.endorsedBy?.includes("dpp")) return "dpp";
  return null;
}
export const blocCandidate = (cands: Candidate[], b: "kmt" | "dpp") => cands.find((c) => bloc(c) === b);

const kmtDpp = (shares: Record<string, number>, cands: Candidate[]) => {
  const k = blocCandidate(cands, "kmt");
  const d = blocCandidate(cands, "dpp");
  return k && d ? { k: k.name, d: d.name, margin: (shares[k.name] ?? 0) - (shares[d.name] ?? 0) } : null;
};

export interface UsablePoll extends Poll { shares: Record<string, number> }

/**
 * 挑出這個選區能用的民調，換算成「已登記候選人之間」的得票率（未表態按比例分配）。
 * 包含已退選者或假設人選、且他們合計超過 5% 的情境不用；同一次調查有多個情境時取最貼近實際的一個。
 */
export function usablePolls(race: ModelRace, polls: Poll[], asOf: string): UsablePoll[] {
  const names = new Set(race.candidates.map((c) => c.name));
  // 主要候選人：基本盤 12% 以上、藍綠陣營，或在任一筆民調拿過 10% 以上（例如花蓮的張峻）。少了他們的情境不能用
  const pollMax: Record<string, number> = {};
  for (const p of polls) if (p.raceId === race.id) for (const r of p.results) pollMax[r.name] = Math.max(pollMax[r.name] ?? 0, r.pct);
  const core = race.candidates.filter((c) =>
    (race.priorShares[c.name] ?? 0) >= 12 || (bloc(c) && (race.priorShares[c.name] ?? 0) >= 5) || (pollMax[c.name] ?? 0) >= 10);
  const best = new Map<string, { poll: UsablePoll; score: number }>();
  for (const p of polls) {
    if (p.raceId !== race.id || p.excluded || p.kind !== "general") continue;
    if (p.fieldEnd > asOf || (p.published && p.published > asOf)) continue;
    const inRace = p.results.filter((r) => names.has(r.name));
    const extra = p.results.filter((r) => !names.has(r.name)).reduce((s, r) => s + r.pct, 0);
    if (extra > 5 || !core.every((c) => inRace.some((r) => r.name === c.name))) continue;
    const known = inRace.reduce((s, r) => s + r.pct, 0);
    if (known <= 0) continue;
    const missing = race.candidates.filter((c) => !inRace.some((r) => r.name === c.name));
    const missingPrior = missing.reduce((s, c) => s + (race.priorShares[c.name] ?? 0), 0);
    const shares: Record<string, number> = {};
    for (const r of inRace) shares[r.name] = (r.pct / known) * (100 - missingPrior);
    for (const c of missing) shares[c.name] = race.priorShares[c.name] ?? 0;
    const key = `${p.pollster}|${p.fieldEnd}`;
    const score = inRace.length * 10 - extra;
    const prev = best.get(key);
    if (!prev || score > prev.score) best.set(key, { poll: { ...p, shares }, score });
  }
  return [...best.values()].map((b) => b.poll).sort((a, b) => a.fieldEnd.localeCompare(b.fieldEnd));
}

const pollWeight = (p: Poll, asOf: string) =>
  0.5 ** (Math.max(0, daysBetween(p.fieldEnd, asOf)) / PARAMS.halfLifeDays) *
  Math.min(2.5, Math.sqrt((p.sampleSize ?? PARAMS.defaultSample) / 1000)) *
  PARAMS.methodWeight[p.method] *
  (p.sponsor ? PARAMS.sponsoredWeight : 1) *
  (p.quality ?? 1);

/**
 * 機構效應（house effect）：某機構的藍綠差距，平均比同選區、前後 30 天內其他機構偏多少。
 * 正值＝偏藍。用 (筆數＋3) 當分母縮減，避免只做過一兩次的機構被誤判。
 */
export function houseEffects(races: ModelRace[], polls: Poll[], asOf: string): Record<string, number> {
  const sum: Record<string, number> = {};
  const count: Record<string, number> = {};
  for (const race of races) {
    const usable = usablePolls(race, polls, asOf)
      .map((p) => ({ p, m: kmtDpp(p.shares, race.candidates) }))
      .filter((x): x is { p: UsablePoll; m: NonNullable<ReturnType<typeof kmtDpp>> } => x.m !== null);
    for (const { p, m } of usable) {
      const refs = usable.filter((o) => o.p.pollster !== p.pollster && Math.abs(daysBetween(o.p.fieldEnd, p.fieldEnd)) <= 30);
      if (!refs.length) continue;
      const w = refs.map((o) => Math.sqrt((o.p.sampleSize ?? PARAMS.defaultSample) / 1000));
      const ref = refs.reduce((s, o, i) => s + o.m.margin * w[i], 0) / w.reduce((a, b) => a + b, 0);
      sum[p.pollster] = (sum[p.pollster] ?? 0) + (m.margin - ref);
      count[p.pollster] = (count[p.pollster] ?? 0) + 1;
    }
  }
  const out: Record<string, number> = {};
  for (const k of Object.keys(sum)) {
    const v = sum[k] / (count[k] + PARAMS.houseShrink);
    out[k] = Math.max(-PARAMS.houseClamp, Math.min(PARAMS.houseClamp, v));
  }
  return out;
}

export interface PollAverage {
  shares: Record<string, number>;
  sigma: number;
  count: number;
  nEff: number;
  latest: string | null;
  undecided: number;
}

export function pollAverage(race: ModelRace, usable: UsablePoll[], house: Record<string, number>, asOf: string): PollAverage | null {
  if (!usable.length) return null;
  const k = blocCandidate(race.candidates, "kmt")?.name;
  const d = blocCandidate(race.candidates, "dpp")?.name;
  const shares: Record<string, number> = Object.fromEntries(race.candidates.map((c) => [c.name, 0]));
  let wSum = 0, w2Sum = 0, ageSum = 0, undSum = 0, undW = 0;
  for (const p of usable) {
    const w = pollWeight(p, asOf);
    if (p.undecided != null) { undSum += w * p.undecided; undW += w; }
    const h = k && d ? (house[p.pollster] ?? 0) : 0;
    for (const c of race.candidates) {
      let s = p.shares[c.name] ?? 0;
      if (c.name === k) s -= h / 2;
      if (c.name === d) s += h / 2;
      shares[c.name] += w * s;
    }
    wSum += w; w2Sum += w * w;
    ageSum += w * Math.max(0, daysBetween(p.fieldEnd, asOf));
  }
  for (const c of race.candidates) shares[c.name] /= wSum;
  const nEff = (wSum * wSum) / w2Sum;
  const age = ageSum / wSum;
  const undecided = undW ? undSum / undW : 20;
  const sigma = Math.sqrt(
    PARAMS.pollError ** 2 / nEff + PARAMS.industryError ** 2 + PARAMS.driftPer30 ** 2 * (age / 30) + (PARAMS.undecidedError * undecided) ** 2,
  );
  return { shares, sigma, count: usable.length, nEff, latest: usable.at(-1)!.fieldEnd, undecided };
}

/**
 * 2026 全國風向：各選區民調平均的藍綠差距，比基本盤多出多少（國民黨減民進黨，百分點）。
 * 用有效民調數加權並縮減，沒民調的選區就靠這個值調整基本盤。
 */
export function environment(races: ModelRace[], avgs: Map<RaceId, PollAverage | null>): number {
  let num = 0, den = 0;
  for (const race of races) {
    const a = avgs.get(race.id);
    const pollM = a ? kmtDpp(a.shares, race.candidates) : null;
    const priorM = kmtDpp(race.priorShares, race.candidates);
    if (!a || !pollM || !priorM) continue;
    const w = Math.min(a.nEff, 4);
    num += w * (pollM.margin - priorM.margin);
    den += w;
  }
  return den ? num / (den + PARAMS.environmentShrink) : 0;
}

export interface RaceForecast {
  id: RaceId;
  /** 預估得票率（模擬平均） */
  shares: Record<string, number>;
  sigma: number;
  winProb: Record<string, number>;
  leader: string;
  leaderParty: Party;
  rating: Rating;
  /** 民調在預估裡佔幾成 */
  pollWeight: number;
  pollCount: number;
  latestPoll: string | null;
  pollShares: Record<string, number> | null;
  priorShares: Record<string, number>;
}

export type Rating = "tossup" | "lean" | "likely" | "safe";
export const RATING_LABEL: Record<Rating, string> = { tossup: "激戰", lean: "微", likely: "偏", safe: "穩" };

export function rating(p: number): Rating {
  return p < 0.6 ? "tossup" : p < 0.75 ? "lean" : p < 0.9 ? "likely" : "safe";
}

export interface Forecast {
  asOf: string;
  daysToElection: number;
  environment: number;
  house: Record<string, number>;
  races: RaceForecast[];
  seats: {
    expected: Record<Party, number>;
    /** histogram[party][k] = 拿到 k 席的機率 */
    histogram: Record<Party, number[]>;
    sims: number;
  };
}

const PARTIES: Party[] = ["kmt", "dpp", "tpp", "npp", "pfp", "tsp", "ind", "other"];

export function forecast(races: ModelRace[], polls: Poll[], opts: ModelOptions): Forecast {
  const { asOf, electionDay } = opts;
  const sims = opts.sims ?? 10_000;
  const swing = opts.swing ?? 0;
  const days = Math.max(0, daysBetween(asOf, electionDay));
  const house = houseEffects(races, polls, asOf);

  const avgs = new Map<RaceId, PollAverage | null>();
  for (const r of races) avgs.set(r.id, pollAverage(r, usablePolls(r, polls, asOf), house, asOf));
  const env = environment(races, avgs);

  // 每個選區：基本盤加上全國風向，再跟民調平均做精確度加權
  const setup = races.map((race) => {
    const prior: Record<string, number> = { ...race.priorShares };
    const k = blocCandidate(race.candidates, "kmt")?.name;
    const d = blocCandidate(race.candidates, "dpp")?.name;
    if (k && d) { prior[k] += env / 2; prior[d] -= env / 2; }
    const a = avgs.get(race.id) ?? null;
    const sp2 = race.priorSigma ** 2;
    const lambda = a ? sp2 / (sp2 + a.sigma ** 2) : 0;
    const mean: Record<string, number> = {};
    for (const c of race.candidates) mean[c.name] = lambda * (a?.shares[c.name] ?? 0) + (1 - lambda) * prior[c.name];
    const postVar = a ? (sp2 * a.sigma ** 2) / (sp2 + a.sigma ** 2) : sp2;
    const future = PARAMS.driftPer30 ** 2 * (days / 30);
    const sigma = Math.sqrt(postVar + future + PARAMS.raceError ** 2);
    return { race, mean, sigma, lambda, avg: a, prior };
  });

  const wins = setup.map((s) => Object.fromEntries(s.race.candidates.map((c) => [c.name, 0])) as Record<string, number>);
  const shareSum = setup.map((s) => Object.fromEntries(s.race.candidates.map((c) => [c.name, 0])) as Record<string, number>);
  const histogram = Object.fromEntries(PARTIES.map((p) => [p, new Array(23).fill(0)])) as Record<Party, number[]>;
  const nationalSigma = Math.sqrt(PARAMS.nationalError ** 2 + 0.5 ** 2 * (days / 30));
  const R = rng(opts.seed ?? 20261128);

  for (let s = 0; s < sims; s++) {
    const nat = swing + R.normal() * nationalSigma;
    const seats: Record<string, number> = {};
    setup.forEach((st, i) => {
      let best = "", bestV = -Infinity, total = 0;
      const draw: Record<string, number> = {};
      for (const c of st.race.candidates) {
        const m = st.mean[c.name];
        const b = bloc(c);
        const shift = b === "kmt" ? nat : b === "dpp" ? -nat : 0;
        const v = Math.max(0.1, m + shift + R.normal() * st.sigma * 1.41 * Math.sqrt(Math.max(m, 4) / 50));
        draw[c.name] = v;
        total += v;
        if (v > bestV) { bestV = v; best = c.name; }
      }
      wins[i][best]++;
      for (const c of st.race.candidates) shareSum[i][c.name] += (draw[c.name] / total) * 100;
      if (st.race.tier !== "township") {
        const party = st.race.candidates.find((c) => c.name === best)!.party;
        seats[party] = (seats[party] ?? 0) + 1;
      }
    });
    for (const p of PARTIES) histogram[p][seats[p] ?? 0]++;
  }

  const raceOut: RaceForecast[] = setup.map((st, i) => {
    const winProb = Object.fromEntries(Object.entries(wins[i]).map(([n, w]) => [n, w / sims]));
    const shares = Object.fromEntries(Object.entries(shareSum[i]).map(([n, v]) => [n, v / sims]));
    const leader = Object.entries(winProb).sort((a, b) => b[1] - a[1])[0][0];
    return {
      id: st.race.id,
      shares,
      sigma: st.sigma,
      winProb,
      leader,
      leaderParty: st.race.candidates.find((c) => c.name === leader)!.party,
      rating: rating(winProb[leader]),
      pollWeight: st.lambda,
      pollCount: st.avg?.count ?? 0,
      latestPoll: st.avg?.latest ?? null,
      pollShares: st.avg?.shares ?? null,
      priorShares: st.prior,
    };
  });

  const expected = Object.fromEntries(
    PARTIES.map((p) => [p, histogram[p].reduce((s, n, k) => s + n * k, 0) / sims]),
  ) as Record<Party, number>;
  for (const p of PARTIES) histogram[p] = histogram[p].map((n) => n / sims);

  return { asOf, daysToElection: days, environment: env, house, races: raceOut, seats: { expected, histogram, sims } };
}

/** 時光機：從 from 到 to 每 step 天算一次，回傳每個選區領先者的當選機率走勢。 */
export function forecastHistory(races: ModelRace[], polls: Poll[], from: string, to: string, electionDay: string, step = 3, sims = 2000) {
  const out: { date: string; races: Record<string, { winProb: Record<string, number>; shares: Record<string, number> }>; seats: Record<Party, number> }[] = [];
  for (let d = from; d <= to; d = addDays(d, step)) {
    const f = forecast(races, polls, { asOf: d, electionDay, sims });
    out.push({
      date: d,
      races: Object.fromEntries(f.races.map((r) => [r.id, { winProb: round(r.winProb), shares: round(r.shares) }])),
      seats: round(f.seats.expected) as Record<Party, number>,
    });
  }
  return out;
}

function round<T extends Record<string, number>>(o: T): T {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 1000) / 1000])) as T;
}
