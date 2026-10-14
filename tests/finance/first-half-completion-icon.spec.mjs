import { test, expect } from "../helpers/browser-fixtures.mjs";

async function loadCompletionUi(page, { today = "2026-08-17", month = "2026-08", firstHalf = "₱0.00", difference = "₱18,313.00", theme = "light" } = {}) {
  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });
  await page.evaluate(({ today, month, firstHalf, difference, theme }) => {
    document.documentElement.dataset.theme = theme;
    window.FINANCE_FIRST_HALF_TODAY_OVERRIDE = today;
    window.selectedMonth = () => month;
    document.body.innerHTML = `
      <main id="money" class="page active">
        <div class="legend">
          <div class="legend-item"><strong class="legend-total" id="legendAvailableTotal">₱20,000.00</strong></div>
          <div class="legend-item"><strong class="legend-total text-red" id="legendEarlyTotal" aria-live="polite">${firstHalf}</strong></div>
        </div>
        <div class="summary-strip" id="moneySummary">
          <div class="summary-item summary-card"><strong class="summary-card-value">₱9,000.00</strong></div>
          <div class="summary-item summary-card"><strong class="summary-card-value text-green">${difference}</strong></div>
          <div class="summary-item summary-card"><strong class="summary-card-value">₱8,000.00</strong></div>
          <div class="summary-item summary-card"><strong class="summary-card-value">₱7,000.00</strong></div>
        </div>
      </main>`;
  }, { today, month, firstHalf, difference, theme });
  await page.addScriptTag({ url:"http://127.0.0.1:3000/interaction-patterns.js?v=first-half-completion-test" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.FinanceInteractionPatterns?.updateFirstHalfCompletionIcons)), { timeout:10000 }).toBe(true);
}

test("completed first half uses the supplied heart-smile artwork in both requested cards", async ({ page }) => {
  await loadCompletionUi(page);

  const firstHalfValue = page.locator("#legendEarlyTotal");
  const firstDifferenceValue = page.locator("#moneySummary > .summary-item:nth-child(2) .summary-card-value");
  await expect(firstHalfValue.locator("img[data-first-half-complete-icon]")).toBeVisible();
  await expect(firstDifferenceValue.locator("img[data-first-half-complete-icon]")).toBeVisible();
  await expect(firstHalfValue).toHaveAttribute("aria-label", "First half completed");
  await expect(firstDifferenceValue).toHaveAttribute("title", "First half completed");

  const lightIcon = firstHalfValue.locator("img");
  await expect(lightIcon).toHaveAttribute("src", /heart-smile-light\.png$/);
  await expect(lightIcon).toHaveAttribute("data-theme-variant", "light");

  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await expect(lightIcon).toHaveAttribute("data-theme-variant", "dark");
  await expect(lightIcon).toHaveAttribute("src", /heart-smile-dark\.png$/);
});

test("past first half keeps an unpaid first-half amount visible but replaces the difference amount", async ({ page }) => {
  await loadCompletionUi(page, { firstHalf:"₱500.00", difference:"₱17,813.00" });

  await expect(page.locator("#legendEarlyTotal img[data-first-half-complete-icon]")).toHaveCount(0);
  await expect(page.locator("#legendEarlyTotal")).toHaveText("₱500.00");
  await expect(page.locator("#moneySummary > .summary-item:nth-child(2) img[data-first-half-complete-icon]")).toBeVisible();
});

test("before day 16 both cards continue to show their money values", async ({ page }) => {
  await loadCompletionUi(page, { today:"2026-08-10" });

  await expect(page.locator("img[data-first-half-complete-icon]")).toHaveCount(0);
  await expect(page.locator("#legendEarlyTotal")).toHaveText("₱0.00");
  await expect(page.locator("#moneySummary > .summary-item:nth-child(2) .summary-card-value")).toHaveText("₱18,313.00");
});
