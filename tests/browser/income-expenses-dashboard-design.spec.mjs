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
}

test("desktop Income vs Expenses follows the approved analytics hierarchy", async ({ page }) => {
  await openDashboard(page, { width:1440, height:900 });
  const card = page.locator('[data-dashboard-card="cash-flow"]');
  await expect(card.locator(".income-expenses-eyebrow")).toHaveText("Analytics");
  await expect(card.locator(".income-expenses-title")).toHaveText("Income vs Expenses");
  await expect(card.locator(".income-expenses-primary-label")).toHaveText("Net Income");
  await expect(card.locator(".income-expenses-kpi")).toHaveCount(3);
  await expect(card.locator(".income-expenses-chart-title")).toContainText("Income vs Expenses");
  await expect(card.locator(".income-expenses-legend-item")).toHaveCount(3);
  await expect(card.locator("svg.income-expenses-svg")).toBeVisible();
  await expect(card.locator(".income-expenses-range button")).toHaveCount(4);
  await expect(card.locator('.income-expenses-range button[aria-pressed="true"]')).toHaveCount(1);

  const geometry = await card.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left:rect.left, right:rect.right, viewport:innerWidth, scrollWidth:document.documentElement.scrollWidth };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport + 1);
});

test("iPhone 14 Pro stacks analytics without overflow with 35px range controls", async ({ page }) => {
  await openDashboard(page, { width:393, height:852 });
  const card = page.locator('[data-dashboard-card="cash-flow"]');
  const summary = card.locator(".income-expenses-summary");
  const rangeButtons = card.locator(".income-expenses-range button");
  const chart = card.locator(".income-expenses-chart-card");

  await expect(summary).toBeVisible();
  await expect(chart).toBeVisible();

  const buttonSizes = await rangeButtons.evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { width:rect.width, height:rect.height };
  }));
  for (const size of buttonSizes) {
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBe(35);
  }

  const layout = await page.evaluate(() => {
    const card = document.querySelector('[data-dashboard-card="cash-flow"]');
    const summary = card.querySelector(".income-expenses-summary");
    const rect = node => {
      const value=node.getBoundingClientRect();
      return { left:value.left, right:value.right, width:value.width };
    };
    return {
      viewport:innerWidth,
      pageScrollWidth:document.documentElement.scrollWidth,
      card:rect(card),
      summaryColumns:getComputedStyle(summary).gridTemplateColumns
    };
  });
  expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.card.left).toBeGreaterThanOrEqual(0);
  expect(layout.card.right).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.summaryColumns.trim().split(/\s+/)).toHaveLength(1);
});

test("range controls update the derived chart without mutating finance data", async ({ page }) => {
  await openDashboard(page, { width:1440, height:900 });
  const before = await page.evaluate(() => JSON.stringify(data));
  const card = page.locator('[data-dashboard-card="cash-flow"]');

  await card.locator('.income-expenses-range button[data-range="12"]').click();
  await expect(card.locator('.income-expenses-range button[data-range="12"]')).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator(".income-expenses-period-copy")).toContainText("12 months");

  await card.locator('.income-expenses-range button[data-range="ytd"]').click();
  await expect(card.locator('.income-expenses-range button[data-range="ytd"]')).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator(".income-expenses-period-copy")).toContainText("Year to date");

  const after = await page.evaluate(() => JSON.stringify(data));
  expect(after).toBe(before);
});
