/**
 * The buttons on the New QSO panel's bottom bar that can be hidden, so the panel can be made
 * as short as it needs to be on a crowded screen.
 *
 * Ids are scoped by what provides the button (`qrz.`…), so a second callsign provider adds its
 * own entries here and gets its own tick boxes with no other change. Log and Clear are not
 * listed: the panel is no use without them.
 */
export interface PanelButton {
  id: string;
  /** The button's own wording, as the bottom bar shows it. */
  name: string;
  /** What hiding it costs, for the tick box's note. */
  note: string;
}

export const PANEL_BUTTONS: PanelButton[] = [
  { id: "qrz.fill", name: "Fill from QRZ", note: "Leaving the call box still looks the call up." },
  { id: "qrz.page", name: "View on QRZ.com", note: "The QSO editor keeps this button." },
];
