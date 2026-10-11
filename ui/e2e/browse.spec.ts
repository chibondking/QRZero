import { expect, test } from "@playwright/test";

test("clicking a QSO in the log shows that station in Worked before and Station", async ({ page }) => {
  await page.goto("/?token=e2e");
  const wizard = page.getByRole("dialog", { name: "QRZero setup" });
  await wizard.getByLabel("Callsign", { exact: true }).fill("n0call");
  await wizard.getByRole("button", { name: "Next" }).click();
  await wizard.getByRole("button", { name: "Skip" }).click();
  await wizard.getByLabel("Grid").fill("EN34");
  await wizard.getByRole("button", { name: "Next" }).click();
  await wizard.getByRole("button", { name: "Next" }).click();
  await wizard.getByRole("button", { name: "Next" }).click();
  await wizard.getByRole("button", { name: "Skip" }).click();
  await wizard.getByRole("button", { name: "Skip" }).click();
  await wizard.getByRole("button", { name: "Start logging" }).click();
  await expect(page.getByText("N0CALL · Home")).toBeVisible();

  const call = page.getByTestId("call");
  for (const c of ["w1aw", "k1abc"]) {
    await call.fill(c);
    await call.press("Space");
    await page.locator("#rst-sent").press("Enter");
    await expect(page.getByText(`Logged ${c.toUpperCase()} on`)).toBeVisible();
  }
  await expect(call).toHaveValue("");

  await page.locator(".grid-row", { hasText: "W1AW" }).click();
  await expect(page.locator(".panel", { hasText: "Worked before" }).first()).toContainText("W1AW");
  await expect(page.locator(".panel", { hasText: "Worked before" }).first()).not.toContainText("K1ABC");
  await expect(call).toHaveValue(""); // the entry is untouched
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/log-click.png` });

  // Typing a call in New QSO takes the panes back.
  await call.fill("k1abc");
  await expect(page.locator(".panel", { hasText: "Worked before" }).first()).toContainText("K1ABC");
});
