import { useEffect, useState } from "react";
import { loadSiteData, type SiteData } from "./lib/data.ts";
import { SiteProvider, useRoute } from "./lib/store.tsx";
import { Layout } from "./components/Layout.tsx";
import { Overview } from "./pages/Overview.tsx";
import { RacePage } from "./pages/RacePage.tsx";
import { PollsPage } from "./pages/PollsPage.tsx";
import { ModelPage } from "./pages/ModelPage.tsx";
import type { RaceId } from "./lib/types.ts";

// 《公職人員選舉罷免法》第 53 條：投票日前 10 日起至投票截止前，不得發布、報導、評論或引述民調
const BLACKOUT_START = Date.parse("2026-11-18T00:00:00+08:00");
const BLACKOUT_END = Date.parse("2026-11-28T16:00:00+08:00");

export function App() {
  const now = Date.now();
  if (now >= BLACKOUT_START && now < BLACKOUT_END) return <Blackout />;
  return <Site />;
}

function Blackout() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="font-serif text-2xl font-black">選情雷達</div>
        <p className="mt-4 leading-relaxed text-ink-2">
          依《公職人員選舉罷免法》第 53 條，投票日前 10 天起至 11 月 28 日下午 4 點投票結束前，不得發布、評論或引述民意調查。
          本站在這段期間暫停顯示民調與當選機率。
        </p>
        <p className="mt-3 text-sm text-ink-3">11/28 下午 4 點投票結束後恢復。記得去投票。</p>
      </div>
    </div>
  );
}

function Site() {
  const [data, setData] = useState<SiteData | { blackout: true } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { loadSiteData().then(setData, (e: Error) => setError(e.message)); }, []);
  if (error) return <div className="p-8 text-center text-ink-2">資料載入失敗：{error}</div>;
  if (data && "blackout" in data) return <Blackout />;
  if (!data) return <div className="grid min-h-screen place-items-center text-ink-3"><span className="kicker">載入選情中…</span></div>;
  return <SiteProvider data={data}><Routes /></SiteProvider>;
}

function Routes() {
  const { page, id } = useRoute();
  return (
    <Layout page={page}>
      {page === "race" ? <RacePage key={id} id={id as RaceId} /> :
       page === "polls" ? <PollsPage /> :
       page === "model" ? <ModelPage /> :
       <Overview />}
    </Layout>
  );
}
