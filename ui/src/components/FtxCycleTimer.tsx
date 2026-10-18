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
 * A short text readout for one source, inline on its control line: whether this period is even
 * (E) or odd (O), the whole seconds left in it, and TX or RX once the slot is known. One timer
 * edits the text directly, only when it changes, so nothing re-renders while it runs.
 */
export default function FtxCycleTimer({ i }: { i: FtxInstance }) {
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
      const label = `${slot ? "O" : "E"} ${Math.ceil((p - into) / 1000)}${mine === undefined ? "" : slot === mine ? " TX" : " RX"}`;
      if (text.current && label !== shown) {
        shown = label;
        text.current.textContent = label;
        text.current.classList.toggle("tx", mine === slot && mine !== undefined);
      }
    };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [p]);

  return (
    <span
      className="mono ftx-timer"
      ref={text}
      title={`${i.mode} period of ${p / 1000} s on the UTC clock: E is an even period, O an odd one, then the seconds left. TX or RX marks this slot once the program has transmitted; WSJT-X doesn't report its slot, so it is learned from the first transmission.`}
    />
  );
}
