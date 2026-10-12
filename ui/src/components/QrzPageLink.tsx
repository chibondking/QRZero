/** The station's public page on QRZ.com. */
export const qrzPageUrl = (call: string) => `https://www.qrz.com/db/${encodeURI(call.trim().toUpperCase())}`;

/** The station's public page on HamQTH. */
export const hamqthPageUrl = (call: string) => `https://www.hamqth.com/${encodeURI(call.trim().toUpperCase())}`;

/**
 * A plain link styled as a button. In the desktop app the window handler sends it to the
 * system browser; in a browser it just opens a new tab.
 */
export default function QrzPageLink({ call, site = "qrz" }: { call: string; site?: "qrz" | "hamqth" }) {
  const c = call.trim();
  const name = site === "hamqth" ? "HamQTH" : "QRZ.com";
  const url = site === "hamqth" ? hamqthPageUrl : qrzPageUrl;
  return (
    <a
      className={`button-link${c.length < 3 ? " disabled" : ""}`}
      href={c.length < 3 ? undefined : url(c)}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={c.length < 3}
      title={`Open this station's page on ${name} in your web browser`}
    >View on {name}</a>
  );
}
