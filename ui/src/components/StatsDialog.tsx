import { useEffect, useState } from "react";
import { api } from "../api";
import type { LogStats } from "../types";
import Modal from "./Modal";

/** A plain-text summary of the log, counted when the window opens. */
export default function StatsDialog({ logId, onClose }: { logId: number; onClose: () => void }) {
  const [stats, setStats] = useState<LogStats | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    api.stats(logId).then((r) => live && setStats(r)).catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [logId]);

  const copy = () =>
    stats &&
    navigator.clipboard.writeText(stats.text).then(
      () => setCopied(true),
      () => {},
    );

  return (
    <Modal title="Statistics" onClose={onClose}>
      {error && <p className="error">{error}</p>}
      {!stats && !error && <p className="muted">Counting…</p>}
      {stats && <pre className="stats-text" aria-label="Statistics summary">{stats.text}</pre>}
      <div className="stats-bar">
        <button onClick={copy} disabled={!stats}>{copied ? "Copied" : "Copy"}</button>
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
