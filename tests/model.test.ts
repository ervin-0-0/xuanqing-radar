import { describe, expect, it } from "vitest";
import { forecast, houseEffects, PARAMS, usablePolls, type ModelRace, type Poll } from "../src/lib/model.ts";

const race = (id: ModelRace["id"], kmt: number, extra: Partial<ModelRace> = {}): ModelRace => ({
  id, tier: "county",
  candidates: [
    { name: `${id}藍`, party: "kmt", incumbent: false, ballotNumber: 1 },
    { name: `${id}綠`, party: "dpp", incumbent: false, ballotNumber: 2 },
  ],
  priorShares: { [`${id}藍`]: kmt, [`${id}綠`]: 100 - kmt },
  priorSigma: 6,
  ...extra,
});

let n = 0;
const poll = (r: ModelRace, kmt: number, dpp: number, fieldEnd: string, extra: Partial<Poll> = {}): Poll => ({
  id: `p${n++}`, raceId: r.id, pollster: "甲", sponsor: null, method: "phone+mobile", sampleSize: 1000,
  fieldEnd, published: null, undecided: 100 - kmt - dpp, excluded: false, kind: "general",
  results: [{ name: `${r.id}藍`, party: "kmt", pct: kmt }, { name: `${r.id}綠`, party: "dpp", pct: dpp }],
  ...extra,
});

const opts = { asOf: "2026-10-28", electionDay: "2026-11-28", sims: 4000 };

describe("usablePolls", () => {
  const r = race("keelung", 50);
  it("未表態按比例分配", () => {
    const [u] = usablePolls(r, [poll(r, 40, 30, "2026-10-20")], opts.asOf);
    expect(u.shares["keelung藍"]).toBeCloseTo(57.14, 1);
  });
  it("有已退選者且超過 5% 的情境不用；調查結束日在 asOf 之後也不用", () => {
    const withdrawn = poll(r, 30, 30, "2026-10-20", { results: [...poll(r, 30, 30, "x").results, { name: "退選者", party: "tpp", pct: 20 }] });
    const future = poll(r, 40, 30, "2026-10-30");
    expect(usablePolls(r, [withdrawn, future], opts.asOf)).toHaveLength(0);
  });
  it("同一次調查多個情境，取包含最多已登記候選人的", () => {
    const a = poll(r, 40, 30, "2026-10-20", { results: [{ name: "keelung藍", party: "kmt", pct: 40 }, { name: "keelung綠", party: "dpp", pct: 30 }, { name: "假設人選", party: "ind", pct: 4 }] });
    const b = poll(r, 42, 31, "2026-10-20");
    const u = usablePolls(r, [a, b], opts.asOf);
    expect(u).toHaveLength(1);
    expect(u[0].id).toBe(b.id);
  });
});

describe("forecast", () => {
  it("民調領先 10 點、選前一個月 → 當選機率九成以上", () => {
    const r = race("taipei", 50);
    const f = forecast([r], [poll(r, 50, 40, "2026-10-20"), poll(r, 49, 41, "2026-10-10", { pollster: "乙" })], opts);
    expect(f.races[0].winProb["taipei藍"]).toBeGreaterThan(0.9);
    expect(f.races[0].pollWeight).toBeGreaterThan(0.6);
  });

  it("沒有民調時靠基本盤，機率不會太極端", () => {
    const r = race("nantou", 54);
    const f = forecast([r], [], opts);
    expect(f.races[0].pollCount).toBe(0);
    expect(f.races[0].winProb["nantou藍"]).toBeGreaterThan(0.55);
    expect(f.races[0].winProb["nantou藍"]).toBeLessThan(0.9);
  });

  it("全國風向滑桿往藍拉，國民黨席次期望值上升", () => {
    const rs = [race("yilan", 49), race("yunlin", 51), race("hsinchu-city", 50)];
    const base = forecast(rs, [], opts);
    const blue = forecast(rs, [], { ...opts, swing: 4 });
    expect(blue.seats.expected.kmt).toBeGreaterThan(base.seats.expected.kmt + 0.5);
  });

  it("縣轄市不算進 22 席", () => {
    const f = forecast([race("zhubei", 60, { tier: "township" })], [], opts);
    expect(f.seats.histogram.kmt[0]).toBe(1);
  });

  it("沒民調的選區跟著其他選區的全國風向走", () => {
    const polled = race("changhua", 50);
    const quiet = race("miaoli", 50);
    const polls = [poll(polled, 40, 50, "2026-10-20"), poll(polled, 41, 51, "2026-10-15", { pollster: "乙" })];
    const f = forecast([polled, quiet], polls, opts);
    expect(f.environment).toBeLessThan(-3);
    expect(f.races[1].winProb["miaoli綠"]).toBeGreaterThan(0.55);
  });
});

it("houseEffects 抓得到固定偏藍的機構，而且有縮減", () => {
  const rs = [race("taoyuan", 50), race("taichung", 50), race("tainan", 50)];
  const polls = rs.flatMap((r) => [
    poll(r, 45, 40, "2026-10-01", { pollster: "偏藍社" }),
    poll(r, 40, 45, "2026-10-02", { pollster: "中立甲" }),
    poll(r, 40, 45, "2026-10-03", { pollster: "中立乙" }),
  ]);
  const h = houseEffects(rs, polls, opts.asOf);
  // 三個縣市各偏 10 點，(30)/(3 筆 + 縮減 6) ≈ 3.3：方向對、但做得少的機構不全信
  expect(h["偏藍社"]).toBeGreaterThan(3);
  expect(h["偏藍社"]).toBeLessThanOrEqual(PARAMS.houseClamp);
  expect(h["中立甲"]).toBeLessThan(0);
});

it("政黨共同推薦的無黨籍算進該陣營：全國風向會移動他", () => {
  const r: ModelRace = {
    id: "hsinchu-city", tier: "county",
    candidates: [
      { name: "藍推無黨", party: "ind", incumbent: true, ballotNumber: 1, endorsedBy: ["kmt", "tpp"] },
      { name: "綠", party: "dpp", incumbent: false, ballotNumber: 2 },
    ],
    priorShares: { 藍推無黨: 50, 綠: 50 }, priorSigma: 6,
  };
  const base = forecast([r], [], opts);
  const blue = forecast([r], [], { ...opts, swing: 4 });
  expect(blue.races[0].winProb["藍推無黨"]).toBeGreaterThan(base.races[0].winProb["藍推無黨"] + 0.2);
  expect(blue.seats.histogram.ind[1]).toBeGreaterThan(0.5); // 席次照登記黨籍算
});

import { computePrior } from "../src/lib/fundamentals.ts";

it("基本盤：今年的候選人若 2022 以別的黨籍參選，當年的票算進今年的陣營", () => {
  const mayor2022 = {
    year: 2022,
    races: {
      miaoli: {
        turnout: 60,
        candidates: [
          { name: "藍系無黨", party: "ind" as const, votes: 100, pct: 42.7, elected: true, incumbent: false },
          { name: "綠", party: "dpp" as const, votes: 70, pct: 31.2, elected: false, incumbent: false },
          { name: "藍提名", party: "kmt" as const, votes: 25, pct: 11.0, elected: false, incumbent: false },
        ],
      },
    },
  };
  const cands = [
    { name: "藍系無黨", party: "kmt" as const, incumbent: true, ballotNumber: 2 },
    { name: "新綠", party: "dpp" as const, incumbent: false, ballotNumber: 1 },
  ];
  const p = computePrior("miaoli", cands, { mayor2022, pres: null });
  expect(p.baseMargin).toBeGreaterThan(20); // 42.7 + 11.0 − 31.2
  expect(p.priorShares["藍系無黨"]).toBeGreaterThan(60);
});
