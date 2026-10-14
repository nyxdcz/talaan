import { expect, test } from "../helpers/browser-fixtures.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeScript = path.resolve(here, "../../assets/js/ui/expense-compact.js");

test("Budget and Expenses compact cards stay readable in dark mode", async ({ page }) => {
  await page.setViewportSize({ width:1440, height:900 });
  await page.setContent(`<!doctype html>
    <html data-theme="dark">
      <body>
        <section id="money">
          <article class="period-card" data-collapse-key="early">
            <header class="period-header">
              <div><h3>First half of the month</h3><p>Unpaid expenses due on days 1–15</p></div>
              <button class="collapse-toggle"><span class="collapse-icon">⌄</span></button>
            </header>
            <div id="earlyExpenses">
              <div class="record-row" data-expense-row>
                <div class="expense-record-title">
                  <div class="record-title-copy"><strong>Grocery</strong><small>Electric ₱1,500.00</small></div>
                  <span class="ui-tag">Grocery</span>
                  <div class="record-statuses"></div>
                </div>
                <div class="due-cell">Every 26</div>
                <div data-label="Planned account">Wallet</div>
                <div class="amount">₱1,500.00</div>
                <div class="desktop-record-actions"></div>
              </div>
            </div>
          </article>
        </section>
      </body>
    </html>`, { waitUntil:"domcontentloaded" });

  await page.addScriptTag({ path:runtimeScript });
  await expect(page.locator("#talaan-paid-repeat-png-control")).toHaveCount(1);

  const colors = await page.evaluate(() => ({
    sectionTitle:getComputedStyle(document.querySelector(".period-header h3")).color,
    sectionCopy:getComputedStyle(document.querySelector(".period-header p")).color,
    recordTitle:getComputedStyle(document.querySelector(".record-title-copy > strong")).color,
    recordCopy:getComputedStyle(document.querySelector(".record-title-copy > small")).color,
    tag:getComputedStyle(document.querySelector(".ui-tag")).color,
    due:getComputedStyle(document.querySelector(".due-cell")).color,
    account:getComputedStyle(document.querySelector('[data-label="Planned account"]')).color,
    amount:getComputedStyle(document.querySelector(".amount")).color,
    toggleColor:getComputedStyle(document.querySelector(".collapse-toggle")).color,
    toggleBackground:getComputedStyle(document.querySelector(".collapse-toggle")).backgroundColor
  }));

  expect(colors).toEqual({
    sectionTitle:"rgb(248, 250, 252)",
    sectionCopy:"rgb(174, 187, 208)",
    recordTitle:"rgb(248, 250, 252)",
    recordCopy:"rgb(174, 187, 208)",
    tag:"rgb(174, 187, 208)",
    due:"rgb(174, 187, 208)",
    account:"rgb(174, 187, 208)",
    amount:"rgb(241, 245, 249)",
    toggleColor:"rgb(203, 213, 225)",
    toggleBackground:"rgb(23, 32, 51)"
  });
});
