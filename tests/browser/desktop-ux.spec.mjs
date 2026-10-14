import { test, expect } from "../helpers/browser-fixtures.mjs";

const widths = [1024, 1280, 1366, 1440, 1920];
for (const width of widths) {
  test(`Talaan V2.5.0 desktop UX affordances remain stable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<!doctype html><html data-theme="light"><head><link rel="stylesheet" href="http://127.0.0.1:3000/app.css?v=2.5.0-talaan1"><link rel="stylesheet" href="http://127.0.0.1:3000/shell-ui.css?v=2.5.0-talaan1"><link rel="stylesheet" href="http://127.0.0.1:3000/desktop-ux.css?v=2.5.0-talaan1"></head><body><button id="busy" aria-busy="true">Saving…</button><details class="cloud-sync-technical-details" id="technical"><summary>Technical details</summary><code>network timeout</code></details><dialog class="modal app-dialog productivity-text-dialog" id="prompt"><form><div class="modal-body"><input class="input"></div></form></dialog></body></html>`, { waitUntil:"networkidle" });
    const metrics = await page.evaluate(() => ({
      busy:getComputedStyle(document.querySelector("#busy")).cursor,
      detailsFont:getComputedStyle(document.querySelector("#technical")).fontSize,
      promptWidth:document.querySelector("#prompt").getBoundingClientRect().width,
      overflow:document.documentElement.scrollWidth > innerWidth + 1
    }));
    expect(metrics.busy).toBe("progress");
    expect(parseFloat(metrics.detailsFont)).toBeGreaterThan(0);
    expect(metrics.promptWidth).toBeLessThanOrEqual(Math.min(440, width - 48) + 1);
    expect(metrics.overflow).toBe(false);
  });
}

test("Talaan V2.5.0 desktop UX stylesheet does not intentionally restyle phone controls", async ({ page }) => {
  await page.setViewportSize({ width:700, height:900 });
  await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="http://127.0.0.1:3000/desktop-ux.css?v=2.5.0-talaan1"></head><body><button id="busy" aria-busy="true">Saving</button><details class="cloud-sync-technical-details" id="technical"><summary>Technical details</summary><code>x</code></details></body></html>`, { waitUntil:"networkidle" });
  const metrics = await page.evaluate(() => ({ busy:getComputedStyle(document.querySelector("#busy")).cursor, detailsMargin:getComputedStyle(document.querySelector("#technical")).marginTop }));
  expect(metrics.busy).not.toBe("progress");
  expect(metrics.detailsMargin).toBe("0px");
});
