// 基本盤：用過去的選舉結果估「如果沒有任何 2026 民調，這個選區大概會怎麼投」。
// 輸出的是含現任優勢、不含 2026 全國風向的得票率；全國風向由模型從民調估。

import { blocCandidate, type Candidate } from "./model.ts";
import type { Party, RaceId } from "./types.ts";

export interface ResultCandidate { name: string; party: Party; votes: number | null; pct: number | null; elected: boolean; incumbent: boolean }
export interface MayorResults { year: number; races: Partial<Record<RaceId, { candidates: ResultCandidate[]; turnout: number | null; validVotes?: number | null }>> }
export interface PresidentialResults {
  elections: Record<string, { national: Record<string, number>; byRace: Partial<Record<RaceId, Record<string, number>>> }>;
}

/** 現任參選的優勢：藍綠差距約 8 個百分點（每人約 4 個百分點得票率） */
export const INCUMBENCY_MARGIN = 8;
export const PRES_WEIGHTS_2026: Record<string, number> = { "2020": 0.4, "2024": 0.6 };

const margin = (shares: Record<string, number> | undefined) =>
  shares && shares.kmt != null && shares.dpp != null ? shares.kmt - shares.dpp : null;

/**
 * 某屆縣市長選舉的藍綠差距（國民黨減民進黨）。
 * 今年的候選人如果當年也參選、但黨籍不同（例如 2022 以無黨籍當選苗栗縣長的鍾東錦、
 * 當年代表民眾黨的高虹安），他當年的票算進他今年所屬的陣營。
 */
function localMargin(r: MayorResults["races"][RaceId] | undefined, candidates: Candidate[]) {
  if (!r) return null;
  const share = (b: "kmt" | "dpp") => {
    let v = Math.max(0, ...r.candidates.filter((c) => c.party === b).map((c) => c.pct ?? 0));
    const now = blocCandidate(candidates, b);
    const then = now && r.candidates.find((c) => c.name === now.name && c.party !== b);
    if (then) v += then.pct ?? 0;
    return v;
  };
  const k = share("kmt"), d = share("dpp");
  return k && d ? k - d : null;
}

/** 全國合計的縣市長藍綠差距，當作「地方選舉基準」 */
export function nationalLocalMargin(res: MayorResults): number {
  let k = 0, d = 0, total = 0;
  for (const [id, r] of Object.entries(res.races)) {
    if (id === "zhubei" || !r) continue;
    for (const c of r.candidates) {
      const v = c.votes ?? 0;
      total += v;
      if (c.party === "kmt") k += v;
      if (c.party === "dpp") d += v;
    }
  }
  return total ? ((k - d) / total) * 100 : 0;
}

/** 台灣版 PVI：總統選舉時這個選區比全國偏藍幾個百分點（正＝偏藍，負＝偏綠） */
export function pvi(pres: PresidentialResults | null, raceId: RaceId, weights = PRES_WEIGHTS_2026): number | null {
  if (!pres) return null;
  let sum = 0, w = 0;
  for (const [year, wt] of Object.entries(weights)) {
    const e = pres.elections[year];
    const m = margin(e?.byRace[raceId]);
    const n = margin(e?.national);
    if (m == null || n == null) continue;
    sum += wt * (m - n);
    w += wt;
  }
  return w ? sum / w : null;
}

/**
 * 某個「比全國偏藍幾點」的指標：byRace 的藍綠差距減全國的藍綠差距。
 * 用在不分區政黨票、議員政黨票、區域立委、各縣市政黨支持度。
 */
export function relativeLean(
  byRace: Partial<Record<string, Record<string, number | null>>> | undefined,
  national: Record<string, number | null> | undefined,
  raceId: RaceId,
  scale = 1,
): number | null {
  const r = byRace?.[raceId];
  if (!r || r.kmt == null || r.dpp == null || !national || national.kmt == null || national.dpp == null) return null;
  return ((r.kmt - r.dpp) - (national.kmt - national.dpp)) * scale;
}

export interface PriorComponent { label: string; margin: number | null; weight: number }

export interface Prior {
  priorShares: Record<string, number>;
  /**
   * 這個候選人的基本盤有沒有根據（藍綠陣營代表、上屆同一人參選、現任）。
   * 沒根據的（例如第一次參選的無黨籍、第三黨）在有民調時改用民調數字當起點，避免被預設值拖累。
   */
  known: Record<string, boolean>;
  priorSigma: number;
  pvi: number | null;
  /** 不含現任優勢、不含全國風向的藍綠差距（各項加權平均） */
  baseMargin: number | null;
  /** 基本盤由哪些指標組成（換算成地方選舉尺度的藍綠差距） */
  components: PriorComponent[];
}

export interface PriorInputs {
  /** 上一屆縣市長選舉 */
  mayorPrev: MayorResults | null;
  pres: PresidentialResults | null;
  presWeights?: Record<string, number>;
  /** 其他「比全國偏藍幾點」的指標，會加上上一屆縣市長的全國藍綠差距換成同一尺度 */
  leans?: { label: string; lean: number | null; weight: number }[];
}

export function computePrior(raceId: RaceId, candidates: Candidate[], data: PriorInputs): Prior {
  const r22 = data.mayorPrev?.races[raceId];
  const p = pvi(data.pres, raceId, data.presWeights);
  const local = localMargin(r22, candidates);
  const natLocal = data.mayorPrev ? nationalLocalMargin(data.mayorPrev) : 0;

  // 上一屆若有現任參選，先把現任優勢扣掉
  let local22 = local;
  const inc22 = r22?.candidates.find((c) => c.incumbent);
  if (local22 != null && inc22) local22 += inc22.party === "kmt" ? -INCUMBENCY_MARGIN : inc22.party === "dpp" ? INCUMBENCY_MARGIN : 0;

  const components: PriorComponent[] = [
    { label: "總統選舉", margin: p != null ? p + natLocal : null, weight: 1 },
    { label: `${data.mayorPrev?.year ?? "上屆"} 縣市長`, margin: local22, weight: 1 },
    ...(data.leans ?? []).map((l) => ({ label: l.label, margin: l.lean != null ? l.lean + natLocal : null, weight: l.weight })),
  ];
  const parts = components.filter((c): c is PriorComponent & { margin: number } => c.margin != null);
  const wSum = parts.reduce((s, c) => s + c.weight, 0);
  const baseMargin = wSum ? parts.reduce((s, c) => s + c.margin * c.weight, 0) / wSum : null;

  const kmt = blocCandidate(candidates, "kmt");
  const dpp = blocCandidate(candidates, "dpp");
  // 同陣營有兩個以上（例如 2022 連江兩位國民黨籍），陣營的票要分給他們，不能全給第一個
  const sameBloc = (b: "kmt" | "dpp", rep: Candidate | undefined) =>
    rep ? candidates.filter((c) => c !== rep && (c.party === b || c.endorsedBy?.includes(b)) && c.party !== (b === "kmt" ? "dpp" : "kmt")) : [];
  const kmtMates = sameBloc("kmt", kmt), dppMates = sameBloc("dpp", dpp);
  const others = candidates.filter((c) => c !== kmt && c !== dpp && !kmtMates.includes(c) && !dppMates.includes(c));

  // 非藍綠候選人：同一人或同黨 2022 的得票率，沒有就給小黨預設值
  const otherShare = (c: Candidate) => {
    const same = r22?.candidates.find((x) => x.name === c.name) ?? (c.party !== "ind" ? r22?.candidates.find((x) => x.party === c.party) : undefined);
    // 沒有前例的小黨、無黨籍候選人，縣市長選舉通常只拿 1–2%
    const base = same?.pct ?? (c.party === "tpp" ? 8 : c.incumbent ? 30 : 1.5);
    return c.incumbent && !same?.incumbent ? base + INCUMBENCY_MARGIN / 2 : base;
  };

  const shares: Record<string, number> = {};
  for (const c of others) shares[c.name] = otherShare(c);
  const rest = Math.max(10, 100 - others.reduce((s, c) => s + shares[c.name], 0));

  if (kmt && dpp && baseMargin != null) {
    let m = baseMargin;
    if (kmt.incumbent || kmtMates.some((c) => c.incumbent)) m += INCUMBENCY_MARGIN;
    if (dpp.incumbent || dppMates.some((c) => c.incumbent)) m -= INCUMBENCY_MARGIN;
    m = Math.max(-60, Math.min(60, m));
    shares[kmt.name] = (rest * (50 + m / 2)) / 100;
    shares[dpp.name] = (rest * (50 - m / 2)) / 100;
  } else {
    for (const [c, b] of [[kmt, "kmt"], [dpp, "dpp"]] as const) {
      if (!c) continue;
      const same = r22?.candidates.find((x) => x.party === b);
      shares[c.name] = (same?.pct ?? 40) + (c.incumbent ? INCUMBENCY_MARGIN / 2 : 0);
    }
  }

  // 把陣營的票平分給同陣營的人（現任多拿現任優勢）
  for (const [rep, mates] of [[kmt, kmtMates], [dpp, dppMates]] as const) {
    if (!rep || !mates.length) continue;
    const group = [rep, ...mates];
    const pool = shares[rep.name] ?? 0;
    const w = group.map((c) => 1 + (c.incumbent ? INCUMBENCY_MARGIN / 25 : 0));
    const wSum2 = w.reduce((a, b) => a + b, 0);
    group.forEach((c, i) => { shares[c.name] = (pool * w[i]) / wSum2; });
  }

  const total = Object.values(shares).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(shares)) shares[k] = (shares[k] / total) * 100;

  const prevSame = (c: Candidate) => !!r22?.candidates.some((x) => x.name === c.name);
  const known: Record<string, boolean> = {};
  for (const c of candidates) {
    const isRep = (c === kmt || c === dpp) && baseMargin != null && !(c === kmt ? kmtMates : dppMates).length;
    known[c.name] = isRep || prevSame(c) || c.incumbent;
  }

  const standard = !!(kmt && dpp && baseMargin != null);
  return {
    priorShares: shares,
    known,
    priorSigma: standard ? (parts.length >= 3 ? 6 : parts.length === 2 ? 7 : 8) : 10,
    pvi: p,
    baseMargin,
    components,
  };
}
