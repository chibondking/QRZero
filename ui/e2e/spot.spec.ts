import { expect, test, type Page, type Route } from "@playwright/test";
import { adifToUnix, expandSpotComment, qsoEnd, spotBlocked } from "../src/spotCheck";

const on = { connected: true, maxMinutes: 10, comment: "" };
const now = Date.UTC(2026, 9, 9, 23, 0, 0) / 1000;

test("a QSO can only be spotted within the time limit", () => {
  expect(spotBlocked(on, "JA1XYZ", now - 9 * 60, now)).toBeNull();
  expect(spotBlocked(on, "JA1XYZ", now - 11 * 60, now)).toMatch(/Too old/);
  expect(spotBlocked({ ...on, maxMinutes: 30 }, "JA1XYZ", now - 11 * 60, now)).toBeNull();
});

test("spotting is refused with no cluster, no call or no valid time", () => {
  expect(spotBlocked({ ...on, connected: false }, "JA1XYZ", now, now)).toMatch(/Not connected/);
  expect(spotBlocked(on, "", now, now)).toMatch(/callsign/);
  expect(spotBlocked(on, "JA1XYZ", null, now)).toMatch(/date and time/);
});

test("the QSO time is read from its off time, else its start", () => {
  expect(adifToUnix("20261009", "2250")).toBe(Date.UTC(2026, 9, 9, 22, 50, 0) / 1000);
  expect(qsoEnd({ QSO_DATE: "20261009", TIME_ON: "225000", TIME_OFF: "225230" })).toBe(Date.UTC(2026, 9, 9, 22, 52, 30) / 1000);
  expect(qsoEnd({ QSO_DATE: "20261009", TIME_ON: "2250" })).toBe(Date.UTC(2026, 9, 9, 22, 50, 0) / 1000);
  expect(qsoEnd({})).toBeNull();
});

test("spot comment placeholders are filled from the QSO", () => {
  const q = { CALL: "JA1XYZ", MODE: "CW", RST_RCVD: "579", MY_GRIDSQUARE: "EN34" };
  expect(expandSpotComment("spotted with QRZero", q)).toBe("spotted with QRZero");
  expect(expandSpotComment("{mode} {rst_rcvd} via QRZero", q)).toBe("CW 579 via QRZero");
  expect(expandSpotComment("{name} {my_grid}  {bogus}!", q)).toBe("EN34 !");
  expect(expandSpotComment("{call} {mode} {rst_rcvd} {my_grid} spotted with QRZero", q)).toHaveLength(30);
});

async function openSpotBox(page: Page, reply: (r: Route) => Promise<void>) {
  const cluster = { config: { nodes: [], auto_connect: false, spot_max_minutes: 10, spot_comment: "" }, state: "", connected: true, lines: [], spots: [] };
  await page.route("**/api/cluster", (r) => (r.request().method() === "GET" ? r.fulfill({ json: cluster }) : r.continue()));
  await page.route("**/api/cluster/spot", reply);
  await page.goto("/?token=e2e");
  const closeWizard = async () => {
    const wizard = page.getByRole("dialog", { name: "QRZero setup" });
    if (await wizard.waitFor({ timeout: 3000 }).then(() => true, () => false)) await wizard.getByRole("button", { name: "Close", exact: true }).click();
  };
  await closeWizard();
  const headers = { "x-qrzero-token": "e2e" };
  const lid = (await (await page.request.get("/api/logs", { headers })).json())[0].id;
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const fields = { CALL: "JA1XYZ", QSO_DATE: `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`, TIME_ON: `${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`, BAND: "20m", MODE: "CW", FREQ: "14.025" };
  await page.request.post(`/api/logs/${lid}/qsos`, { headers, data: { location_id: null, fields } });
  await page.reload();
  await closeWizard();
  await page.getByTestId("search").fill("JA1XYZ");
  await page.locator(".grid-row", { hasText: "JA1XYZ" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Spot JA1XYZ to the cluster/ }).click();
  await expect(page.getByRole("dialog", { name: "Spot to the DX cluster" })).toBeVisible();
}

test("the spot box closes once the spot is sent", async ({ page }) => {
  await openSpotBox(page, (r) => r.fulfill({ json: { line: "DX 14025.0 JA1XYZ" } }));
  await page.getByRole("button", { name: "Send spot" }).click();
  await expect(page.getByRole("dialog", { name: "Spot to the DX cluster" })).toBeHidden();
});

test("the spot box stays open with the reason when sending fails", async ({ page }) => {
  await openSpotBox(page, (r) => r.fulfill({ status: 502, json: { error: "cluster refused" } }));
  await page.getByRole("button", { name: "Send spot" }).click();
  await expect(page.getByRole("dialog", { name: "Spot to the DX cluster" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send spot" })).toBeEnabled();
});
