import { test, expect } from "../helpers/browser-fixtures.mjs";

const viewports = [390, 820, 1440];

for (const width of viewports) {
  test(`Cash Flow uses static CSS ownership at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("http://127.0.0.1:3000/index.html?page=dashboard", { waitUntil:"networkidle" });

    await expect(page.locator("style#cashFlowLayoutV1522")).toHaveCount(0);
    await expect(page.locator("#dashCashFlowChart")).toHaveCount(1);

    await page.evaluate(() => {
      const target = document.getElementById("dashCashFlowChart");
      target.innerHTML = `
        <div class="cash-flow-chart-grid">
          <section class="cash-flow-chart-panel"><h4>Chart</h4><svg class="chart-svg" viewBox="0 0 100 40"></svg></section>
          <section class="cash-flow-chart-panel">
            <svg><title>August 2026 income: ₱10,000.00</title><title>August 2026 expenses: ₱4,000.00</title><title>August 2026 balance: ₱6,000.00</title><title>July 2026 income: ₱9,000.00</title><title>July 2026 expenses: ₱4,500.00</title><title>July 2026 balance: ₱4,500.00</title></svg>
          </section>
        </div>
        <div class="chart-legend">Income · Expenses</div>
        <div class="chart-note">Legacy note</div>
      `;
    });

    await expect(page.locator("#dashCashFlowChart .cash-flow-summary-panel")).toHaveCount(1);
    const metrics = await page.evaluate(() => {
      const target = document.getElementById("dashCashFlowChart");
      const grid = target.querySelector(".cash-flow-chart-grid");
      const main = target.querySelector(".cash-flow-chart-main");
      const summary = target.querySelector(".cash-flow-summary-panel");
      const legend = target.querySelector(".cash-flow-chart-main .chart-legend");
      const mainRect = main.getBoundingClientRect();
      const summaryRect = summary.getBoundingClientRect();
      const legendStyle = getComputedStyle(legend);
      const summaryStyle = getComputedStyle(summary);
      return {
        runtimeStyle:Boolean(document.getElementById("cashFlowLayoutV1522")),
        staticOwner:[...document.styleSheets].some(sheet => String(sheet.href || "").includes("desktop-ux.css")),
        gridTemplate:getComputedStyle(grid).gridTemplateColumns,
        mainRect:{ left:mainRect.left, right:mainRect.right, top:mainRect.top, bottom:mainRect.bottom },
        summaryRect:{ left:summaryRect.left, right:summaryRect.right, top:summaryRect.top, bottom:summaryRect.bottom },
        legendMarginTop:legendStyle.marginTop,
        legendPaddingTop:legendStyle.paddingTop,
        legendBorderTopStyle:legendStyle.borderTopStyle,
        summaryPaddingTop:summaryStyle.paddingTop,
        summaryPaddingRight:summaryStyle.paddingRight,
        overflow:document.documentElement.scrollWidth > innerWidth + 1
      };
    });

    expect(metrics.runtimeStyle).toBe(false);
    expect(metrics.staticOwner).toBe(true);
    expect(metrics.legendMarginTop).toBe(width >= 1101 ? "5px" : "6px");
    expect(metrics.legendPaddingTop).toBe("6px");
    expect(metrics.legendBorderTopStyle).toBe("solid");
    expect(metrics.summaryPaddingTop).toBe(width >= 1101 ? "7px" : "10px");
    expect(metrics.summaryPaddingRight).toBe(width >= 1101 ? "7px" : "10px");
    expect(metrics.overflow).toBe(false);
    if (width <= 700) expect(metrics.summaryRect.top).toBeGreaterThanOrEqual(metrics.mainRect.bottom - 1);
    else expect(metrics.summaryRect.left).toBeGreaterThanOrEqual(metrics.mainRect.right - 1);
  });
}
