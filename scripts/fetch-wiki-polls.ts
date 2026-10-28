// 下載維基百科民調彙整頁原始碼，解析成 data/polls/wiki.json。每天排程跑一次。
import { mkdirSync, writeFileSync } from "node:fs";
import { parsePollPageFull } from "../src/lib/wikitable.ts";

const PAGE = "2026年中華民國直轄市長及縣市長選舉民意調查";
const url = `https://zh.wikipedia.org/w/index.php?title=${encodeURIComponent(PAGE)}&action=raw`;

const res = await fetch(url, { headers: { "User-Agent": "xuanqing-radar/0.1 (election poll aggregator)" } });
if (!res.ok) throw new Error(`維基下載失敗：HTTP ${res.status}`);
const wikitext = await res.text();
const revision = res.headers.get("last-modified");

const { rows, sections } = parsePollPageFull(wikitext);
if (rows.length < 100) throw new Error(`只解析出 ${rows.length} 筆，頁面格式可能變了，不覆寫舊資料`);

mkdirSync("data/raw", { recursive: true });
mkdirSync("data/polls", { recursive: true });
writeFileSync("data/raw/wiki-polls.wikitext", wikitext);
writeFileSync(
  "data/polls/wiki.json",
  JSON.stringify({ page: PAGE, source: `https://zh.wikipedia.org/wiki/${encodeURIComponent(PAGE)}`, fetched: new Date().toISOString(), revision, rows, sections }, null, 1),
);
const latest = rows.map((r) => r.fieldEnd ?? "").sort().at(-1);
console.log(`維基民調 ${rows.length} 筆，最新調查結束日 ${latest}`);
