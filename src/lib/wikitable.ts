// 解析維基百科「2026年中華民國直轄市長及縣市長選舉民意調查」的原始碼。
// 只處理這一頁用到的 wikitable 語法：rowspan／colspan、`||` 同列多格、cell 屬性、<ref>。

import type { Party, RaceId } from "./types.ts";

export const RACE_BY_HEADING: Record<string, RaceId> = {
  台北市: "taipei", 臺北市: "taipei", 新北市: "new-taipei", 桃園市: "taoyuan",
  台中市: "taichung", 臺中市: "taichung", 台南市: "tainan", 臺南市: "tainan", 高雄市: "kaohsiung",
  基隆市: "keelung", 新竹市: "hsinchu-city", 新竹縣: "hsinchu-county", 苗栗縣: "miaoli",
  彰化縣: "changhua", 南投縣: "nantou", 雲林縣: "yunlin", 嘉義市: "chiayi-city",
  嘉義縣: "chiayi-county", 屏東縣: "pingtung", 宜蘭縣: "yilan", 花蓮縣: "hualien",
  台東縣: "taitung", 臺東縣: "taitung", 澎湖縣: "penghu", 金門縣: "kinmen", 連江縣: "lienchiang",
  竹北市: "zhubei",
};

const PARTY_BY_TEMPLATE: Record<string, Party> = {
  KMT: "kmt", DPP: "dpp", TPP: "tpp", NPP: "npp", PFP: "pfp", TSP: "tsp", NONP: "ind",
};
const PARTY_BY_COLOR: Record<string, Party> = {
  "000099": "kmt", "1b9431": "dpp", "23c9c9": "tpp", "0cb5b5": "tpp", "707070": "ind",
};

export interface WikiCandidate { name: string; party: Party }

export interface WikiPollRow {
  raceId: RaceId;
  scenario: string;
  pollster: string;
  dateText: string;
  fieldStart: string | null;
  fieldEnd: string | null;
  sources: string[];
  results: { name: string; party: Party; pct: number }[];
  undecided: number | null;
  /** 同一機構同一次調查裡的第幾個情境（0 起算） */
  variant: number;
}

interface Cell { text: string; rowspan: number; colspan: number }

/** 掃過整頁，建立 <ref name="x">…</ref> → 網址 的對照，讓 <ref name="x" /> 也查得到出處。 */
export function namedRefs(wikitext: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const re = /<ref\s+name\s*=\s*"?([^">/]+?)"?\s*>([\s\S]*?)<\/ref>/g;
  for (const m of wikitext.matchAll(re)) {
    const urls = refUrls(m[2]);
    if (urls.length) map.set(m[1].trim(), urls);
  }
  return map;
}

function refUrls(s: string): string[] {
  const urls: string[] = [];
  for (const m of s.matchAll(/(?:^|[|\s{])url\s*=\s*([^|}\s]+)/g)) urls.push(m[1].trim());
  return urls;
}

/** ref 裡的發布日期：cite 的 date=，或網址裡的日期。 */
export function refDates(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/[|\s]date\s*=\s*(\d{4})[-年](\d{1,2})[-月](\d{1,2})/g)) out.push(iso(+m[1], +m[2], +m[3]));
  for (const m of s.matchAll(/url\s*=\s*[^|}\s]*?\/(20\d{2})-?(\d{2})-?(\d{2})(?:\/|\d{4}|\.)/g)) out.push(iso(+m[1], +m[2], +m[3]));
  return out.filter((d) => d >= "2024-01-01" && d <= "2027-12-31");
}

/** 跨行的 <ref>…</ref> 或 {{…}} 併回同一行，避免把 ref 裡的「|work=」當成新的格子。 */
function joinLogicalLines(lines: string[]): string[] {
  const out: string[] = [];
  let buf: string | null = null;
  const open = (t: string) =>
    (t.match(/\{\{/g)?.length ?? 0) > (t.match(/\}\}/g)?.length ?? 0) ||
    (t.match(/<ref(?![^>]*\/>)[^>]*>/g)?.length ?? 0) > (t.match(/<\/ref>/g)?.length ?? 0);
  for (const line of lines) {
    buf = buf === null ? line : buf + " " + line;
    if (!open(buf)) { out.push(buf); buf = null; }
  }
  if (buf !== null) out.push(buf);
  return out;
}

/** cell 內所有出處網址（含具名 ref）。 */
export function cellSources(text: string, refs: Map<string, string[]>): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/<ref[^>]*?>([\s\S]*?)<\/ref>/g)) out.push(...refUrls(m[1]));
  for (const m of text.matchAll(/<ref\s+name\s*=\s*"?([^">/]+?)"?\s*\/>/g)) out.push(...(refs.get(m[1].trim()) ?? []));
  return out;
}

/** 去掉 ref、模板、連結語法、HTML，留下顯示文字。 */
export function plainText(s: string): string {
  return s
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[File:[^\]]*\]\]/gi, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/'''?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePct(s: string): number | null {
  const m = plainText(s).match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

/** 在深度 0（不在 [[ ]]、{{ }}、<ref> 裡）切開字串。 */
function splitTop(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0, inRef = false, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith("<ref", i) && !s.startsWith("<ref", i + 1)) {
      const close = s.indexOf(">", i);
      if (close > 0 && s[close - 1] !== "/") inRef = true;
    } else if (s.startsWith("</ref>", i)) inRef = false;
    else if (s.startsWith("[[", i) || s.startsWith("{{", i)) { depth++; i++; continue; }
    else if (s.startsWith("]]", i) || s.startsWith("}}", i)) { depth = Math.max(0, depth - 1); i++; continue; }
    if (depth === 0 && !inRef && s.startsWith(sep, i)) {
      parts.push(s.slice(start, i));
      start = i + sep.length;
      i += sep.length - 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

function parseCell(raw: string): Cell {
  const parts = splitTop(raw, "|");
  let attrs = "", text = raw;
  // 屬性區：style="…" rowspan="2"…；維基上偶有少一個引號的寫法，所以只看開頭是不是屬性名
  if (parts.length > 1 && /^\s*(rowspan|colspan|style|class|align|width|bgcolor)\s*=[^[{<]*$/i.test(parts[0])) {
    attrs = parts[0];
    text = parts.slice(1).join("|");
  }
  const span = (k: string) => Number(attrs.match(new RegExp(`${k}\\s*=\\s*"?(\\d+)`))?.[1] ?? 1);
  return { text: text.trim(), rowspan: span("rowspan"), colspan: span("colspan") };
}

interface Table { header: Cell[]; rows: Cell[][] }

function parseTable(rawLines: string[]): Table {
  const lines = joinLogicalLines(rawLines);
  const header: Cell[] = [];
  const rawRows: Cell[][] = [];
  let current: Cell[] | null = null;
  let last: Cell | null = null;
  for (const line of lines) {
    if (line.startsWith("{|") || line.startsWith("|+")) continue;
    if (line.startsWith("|-")) { current = []; rawRows.push(current); last = null; continue; }
    if (line.startsWith("!")) {
      for (const c of splitTop(line.slice(1), "!!")) header.push((last = parseCell(c)));
      continue;
    }
    if (line.startsWith("|")) {
      if (!current) { current = []; rawRows.push(current); }
      for (const c of splitTop(line.slice(1), "||")) current.push((last = parseCell(c)));
      continue;
    }
    if (last) last.text += "\n" + line; // 跨行的 cell 內容
  }

  // 展開 rowspan／colspan 成方格
  const width = header.reduce((n, c) => n + c.colspan, 0);
  const pending: { left: number; cell: Cell }[] = [];
  const rows: Cell[][] = [];
  for (const raw of rawRows) {
    if (!raw.length) continue;
    const row: Cell[] = [];
    let k = 0;
    for (let col = 0; col < width; ) {
      const p = pending[col];
      if (p && p.left > 0) { row[col] = p.cell; p.left--; col++; continue; }
      const cell = raw[k++];
      if (!cell) break;
      for (let j = 0; j < cell.colspan && col < width; j++, col++) {
        row[col] = cell;
        pending[col] = { left: cell.rowspan - 1, cell };
      }
    }
    rows.push(row);
  }
  return { header, rows };
}

function headerCandidate(cell: Cell): WikiCandidate | null {
  const t = cell.text;
  if (/民調來源|調查日期|未表態|其他/.test(plainText(t))) return null;
  const tpl = t.match(/\{\{([A-Za-z]+)\/logo2?\}\}/)?.[1]?.toUpperCase();
  const color = t.match(/border-bottom:\s*4px solid #([0-9a-fA-F]{6})/)?.[1]?.toLowerCase();
  const party: Party = (tpl && PARTY_BY_TEMPLATE[tpl]) || (color && PARTY_BY_COLOR[color]) || (tpl ? "other" : "ind");
  const name = plainText(t);
  return name ? { name, party } : null;
}

/**
 * 「2025年8月12日至16日」「10月3日、5日至7日」「9月29日至10月2日」→ 起訖日。
 * 沒寫年的沿用 `year`；回傳的 year/month 讓下一列接著推。
 */
export function parseDateRange(text: string, year: number, prevMonth: number) {
  const t = plainText(text);
  const dates: { y: number; m: number; d: number }[] = [];
  let y = year, m = 0;
  const re = /(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})(?=日|至|、|$|\s|-|－|–)/g;
  for (const g of t.matchAll(re)) {
    if (g[1]) y = Number(g[1]);
    if (g[2]) {
      const month = Number(g[2]);
      // 沒寫年、月份倒退很多 → 跨年
      if (!g[1] && !dates.length && prevMonth && prevMonth - month >= 5) y++;
      if (!g[1] && dates.length && month < m) y++; // 12月30日至1月3日
      m = month;
    }
    if (!m) continue;
    dates.push({ y, m, d: Number(g[3]) });
  }
  if (!dates.length) {
    const mo = t.match(/(?:(\d{4})年)?(\d{1,2})月/);
    if (!mo) return { start: null, end: null, year, month: prevMonth };
    const yy = mo[1] ? Number(mo[1]) : year;
    const mm = Number(mo[2]);
    return { start: iso(yy, mm, 1), end: iso(yy, mm, daysIn(yy, mm)), year: yy, month: mm };
  }
  const a = dates[0], b = dates[dates.length - 1];
  return { start: iso(a.y, a.m, a.d), end: iso(b.y, b.m, b.d), year: b.y, month: b.m };
}

const dayNum = (s: string) => Date.parse(s + "T00:00:00Z") / 86_400_000;

/** 沒寫年份時，用報導發布日推年份：調查結束日要在發布日前（容許 3 天誤差）且最接近。 */
export function resolveDates(text: string, year: number, month: number, published: string[]) {
  const d = parseDateRange(text, year, month);
  if (/\d{4}年/.test(plainText(text)) || !published.length || !d.end) return d;
  const pub = published.sort()[0];
  const gap = (end: string | null) => (end ? dayNum(pub) - dayNum(end) : -Infinity);
  let best: ReturnType<typeof parseDateRange> = d;
  for (const y of [Number(pub.slice(0, 4)) - 1, Number(pub.slice(0, 4))]) {
    const c = parseDateRange(text, y, 0);
    const g = gap(c.end);
    const gb = gap(best.end);
    if (g >= -3 && (gb < -3 || g < gb)) best = c;
  }
  return best;
}

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export interface WikiSection { raceId: RaceId; scenario: string; candidates: WikiCandidate[] }

export function parsePollPage(wikitext: string): WikiPollRow[] {
  return parsePollPageFull(wikitext).rows;
}

/** 連同每張表的表頭候選人一起回傳；沒有任何民調列的表（例如屏東）也能知道是誰對決 */
export function parsePollPageFull(wikitext: string): { rows: WikiPollRow[]; sections: WikiSection[] } {
  const refs = namedRefs(wikitext);
  const sections: WikiSection[] = [];
  const lines = wikitext.split("\n");
  const out: WikiPollRow[] = [];
  let race: RaceId | null = null;
  let scenario = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h2 = line.match(/^==\s*([^=]+?)\s*==\s*$/);
    if (h2) { race = RACE_BY_HEADING[h2[1]] ?? null; scenario = ""; continue; }
    const h3 = line.match(/^===\s*([^=]+?)\s*===\s*$/);
    if (h3) { scenario = h3[1]; continue; }
    if (!line.startsWith("{|") || !race) continue;

    const body: string[] = [];
    for (; i < lines.length && !lines[i].startsWith("|}"); i++) body.push(lines[i]);
    const table = parseTable(body);

    const cols = table.header.flatMap((c) => Array(c.colspan).fill(c) as Cell[]);
    const pollsterCol = cols.findIndex((c) => /民調來源/.test(c.text));
    const dateCol = cols.findIndex((c) => /調查日期/.test(c.text));
    const undecidedCol = cols.findIndex((c) => /未表態|其他/.test(plainText(c.text)));
    const candCols = cols
      .map((c, idx) => ({ idx, cand: headerCandidate(c) }))
      .filter((x): x is { idx: number; cand: WikiCandidate } => x.cand !== null);
    sections.push({ raceId: race, scenario, candidates: candCols.map((c) => c.cand) });

    let year = 2025, month = 0;
    let prevKey = "", variant = 0;
    let d = parseDateRange("", year, month);
    for (const row of table.rows) {
      const pollsterCell = row[pollsterCol];
      const dateCell = row[dateCol];
      if (!pollsterCell || !dateCell) continue;
      // 備註列：一格橫跨候選人欄（例如「某某退選」）
      if (candCols.some(({ idx }) => row[idx]?.colspan > 1)) continue;

      const results = candCols
        .map(({ idx, cand }) => ({ ...cand, pct: row[idx] ? parsePct(row[idx].text) : null }))
        .filter((r): r is { name: string; party: Party; pct: number } => r.pct !== null);
      if (!results.length) continue;

      const key = `${pollsterCell.text}\u0000${dateCell.text}`;
      if (key === prevKey) variant++;
      else {
        variant = 0;
        d = resolveDates(dateCell.text, year, month, [...refDates(pollsterCell.text), ...refDates(dateCell.text)]);
        year = d.year; month = d.month;
      }
      prevKey = key;

      out.push({
        raceId: race,
        scenario,
        pollster: plainText(pollsterCell.text),
        dateText: plainText(dateCell.text),
        fieldStart: d.start,
        fieldEnd: d.end,
        sources: [...new Set([...cellSources(pollsterCell.text, refs), ...cellSources(dateCell.text, refs)])],
        results,
        undecided: undecidedCol >= 0 && row[undecidedCol] ? parsePct(row[undecidedCol].text) : null,
        variant,
      });
    }
  }
  return { rows: out, sections };
}
