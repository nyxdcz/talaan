import { test, expect } from "../helpers/browser-fixtures.mjs";

async function loadOtherExpensesUi(page, { other = "₱0.00", theme = "light" } = {}) {
  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });
  await page.evaluate(({ other, theme }) => {
    document.documentElement.dataset.theme = theme;
    window.FINANCE_FIRST_HALF_TODAY_OVERRIDE = "2026-08-10";
    window.selectedMonth = () => "2026-08";
    document.body.innerHTML = `
      <main id="money" class="page active">
        <div class="legend">
          <div class="legend-item"><strong class="legend-total" id="legendAvailableTotal">₱20,000.00</strong></div>
          <div class="legend-item"><strong class="legend-total text-red" id="legendEarlyTotal">₱0.00</strong></div>
          <div class="legend-item"><strong class="legend-total text-orange" id="legendLateTotal">₱500.00</strong></div>
          <div class="legend-item"><strong class="legend-total text-blue" id="legendOtherTotal">${other}</strong></div>
        </div>
        <div class="summary-strip" id="moneySummary">
          <div class="summary-item"><strong class="summary-card-value">₱500.00</strong></div>
          <div class="summary-item"><strong class="summary-card-value">₱19,500.00</strong></div>
          <div class="summary-item"><strong class="summary-card-value">₱19,000.00</strong></div>
          <div class="summary-item"><strong class="summary-card-value">₱19,000.00</strong></div>
        </div>
      </main>`;
  }, { other, theme });
  await page.addScriptTag({ url:"http://127.0.0.1:3000/interaction-patterns.js?v=other-expenses-zero-test" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.FinanceInteractionPatterns?.updateFirstHalfCompletionIcons)), { timeout:10000 }).toBe(true);
}

test("zero Other expenses uses the supplied heart-smile artwork", async ({ page }) => {
  await loadOtherExpensesUi(page);

  const otherValue = page.locator("#legendOtherTotal");
  const icon = otherValue.locator("img[data-other-expenses-complete-icon]");
  await expect(icon).toBeVisible();
  await expect(otherValue).toHaveAttribute("aria-label", "No other expenses");
  await expect(otherValue).toHaveAttribute("title", "No other expenses");
  await expect(icon).toHaveAttribute("data-theme-variant", "light");
  await expect(icon).toHaveAttribute("src", /heart-smile-light\.png$/);

  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await expect(icon).toHaveAttribute("data-theme-variant", "dark");
  await expect(icon).toHaveAttribute("src", /heart-smile-dark\.png$/);
});

test("non-zero Other expenses keeps the money amount visible", async ({ page }) => {
  await loadOtherExpensesUi(page, { other:"₱720.00" });

  const otherValue = page.locator("#legendOtherTotal");
  await expect(otherValue.locator("img[data-other-expenses-complete-icon]")).toHaveCount(0);
  await expect(otherValue).toHaveText("₱720.00");
  await expect(otherValue).not.toHaveAttribute("aria-label", "No other expenses");
});

test("Other expenses switches between icon and amount when the total changes", async ({ page }) => {
  await loadOtherExpensesUi(page);
  const otherValue = page.locator("#legendOtherTotal");
  await expect(otherValue.locator("img[data-other-expenses-complete-icon]")).toBeVisible();

  await page.evaluate(() => {
    const value = document.getElementById("legendOtherTotal");
    value.textContent = "₱250.00";
  });
  await expect(otherValue.locator("img[data-other-expenses-complete-icon]")).toHaveCount(0);
  await expect(otherValue).toHaveText("₱250.00");
});
