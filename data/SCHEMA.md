# 選情雷達資料格式

所有資料檔都是 UTF-8 JSON，數字一律用 number（百分比寫 38.6，不寫 "38.6%"），日期一律 `YYYY-MM-DD`。
每一筆資料都要有 `source`（原始網址）。查不到的欄位填 `null`，不要猜。

## 選區代碼（raceId）

| raceId | 名稱 | tier |
|---|---|---|
| taipei | 台北市 | metro |
| new-taipei | 新北市 | metro |
| taoyuan | 桃園市 | metro |
| taichung | 台中市 | metro |
| tainan | 台南市 | metro |
| kaohsiung | 高雄市 | metro |
| keelung | 基隆市 | county |
| hsinchu-city | 新竹市 | county |
| hsinchu-county | 新竹縣 | county |
| miaoli | 苗栗縣 | county |
| changhua | 彰化縣 | county |
| nantou | 南投縣 | county |
| yunlin | 雲林縣 | county |
| chiayi-city | 嘉義市 | county |
| chiayi-county | 嘉義縣 | county |
| pingtung | 屏東縣 | county |
| yilan | 宜蘭縣 | county |
| hualien | 花蓮縣 | county |
| taitung | 台東縣 | county |
| penghu | 澎湖縣 | county |
| kinmen | 金門縣 | county |
| lienchiang | 連江縣 | county |
| zhubei | 竹北市（新竹縣轄市，市長選舉） | township |

## 政黨代碼（party）

`kmt` 國民黨、`dpp` 民進黨、`tpp` 民眾黨、`npp` 時代力量、`pfp` 親民黨、`tsp` 台灣基進、`ind` 無黨籍、`other` 其他（另填 `partyName`）。

## data/base/results-mayor-{2018,2022}.json

```json
{
  "year": 2022,
  "source": "https://db.cec.gov.tw/...",
  "races": {
    "taipei": {
      "electorate": 2080000, "ballotsCast": 1200000, "validVotes": 1180000, "turnout": 57.69,
      "candidates": [
        { "name": "蔣萬安", "party": "kmt", "votes": 575590, "pct": 42.29, "elected": true, "incumbent": false }
      ],
      "source": "https://..."
    }
  }
}
```

## data/base/presidential-by-county.json

```json
{
  "elections": {
    "2024": {
      "tickets": [{ "id": "dpp", "names": "賴清德／蕭美琴" }, { "id": "kmt", "names": "侯友宜／趙少康" }, { "id": "tpp", "names": "柯文哲／吳欣盈" }],
      "national": { "dpp": 40.05, "kmt": 33.49, "tpp": 26.46, "turnout": 71.86 },
      "byRace": { "taipei": { "dpp": 38.0, "kmt": 36.0, "tpp": 26.0, "turnout": 70.1, "validVotes": 1600000 } },
      "source": "https://..."
    }
  }
}
```
`byRace` 用上面的 raceId，竹北市（zhubei）用鄉鎮市區層級資料。2016／2020／2024 三屆都要。

## data/base/party-list-by-county.json

立委不分區政黨票，2020／2024，結構同上，`byRace.{raceId}` 是 `{ "dpp": 36.2, "kmt": 33.5, "tpp": 22.1, "npp": 2.1, "other": 6.1 }`。

## data/national/*.json

```json
{
  "series": [
    {
      "fieldStart": "2026-09-22", "fieldEnd": "2026-09-24", "published": "2026-09-28",
      "pollster": "美麗島電子報", "sampleSize": 1072, "method": "phone+mobile",
      "values": { "satisfied": 46.4, "dissatisfied": 43.9 },
      "source": "https://..."
    }
  ]
}
```
- `approval.json`：總統施政滿意度。`values` = `{ satisfied, dissatisfied }`。
- `party-favorability.json`：政黨好感度。`values` = `{ dppLike, dppDislike, kmtLike, kmtDislike, tppLike, tppDislike }`。
- `party-id.json`：政黨支持度（認同）。`values` = `{ dpp, kmt, tpp, npp, neutral }`。
- `party-id-nccu.json`：政大選研中心政黨偏好長期趨勢，`fieldStart`／`fieldEnd` 用該期年月，`values` 同上。

`method`：`phone`（市話）、`phone+mobile`（市話＋手機）、`mobile`、`online`（網路）、`mixed`、`unknown`。

## data/races/{raceId}.json（候選人與選區背景）

```json
{
  "raceId": "new-taipei",
  "incumbent": { "name": "侯友宜", "party": "kmt", "running": false, "termLimited": true },
  "candidates": [
    {
      "name": "李四川", "party": "kmt", "partyName": null,
      "status": "registered",
      "ballotNumber": 2,
      "endorsedBy": ["kmt", "tpp"],
      "incumbent": false,
      "born": 1955,
      "currentRole": "前新北市副市長",
      "bio": "一句話背景",
      "source": "https://..."
    }
  ],
  "withdrawn": [{ "name": "黃國昌", "party": "tpp", "reason": "藍白整合民調落敗", "date": "2026-04-28", "source": "https://..." }],
  "keyEvents": [{ "date": "2026-04-28", "text": "藍白整合民調，李四川勝出", "source": "https://..." }],
  "notes": null,
  "updated": "2026-10-28"
}
```
`status`：`registered`（已向選委會登記）、`nominated`（政黨已提名、未登記）、`declared`（宣布參選）、`withdrawn`。

## data/polls/details/{raceId}.json（民調細節補充）

維基百科的民調表只有機構、日期、支持率。這個檔補上原始報導裡的細節，用原始新聞網址對應：

```json
{
  "raceId": "new-taipei",
  "details": [
    {
      "source": "https://news.ltn.com.tw/news/politics/breakingnews/5593630",
      "pollster": "山水民調", "sponsor": "蘇巧慧競選總部",
      "fieldStart": "2026-09-30", "fieldEnd": "2026-10-01", "published": "2026-10-02",
      "method": "phone+mobile", "sampleSize": 1215, "moe": 2.8, "confidence": 95,
      "population": "20 歲以上新北市民",
      "weighting": "依性別、年齡、行政區加權",
      "results": [{ "name": "蘇巧慧", "party": "dpp", "pct": 41.2 }, { "name": "李四川", "party": "kmt", "pct": 36.6 }],
      "undecided": 22.2,
      "likelyVoters": { "sampleSize": 900, "results": [{ "name": "蘇巧慧", "pct": 47.0 }, { "name": "李四川", "pct": 42.1 }] },
      "notes": "其他值得記的事：例如詢問題目、是否含政黨傾向分析",
      "extraSources": ["https://..."]
    }
  ],
  "extraPolls": []
}
```
- `details`：維基已列、你補細節的民調。
- `extraPolls`：維基沒列、但你在新聞找到的科學民調（電話或網路調查，有樣本數）。格式同 `details`。
- 不收：壹蘋投票、網路即時投票、AI 預測、街頭調查、沒有樣本數的「內參」傳聞。真的遇到值得記錄的，放進 `extraPolls` 並加 `"excluded": true, "excludeReason": "..."`。

## data/history/polls-{2018,2022}.json（歷屆選前民調，用來校準）

選舉日：2018-11-24、2022-11-26。只收投票日前 75 天內、封關前的候選人對決民調。

```json
{
  "year": 2022,
  "electionDay": "2022-11-26",
  "polls": [
    {
      "raceId": "taipei",
      "pollster": "TVBS", "sponsor": null,
      "fieldStart": "2022-10-20", "fieldEnd": "2022-10-24", "published": "2022-10-26",
      "method": "phone+mobile", "sampleSize": 1068,
      "results": [{ "name": "蔣萬安", "party": "kmt", "pct": 38 }, { "name": "陳時中", "party": "dpp", "pct": 26 }, { "name": "黃珊珊", "party": "ind", "pct": 27 }],
      "undecided": 9,
      "source": "https://...", "via": "wikipedia | news", "notes": null
    }
  ]
}
```
`party` 用當年登記黨籍（2018 柯文哲＝ind、2022 黃珊珊＝ind、高虹安＝tpp）。名字要跟 data/base/results-mayor-{年}.json 裡的寫法一致。

## data/base/recent-votes.json（較新的投票）

```json
{
  "council2022": { "national": { "kmt": 37.0, "dpp": 30.0, "tpp": 3.0, "ind": 25.0, "other": 5.0 }, "byRace": { "taipei": { "kmt": 0, "dpp": 0, "tpp": 0, "npp": 0, "ind": 0, "other": 0, "validVotes": 0 } }, "source": "..." },
  "legislative2024": { "national": {...}, "byRace": {...}, "source": "..." },
  "recall2025": {
    "rounds": [{ "date": "2025-07-26", "source": "..." }, { "date": "2025-08-23", "source": "..." }],
    "districts": [{ "date": "2025-07-26", "raceId": "taipei", "district": "臺北市第3選舉區", "target": "王鴻薇", "targetParty": "kmt", "agree": 0, "disagree": 0, "agreePct": 0, "electorate": 0, "turnout": 0, "passed": false, "source": "..." }],
    "byRace": { "taipei": { "agreePct": 0, "turnout": 0, "districts": 0 } }
  },
  "referendum2025": { "date": "2025-08-23", "question": "核三延役", "national": { "agreePct": 0, "turnout": 0 }, "byRace": { "taipei": { "agreePct": 0, "turnout": 0 } }, "source": "..." }
}
```
各項百分比是佔有效票的比例。`byRace` 用 raceId，竹北用鄉鎮市區層級。

## data/base/party-support-county.json（各縣市政黨支持度）

```json
{
  "surveys": [
    {
      "pollster": "遠見雜誌", "title": "2026 縣市長施政滿意度暨政黨支持度調查",
      "fieldStart": "2026-03-02", "fieldEnd": "2026-04-14", "published": "2026-05-xx",
      "method": "phone+mobile", "source": "https://...",
      "byRace": { "taipei": { "kmt": 0, "dpp": 0, "tpp": 0, "none": 0, "sampleSize": null } }
    }
  ]
}
```
