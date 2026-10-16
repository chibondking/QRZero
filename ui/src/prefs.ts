import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/**
 * A preference stored in the log database (so it survives reinstalls).
 * Returns [value, save, loaded].
 */
export function usePref<T>(key: string, fallback: T): [T, (v: T) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    api
      .getPref<T>(key)
      .then((v) => live && v !== null && setValue(v))
      .catch(() => {})
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [key]);
  const save = useCallback(
    (v: T) => {
      setValue(v);
      api.setPref(key, v).catch(() => {});
    },
    [key],
  );
  return [value, save, loaded];
}

/**
 * Window and pane settings (layouts, columns, filters, last band...). They live in localStorage
 * for quick reads, and are copied to the database too: the desktop app's address changes every
 * start, and with it the browser storage, so the database copy is what survives.
 */
export function localGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}

export function localSet(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch { /* storage unavailable */ }
  saveSoon();
}

const STORE = "ui.local";
const PREV = "ui.local.prev";
const PREFIX = "qrzero.";
let timer: ReturnType<typeof setTimeout> | null = null;
/** The database copy as it was loaded; null until it has loaded. Nothing is written back before then. */
let stored: Record<string, unknown> | null = null;

/** Every window setting in this browser's storage. Windows of one app share it, so this is the latest of all of them. */
function allLocal(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      try {
        out[k] = JSON.parse(localStorage.getItem(k) ?? "null");
      } catch { /* not ours */ }
    }
  } catch { /* storage unavailable */ }
  return out;
}

/** What gets saved: this browser's settings over the stored copy, so a setting is never dropped. */
function toSave(): Record<string, unknown> {
  return { ...stored, ...allLocal() };
}

function saveSoon() {
  if (!stored) return; // the database copy hasn't loaded: saving now would replace it with defaults
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const all = toSave();
    stored = all;
    api.setPref(STORE, all).catch(() => {});
  }, 400);
}

/**
 * Before the first render: fills this browser's storage from the database copy. Anything already
 * in this browser's storage is at least as new (it is written first), so it wins and is saved up.
 * If the database copy can't be read in time the window starts without it, and keeps trying in
 * the background; until it loads nothing is written back, so a slow start never wipes it.
 */
export async function loadLocalPrefs(): Promise<void> {
  try {
    if (!(await fill(3000))) retryLater();
  } finally {
    afterLoad.forEach((f) => f());
  }
}

/** Settings read when their module loads (before the database copy is in) must read again once it is. */
const afterLoad: (() => void)[] = [];
export function onLocalPrefsLoaded(f: () => void) {
  afterLoad.push(f);
}

function retryLater(delay = 2000) {
  setTimeout(async () => {
    if (await fill(10000)) afterLoad.forEach((f) => f());
    else retryLater(Math.min(delay * 2, 30000));
  }, delay);
}

/** True once the database copy has been read and merged. */
async function fill(wait: number): Promise<boolean> {
  let saved: Record<string, unknown> | null;
  try {
    saved = await Promise.race([
      api.getPref<Record<string, unknown>>(STORE),
      new Promise<null>((_, no) => setTimeout(() => no(new Error("timeout")), wait)),
    ]);
  } catch {
    return false;
  }
  const local = allLocal();
  try {
    for (const [k, v] of Object.entries(saved ?? {})) if (!(k in local)) localStorage.setItem(k, JSON.stringify(v));
  } catch {
    return false;
  }
  stored = saved ?? {};
  // The last copy that loaded, kept apart in case a later save goes wrong.
  if (saved && Object.keys(saved).length) api.setPref(PREV, saved).catch(() => {});
  const differs = Object.entries(local).some(([k, v]) => JSON.stringify(stored![k]) !== JSON.stringify(v));
  if (differs) saveSoon();
  return true;
}

// Don't lose a change made just before the window closes.
window.addEventListener("pagehide", () => {
  if (!timer || !stored) return;
  clearTimeout(timer);
  timer = null;
  api.setPref(STORE, toSave(), true).catch(() => {});
});
