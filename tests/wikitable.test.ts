import { describe, expect, it } from "vitest";
import { parseDateRange, parsePollPage, plainText, resolveDates } from "../src/lib/wikitable.ts";

const page = `== 新北市 ==
=== 李四川－蘇巧慧 ===
{| class="wikitable"
! style="width:120px;" |民調來源
! style="width:140px;" |調查日期
! style="border-bottom:4px solid #000099;" |{{KMT/logo2}} [[李四川]]
! style="border-bottom:4px solid #1B9431;" |{{DPP/logo2}}<br>[[蘇巧慧]]
! style="border-bottom:4px solid #707070;" |[[File:Undecided-Square.png|20x20px]] 其他/未表態
|-
| rowspan="2" |TVBS<ref name="tv">{{cite news |title=民調 |url=https://example.com/a |date=2026-09-02}}</ref>
| rowspan="2" style="border-right:4px solid #000099|8月28日至30日
| style="background-color:#CCCCFF;" |'''39.8%'''
|33.1%
|27.1%
|-
|41%
| -
|30%
|-
| colspan="5" |某某退選
|-
|山水民調<ref>{{cite news| title=民調
| work=自由 | date=2026-10-02 | url=https://example.com/b}}</ref>
|9月30日至10月1日
|34.5% || 39.1% || -
|-
|再次引用<ref name="tv" />
|12月30日至1月2日
|40% || 40% || 20%
|}
`;

describe("parsePollPage", () => {
  const rows = parsePollPage(page);

  it("展開 rowspan，同一調查的第二個情境標 variant 1", () => {
    expect(rows[0]).toMatchObject({ raceId: "new-taipei", pollster: "TVBS", variant: 0, undecided: 27.1 });
    expect(rows[0].results).toEqual([
      { name: "李四川", party: "kmt", pct: 39.8 },
      { name: "蘇巧慧", party: "dpp", pct: 33.1 },
    ]);
    expect(rows[1]).toMatchObject({ pollster: "TVBS", variant: 1, fieldEnd: "2026-08-30" });
    expect(rows[1].results).toEqual([{ name: "李四川", party: "kmt", pct: 41 }]);
  });

  it("沒寫年份時用 ref 的發布日推年份", () => {
    expect(rows[0].fieldStart).toBe("2026-08-28");
    expect(rows[2]).toMatchObject({ fieldStart: "2026-09-30", fieldEnd: "2026-10-01" });
  });

  it("略過備註列、處理跨行 ref 與 || 同列多格", () => {
    expect(rows.map((r) => r.pollster)).toEqual(["TVBS", "TVBS", "山水民調", "再次引用"]);
    expect(rows[2].sources).toEqual(["https://example.com/b"]);
    expect(rows[2].undecided).toBeNull();
  });

  it("具名 ref 查得到網址，跨年區間正確", () => {
    expect(rows[3].sources).toEqual(["https://example.com/a"]);
    expect(rows[3]).toMatchObject({ fieldStart: "2026-12-30", fieldEnd: "2027-01-02" });
  });
});

describe("日期", () => {
  it("各種寫法", () => {
    expect(parseDateRange("2025年8月12日至16日", 2025, 0)).toMatchObject({ start: "2025-08-12", end: "2025-08-16" });
    expect(parseDateRange("10月3日、5日至7日", 2026, 9)).toMatchObject({ start: "2026-10-03", end: "2026-10-07" });
    expect(parseDateRange("10月14至16日", 2026, 9)).toMatchObject({ start: "2026-10-14", end: "2026-10-16" });
    expect(parseDateRange("10月20日至22日、10月25日", 2026, 9)).toMatchObject({ start: "2026-10-20", end: "2026-10-25" });
    expect(parseDateRange("2025年11月24日到27日", 2025, 0)).toMatchObject({ start: "2025-11-24", end: "2025-11-27" });
    expect(parseDateRange("2025年12月", 2025, 0)).toMatchObject({ start: "2025-12-01", end: "2025-12-31" });
  });

  it("前一列在 11 月、這列寫 1 月 → 跨到下一年", () => {
    expect(parseDateRange("1月6日至16日", 2025, 11)).toMatchObject({ start: "2026-01-06", end: "2026-01-16" });
  });

  it("發布日比推算的年份可信", () => {
    expect(resolveDates("8月28日至29日", 2025, 3, ["2026-09-02"])).toMatchObject({ end: "2026-08-29" });
  });
});

it("plainText 去掉語法", () => {
  expect(plainText("'''[[黃世杰 (政治人物)|黃世杰]]'''<ref>{{cite|url=x}}</ref>")).toBe("黃世杰");
});
