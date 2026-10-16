import { useEffect, useRef, useState } from "react";
import "../workspace.css";
import { canStayOnTop, closeWindow, getOnTop, listen, post, saveGeometry, setOnTop, type PopContext } from "../bus";
import { paneTitle, type PaneId } from "../workspace";
import SharedPane, { type PaneActions } from "./SharedPanes";
import WindowControls from "./WindowControls";
import { barMouseDown } from "../frame";

/** One pane in its own window, kept in step with the main window. */
export default function Popout({ pane }: { pane: PaneId }) {
  const [ctx, setCtx] = useState<PopContext | null>(null);
  const closing = useRef(false);
  const [onTop, setTop] = useState(() => canStayOnTop() && getOnTop(pane));
  const title = `${paneTitle(pane)} - QRZero`;

  useEffect(() => {
    document.title = title;
    if (getOnTop(pane) && canStayOnTop()) setOnTop(pane, true);
    const off = listen((m) => {
      if (m.t === "ctx") setCtx(m.ctx);
      if (m.t === "close-all") {
        closing.current = true;
        closeWindow();
      }
    });
    post({ t: "hello", pane });
    post({ t: "want-ctx" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resized = () => {
      clearTimeout(timer);
      timer = setTimeout(() => saveGeometry(pane), 400);
    };
    const leave = () => {
      saveGeometry(pane);
      if (!closing.current) post({ t: "bye", pane });
    };
    window.addEventListener("resize", resized);
    window.addEventListener("beforeunload", leave);
    // Window moves fire no event; check now and then.
    const moved = setInterval(() => saveGeometry(pane), 5000);
    return () => {
      off();
      clearInterval(moved);
      window.removeEventListener("resize", resized);
      window.removeEventListener("beforeunload", leave);
    };
  }, [pane]);

  const act: PaneActions = {
    onPick: (pick) => post({ t: "pick", pick }),
    onEdit: (qso) => post({ t: "edit", qso }),
    onCopy: (fields) => post({ t: "copy", fields }),
    onShowQsos: (filter) => post({ t: "show-qsos", filter }),
    onSlot: (slot) => post({ t: "slot", slot }),
    onSettings: (tab) => post({ t: "settings", tab }),
  };

  const dockBack = () => {
    saveGeometry(pane);
    post({ t: "bye", pane });
    closing.current = true;
    closeWindow();
  };

  return (
    <div className="popout">
      <div className="popout-bar" onMouseDown={barMouseDown}>
        <b>{paneTitle(pane)}</b>
        <span className="spacer" />
        {canStayOnTop() && (
          <button
            className={`tiny${onTop ? " on" : ""}`}
            aria-pressed={onTop}
            onClick={() => {
              setTop(!onTop);
              setOnTop(pane, !onTop);
            }}
            title="Keep this window above other windows"
          >
            Always on top
          </button>
        )}
        <button className="tiny" onClick={dockBack} title="Put this pane back in the main window">
          Dock back
        </button>
        <WindowControls onClose={dockBack} closeTitle="Close and put this pane back in the main window" />
      </div>
      <div className="popout-body">
        {ctx ? <SharedPane id={pane} ctx={ctx} act={act} /> : <p className="muted" style={{ padding: 16 }}>Waiting for the main QRZero window…</p>}
      </div>
    </div>
  );
}
