import { Card } from "../components/Layout.tsx";
import { LineChart } from "../components/LineChart.tsx";
import { useSite } from "../lib/store.tsx";
import { PARAMS } from "../lib/model.ts";
import { INCUMBENCY_MARGIN } from "../lib/fundamentals.ts";
import { PARTY_VAR } from "../lib/format.ts";
import { RACE_BY_ID } from "../lib/types.ts";

export function ModelPage() {
  const { data } = useSite();
  const f = data.forecast;
  const counts: Record<string, number> = {};
  for (const p of data.polls) if (!p.excluded && p.kind === "general" && p.variant === 0) counts[p.pollster] = (counts[p.pollster] ?? 0) + 1;
  const house = Object.entries(f.house).sort((a, b) => b[1] - a[1]);
  const approvalBy = groupBy(data.national.approval, (p) => p.pollster);
  const nccu = (k: string) => data.national["party-id-nccu"].filter((p) => p.values[k] != null).map((p) => ({ x: p.fieldEnd, y: p.values[k]! }));

  return (
    <div className="space-y-6">
      <section className="rise">
        <div className="kicker">METHODOLOGY</div>
        <h1 className="mt-2 font-serif text-3xl font-black">民調怎麼變成當選機率</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-ink-2">
          FiveThirtyEight、經濟學人、紐約時報的選舉模型都不直接報「誰民調最高」，而是回答：如果明天重選一萬次，各候選人會贏幾次？
          這裡用同樣的邏輯處理 22 縣市長加竹北市長。所有參數都寫在下面，程式碼裡用的就是這些數字。
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Step n="01" title="只收能比較的民調">
          每筆民調換算成「已登記候選人之間」的得票率，未表態按已表態比例分配。包含已退選或假設人選、且他們合計超過 5% 的情境不用；
          同一次調查有好幾個情境時，取最接近實際對決的那一個。初選、整合、內參民調列在民調庫，但不進模型；AI 生成或自願投票的「民調」不收。
        </Step>
        <Step n="02" title="加權平均，而不是信最新一筆">
          權重＝新舊（半衰期 {PARAMS.halfLifeDays} 天）× 樣本數開根號 × 調查方式（市話＋手機 1、市話 {PARAMS.methodWeight.phone}、網路 {PARAMS.methodWeight.online}、未載明 {PARAMS.methodWeight.unknown}）
          × 委託（候選人或政黨委託 {PARAMS.sponsoredWeight}）。
        </Step>
        <Step n="03" title="扣掉機構效應">
          某機構的藍綠差距，平均比同縣市、前後 30 天內其他機構的民調偏多少，就是它的 house effect。
          全部從資料估，分母加 {PARAMS.houseShrink} 讓做得少的機構往 0 收斂，上限 ±{PARAMS.houseClamp} 點。下面有目前估出來的表。
        </Step>
        <Step n="04" title="基本盤">
          把好幾種投票都換成「這裡比全國偏藍或偏綠幾點」再加權平均：2020／2024 總統選舉、2022 縣市長（有現任參選先扣掉現任優勢）、
          2024 不分區政黨票、2022 議員政黨票、2024 區域立委、遠見 2026 各縣市「今年縣市長支持哪一黨」，以及 2025 核三公投（弱指標）。
          政黨支持度跟實際投票不同尺度，用 22 縣市跟總統、不分區得票的差距做回歸換算（係數 {data.meta.supportScale ?? 1}）；藍白合推的候選人，民眾黨支持者也算進藍營。
          今年的候選人如果上屆以別的黨籍參選，當年的票算進他現在的陣營。現任參選再加 {INCUMBENCY_MARGIN} 個百分點的藍綠差距。
          最後加上「全國風向」：各縣市民調平均比基本盤偏多少，目前估計 <b>{f.environment >= 0 ? "偏藍" : "偏綠"} {Math.abs(f.environment).toFixed(1)}</b> 點。
          2025 罷免投票只在國民黨立委選區舉行，不能代表整個縣市，只列在縣市頁參考。
        </Step>
        <Step n="05" title="民調跟基本盤怎麼合">
          兩者都有不確定度：民調平均的誤差＝單筆非抽樣誤差 {PARAMS.pollError} 點 ÷ 有效筆數，加上整個業界一起偏的 {PARAMS.industryError} 點，
          再加上民調變舊的漂移（每 30 天 {PARAMS.driftPer30} 點）與未表態比例（每 10% 未表態加 {(PARAMS.undecidedError * 10).toFixed(1)} 點）；基本盤誤差 6–10 點。誤差越小的佔越重，所以民調多又新的縣市幾乎全看民調。
        </Step>
        <Step n="06" title="蒙地卡羅：席次不是勝率相加">
          每次模擬先抽一個全國誤差（標準差 {PARAMS.nationalError} 點，所有國民黨候選人一起加、民進黨一起減），再抽各縣市自己的誤差，記下誰贏。
          抽一萬次，就能回答「國民黨拿到 12 席以上的機率」。
        </Step>
        <Step n="07" title="預估票數">
          票數＝選舉人數 × 投票率 × 有效票比例 × 預估得票率。投票率假設是各縣市 2022 縣市長投票率加 {data.meta.turnoutAddPoints ?? 0} 個百分點，
          有效票比例沿用 2022；選舉人數先用 2022，中選會公告 2026 選舉人數後會換掉。首頁席次卡和各縣市頁有拉桿可以改投票率；投票率只影響票數，不影響得票率和當選機率。
        </Step>
      </div>

      <Card kicker={`${house.length} 家機構`} title="目前估出的機構效應" right={<span className="text-xs text-ink-3">正＝偏藍，負＝偏綠</span>}>
        <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {house.map(([name, v]) => (
            <div key={name} className="flex items-center gap-2 text-sm">
              <span className="w-28 truncate">{name}</span>
              <div className="relative h-3 flex-1">
                <div className="absolute left-1/2 top-0 h-3 w-px bg-rule" />
                <div className="absolute top-0.5 h-2 rounded-sm" style={{
                  left: v >= 0 ? "50%" : `${50 + (v / PARAMS.houseClamp) * 50}%`,
                  width: `${(Math.abs(v) / PARAMS.houseClamp) * 50}%`,
                  background: v >= 0 ? "var(--kmt)" : "var(--dpp)",
                }} />
              </div>
              <span className="num w-12 text-right">{v > 0 ? "+" : ""}{v.toFixed(1)}</span>
              <span className="num w-10 text-right text-xs text-ink-3">{counts[name] ?? 0} 筆</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-3">單位是藍綠差距的百分點。只做過一兩次的機構估計很不穩，所以縮減得多。</p>
      </Card>

      <TrackRecord />

      {Object.keys(approvalBy).length > 0 && (
        <Card title="各機構的總統滿意度">
          <LineChart
            yDomain={[25, 65]} yTicks={[30, 40, 50, 60]} yFormat={(v) => `${v}%`}
            series={Object.entries(approvalBy).slice(0, 4).map(([name, pts], i) => ({
              key: name, label: name, color: ["var(--dpp)", "var(--kmt)", "var(--tpp)", "var(--ind)"][i],
              points: pts.filter((p) => p.values.satisfied != null).map((p) => ({ x: p.fieldEnd, y: p.values.satisfied! })),
            }))}
          />
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-2">
            {Object.keys(approvalBy).slice(0, 4).map((n, i) => (
              <span key={n} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: ["var(--dpp)", "var(--kmt)", "var(--tpp)", "var(--ind)"][i] }} />{n}</span>
            ))}
          </div>
        </Card>
      )}

      {data.national["party-id-nccu"].length > 0 && (
        <Card kicker="政大選舉研究中心・每年" title="台灣民眾政黨偏好，1992 至今">
          <LineChart
            yDomain={[0, 70]} yTicks={[0, 20, 40, 60]} yFormat={(v) => `${v}%`} height={240}
            series={[
              { key: "n", label: "中立／無反應", color: "var(--ind)", dashed: true, points: nccu("neutral") },
              { key: "d", label: "民進黨", color: "var(--dpp)", points: nccu("dpp") },
              { key: "k", label: "國民黨", color: "var(--kmt)", points: nccu("kmt") },
              { key: "t", label: "民眾黨", color: "var(--tpp)", points: nccu("tpp") },
            ].filter((s) => s.points.length)}
          />
          <p className="mt-2 text-xs text-ink-3">每年合併調查；2026 年只含 1–6 月。虛線是中立或無反應，至今仍是最大的一群。</p>
        </Card>
      )}

      <Card title="這套方法做不到的事">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2">
          <li>最後三週的黑材料、颱風、投票率暴跌，模型都不知道；11/18 起民調封關，之後的變化完全看不到。</li>
          <li>台灣的公開民調很多是候選人或政黨委託，雖然打了折，仍可能把單一縣市帶偏。</li>
          <li>多人參選（花蓮、澎湖、金門）的分裂投票比兩人對決更難估，這些縣市的機率要打更大的折扣。</li>
          <li>民調少的縣市主要靠基本盤與全國風向，地方派系、候選人個人因素都沒進模型。</li>
        </ul>
      </Card>

      <Card title="資料來源與更新">
        <ul className="space-y-1.5 text-sm leading-relaxed text-ink-2">
          <li>民調：<a className="underline" href={data.meta.wikiSource} target="_blank" rel="noreferrer">維基百科「2026年中華民國直轄市長及縣市長選舉民意調查」</a>每日自動抓取，
            再逐筆對照原始報導補上樣本數、調查方式、委託單位；維基沒列的科學民調另外收錄。最近一次抓取 <span className="num">{data.meta.wikiFetched.slice(0, 10)}</span>。</li>
          <li>歷屆結果：<a className="underline" href="https://db.cec.gov.tw/" target="_blank" rel="noreferrer">中選會選舉資料庫</a>（2018／2022 縣市長、2016／2020／2024 總統、2020／2024 不分區政黨票）。</li>
          <li>全國民意：美麗島電子報國政民調、台灣民意基金會、政大選研中心政黨偏好趨勢。</li>
          <li>地圖：<a className="underline" href="https://github.com/dkaoster/taiwan-atlas" target="_blank" rel="noreferrer">taiwan-atlas</a>（內政部國土測繪中心圖資）。</li>
        </ul>
      </Card>
    </div>
  );
}

/** 歷屆民調準確度與回測 */
function TrackRecord() {
  const { data } = useSite();
  const c = data.calibration;
  if (!c?.accuracy) return null;
  const a = c.accuracy;
  const bt = c.backtests[0];
  const top = a.pollsters.filter((p) => p.n >= 3);
  return (
    <Card kicker={`2018 ${c.years["2018"] ?? 0} 筆・2022 ${c.years["2022"] ?? 0} 筆選前民調`} title="這套方法以前準不準">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {bt && (
            <div className="mb-4 rounded-lg bg-wash p-4">
              <div className="text-xs text-ink-3">回測 {bt.year}：只用當年選前就有的資料，在封關前一天（{bt.asOf}）跑同一套模型</div>
              <div className="mt-1 font-serif text-3xl font-black">猜中 <span className="num">{bt.correct}</span><span className="text-lg text-ink-3"> / {bt.total} 縣市</span></div>
              <div className="text-xs text-ink-2">Brier 分數 <span className="num">{bt.brier.toFixed(3)}</span>（0 最好；全部丟銅板是 0.25）</div>
            </div>
          )}
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-ink-2">單筆民調前兩名差距的誤差（中位數）</dt><dd className="num">{a.medianAbs.toFixed(1)} 點</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-2">　均方根（含少數離譜的）</dt><dd className="num">{a.rmse.toFixed(1)} 點</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-2">單筆民調猜中當選人</dt><dd className="num">{Math.round(a.hitRate * 100)}%</dd></div>
            {Object.entries(a.industryBias).map(([y, v]) => (
              <div key={y} className="flex justify-between gap-3"><dt className="text-ink-2">{y} 民調整體{v < 0 ? "低估國民黨" : "低估民進黨"}</dt><dd className="num">{Math.abs(v).toFixed(1)} 點</dd></div>
            ))}
          </dl>
          <div className="mt-3 space-y-2 text-xs leading-relaxed text-ink-3">
            <p>從這些紀錄學到、已經改進模型的兩件事：</p>
            <p>1. 未表態的人<b className="text-ink-2">平均分給主要候選人</b>，比按支持度比例分配準（誤差從 15.9 降到 12.1 點）。台灣地方選舉的未表態常倒向落後的一方，例如 2022 台南、高雄、屏東，民調都把領先差距高估了二、三十點。</p>
            <p>2. 第一次參選、沒有前例的無黨籍或第三黨候選人（像 2022 的高虹安、鍾東錦），基本盤不可信，<b className="text-ink-2">有民調就改用民調數字當起點</b>。這讓 2022 回測從猜中 17 個變成 20 個。</p>
            <p>兩屆民調都低估國民黨，但只有兩屆、而且都是藍營大勝的年份，方向不一定延續，所以不直接修正今年的民調，而是把全國誤差加大到 ±{PARAMS.nationalError} 個百分點（得票率）。各機構跟同業比的偏差，則當成今年估機構效應的起點。</p>
          </div>
        </div>
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead><tr className="text-left text-xs text-ink-3"><th className="px-2 py-1 font-normal">機構（3 筆以上）</th><th className="px-2 text-right font-normal">筆數</th><th className="px-2 text-right font-normal">相對偏差</th><th className="px-2 text-right font-normal">誤差</th><th className="px-2 text-right font-normal">猜中</th></tr></thead>
            <tbody className="divide-y divide-rule">
              {top.map((p) => (
                <tr key={p.pollster}>
                  <td className="px-2 py-1.5">{p.pollster}</td>
                  <td className="num px-2 text-right">{p.n}</td>
                  <td className="num px-2 text-right" style={{ color: p.bias == null ? undefined : p.bias > 0 ? "var(--kmt)" : "var(--dpp)" }}>{p.bias == null ? "—" : `${p.bias > 0 ? "藍" : "綠"} ${Math.abs(p.bias).toFixed(1)}`}</td>
                  <td className="num px-2 text-right">{p.rmse.toFixed(1)}</td>
                  <td className="num px-2 text-right">{Math.round(p.hitRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {bt && (
        <div className="mt-5 border-t hairline pt-4">
          <div className="mb-2 text-xs text-ink-3">{bt.year} 回測逐縣市</div>
          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {bt.races.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className={`w-4 text-center font-bold ${r.correct ? "text-accent" : "text-ink-3"}`}>{r.correct ? "✓" : "✗"}</span>
                <span className="w-10">{RACE_BY_ID[r.id].short}</span>
                <span className="truncate" style={{ color: PARTY_VAR[r.predictedParty] }}>{r.predicted}</span>
                <span className="num text-ink-3">{Math.round(r.prob * 100)}%</span>
                {!r.correct && <span className="truncate text-[11px] text-ink-3">實際 {r.winner}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="num text-sm text-accent">{n}</div>
      <h2 className="mt-1 font-serif text-lg font-black">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{children}</p>
    </section>
  );
}

function groupBy<T>(xs: T[], k: (x: T) => string) {
  const out: Record<string, T[]> = {};
  for (const x of xs) (out[k(x)] ??= []).push(x);
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1].length - a[1].length));
}
