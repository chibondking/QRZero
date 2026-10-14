import { useState } from "react";
import { api } from "../api";
import Modal from "./Modal";

export interface SpotRequest { call: string; freqKhz: number; comment: string; qsoUtc: number }

/** Shows exactly what will go to the cluster and sends it when the operator confirms, then closes. */
export default function SpotDialog({ req, onClose }: { req: SpotRequest; onClose: () => void }) {
  const [freq, setFreq] = useState(String(Math.round(req.freqKhz * 10) / 10));
  const [comment, setComment] = useState(req.comment);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const khz = Number(freq);
  const send = async () => {
    setBusy(true);
    try {
      await api.clusterSpot({ call: req.call, freq_khz: khz, comment: comment.trim(), qso_utc: req.qsoUtc });
      onClose();
    } catch (e) {
      setMsg((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Spot to the DX cluster" onClose={onClose}>
      <p>Send a spot of <b>{req.call}</b> to everyone on the cluster?</p>
      <div className="row">
        <label className="f w-m"><span>Freq kHz</span><input value={freq} onChange={(e) => setFreq(e.target.value)} inputMode="decimal" disabled={busy} /></label>
        <label className="f grow"><span>Comment</span><input value={comment} maxLength={30} onChange={(e) => setComment(e.target.value)} disabled={busy} autoFocus /></label>
      </div>
      <p className="muted small">The cluster will get: <code>DX {Number.isFinite(khz) ? khz.toFixed(1) : "?"} {req.call} {comment.trim()}</code></p>
      {msg && <p className="err">{msg}</p>}
      <div className="buttons">
        <button className="primary" onClick={() => void send()} disabled={busy || !(khz > 0)}>Send spot</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
