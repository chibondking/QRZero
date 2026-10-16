import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import { localGet } from "../prefs";
import { useAwardsOff } from "../awardsPref";
import { SLOT_GROUPS, slotGroup } from "../modes";
import type { AwardHint, AwardKind, LookupResult, SlotGrid, SlotPick } from "../types";
import type { EntryContext } from "./EntryPanel";
import { useLiveNote } from "../notes";
import "../notes.css";

interface StationProps {
  logId: number;
  result: LookupResult | null;
  entry: EntryContext;
  refreshKey?: number;
  /** The slot listed in Worked before, marked in the grid. */
  slot?: SlotPick | null;
  /** A worked slot was clicked (null: the picked one again). */
  onSlot?: (s: SlotPick | null) => void;
}

export default function LookupPanel({ logId, result, entry, refreshKey, slot, onSlot }: StationProps) {
  const note = useLiveNote(entry.fields.CALL ?? "", result?.note ?? null);
  const off = useAwardsOff();
  const hints = useAwardHints(logId, result, entry, refreshKey)?.filter((h) => !off.includes(h.award)) ?? null;
  const slots = useStationSlots(logId, result, entry, refreshKey);
  if (!result) {
    return (
      <section className="panel lookup">
        <div className="panel-title"><span>Station</span></div>
        <div className="panel-body">
          <p className="muted">Type a call and leave the field (Tab or Space) to see station details.</p>
        </div>
      </section>
    );
  }
  const s = result.station;
  const w = result.worked;
  const flags: { text: string; cls: string }[] = [];
  if (w.call_count === 0) flags.push({ text: "First QSO with this call", cls: "info" });
  else if (w.call_slots.some(([b, m]) => b === entry.band && m === entry.mode)) {
    flags.push({ text: `Already worked on ${entry.band} ${entry.mode}`, cls: "dupe" });
  }

  return (
    <section className="panel lookup">
      <div className="panel-title"><span>Station</span><span className="spacer" /><span className="small muted">{result.source}</span></div>
      <div className="panel-body">
      {s ? (
        <div className="station">
          <div className="station-call">{s.CALL}</div>
          <div>{s.NAME}</div>
          <div className="muted">{[s.QTH, s.STATE, s.COUNTRY].filter(Boolean).join(", ")}</div>
          <div className="muted">
            {[s.GRIDSQUARE && `Grid ${s.GRIDSQUARE}`, s.DXCC && `DXCC ${s.DXCC}`, s.CQZ && `CQ ${s.CQZ}`, s.ITUZ && `ITU ${s.ITUZ}`].filter(Boolean).join(" · ")}
          </div>
          {s.QSL_VIA && <div className="muted">QSL via {s.QSL_VIA}</div>}
          {s.QRZ_LOTW === "1" && <div className="muted small">Uses LoTW</div>}
        </div>
      ) : result.entity ? (
        <div className="station">
          <div>{result.entity.name}</div>
          <div className="muted">{[`CQ ${result.entity.cq}`, `ITU ${result.entity.itu}`, result.entity.cont, result.entity.dxcc && `DXCC ${result.entity.dxcc}`].filter(Boolean).join(" · ")}</div>
          {result.error && <div className="muted small">Lookup: {result.error}</div>}
        </div>
      ) : (
        <div className="muted">{result.error ? `Lookup: ${result.error}` : "No station details (lookup is off or the call wasn't found)."}</div>
      )}
      {note && <div className="lookup-note" title={note}>Note: {note.trim().replace(/\s*\n\s*/g, " / ")}</div>}
      <div className="flags">
        {flags.map((f) => (
          <span key={f.text} className={`flag ${f.cls}`}>{f.text}</span>
        ))}
      </div>
      {hints && hints.length > 0 && <AwardHints hints={hints} band={entry.band} mode={entry.mode} />}
      {slots && !off.includes("dxcc") && <DxccSlots {...slots} band={entry.band} mode={entry.mode} picked={slot} onSlot={onSlot} />}
      </div>
    </section>
  );
}

/**
 * What a QSO with the looked-up station, on the entry panel's band and mode,
 * would add to each award. Refetched (debounced) when the band, mode or the
 * station's state, zone or entity change.
 */
function useAwardHints(logId: number, result: LookupResult | null, entry: EntryContext, refreshKey?: number): AwardHint[] | null {
  const [hints, setHints] = useState<AwardHint[] | null>(null);
  const f = entry.fields;
  const st = result?.station ?? {};
  const call = result?.call ?? "";
  // What the entry form says wins (the user may have corrected it), then the lookup.
  const pick = (k: string) => (f[k] ?? st[k] ?? "").trim();
  const state = pick("STATE");
  const cqz = pick("CQZ") || (result?.entity?.cq ? String(result.entity.cq) : "");
  const dxcc = pick("DXCC") || (result?.entity?.dxcc ? String(result.entity.dxcc) : "");
  const grid = pick("GRIDSQUARE");
  const iota = pick("IOTA");
  const cnty = pick("CNTY");
  useEffect(() => {
    if (!call) {
      setHints(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      // Count confirmations the way the Awards pane is set to.
      const c = localGet("qrzero.awards", { lotw: true, paper: true, eqsl: false });
      api
        .awardHints(logId, { call, band: entry.band, mode: entry.mode, state, cqz, dxcc, grid, iota, cnty, lotw: c.lotw, paper: c.paper, eqsl: c.eqsl })
        .then((h) => live && setHints(h))
        .catch(() => live && setHints(null));
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [logId, call, entry.band, entry.mode, state, cqz, dxcc, grid, iota, cnty, refreshKey]);
  return call ? hints : null;
}

const AWARD_NAMES: Record<AwardKind, string> = { dxcc: "DXCC", was: "WAS", waz: "WAZ", wpx: "WPX", wac: "WAC", itu: "ITU", vucc: "VUCC", iota: "IOTA", counties: "County" };
const ROW_WORDS: Record<AwardKind, string> = { dxcc: "country", was: "state", waz: "zone", wpx: "prefix", wac: "continent", itu: "ITU zone", vucc: "grid", iota: "island group", counties: "county" };
const COLUMN_NAMES: Record<string, string> = { cw: "CW", phone: "Phone", digital: "Digital" };
const colName = (c: string) => COLUMN_NAMES[c] ?? c;

function rowLabel(h: AwardHint): string {
  if (h.award === "was") return `${h.key} ${h.name}`;
  if (h.award === "waz" || h.award === "itu") return h.key;
  return h.name;
}

/** One line per award this QSO would move: new slots in bold, unconfirmed ones after. */
function AwardHints({ hints, band, mode }: { hints: AwardHint[]; band: string; mode: string }) {
  const lines = hints
    .map((h) => {
      const [mixed, ...slots] = h.cells;
      if (!mixed) return null;
      if (mixed.status === "new") {
        return (
          <>
            <b className="ah-new">new {ROW_WORDS[h.award]}</b> {rowLabel(h)}
          </>
        );
      }
      const fresh = slots.filter((c) => c.status === "new");
      const unconfirmed = h.cells.filter((c) => c.status === "worked").map((c) => (c.column === "mixed" ? rowLabel(h) : colName(c.column)));
      if (!fresh.length && !unconfirmed.length) return null;
      return (
        <>
          {h.award !== "waz" && h.award !== "itu" && <span>{rowLabel(h)}: </span>}
          {(h.award === "waz" || h.award === "itu") && <span>zone {h.key}: </span>}
          {fresh.map((c, i) => (
            <Fragment key={c.column}>
              {i > 0 && ", "}
              <b className="ah-new">new {/^\d/.test(c.column) ? "band" : "mode"}</b> {colName(c.column)}
            </Fragment>
          ))}
          {unconfirmed.length > 0 && <span className="muted">{fresh.length ? "; " : ""}not confirmed: {unconfirmed.join(", ")}</span>}
        </>
      );
    })
    .map((line, i) => (line ? { award: hints[i].award, line } : null))
    .filter((x): x is { award: AwardKind; line: React.JSX.Element } => x !== null);

  const slot = [band, mode].filter(Boolean).join(" ");
  return (
    <div className="award-hints" aria-label="Award hints">
      <div className="ah-title">Awards{slot ? ` on ${slot}` : ""}</div>
      {lines.length === 0 ? (
        <div className="muted">Nothing new for awards, all confirmed.</div>
      ) : (
        lines.map(({ award, line }) => (
          <div className="ah-line" key={award}>
            <span className="ah-award">{AWARD_NAMES[award]}</span>
            <span className="ah-text">{line}</span>
          </div>
        ))
      )}
    </div>
  );
}

/** The DXCC slots grid on its own, small enough to keep in view in its own window. */
export function SlotsPane({ logId, result, entry, refreshKey, slot, onSlot }: StationProps) {
  const slots = useStationSlots(logId, result, entry, refreshKey);
  return (
    <section className="panel lookup slots-pane">
      <div className="panel-title"><span>DXCC slots</span>{result && <span className="small muted">{result.call}</span>}</div>
      <div className="panel-body">
        {slots ? (
          <DxccSlots {...slots} band={entry.band} mode={entry.mode} picked={slot} onSlot={onSlot} />
        ) : (
          <p className="muted">{result ? "No DXCC entity for this call." : "Type a call and leave the field to see its entity's slots."}</p>
        )}
      </div>
    </section>
  );
}

/** The slots of the looked-up station's entity: the entry form's DXCC wins, then the lookup's. */
function useStationSlots(logId: number, result: LookupResult | null, entry: EntryContext, refreshKey?: number) {
  const dxcc = String(entry.fields.DXCC ?? result?.station?.DXCC ?? result?.entity?.dxcc ?? "").trim();
  const grid = useDxccSlots(logId, result ? dxcc : "", refreshKey);
  if (!grid || !result) return null;
  return { grid, dxcc: Number(dxcc), name: result.entity?.name ?? result.station?.COUNTRY ?? `DXCC ${dxcc}` };
}

/** The band-by-mode slots of the entity, refetched when the entity or the log changes. */
function useDxccSlots(logId: number, dxcc: string, refreshKey?: number): SlotGrid | null {
  const [grid, setGrid] = useState<SlotGrid | null>(null);
  useEffect(() => {
    if (!/^\d+$/.test(dxcc)) {
      setGrid(null);
      return;
    }
    let live = true;
    const c = localGet("qrzero.awards", { lotw: true, paper: true, eqsl: false });
    api
      .dxccSlots(logId, { dxcc, lotw: c.lotw, paper: c.paper, eqsl: c.eqsl })
      .then((g) => live && setGrid(g))
      .catch(() => live && setGrid(null));
    return () => {
      live = false;
    };
  }, [logId, dxcc, refreshKey]);
  return grid;
}

interface SlotsProps {
  grid: SlotGrid;
  dxcc: number;
  name: string;
  band: string;
  mode: string;
  picked?: SlotPick | null;
  onSlot?: (s: SlotPick | null) => void;
}

/** DXCC slots for the entity: W = worked, C = confirmed, blank = still needed. A worked slot can be clicked to list its QSOs. */
function DxccSlots({ grid, dxcc, name, band, mode, picked, onSlot }: SlotsProps) {
  const g = slotGroup(mode);
  const mi = g ? SLOT_GROUPS.indexOf(g) : -1;
  const bi = grid.bands.indexOf(band);
  const mark = { new: "", worked: "W", confirmed: "C" } as const;
  const isPicked = (b: string, m: string) => picked?.dxcc === dxcc && picked.band === b && picked.group === m;
  return (
    <div className="dxcc-slots" aria-label="DXCC slots">
      <div className="ah-title">{name} slots (W worked, C confirmed, blank needed)</div>
      <table>
        <thead>
          <tr>
            <th />
            {grid.bands.map((b, i) => (
              <th key={b} className={i === bi ? "cur" : ""}>{b.replace("m", "")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SLOT_GROUPS.map((m, j) => (
            <tr key={m}>
              <th className={j === mi ? "cur" : ""}>{m}</th>
              {grid.bands.map((b, i) => {
                const st = grid.cells[i][j];
                const on = isPicked(b, m);
                const pick = onSlot && st !== "new" ? () => onSlot(on ? null : { dxcc, name, band: b, group: m }) : undefined;
                const cls = [st, i === bi && j === mi && "cur", on && "picked", pick && "pick"].filter(Boolean).join(" ");
                const tip = `${b} ${m}: ${st === "new" ? "needed" : st}${pick ? (on ? " (click to go back to the call's history)" : " (click to list every QSO in this slot)") : ""}`;
                return (
                  <td key={b} className={cls} title={tip} onClick={pick}>{mark[st]}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
