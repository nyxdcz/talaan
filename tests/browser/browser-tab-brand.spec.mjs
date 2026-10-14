import { expect, test } from "../helpers/browser-fixtures.mjs";

const BASE = "http://127.0.0.1:3000";

test("browser tab keeps the Talaan logo and omits the version from the title", async ({ page }) => {
  await page.goto(`${BASE}/?page=dashboard`, { waitUntil:"domcontentloaded" });

  await expect.poll(() => page.title()).toBe("Talaan");

  const favicon = page.locator('link[rel="icon"][sizes="32x32"]');
  await expect(favicon).toHaveAttribute("href", /favicon-32-logo2\.png$/);
  expect(await page.title()).not.toMatch(/V?\d+\.\d+\.\d+/i);
});
