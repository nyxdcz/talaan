import fs from "node:fs";
import { test, expect } from "@playwright/test";

test.use({ serviceWorkers:"block" });

const expectedOrder = [
  "themeToggleButton",
  "quickEntryMenuButton",
  "customizeDashboardMenuButton",
  "undoMoneyMenuButton",
  "redoMoneyMenuButton",
  "globalSearchButton",
  "productivityCenterButton",
  "privacyDisplayToggle"
];

test("Header and More Tools compatibility is owned by the dedicated UI module", async () => {
  const updater = fs.readFileSync("assets/js/pwa-update.js", "utf8");
  const headerTools = fs.readFileSync("assets/js/ui/header-tools-compat.js", "utf8");
  expect(updater).not.toContain("installQuickEntryToolsMenuRelocation");
  expect(updater).not.toContain("installHeaderToolsRelocation");
  expect(headerTools).toContain("installQuickEntryToolsMenuRelocation");
  expect(headerTools).toContain("installHeaderToolsRelocation");
});

async function unlock(page, email) {
  await page.waitForFunction(() => typeof window.FinancePrivacyLock?.unlock === "function" && Boolean(document.getElementById("topbarToolsTrigger")));
  await page.evaluate(value => window.FinancePrivacyLock.unlock({ email:value }), email);
}

async function openTools(page) {
  const trigger = page.locator("#topbarToolsTrigger");
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#topbarToolsPanel")).toBeVisible();
}

test("desktop More Tools preserves ordering, semantics, actions, and duplicate safety", async ({ page }) => {
  await page.setViewportSize({ width:1440, height:900 });
  await page.goto("http://127.0.0.1:3000/index.html?page=dashboard", { waitUntil:"networkidle" });
  await unlock(page, "header-tools-desktop@example.invalid");

  const triggerGeometry = await page.locator("#topbarToolsTrigger").evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left:rect.left, right:rect.right, width:rect.width, height:rect.height, viewport:innerWidth };
  });
  expect(triggerGeometry.width).toBeCloseTo(30, 0);
  expect(triggerGeometry.height).toBeCloseTo(30, 0);
  expect(triggerGeometry.left).toBeGreaterThanOrEqual(0);
  expect(triggerGeometry.right).toBeLessThanOrEqual(triggerGeometry.viewport - 12);


  await expect(page.locator("#quickEntryMenuButton")).toHaveCount(1);
  await expect(page.locator("#customizeDashboardMenuButton")).toHaveCount(1);
  await openTools(page);

  const directButtons = await page.locator("#topbarToolsPanel > button").evaluateAll(nodes => nodes.map(node => node.id));
  expect(directButtons).toEqual(expectedOrder);

  const panelGeometry = await page.locator("#topbarToolsPanel").evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left:rect.left, right:rect.right, viewport:innerWidth };
  });
  expect(panelGeometry.left).toBeGreaterThanOrEqual(12);
  expect(panelGeometry.right).toBeLessThanOrEqual(panelGeometry.viewport - 12);

  const quick = page.locator("#quickEntryMenuButton");
  const customize = page.locator("#customizeDashboardMenuButton");
  await expect(quick).toHaveAttribute("role", "menuitem");
  await expect(quick).toHaveAttribute("aria-label", "Quick add");
  await expect(customize).toHaveAttribute("role", "menuitem");
  await expect(customize).toHaveAttribute("aria-label", "Customize dashboard");
  await expect(page.locator("#privacyDisplayToggle")).toHaveAttribute("role", "menuitem");
  await expect(page.locator("#privacyDisplayToggle")).toHaveAttribute("aria-label", "Hide monetary values");
  await expect(page.locator("#topbarToolsPanel > .menu-command-separator")).toHaveCount(0);
  await expect(page.locator(".topbar-history-actions")).toBeHidden();
  await expect(page.locator("#customizeDashboardButton")).toBeHidden();
  await expect(page.locator("#mobileAddExpenseButton")).toBeHidden();

  await page.evaluate(() => {
    window.__quickAddOpened = 0;
    window.FinanceProductivityTools = {
      ...(window.FinanceProductivityTools || {}),
      openQuickAdd() { window.__quickAddOpened += 1; }
    };
  });
  await quick.click();
  await expect.poll(() => page.evaluate(() => window.__quickAddOpened)).toBe(1);

  await page.evaluate(() => document.body.appendChild(document.createElement("div")));
  await expect.poll(async () => ({
    quick:await page.locator("#quickEntryMenuButton").count(),
    customize:await page.locator("#customizeDashboardMenuButton").count()
  })).toEqual({ quick:1, customize:1 });
});

test("Customize Dashboard still works when invoked from another page", async ({ page }) => {
  await page.setViewportSize({ width:1280, height:850 });
  await page.goto("http://127.0.0.1:3000/index.html?page=money", { waitUntil:"networkidle" });
  await unlock(page, "header-tools-customize@example.invalid");
  await page.evaluate(() => {
    window.__customizeClicks = 0;
    document.getElementById("customizeDashboardButton")?.addEventListener("click", () => { window.__customizeClicks += 1; });
  });
  await openTools(page);
  await page.locator("#customizeDashboardMenuButton").click();
  await expect.poll(() => page.locator("#dashboard").evaluate(node => node.classList.contains("active"))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__customizeClicks)).toBeGreaterThan(0);
});

test("phone Finance and Work headers keep customization inside More Tools", async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  for (const pageId of ["money", "projects"]) {
    await page.goto(`http://127.0.0.1:3000/index.html?page=${pageId}`, { waitUntil:"networkidle" });
    await unlock(page, `header-tools-phone-${pageId}@example.invalid`);
    await openTools(page);

    const directButtons = await page.locator("#topbarToolsPanel > button").evaluateAll(nodes => nodes.map(node => node.id));
    expect(directButtons).toEqual(expectedOrder);
    await expect(page.locator("#quickEntryMenuButton")).toHaveCount(1);
    await expect(page.locator("#customizeDashboardMenuButton")).toHaveCount(1);
    await expect(page.locator("#quickEntryMenuButton")).toHaveAttribute("role", "menuitem");
    await expect(page.locator("#customizeDashboardMenuButton")).toHaveAttribute("role", "menuitem");
    await expect(page.locator("#mobileAddExpenseButton")).toBeHidden();

    const customizeSource = await page.locator("#customizeDashboardButton").evaluate(node => ({
      hidden:node.hidden,
      inTopbar:Boolean(node.closest(".topbar-actions")),
      ariaHidden:node.getAttribute("aria-hidden"),
      tabIndex:node.tabIndex
    }));
    expect(customizeSource).toEqual({ hidden:true, inTopbar:false, ariaHidden:"true", tabIndex:-1 });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflow).toBe(false);
  }
});
