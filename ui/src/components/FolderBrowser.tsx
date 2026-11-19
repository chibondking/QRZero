import { useEffect, useState } from "react";
import { api } from "../api";
import Modal from "./Modal";

/** Plain folder chooser: lists the folders under a path on the machine running QRZero. */
export default function FolderBrowser({ start, onPick, onClose }: { start: string; onPick: (dir: string) => void; onClose: () => void }) {
  const [here, setHere] = useState<{ path: string; parent: string | null; dirs: string[] } | null>(null);
  const [error, setError] = useState("");

  const open = (path: string) => {
    api.listDirs(path).then((r) => { setHere(r); setError(""); }).catch((e) => setError((e as Error).message));
  };
  useEffect(() => {
    api.listDirs(start).catch(() => api.listDirs("")).then((r) => setHere(r)).catch((e) => setError((e as Error).message));
  }, [start]);

  const join = (name: string) => (here!.path.endsWith("/") || here!.path.endsWith("\\") ? here!.path + name : here!.path + (here!.path.includes("\\") ? "\\" : "/") + name);

  return (
    <Modal title="Choose a folder" onClose={onClose}>
      {here && <p className="muted">{here.path}</p>}
      <div className="folder-list" style={{ height: 260, overflow: "auto", border: "1px solid var(--border, #999)" }}>
        {here?.parent && <div><button className="ghost" onClick={() => open(here.parent!)}>.. (up one level)</button></div>}
        {here?.dirs.map((d) => <div key={d}><button className="ghost" onDoubleClick={() => open(join(d))} onClick={() => open(join(d))}>{d}</button></div>)}
        {here && !here.dirs.length && <p className="muted">No subfolders.</p>}
      </div>
      {error && <p className="err">{error}</p>}
      <div className="buttons">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!here} onClick={() => here && onPick(here.path)}>Use this folder</button>
      </div>
    </Modal>
  );
}
