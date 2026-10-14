import { test, expect } from "../helpers/browser-fixtures.mjs";

test("More tools appearance is one compact Auto, Light, or Dark label", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html", { waitUntil:"domcontentloaded" });

  const themeButton = page.locator("#themeToggleButton");
  const legacyHeading = themeButton.locator(":scope > span:last-child > strong");
  const label = page.locator("#themeToggleText");

  await expect(legacyHeading).toBeHidden();

  for (const [preference, expected] of [["system", "Auto"], ["light", "Light"], ["dark", "Dark"]]) {
    await page.evaluate(value => { document.documentElement.dataset.themePreference = value; }, preference);
    await expect.poll(async () => label.evaluate(node => getComputedStyle(node, "::after").content)).toBe(`"${expected}"`);
  }
});
