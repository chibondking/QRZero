import { useEffect, useState } from "react";
import { api } from "../api";
import type { Location, QsoFilter, StationCallsign } from "../types";
import { localGet, localSet } from "../prefs";
import FolderBrowser from "./FolderBrowser";
import Modal from "./Modal";
import ScopePicker from "./ScopePicker";

interface Props {
  logId: number;
  logName: string;
  selection: Set<number>;
  gridFilter: QsoFilter;
  callsigns: StationCallsign[];
  locations: Location[];
  onClose: () => void;
}

export default function ExportDialog({ logId, logName, selection, gridFilter, callsigns, locations, onClose }: Props) {
  const [filter, setFilter] = useState<QsoFilter>({});
  const [profile, setProfile] = useState<"standard" | "full">("standard");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [dir, setDir] = useState<string>(() => localGet<{ dir: string }>("qrzero.export", { dir: "" }).dir);
  const [name, setName] = useState("");
  const [browse, setBrowse] = useState(false);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    api.search(logId, {}, 0, 0).then((r) => setTotal(r.total)).catch(() => {});
    if (!dir) api.listDirs("").then((r) => setDir(r.default_dir)).catch(() => {});
  }, [logId]);

  useEffect(() => {
    let live = true;
    setCount(null);
    const t = setTimeout(() => {
      api.search(logId, filter, 0, 0).then((r) => live && setCount(r.total)).catch((e) => live && setError(e.message));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [logId, filter]);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const defaultName = `${logName.replace(/[^\w-]+/g, "_")}-${stamp}${profile === "full" ? "-full" : ""}.adi`;

  const run = async () => {
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const r = await api.exportToFile(logId, filter, profile, dir, name.trim() || defaultName);
      localSet("qrzero.export", { dir });
      setSaved(r.path);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Export ADIF" onClose={onClose} wide>
      <ScopePicker selection={selection} gridFilter={gridFilter} callsigns={callsigns} locations={locations} onFilter={setFilter} allowAll logTotal={total} />

      <fieldset>
        <legend>Fields</legend>
        <label className="check"><input type="radio" checked={profile === "standard"} onChange={() => setProfile("standard")} /> Standard: the ADIF fields other loggers and QSL services use</label>
        <label className="check"><input type="radio" checked={profile === "full"} onChange={() => setProfile("full")} /> Full: every stored field, including other programs' APP_ fields</label>
      </fieldset>

      <fieldset>
        <legend>Save to</legend>
        <div className="row">
          <label className="f"><span>Folder</span><input value={dir} onChange={(e) => setDir(e.target.value)} /></label>
          <button onClick={() => setBrowse(true)}>Browse…</button>
        </div>
        <label className="f"><span>File name</span><input value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} /></label>
      </fieldset>

      {saved && <p>Saved {count?.toLocaleString()} QSOs to {saved}</p>}
      {error && <p className="err">{error}</p>}
      <div className="buttons">
        <span className="muted">{count === null ? "Counting…" : `${count.toLocaleString()} QSOs will be exported`}</span>
        <button onClick={onClose}>{saved ? "Close" : "Cancel"}</button>
        <button className="primary" disabled={busy || !count || !dir.trim()} onClick={run}>{busy ? "Exporting…" : "Export"}</button>
      </div>
    {browse && <FolderBrowser start={dir} onClose={() => setBrowse(false)} onPick={(d) => { setDir(d); setBrowse(false); }} />}
    </Modal>
  );
}
