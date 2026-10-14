import { test, expect } from "../helpers/browser-fixtures.mjs";

async function unlockApp(page, pageName = "dashboard") {
  await page.addInitScript(() => {
    localStorage.setItem("simple-finance-sidebar-pinned-v1", "false");
  });
  await page.setViewportSize({ width:1280, height:800 });
  await page.goto(`http://127.0.0.1:3000/?page=${pageName}`, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await page.waitForFunction(() => document.querySelector(".sidebar .brand strong")?.textContent === "Talaan");
}

test("collapsed desktop nav changes pages without expanding the rail", async ({ page }) => {
  await unlockApp(page);

  const sidebar = page.locator("#sidebar");
  await sidebar.evaluate(node => node.classList.remove("desktop-open", "sidebar-pinned"));
  await expect(sidebar).toHaveCSS("width", "60px");

  await page.locator('#sidebar .nav-button[data-page="money"]').click();

  await expect(page.locator("#money")).toHaveClass(/active/);
  await expect(sidebar).not.toHaveClass(/desktop-open/);
  await expect(sidebar).not.toHaveClass(/sidebar-pinned/);
  await expect(sidebar).toHaveCSS("width", "60px");
  await expect(page.locator("#menuButton")).toHaveAttribute("aria-expanded", "false");
});

test("collapsed logo reveals the expand control and pinning still expands the rail", async ({ page }) => {
  await unlockApp(page, "money");

  const sidebar = page.locator("#sidebar");
  const expandButton = page.locator("#sidebarCloseButton");
  const pinIcon = expandButton.locator(".sidebar-pin-icon");
  const logo = page.locator("#sidebar .talaan-brand-logo");

  await sidebar.evaluate(node => node.classList.remove("desktop-open", "sidebar-pinned"));
  await expect(pinIcon).toHaveCSS("opacity", "0");
  await expect(logo).toHaveCSS("opacity", "1");

  await expandButton.hover();
  await expect(pinIcon).toHaveCSS("opacity", "1");
  await expect(logo).toHaveCSS("opacity", "0");

  await expandButton.click();
  await expect(sidebar).toHaveClass(/sidebar-pinned/);
  await expect(sidebar).toHaveClass(/desktop-open/);
  await expect(sidebar).toHaveCSS("width", "185px");

  await page.locator('#sidebar .nav-button[data-page="dashboard"]').click();
  await expect(page.locator("#dashboard")).toHaveClass(/active/);
  await expect(sidebar).toHaveClass(/sidebar-pinned/);
  await expect(sidebar).toHaveCSS("width", "185px");
});
