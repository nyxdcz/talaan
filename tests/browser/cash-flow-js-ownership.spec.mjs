import { test, expect } from "../helpers/browser-fixtures.mjs";

const widths = [390, 820, 1440];

async function seedCashFlow(page) {
  await page.evaluate(() => {
    const target = document.getElementById("dashCashFlowChart");
    target.innerHTML = `
      <div class="cash-flow-chart-grid">
        <section class="cash-flow-chart-panel"><h4>Chart</h4><svg class="chart-svg" viewBox="0 0 100 40"></svg></section>
        <section class="cash-flow-chart-panel">
          <svg>
            <title>August 2026 income: ₱10,000.00</title>
            <title>August 2026 expenses: ₱4,000.00</title>
            <title>August 2026 balance: ₱6,000.00</title>
            <title>July 2026 income: ₱9,000.00</title>
            <title>July 2026 expenses: ₱4,500.00</title>
            <title>July 2026 balance: ₱4,500.00</title>
          </svg>
        </section>
      </div>
      <div class="chart-legend">Income · Expenses</div>
      <div class="chart-note">Legacy note</div>
    `;
  });
}

for (const width of widths) {
  test(`Cash Flow behavior is feature-owned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    await page.goto("http://127.0.0.1:3000/index.html?page=dashboard", { waitUntil:"networkidle" });

    const delivery = await page.evaluate(() => ({
      scripts:[...document.scripts].map(script => script.getAttribute("src") || "").filter(Boolean)
    }));
    expect(delivery.scripts.some(src => src.includes("cash-flow-summary.js?v=2.5.0-talaan1"))).toBe(true);
    expect(delivery.scripts.some(src => src.includes("pwa-update.js?v=2.5.0-talaan1"))).toBe(true);

    await seedCashFlow(page);

    const summary = page.locator("#dashCashFlowChart .cash-flow-summary-panel");
    await expect(summary).toHaveCount(1);
    await expect(summary).toHaveAttribute("aria-label", "August 2026 income, expenses, and balance summary");
    await expect(summary.locator(".income-value")).toHaveText("₱10,000.00");
    await expect(summary.locator(".expense-value")).toHaveText("₱4,000.00");
    await expect(summary.locator(".balance-value")).toHaveText("₱6,000.00");
    await expect(summary.locator(".cash-flow-summary-change span")).toHaveText("vs July 2026");
    await expect(summary.locator(".cash-flow-summary-change strong")).toContainText("↑ ₱1,500.00 · 33.3%");
    await expect(page.locator("#dashCashFlowChart")).toHaveAttribute("aria-label", "Income, expenses, and balance chart with monthly summary");
    await expect(page.locator("#dashCashFlowChart > .chart-note")).toHaveCount(0);
    await expect(page.locator("#dashCashFlowChart .cash-flow-chart-main .chart-legend")).toHaveCount(1);

    const geometry = await page.evaluate(() => {
      const main = document.querySelector("#dashCashFlowChart .cash-flow-chart-main").getBoundingClientRect();
      const summary = document.querySelector("#dashCashFlowChart .cash-flow-summary-panel").getBoundingClientRect();
      return {
        main:{left:main.left,right:main.right,top:main.top,bottom:main.bottom},
        summary:{left:summary.left,right:summary.right,top:summary.top,bottom:summary.bottom},
        overflow:document.documentElement.scrollWidth > innerWidth + 1
      };
    });
    expect(geometry.overflow).toBe(false);
    if (width <= 700) expect(geometry.summary.top).toBeGreaterThanOrEqual(geometry.main.bottom - 1);
    else expect(geometry.summary.left).toBeGreaterThanOrEqual(geometry.main.right - 1);

    await page.evaluate(() => {
      const target = document.getElementById("dashCashFlowChart");
      target.append(document.createComment("observer trigger"));
    });
    await expect(summary).toHaveCount(1);
  });
}

test("Cash Flow feature handles a missing previous month without changing PWA API ownership", async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto("http://127.0.0.1:3000/index.html?page=dashboard", { waitUntil:"networkidle" });
  await page.evaluate(() => {
    const target = document.getElementById("dashCashFlowChart");
    target.innerHTML = `
      <div class="cash-flow-chart-grid">
        <section class="cash-flow-chart-panel"><h4>Chart</h4><svg class="chart-svg"></svg></section>
        <section class="cash-flow-chart-panel"><svg>
          <title>August 2026 income: ₱10,000.00</title>
          <title>August 2026 expenses: ₱4,000.00</title>
          <title>August 2026 balance: ₱6,000.00</title>
        </svg></section>
      </div>
      <div class="chart-legend">Income · Expenses</div>`;
  });
  const change = page.locator("#dashCashFlowChart .cash-flow-summary-change");
  await expect(change).toContainText("No previous month");
  expect(await page.evaluate(() => typeof window.FinancePwaUpdate?.serviceWorkerUrl)).toBe("function");
});
