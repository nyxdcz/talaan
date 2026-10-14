import { expect, test } from "../helpers/browser-fixtures.mjs";

const base = "http://127.0.0.1:3000";

test.describe.configure({ mode:"serial" });

async function unlock(page, route = "dashboard") {
  await page.goto(`${base}/?page=${route}`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
}

async function assertEmbeddedSidebar(page) {
  const images = page.locator("#sidebar .nav-icon-image");
  await expect(images).toHaveCount(5);
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(img => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0))).toBe(true);
  const sources = await images.evaluateAll(nodes => nodes.map(img => img.getAttribute("src") || ""));
  expect(sources.every(src => src.startsWith("data:image/png;base64,"))).toBe(true);
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(img => getComputedStyle(img).content === "normal" || getComputedStyle(img).content === "none"))).toBe(true);
}

test("V15.2.10 sidebar icons render with every external sidebar PNG request blocked", async ({ page }) => {
  const sidebarRequests = [];
  await page.route("**/icons/sidebar-*.png*", route => { sidebarRequests.push(route.request().url()); return route.abort(); });
  await page.setViewportSize({ width:1440, height:900 });
  await unlock(page);
  await page.locator("#sidebar").evaluate(sidebar => {
    sidebar.classList.add("sidebar-pinned");
    sidebar.classList.remove("desktop-open");
    sidebar.setAttribute("aria-hidden", "false");
  });
  await assertEmbeddedSidebar(page);
  expect(sidebarRequests).toEqual([]);
});

test("V15.2.10 embedded sidebar icons survive collapsed rail and phone drawer", async ({ page }) => {
  const sidebarRequests = [];
  await page.route("**/icons/sidebar-*.png*", route => { sidebarRequests.push(route.request().url()); return route.abort(); });
  await page.setViewportSize({ width:1280, height:820 });
  await unlock(page);
  await page.locator("#sidebar").evaluate(sidebar => {
    sidebar.classList.remove("sidebar-pinned", "desktop-open");
    sidebar.setAttribute("aria-hidden", "false");
  });
  await assertEmbeddedSidebar(page);
  await page.setViewportSize({ width:390, height:844 });
  const menu = page.locator("#menuButton");
  if (await menu.isVisible()) await menu.click();
  await expect(page.locator("#sidebar")).toBeVisible();
  await assertEmbeddedSidebar(page);
  expect(sidebarRequests).toEqual([]);
});

test("V15.2.9 Quick actions uses the native sliders SVG", async ({ page }) => {
  await page.setViewportSize({ width:1440, height:900 });
  await unlock(page);
  await page.locator("#topbarToolsTrigger").click();
  const button = page.locator("#productivityCenterButton");
  await expect(button).toBeVisible();
  const icon = await button.locator(".toolbar-icon").evaluate(node => ({ background:getComputedStyle(node).backgroundImage, svgOpacity:getComputedStyle(node.querySelector("svg")).opacity, paths:node.querySelectorAll("svg path").length }));
  expect(icon.background).toBe("none");
  expect(icon.svgOpacity).toBe("1");
  expect(icon.paths).toBeGreaterThan(0);
});

for (const width of [1200,1280,1440]) {
  test(`V15.2.9 Monthly budget plan disclosure does not overlap Forecast at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    await unlock(page, "income");
    const card = page.locator("#monthlyBudgetPlannerCard");
    const toggle = page.locator("#monthlyBudgetPlannerToggle");
    await expect(card).toBeVisible();
    if (await toggle.getAttribute("aria-expanded") === "true") await toggle.click();
    await expect(card).toHaveClass(/is-planner-collapsed/);
    const metrics = await page.evaluate(() => {
      const toggle = document.getElementById("monthlyBudgetPlannerToggle").getBoundingClientRect();
      const visible = [...document.querySelectorAll("#monthlyBudgetPlannerCard .budget-plan-kpi")].filter(node => getComputedStyle(node).display !== "none");
      const forecast = visible.at(-1).getBoundingClientRect();
      const card = document.getElementById("monthlyBudgetPlannerCard").getBoundingClientRect();
      return { toggle:{ left:toggle.left, right:toggle.right, width:toggle.width }, forecast:{ left:forecast.left, right:forecast.right }, card:{ left:card.left, right:card.right }, visible:visible.length };
    });
    expect(metrics.visible).toBe(3);
    expect(metrics.toggle.width).toBe(30);
    expect(metrics.forecast.right).toBeLessThanOrEqual(metrics.toggle.left - 4);
    expect(metrics.toggle.right).toBeLessThanOrEqual(metrics.card.right);
  });
}
