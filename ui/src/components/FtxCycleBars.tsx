import { useEffect, useRef } from "react";
import type { FtxInstance } from "../types";

/** Length of a source's T/R period in milliseconds: the mode wins for FT4, as in the server. */
export function periodMs(mode: string, trPeriod: number): number {
  if (mode === "FT4") return 7500;
  if (trPeriod >= 1 && trPeriod <= 300) return trPeriod * 1000;
  return mode.startsWith("JT") || mode.startsWith("Q65") ? 60000 : 15000;
}

/**
 * A thin bar per source showing how far through its T/R period the UTC clock is. One timer
 * moves every bar by editing styles directly, so nothing re-renders while the bars run, and
 * it only runs while the bars are on screen.
 */
export default function FtxCycleBars({ instances, tag }: { instances: FtxInstance[]; tag: (i: FtxInstance) => string }) {
  const fills = useRef<(HTMLDivElement | null)[]>([]);
  const texts = useRef<(HTMLSpanElement | null)[]>([]);
  const periods = instances.map((i) => periodMs(i.mode, i.tr_period));
  const key = periods.join(",");

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      periods.forEach((p, n) => {
        const into = now % p;
        const fill = fills.current[n];
        const text = texts.current[n];
        if (fill) fill.style.width = `${(into / p) * 100}%`;
        if (text) text.textContent = `${(into / 1000).toFixed(1)} / ${p / 1000} s`;
      });
    };
    tick();
    const t = setInterval(tick, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (instances.length === 0) return null;
  return (
    <div className="ftx-cycle-bars" aria-label="Period timer">
      {instances.map((i, n) => (
        <div key={i.id} className={`ftx-cycle-bar src-${i.color_index % 8}`} title={`${i.source || i.id}: ${i.mode} period, UTC clock${i.transmitting ? ", transmitting now" : ""}`}>
          <span className="mono src-tag">{tag(i)}</span>
          <span className="mono mode">{i.mode}</span>
          <div className="track"><div className={`fill ${i.transmitting ? "tx" : ""}`} ref={(e) => { fills.current[n] = e; }} /></div>
          <span className="mono secs" ref={(e) => { texts.current[n] = e; }} />
          <span className="mono state">{i.transmitting ? "TX" : "RX"}</span>
        </div>
      ))}
    </div>
  );
}
