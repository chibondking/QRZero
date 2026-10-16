import { shell, useFrame } from "../frame";

/** Minimize, maximize and close for a frameless window. Nothing in a browser, with the system frame, or on macOS (which keeps its own). */
export default function WindowControls({ onClose, closeTitle = "Close", closeLabel = closeTitle }: { onClose: () => void; closeTitle?: string; closeLabel?: string }) {
  const frame = useFrame();
  if (!frame.on || frame.os === "macos") return null;
  return (
    <div className="caption-buttons">
      <button className="caption" onClick={() => shell("min")} title="Minimize" aria-label="Minimize">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" /></svg>
      </button>
      <button className="caption" onClick={() => shell("max")} title={frame.max ? "Restore" : "Maximize"} aria-label={frame.max ? "Restore" : "Maximize"}>
        {frame.max ? (
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /></svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M.5 .5h9v9h-9z" /></svg>
        )}
      </button>
      <button className="caption close" onClick={onClose} title={closeTitle} aria-label={closeLabel}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg>
      </button>
    </div>
  );
}
