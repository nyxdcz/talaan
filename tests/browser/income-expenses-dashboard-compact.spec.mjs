import { expect, test } from "@playwright/test";
/* global data */

const BASE = "http://127.0.0.1:3000";

test.use({ serviceWorkers:"block" });

async function openDashboard(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/?page=dashboard`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("body")).toHaveClass(/finance-signed-in/);
  await page.waitForFunction(() => document.querySelector("#dashCashFlowChart .income-expenses-analytics"));
  await page.locator('[data-dashboard-view-tab="cash-flow"]').click();
  await page.waitForFunction(() => {
    const link = document.getElementById("incomeExpensesCompactStylesheet");
    return Boolean(link && link.sheet);
  });
}

test("desktop Income vs Expenses keeps compact chrome with a bounded over-time chart", async ({ page }) => {
  await openDashboard(page, { width:1440, height:900 });

  const stylesheet = page.locator("#incomeExpensesCompactStylesheet");
  await expect(stylesheet).toHaveAttribute("href", /income-expenses-compact\.css\?v=2\.5\.0-income-expenses-compact2$/);
  await expect(page.locator("#dashboardWeekMarquee")).toBeHidden();

  const measurements = await page.evaluate(() => {
    const analytics = document.querySelector(".income-expenses-analytics");
    const summary = analytics.querySelector(".income-expenses-summary");
    const chartCard = analytics.querySelector(".income-expenses-chart-card");
    const chart = analytics.querySelector(".income-expenses-svg");
    const lowerCard = analytics.querySelector(".income-expenses-lower-card");
    const rect = node => node.getBoundingClientRect();
    return {
      summaryHeight:rect(summary).height,
      chartHeight:rect(chart).height,
      chartPaddingTop:parseFloat(getComputedStyle(chartCard).paddingTop),
      lowerCardHeight:rect(lowerCard).height,
      pageScrollWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth
    };
  });

  expect(measurements.summaryHeight).toBeLessThanOrEqual(96);
  expect(measurements.chartHeight).toBeGreaterThanOrEqual(300);
  expect(measurements.chartHeight).toBeLessThanOrEqual(420);
  expect(measurements.chartPaddingTop).toBeGreaterThanOrEqual(14);
  expect(measurements.lowerCardHeight).toBeLessThan(150);
  expect(measurements.pageScrollWidth).toBeLessThanOrEqual(measurements.viewportWidth + 1);
});

test("iPhone 14 Pro keeps the chart readable with 35px range controls", async ({ page }) => {
  await openDashboard(page, { width:393, height:852 });
  const buttons = page.locator(".income-expenses-range button");

  const layout = await page.evaluate(() => {
    const analytics = document.querySelector(".income-expenses-analytics");
    const chartCard = analytics.querySelector(".income-expenses-chart-card");
    const chart = analytics.querySelector(".income-expenses-svg");
    const subtitle = analytics.querySelector(".income-expenses-subtitle");
    return {
      chartHeight:chart.getBoundingClientRect().height,
      chartPaddingTop:parseFloat(getComputedStyle(chartCard).paddingTop),
      subtitleDisplay:getComputedStyle(subtitle).display,
      pageScrollWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth
    };
  });

  expect(layout.subtitleDisplay).toBe("none");
  expect(layout.chartHeight).toBe(220);
  expect(layout.chartPaddingTop).toBeGreaterThanOrEqual(13);
  expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);

  const sizes = await buttons.evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { width:rect.width, height:rect.height };
  }));
  for (const size of sizes) {
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBe(35);
  }
});

test("compact range controls remain presentation-only", async ({ page }) => {
  await openDashboard(page, { width:1440, height:900 });
  const before = await page.evaluate(() => JSON.stringify(data));

  await page.locator('.income-expenses-range button[data-range="12"]').click();
  await expect(page.locator('.income-expenses-range button[data-range="12"]')).toHaveAttribute("aria-pressed", "true");

  const after = await page.evaluate(() => JSON.stringify(data));
  expect(after).toBe(before);
});
