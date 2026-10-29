# 選情雷達 2026

2026 九合一縣市長選舉當選機率預測。資料和程式分開：網站只讀 `public/data/*.json`，更新資料不用改程式。

## 每天更新

```bash
npm run update
```

會依序：

1. `data:wiki`：下載維基百科「2026年中華民國直轄市長及縣市長選舉民意調查」原始碼，解析成 `data/polls/wiki.json`。解析不到 100 筆就停下來，不覆寫舊資料。
2. `data`：合併所有來源、算今天的預測和 6/1 起每 3 天的走勢，輸出到 `public/data/`。
3. 跑測試、打包到 `dist/`。

`dist/` 是純靜態檔，放任何靜態主機都可以。

## 部署

GitHub Pages：<https://ervin-0-0.github.io/xuanqing-radar/>

`.github/workflows/update.yml` 每天台灣時間 18:00 自動跑：下載維基 → 算預測 → 測試 → 打包 → 部署，並把當天的維基快照存回 repo。
推到 main 也會重新部署。要立刻更新可以在 GitHub 的 Actions 頁按「Run workflow」，或：

```bash
gh workflow run update.yml
```

新民調的樣本數、調查方式、委託單位不會自動補，要對照原始報導寫進 `data/polls/details/{縣市}.json` 再推上去。

## 資料在哪

| 路徑 | 內容 | 怎麼來的 |
|---|---|---|
| `data/polls/wiki.json` | 維基民調表解析結果 | `npm run data:wiki` 自動 |
| `data/polls/details/{縣市}.json` | 每筆民調的樣本數、方式、委託單位、定投票者；維基沒列的民調放 `extraPolls` | 對照原始報導人工／AI 補 |
| `data/races/{縣市}.json` | 候選人、號次、現任、退選、大事記 | 中選會公告與新聞 |
| `data/base/` | 2018／2022 縣市長、2016／2020／2024 總統、2020／2024 不分區政黨票 | 中選會選舉資料庫 |
| `data/base/turnout-2026.json` | 預估票數的投票率假設（2022 加幾個百分點）；中選會公告 2026 選舉人數後填 `electorate` | 手動 |
| `data/national/` | 總統滿意度、政黨好感與支持度、政大政黨偏好 | 美麗島電子報、台灣民意基金會、政大選研 |

格式見 `data/SCHEMA.md`。民調細節用原始報導網址跟維基資料對上，所以 `source` 要用維基 ref 裡的網址。

## 模型

`src/lib/model.ts`，參數集中在 `PARAMS`。說明頁（`#/model`）直接讀這些數字。
修改後跑 `npm test`。

## 封關

依《公職人員選舉罷免法》第 53 條，11/18 00:00 起至 11/28 16:00 不得發布、報導、評論或引述民調（包括之前做的）。`src/App.tsx` 會依台灣時間自動切到暫停頁，期間也不要跑 `npm run update` 發布新資料。
