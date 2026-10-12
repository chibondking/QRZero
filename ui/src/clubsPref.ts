import { useSyncExternalStore } from "react";
import { localGet, localSet, onLocalPrefsLoaded } from "./prefs";

/** One club the operator belongs to and their own membership number in it. */
export interface Club {
  id: string;
  name: string;
  number: string;
}

const KEY = "qrzero.clubs";
const SEED = ["CWops", "SKCC", "NAQCC", "FISTS", "10-10"];
const listeners = new Set<() => void>();

const seed = (): Club[] => SEED.map((name) => ({ id: name, name, number: "" }));
const read = (): Club[] => {
  const v = localGet<{ list?: Club[] }>(KEY, {});
  return Array.isArray(v.list) ? v.list : seed();
};
let clubs: Club[] = read();
// The saved copy from the database arrives after this module loads.
onLocalPrefsLoaded(() => {
  clubs = read();
  listeners.forEach((l) => l());
});

export function setClubs(list: Club[]) {
  clubs = list;
  localSet(KEY, { list });
  listeners.forEach((l) => l());
}

export const newClubId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const defaultClubs = seed;

/** The clubs list, shared by every window and pane. */
export function useClubs(): readonly Club[] {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    () => clubs,
  );
}

// Another window changed them: its write lands in shared storage.
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  clubs = read();
  listeners.forEach((l) => l());
});
