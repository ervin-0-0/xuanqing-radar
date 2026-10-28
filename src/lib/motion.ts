import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 數字補間：值改變時在 ms 毫秒內滑過去。分頁在背景或使用者關閉動態時直接跳到終值。 */
export function useTween(target: number, ms = 600) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    if (reduced() || document.hidden) { cur.current = target; setV(target); return; }
    from.current = cur.current;
    const t0 = performance.now();
    let id = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      cur.current = from.current + (target - from.current) * e;
      setV(cur.current);
      if (k < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    // 保險：rAF 被節流時，時間到也要落在終值
    const done = setTimeout(() => { cur.current = target; setV(target); }, ms + 120);
    return () => { cancelAnimationFrame(id); clearTimeout(done); };
  }, [target, ms]);
  return v;
}

/** 進入畫面時加上 class（只觸發一次），用來做卡片浮現、線條畫出 */
export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    // 保險：觀察器沒觸發（舊瀏覽器、背景分頁）也要在 1.5 秒後顯示，內容不能藏起來
    const t = setTimeout(() => setSeen(true), 1500);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [seen]);
  return { ref, seen };
}
