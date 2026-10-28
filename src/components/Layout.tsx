import type { ReactNode } from "react";
import { useSite } from "../lib/store.tsx";
import { daysBetween } from "../lib/stats.ts";
import { md } from "../lib/format.ts";

const NAV = [
  { href: "#/", label: "總覽", page: "" },
  { href: "#/polls", label: "民調庫", page: "polls" },
  { href: "#/mymap", label: "自己畫地圖", page: "mymap" },
  { href: "#/model", label: "模型說明", page: "model" },
];

export function Layout({ page, children }: { page: string; children: ReactNode }) {
  const { data, isLive, asOf, setAsOf } = useSite();
  const days = daysBetween(data.meta.asOf, data.meta.electionDay);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b hairline bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <a href="#/" className="flex items-center gap-2">
            <span className="radar shrink-0" aria-hidden />
            <span className="font-serif text-xl font-black tracking-wide">選情雷達</span>
            <span className="text-xs text-ink-3">2026 九合一</span>
          </a>
          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {NAV.map((n) => {
              const on = n.page === page || (n.page === "" && page === "race");
              return (
                <a key={n.href} href={n.href} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${on ? "bg-ink text-paper" : "text-ink-2 hover:bg-wash"}`}>
                  {n.label}
                </a>
              );
            })}
          </nav>
          <div className="ml-auto text-xs text-ink-2">
            {days > 0 ? <>距投票 <b className="num text-sm text-ink">{days}</b> 天</> : <>投票日 11/28</>}
            <span className="mx-2 text-ink-3">·</span>民調至 <span className="num">{md(data.meta.latestPoll)}</span>
          </div>
        </div>
      </header>
      {!isLive && (
        <div className="border-b border-accent/30 bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
            <span className="font-medium text-accent">時光機</span>
            <span className="text-ink-2">正在看 {md(asOf)} 當時的預測，全站數字都是只用那天以前的民調算的</span>
            <button className="ml-auto rounded border hairline px-2 py-0.5 text-xs hover:bg-wash" onClick={() => setAsOf(data.meta.asOf)}>回到今天的預測</button>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
      <footer className="border-t hairline">
        <div className="mx-auto max-w-6xl space-y-1 px-4 py-6 text-xs leading-relaxed text-ink-3">
          <p>民調彙整自<a className="underline" href={data.meta.wikiSource} target="_blank" rel="noreferrer">維基百科民調列表</a>與各媒體原始報導；歷屆選舉結果來自中選會選舉資料庫。每筆民調都附原始連結。</p>
          <p>依《公職人員選舉罷免法》第 53 條，11/18 起至 11/28 下午 4 點投票結束前不得發布、評論或引述民調，本站在這段期間自動暫停顯示民調與預測。</p>
          <p>資料建置於 <span className="num">{data.meta.built.slice(0, 16).replace("T", " ")}</span> UTC。這是統計估計，不是押寶工具：當選機率 70% 代表十次會輸三次。</p>
        </div>
      </footer>
    </div>
  );
}

export function Card({ title, kicker, children, className = "", right }: { title?: ReactNode; kicker?: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      {(title || kicker) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {kicker && <div className="kicker mb-1">{kicker}</div>}
            {title && <h2 className="font-serif text-xl font-black">{title}</h2>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
