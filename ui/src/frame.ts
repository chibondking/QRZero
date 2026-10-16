// Frameless windows in the desktop app: QRZero draws the title bar, and asks the shell to move,
// minimize, maximize or close the window by setting the page title (no IPC; the same UI runs in a browser).

import { useEffect, useState } from "react";
import type React from "react";

interface FrameInfo { supported: boolean; on: boolean }

const info = (): FrameInfo => (window as unknown as { __qrzeroFrame?: FrameInfo }).__qrzeroFrame ?? { supported: false, on: false };

let shown = "";
let seq = 0;
let restore: ReturnType<typeof setTimeout> | undefined;

/** Sends the desktop shell a command. Each one gets its own number, so a repeat still changes the title. */
export function shell(cmd: string) {
  if (!document.title.startsWith("qrzero:")) shown = document.title;
  document.title = `qrzero:${cmd}:${++seq}`;
  clearTimeout(restore);
  restore = setTimeout(() => {
    if (document.title.startsWith("qrzero:")) document.title = shown;
  }, 100);
}

/** Whether this window draws its own title bar, whether the user can choose it, and whether the window is maximized. */
export function useFrame() {
  const [state, setState] = useState(() => ({ ...info(), max: false }));
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ on: boolean; max: boolean }>).detail;
      setState({ supported: info().supported, on: d.on, max: d.max });
    };
    window.addEventListener("qrzero-frame", h);
    return () => window.removeEventListener("qrzero-frame", h);
  }, []);
  return state;
}

/** Switches every window between QRZero's title bar and the system frame. */
export const setFrameless = (on: boolean) => shell(`frame:${on ? 1 : 0}`);

/** On a title bar: drag moves the window, double-click maximizes or restores. Controls in the bar keep their clicks. */
export function barMouseDown(e: React.MouseEvent) {
  if (e.button !== 0 || !info().on) return;
  if ((e.target as HTMLElement).closest("button, input, select, textarea, a, label, [role=menu], .vfo-bar, .notice")) return;
  e.preventDefault();
  shell(e.detail === 2 ? "max" : "drag");
}
