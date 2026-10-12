// Which callsign lookup services are set up, and whether entering a QSO by hand looks the call
// up by itself. Fetched once per window on first use and kept until the settings are saved, so
// the QSO panel never asks the server on every keystroke.
import { useSyncExternalStore } from "react";
import { api } from "./api";

export interface LookupSettings {
  /** Look the call up by itself while a QSO is typed into the panel. */
  onEntry: boolean;
  qrz: boolean;
  hamqth: boolean;
}

/** Until the settings arrive: lookups on, which is how QRZero behaves with nothing configured. */
const DEFAULTS: LookupSettings = { onEntry: true, qrz: false, hamqth: false };

let current: LookupSettings = DEFAULTS;
let loaded = false;
const subs = new Set<() => void>();

/** Settings were saved (in this window or another): read them again. */
export const LOOKUP_SETTINGS_CHANGED = "qrzero:lookup-settings";

export function refreshLookupSettings() {
  api
    .settings()
    .then((s) => {
      const next: LookupSettings = {
        onEntry: s.lookup_on_entry,
        qrz: s.qrz_enabled && !!s.qrz_username,
        hamqth: s.hamqth_enabled && !!s.hamqth_username,
      };
      loaded = true;
      if (next.onEntry === current.onEntry && next.qrz === current.qrz && next.hamqth === current.hamqth) return;
      current = next;
      subs.forEach((f) => f());
    })
    .catch(() => {});
}

window.addEventListener(LOOKUP_SETTINGS_CHANGED, refreshLookupSettings);

export function useLookupSettings(): LookupSettings {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      if (!loaded) refreshLookupSettings();
      return () => subs.delete(f);
    },
    () => current,
  );
}
