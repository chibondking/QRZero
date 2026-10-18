import { useEffect, useRef } from "react";
import type { FtxInstance } from "../types";

/** Length of a source's T/R period in milliseconds: the mode wins for FT4, as in the server. */
export function periodMs(mode: string, trPeriod: number): number {
  if (mode === "FT4") return 7500;
  if (trPeriod >= 1 && trPeriod <= 300) return trPeriod * 1000;
  return mode.startsWith("JT") || mode.startsWith("Q65") ? 60000 : 15000;
}

/**
 * Which slot (0 even, 1 odd) each source was last seen transmitting in. WSJT-X's UDP status has
 * no "Tx even/1st" flag, so it is learned from the first transmission; until then it is unknown.
 */
const txSlots = new Map<string, number>();

/**
 * A small bar for one source, inline on its control line: how far through its T/R period the UTC
 * clock is, and whether this period is an even or odd one (marked TX once that is known). One
 * timer edits the bar's style and text directly, so nothing re-renders while it runs.
 */
export default function FtxCycleTimer({ i }: { i: FtxInstance }) {
  const fill = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const live = useRef(i);
  live.current = i;
  const p = periodMs(i.mode, i.tr_period);

  useEffect(() => {
    let shown = "";
    const tick = () => {
      const now = Date.now();
      const into = now % p;
      const slot = Math.floor(now / p) % 2;
      const cur = live.current;
      // Past the first half second, so a status sent just after the boundary isn't counted in the old slot.
      if (cur.transmitting && into > 500) txSlots.set(cur.id, slot);
      const mine = txSlots.get(cur.id);
      if (fill.current) fill.current.style.width = `${(into / p) * 100}%`;
      const label = `${slot ? "O" : "E"}${mine === undefined ? "" : slot === mine ? " TX" : " RX"}`;
      if (text.current && label !== shown) {
        shown = label;
        text.current.textContent = label;
        text.current.classList.toggle("tx", mine === slot && mine !== undefined);
      }
    };
    tick();
    const t = setInterval(tick, 100);
    return () => clearInterval(t);
  }, [p]);

  return (
    <span className="ftx-timer" title={`${i.mode} period of ${p / 1000} s on the UTC clock. E is an even period, O an odd one; TX marks the slot this program transmits in, learned from its first transmission.`}>
      <span className="track"><span className="fill" ref={fill} /></span>
      <span className="mono slot" ref={text} />
    </span>
  );
}
