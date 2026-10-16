import { useCallback, useRef } from "react";
import { post, type PopContext } from "../bus";
import { useRadios } from "../live";
import EntryPanel, { type EntryContext } from "./EntryPanel";
import type { LookupResult } from "../types";

/** The New QSO pane in its own window: the main window owns the data, this window owns the form. */
export default function EntryHost({ ctx }: { ctx: PopContext }) {
  const radios = useRadios();
  const h = ctx.entryHost;
  // The main window resends everything on each change; keep unchanged parts the same object so the form isn't disturbed.
  const stable = <T,>(v: T): T => {
    const key = JSON.stringify(v);
    const ref = useRef<{ key: string; v: T } | undefined>(undefined);
    if (!ref.current || ref.current.key !== key) ref.current = { key, v };
    return ref.current.v;
  };
  const location = stable(h.location);
  const layout = stable(h.layout);
  const modeLayouts = stable(h.modeLayouts);
  const equipment = stable(h.equipment);
  // Spots picked before this window opened were already used (or not); only react to new ones.
  const first = useRef({ prefill: h.prefill?.nonce ?? 0, copy: h.copy?.nonce ?? 0 });
  const prefill = h.prefill && h.prefill.nonce !== first.current.prefill ? h.prefill : null;
  const copy = h.copy && h.copy.nonce !== first.current.copy ? h.copy : null;
  const onLogged = useCallback(() => post({ t: "logged" }), []);
  const onLookup = useCallback((lookup: LookupResult | null) => post({ t: "lookup", lookup }), []);
  const onContext = useCallback((entry: EntryContext) => post({ t: "entry", entry }), []);
  const onRadio = useCallback((key: string) => post({ t: "radio", key }), []);

  if (!ctx.stationCall) {
    return (
      <section className="panel entry">
        <div className="panel-body">
          <p>QRZero needs your callsign and home location before you can log.</p>
          <button className="primary" onClick={() => post({ t: "setup" })}>Start setup</button>
        </div>
      </section>
    );
  }
  return (
    <EntryPanel
      key={`${ctx.logId}-${location?.id ?? 0}`}
      logId={ctx.logId}
      stationCall={ctx.stationCall}
      location={location}
      layout={layout}
      modeLayouts={modeLayouts}
      equipment={equipment}
      onLogged={onLogged}
      onLookup={onLookup}
      onContext={onContext}
      radios={radios}
      radioKey={ctx.radioKey}
      onRadio={onRadio}
      prefill={prefill}
      copy={copy}
    />
  );
}
