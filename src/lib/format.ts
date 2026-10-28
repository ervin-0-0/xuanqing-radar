import type { Party } from "./types.ts";
import type { Rating } from "./model.ts";

export const PARTY_VAR: Record<Party, string> = {
  kmt: "var(--kmt)", dpp: "var(--dpp)", tpp: "var(--tpp)", npp: "var(--ind)", pfp: "var(--ind)",
  tsp: "var(--ind)", ind: "var(--ind)", other: "var(--ind)",
};
/** 大面積色塊用的亮色版 */
export const PARTY_FILL: Record<Party, string> = {
  kmt: "var(--kmt-fill)", dpp: "var(--dpp-fill)", tpp: "var(--tpp-fill)", npp: "var(--ind-fill)", pfp: "var(--ind-fill)",
  tsp: "var(--ind-fill)", ind: "var(--ind-fill)", other: "var(--ind-fill)",
};
export const PARTY_SOFT: Record<Party, string> = {
  kmt: "var(--kmt-soft)", dpp: "var(--dpp-soft)", tpp: "var(--tpp-soft)", npp: "var(--ind-soft)", pfp: "var(--ind-soft)",
  tsp: "var(--ind-soft)", ind: "var(--ind-soft)", other: "var(--ind-soft)",
};
export const PARTY_SHORT: Record<Party, string> = {
  kmt: "藍", dpp: "綠", tpp: "白", npp: "時力", pfp: "親", tsp: "基進", ind: "無", other: "其他",
};

/** 地圖填色：當選機率 50% 幾乎是紙色，100% 是政黨全色 */
export function probFill(party: Party, p: number) {
  const t = Math.max(0, Math.min(1, (p - 0.5) / 0.5));
  const pct = Math.round(22 + t * 78);
  return `color-mix(in oklab, ${PARTY_FILL[party]} ${pct}%, var(--card))`;
}

export const pct = (v: number | null | undefined, digits = 0) => (v == null ? "—" : `${v.toFixed(digits)}%`);
export const prob = (p: number) => (p > 0.995 ? ">99%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
export const md = (d: string | null | undefined) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "—");
export const ymd = (d: string) => d.replaceAll("-", "/");

export function ratingText(r: Rating, party: Party) {
  const side = party === "kmt" ? "藍" : party === "dpp" ? "綠" : party === "tpp" ? "白" : "無";
  return r === "tossup" ? "激戰" : r === "lean" ? `微${side}` : r === "likely" ? `偏${side}` : `穩${side}`;
}

export const METHOD_LABEL: Record<string, string> = {
  "phone+mobile": "市話＋手機", phone: "市話", mobile: "手機", online: "網路", mixed: "混合", unknown: "未載明",
};
