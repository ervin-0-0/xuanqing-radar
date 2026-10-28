// 民調機構名稱統一，以及不採用的來源。

const ALIASES: Record<string, string> = {
  "TVBS民調中心": "TVBS",
  ETToday: "ETtoday",
  "ETtoday民調雲": "ETtoday",
  "ET民調雲": "ETtoday",
  美麗島: "美麗島電子報",
  山水: "山水民調",
  "震傳媒／山水": "山水民調",
  年代: "年代民調",
  信民兩岸研究協會: "信民協會",
  "信民兩岸協會": "信民協會",
  皮爾森數據: "鉅聞天下",
  鉅聞: "鉅聞天下",
  鋒燦傳媒: "鋒燦民調",
  艾普羅: "艾普羅民調",
  Newtalk: "NewTalk",
  新頭殼: "NewTalk",
  關鍵調查: "關鍵民調",
  世新大學: "世新民調",
  "TPOC台灣議題研究中心": "TPOC",
  台灣議題研究中心: "TPOC",
  鏡新聞: "鏡報",
  "上報民調": "上報",
  精確市場研究: "精確民調",
};

export function canonicalPollster(name: string): string {
  const n = name.replace(/\s+/g, "").trim();
  return ALIASES[n] ?? n;
}

/** 不進模型、但仍在民調庫列出的來源 */
export const EXCLUDED_POLLSTERS: Record<string, string> = {
  壹蘋投票: "網路自願投票，非抽樣調查",
};

/** 方法較弱、但仍是抽樣調查的來源：進模型但降權 */
export const POLLSTER_QUALITY: Record<string, { weight: number; note: string }> = {
  包打聽AI民調中心: { weight: 0.4, note: "AI 語音自動撥號電訪（IVR），降權處理" },
};

export function classifyPoll(pollster: string, scenario: string): "general" | "primary" | "internal" {
  const s = `${pollster} ${scenario}`;
  if (/內參/.test(s)) return "internal";
  if (/初選|整合/.test(s)) return "primary";
  return "general";
}
