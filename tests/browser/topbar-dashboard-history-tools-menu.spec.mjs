import { test, expect } from "../helpers/browser-fixtures.mjs";

async function loadHeaderRelocation(page, width = 1280) {
  await page.setViewportSize({ width, height:900 });
  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });
  await page.evaluate(() => {
    window.__customizeCalls = 0;
    window.__quickAddCalls = 0;
    window.FinanceProductivityTools = { openQuickAdd() { window.__quickAddCalls += 1; } };
    document.body.innerHTML = `
      <button data-page="dashboard" id="dashboardNav" type="button">Dashboard</button>
      <main id="dashboard" class="page active">
        <button id="customizeDashboardButton" type="button">Customize dashboard</button>
      </main>
      <header class="topbar">
        <div class="topbar-actions">
          <button id="mobileAddExpenseButton" type="button" aria-label="Customize dashboard" style="display:grid!important">Grid add</button>
          <div class="topbar-history-actions" role="group" aria-label="Edit history">
            <button id="undoMoneyButton" data-history-action="undo" type="button">Undo</button>
            <button id="redoMoneyButton" data-history-action="redo" type="button">Redo</button>
          </div>
          <div class="topbar-tools-menu" id="topbarToolsMenu">
            <button class="topbar-tools-trigger" id="topbarToolsTrigger" type="button" aria-controls="topbarToolsPanel">More</button>
            <div class="topbar-tools-panel" id="topbarToolsPanel" role="menu">
              <button class="topbar-tools-item" id="themeToggleButton" role="menuitem" type="button">Theme</button>
              <button class="topbar-tools-item" id="globalSearchButton" role="menuitem" type="button">Search</button>
              <button class="topbar-tools-item" id="productivityCenterButton" role="menuitem" type="button">Quick actions</button>
              <div class="menu-command-separator" role="separator"></div>
              <button class="topbar-tools-item" id="undoMoneyMenuButton" role="menuitem" data-history-action="undo" type="button">Undo</button>
              <button class="topbar-tools-item" id="redoMoneyMenuButton" role="menuitem" data-history-action="redo" type="button">Redo</button>
            </div>
          </div>
        </div>
      </header>`;
    document.getElementById("customizeDashboardButton").addEventListener("click", () => { window.__customizeCalls += 1; });
  });
  await page.addScriptTag({ url:"http://127.0.0.1:3000/header-tools-compat.js?v=dashboard-history-menu-test" });
  await expect(page.locator("#customizeDashboardMenuButton")).toHaveCount(1);
}

test("moves Customize dashboard, Undo, and Redo into More tools in the requested order", async ({ page }) => {
  await loadHeaderRelocation(page);

  const ids = await page.locator("#topbarToolsPanel > button").evaluateAll(nodes => nodes.map(node => node.id));
  expect(ids).toEqual([
    "themeToggleButton",
    "quickEntryMenuButton",
    "customizeDashboardMenuButton",
    "undoMoneyMenuButton",
    "redoMoneyMenuButton",
    "globalSearchButton",
    "productivityCenterButton"
  ]);
  await expect(page.locator("#customizeDashboardMenuButton")).toHaveAttribute("role", "menuitem");
  await expect(page.locator("#topbarToolsPanel > .menu-command-separator")).toHaveCount(0);
});

test("removes standalone dashboard/history controls even when legacy CSS forces them visible", async ({ page }) => {
  await loadHeaderRelocation(page);

  await expect(page.locator("#mobileAddExpenseButton")).toBeHidden();
  await expect(page.locator("#mobileAddExpenseButton")).toHaveAttribute("aria-hidden", "true");
  expect(await page.locator("#mobileAddExpenseButton").evaluate(node => getComputedStyle(node).display)).toBe("none");
  await expect(page.locator(".topbar-history-actions")).toBeHidden();
  await expect(page.locator(".topbar-history-actions")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#undoMoneyButton")).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#redoMoneyButton")).toHaveAttribute("tabindex", "-1");
});

test("Customize dashboard menu item preserves the existing dashboard action", async ({ page }) => {
  await loadHeaderRelocation(page, 390);

  await page.locator("#customizeDashboardMenuButton").click({ force:true });
  await expect.poll(() => page.evaluate(() => window.__customizeCalls)).toBe(1);
});