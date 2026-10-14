import { test, expect } from "../helpers/browser-fixtures.mjs";

test.use({ serviceWorkers:"block" });

test("website Version history shows only the current Talaan V2.5.0 release", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/?page=settings", { waitUntil:"networkidle" });

  const card = page.locator(".settings-version-history-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator("h3")).toHaveText("Version history");
  await expect(card.locator(".card-header p")).toHaveText("Latest release details");

  const entries = card.locator(".version-history-entry");
  await expect(entries).toHaveCount(1);
  await expect(entries.locator("summary strong")).toHaveText("V2.5.0 · Talaan");

  const visibleText = await card.innerText();
  expect(visibleText.match(/V\d+\.\d+\.\d+/g) || []).toEqual(["V2.5.0"]);
  expect(visibleText).toContain("Current production release under the Talaan product name.");
  expect(visibleText).not.toContain("V2.0.0");
});
