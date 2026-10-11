import { expect, test, type Page } from "@playwright/test";

const now = Math.floor(Date.now() / 1000);
const spot = (seq: number, call: string, khz: number, mode: string, country: string, comment: string) => ({
  seq, received: now - seq * 20, time: "0015", spotter: "K1TTT", call, freq_hz: khz * 1000, band: "20m", mode, comment,
  entity: { name: country, prefix: "", cont: "EU", dxcc: seq, lat: 0, lon: 0 }, needed: null,
});
const snapshot = {
  config: { nodes: [], auto_connect: false, spot_max_minutes: 10, spot_comment: "" },
  state: "", connected: false, lines: [],
  spots: [spot(1, "DL1ABC", 14025, "CW", "Germany", "up 1"), spot(2, "JA1XYZ", 14195, "SSB", "Japan", "599 here")],
};

// A fresh data folder opens the setup wizard on top of everything.
async function closeWizard(page: Page) {
  const wizard = page.getByRole("dialog", { name: "QRZero setup" });
  if (await wizard.waitFor({ timeout: 3000 }).then(() => true, () => false)) await wizard.getByRole("button", { name: "Close", exact: true }).click();
}

async function open(page: Page) {
  await page.route("**/api/cluster", (r) => (r.request().method() === "GET" ? r.fulfill({ json: snapshot }) : r.continue()));
  await page.goto("/?token=e2e");
  await closeWizard(page);
  await page.getByRole("tab", { name: "Cluster" }).click();
}

const heads = (page: Page) => page.locator(".spot-row.head .col-head");

test("cluster columns can be moved and resized, and are remembered", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("tab", { name: "Cluster" })).toBeVisible();
  await expect(heads(page).nth(0)).toHaveText("UTC", { timeout: 5000 });
  const call = heads(page).nth(2);
  const utc = heads(page).nth(0);
  const from = (await call.boundingBox())!;
  const to = (await utc.boundingBox())!;
  // Drag Call onto the left half of UTC.
  await page.mouse.move(from.x + 20, from.y + 8);
  await page.mouse.down();
  await page.mouse.move(to.x + 6, to.y + 8, { steps: 8 });
  await page.mouse.up();
  await expect(heads(page).nth(0)).toHaveText("Call");
  await expect(page.locator(".spot-row:not(.head)").first().locator("span").first()).toHaveText("JA1XYZ");

  // Drag the right edge of Freq wider.
  const freq = heads(page).nth(2);
  await expect(freq).toHaveText("Freq");
  const before = (await freq.boundingBox())!.width;
  const edge = freq.locator(".col-resize");
  const e = (await edge.boundingBox())!;
  await page.mouse.move(e.x + 3, e.y + 8);
  await page.mouse.down();
  await page.mouse.move(e.x + 63, e.y + 8, { steps: 6 });
  await page.mouse.up();
  expect((await freq.boundingBox())!.width).toBeGreaterThan(before + 40);

  // Still there after a reload; Reset columns puts them back.
  await page.reload();
  await closeWizard(page);
  await page.getByRole("tab", { name: "Cluster" }).click();
  await expect(heads(page).nth(0)).toHaveText("Call");
  await page.getByRole("button", { name: "Reset columns" }).click();
  await expect(heads(page).nth(0)).toHaveText("UTC");
  await expect(page.getByRole("button", { name: "Reset columns" })).toHaveCount(0);
});
