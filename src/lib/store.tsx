// 全站資料與時光機狀態。forecast 在瀏覽器裡重算，拖滑桿時用較少模擬次數，放開再算完整版。

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { forecast, type Forecast, type ModelRace, type Poll } from "./model.ts";
import type { SiteData } from "./data.ts";

interface Ctx {
  data: SiteData;
  modelRaces: ModelRace[];
  modelPolls: Poll[];
  asOf: string;
  setAsOf: (d: string) => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  live: Forecast;
  isLive: boolean;
  /** 抽籤號次；沒抽到（或已退選、假設人選）回傳 null */
  ballot: (raceId: string, name: string) => number | null;
}

const C = createContext<Ctx | null>(null);

export function SiteProvider({ data, children }: { data: SiteData; children: ReactNode }) {
  const modelRaces = useMemo<ModelRace[]>(
    () => data.races.filter((r) => r.candidates.length >= 2).map((r) => ({
      id: r.id, tier: r.tier, candidates: r.candidates, priorShares: r.prior.priorShares, priorSigma: r.prior.priorSigma,
    })),
    [data],
  );
  const modelPolls = data.polls as unknown as Poll[];
  const ballots = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.races) for (const c of r.candidates) if (c.ballotNumber != null) m.set(`${r.id}|${c.name}`, c.ballotNumber);
    return m;
  }, [data]);
  const ballot = (raceId: string, name: string) => ballots.get(`${raceId}|${name}`) ?? null;
  const [asOf, setAsOf] = useState(data.meta.asOf);
  const [dragging, setDragging] = useState(false);
  const [live, setLive] = useState<Forecast>(data.forecast);

  const isLive = asOf === data.meta.asOf;
  useEffect(() => {
    if (isLive) { setLive(data.forecast); return; }
    // 用計時器而不是 requestAnimationFrame：背景分頁裡 rAF 不會觸發
    const id = setTimeout(() =>
      setLive(forecast(modelRaces, modelPolls, { asOf, electionDay: data.meta.electionDay, sims: dragging ? 2500 : 10_000 })),
    dragging ? 0 : 30);
    return () => clearTimeout(id);
  }, [asOf, dragging, isLive, data, modelRaces, modelPolls]);

  return (
    <C.Provider value={{ data, modelRaces, modelPolls, asOf, setAsOf, dragging, setDragging, live, isLive, ballot }}>
      {children}
    </C.Provider>
  );
}

export function useSite() {
  const c = useContext(C);
  if (!c) throw new Error("useSite 必須在 SiteProvider 裡");
  return c;
}

/** 極簡 hash 路由：#/race/taipei、#/polls、#/model、#/mymap */
export function useRoute() {
  const parse = () => {
    const [, page = "", id = ""] = window.location.hash.replace(/^#/, "").split("/");
    return { page, id };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
