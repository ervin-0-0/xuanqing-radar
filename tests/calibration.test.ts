import { describe, expect, it } from "vitest";
import { pollErrors, pollsterAccuracy, type HistFile } from "../src/lib/calibration.ts";
import { houseEffects, type ModelRace } from "../src/lib/model.ts";
import type { MayorResults } from "../src/lib/fundamentals.ts";

const results: MayorResults = {
  year: 2022,
  races: {
    taipei: { turnout: 60, candidates: [
      { name: "藍", party: "kmt", votes: 50, pct: 50, elected: true, incumbent: false },
      { name: "綠", party: "dpp", votes: 40, pct: 40, elected: false, incumbent: false },
      { name: "小", party: "ind", votes: 10, pct: 10, elected: false, incumbent: false },
    ] },
    hualien: { turnout: 60, candidates: [
      { name: "黄某", party: "ind", votes: 60, pct: 60, elected: true, incumbent: false },
      { name: "綠二", party: "dpp", votes: 40, pct: 40, elected: false, incumbent: false },
    ] },
  },
};
const poll = (raceId: "taipei" | "hualien", pollster: string, res: [string, "kmt" | "dpp" | "ind", number][]) => ({
  raceId, pollster, sponsor: null, fieldStart: null, fieldEnd: "2022-11-10", published: null, method: null, sampleSize: 1000,
  results: res.map(([name, party, pct]) => ({ name, party, pct })), undecided: 20, source: "x",
});

describe("pollErrors", () => {
  const file: HistFile = {
    year: 2022, electionDay: "2022-11-26",
    polls: [
      poll("taipei", "甲", [["藍", "kmt", 40], ["綠", "dpp", 40]]), // 民調平手，實際藍贏 50:40 → 低估藍
      poll("hualien", "乙", [["黃某", "ind", 50], ["綠二", "dpp", 30]]), // 異體字要對得上
    ],
  };
  const es = pollErrors(file, results);

  it("用民調有列的候選人之間比較，算出前兩名差距與藍綠偏差", () => {
    // 民調 藍 50／綠 50；開票在兩人之間 藍 55.6／綠 44.4
    expect(es[0].error).toBeCloseTo(0 - (55.56 - 44.44), 1);
    expect(es[0].blocError).toBeCloseTo(-11.1, 1);
    expect(es[0].calledWinner).toBe(true); // 平手時取第一個，剛好是藍
    expect(es[0].daysOut).toBe(16);
  });

  it("中選會「黄」跟維基「黃」對得上；沒有藍綠對決時 blocError 為 null", () => {
    expect(es).toHaveLength(2);
    expect(es[1].blocError).toBeNull();
    // 未表態 20 平均分給兩人：60／40 → 差距 20，跟開票 60／40 一樣
    expect(es[1].error).toBeCloseTo(0, 5);
  });
});

it("pollsterAccuracy 扣掉當年業界平均偏差，只留各家相對偏差", () => {
  const mk = (pollster: string, blocError: number) => ({ year: 2022, raceId: "taipei" as const, pollster, fieldEnd: "2022-11-10", daysOut: 16, error: blocError, blocError, calledWinner: true });
  const a = pollsterAccuracy([mk("偏藍", 6), mk("偏藍", 6), mk("中立", 2), mk("中立", 2)]);
  expect(a.industryBias["2022"]).toBe(4);
  expect(a.pollsters.find((p) => p.pollster === "偏藍")!.bias).toBe(2);
  expect(a.pollsters.find((p) => p.pollster === "中立")!.bias).toBe(-2);
});

it("houseEffects：只有歷史紀錄、這次沒資料的機構，也會套用縮減後的歷史偏差", () => {
  const races: ModelRace[] = [];
  const h = houseEffects(races, [], "2026-10-28", { 老牌: { bias: 4, n: 10 } });
  // 權重 min(3, 10×0.5)=3；3×4／(3+6)≈1.33
  expect(h["老牌"]).toBeCloseTo(1.33, 1);
});
