import { test, expect } from "../helpers/browser-fixtures.mjs";

test.use({ serviceWorkers:"block" });

async function unlock(page, email) {
  await page.waitForFunction(() => typeof window.FinancePrivacyLock?.unlock === "function");
  await page.evaluate(value => window.FinancePrivacyLock.unlock({ email:value }), email);
}

async function expectReadableActiveTab(page, pageId, switcherSelector, tabPage) {
  await page.setViewportSize({ width:1440, height:900 });
  await page.goto(`http://127.0.0.1:3000/index.html?page=${pageId}`, { waitUntil:"networkidle" });
  await unlock(page, `workspace-${pageId}@example.invalid`);
  const tab = page.locator(`${switcherSelector} [data-workspace-page="${tabPage}"]`).first();
  await expect(tab).toBeVisible();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(tab).toHaveCSS("background-color", "rgb(53, 111, 209)");
  await expect(tab).toHaveCSS("color", "rgb(255, 255, 255)");
  await tab.hover();
  await expect(tab).toHaveCSS("background-color", "rgb(53, 111, 209)");
  await expect(tab).toHaveCSS("color", "rgb(255, 255, 255)");
  await tab.focus();
  await expect(tab).toHaveCSS("background-color", "rgb(53, 111, 209)");
  await expect(tab).toHaveCSS("color", "rgb(255, 255, 255)");
}

test("Finance active workspace tab stays readable on hover and focus", async ({ page }) => {
  await expectReadableActiveTab(page, "money", "#money .money-workspace-switcher", "money");
});

test("Projects active workspace tab stays readable on hover and focus", async ({ page }) => {
  await expectReadableActiveTab(page, "projects", "#projects .project-workspace-switcher", "projects");
});
