import fs from "node:fs";
import { test, expect } from "@playwright/test";

test.use({ serviceWorkers:"block" });

async function installSidebarFixture(page, extraSidebarClass = "") {
  await page.evaluate(sidebarClass => {
    document.body.className = "";
    document.body.innerHTML = `
      <div class="app">
        <aside class="sidebar ${sidebarClass}" id="sidebar">
          <button class="sidebar-close-button" type="button" aria-label="Pin navigation open"></button>
          <div class="brand"><img class="talaan-brand-logo" src="./icons/talaan-brand-logo.png?v=2.2.0-talaan2" alt="" aria-hidden="true"><strong>Talaan</strong></div>
          <nav class="sidebar-navigation">
            <button class="nav-button" data-nav-label="Overview"><span class="nav-icon"><span class="nav-icon-image"></span></span><span class="nav-label">Overview</span></button>
            <button class="nav-button active" data-nav-label="Finance"><span class="nav-icon"><span class="nav-icon-image"></span></span><span class="nav-label">Finance</span></button>
            <button class="nav-button" data-nav-label="Work"><span class="nav-icon"><span class="nav-icon-image"></span></span><span class="nav-label">Work</span></button>
            <button class="nav-button insights-nav-button" data-nav-label="Insights"><span class="nav-icon"><span class="nav-icon-image"></span></span><span class="nav-label">Insights</span></button>
            <div class="sidebar-settings-bottom"><button class="nav-button settings-nav-button" data-nav-label="Settings"><span class="nav-icon"><span class="nav-icon-image"></span></span><span class="nav-label">Settings</span></button></div>
          </nav>
        </aside>
        <main class="main">Workspace</main>
      </div>`;
  }, extraSidebarClass);
  await page.addStyleTag({ url:"http://127.0.0.1:3000/app.css?v=2.5.0-talaan1" });
  await page.addStyleTag({ url:"http://127.0.0.1:3000/shell-ui.css?v=2.5.0-talaan1" });
  await page.addStyleTag({ url:"http://127.0.0.1:3000/sidebar-compact-brand.css?v=2.2.0-talaan2" });
  await page.addStyleTag({ url:"http://127.0.0.1:3000/ui-radius.css?v=2.5.0-talaan4" });
  await page.addStyleTag({ url:"http://127.0.0.1:3000/assets/css/ui-icon-alignment.css?v=2.5.0-talaan1" });
}

test("desktop sidebar collapses to 60px and expands to 185px with the approved Talaan specification", async ({ page }) => {
  await page.setViewportSize({ width:1280, height:800 });
  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });
  await installSidebarFixture(page);

  const sidebar = page.locator("#sidebar");
  const main = page.locator(".main");
  const brand = page.locator(".brand");
  const brandLogo = brand.locator(".talaan-brand-logo");
  const brandText = brand.locator("strong");
  const firstButton = page.locator(".nav-button").first();
  const firstLabel = page.locator(".nav-label").first();
  const active = page.locator(".nav-button.active");
  const activeLabel = active.locator(".nav-label");
  const activeIcon = active.locator(".nav-icon");
  const activeIconImage = active.locator(".nav-icon-image");

  await expect(sidebar).toHaveCSS("width", "60px");
  await expect(sidebar).toHaveCSS("padding-left", "6px");
  await expect(sidebar).toHaveCSS("padding-right", "6px");
  await expect(sidebar).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(main).toHaveCSS("margin-left", "60px");

  await expect(brand).toBeVisible();
  await expect(brandLogo).toBeVisible();
  await expect(brandLogo).toHaveCSS("width", "25px");
  await expect(brandLogo).toHaveCSS("height", "25px");
  await expect(brandText).toBeHidden();

  await expect(firstButton).toHaveCSS("width", "48px");
  await expect(firstButton).toHaveCSS("min-height", "44px");
  await expect(firstLabel).toHaveCSS("max-width", "0px");
  await expect(firstLabel).toHaveCSS("opacity", "0");
  await expect(page.locator(".insights-nav-button")).toBeVisible();
  await expect(activeIcon).toHaveCSS("width", "28px");
  await expect(activeIcon).toHaveCSS("height", "28px");
  await expect(activeIconImage).toHaveCSS("width", "16px");
  await expect(activeIconImage).toHaveCSS("height", "16px");
  await expect(active).toHaveCSS("background-color", "rgba(53, 111, 209, 0.18)");
  await expect(active).toHaveCSS("border-radius", "12px");
  await expect(active).toHaveCSS("color", "rgb(24, 34, 48)");
  await expect(activeIcon).toHaveCSS("background-color", "rgb(53, 111, 209)");

  const collapsedTooltip = await active.evaluate(node => {
    const style = getComputedStyle(node, "::after");
    return {
      content:style.content,
      fontSize:style.fontSize,
      fontWeight:style.fontWeight,
      backgroundColor:style.backgroundColor,
      color:style.color,
      paddingTop:style.paddingTop,
      paddingRight:style.paddingRight,
      borderRadius:style.borderRadius
    };
  });
  expect(collapsedTooltip).toEqual({
    content:'"Finance"',
    fontSize:"13px",
    fontWeight:"700",
    backgroundColor:"rgb(31, 41, 55)",
    color:"rgb(24, 34, 48)",
    paddingTop:"7px",
    paddingRight:"10px",
    borderRadius:"12px"
  });

  await active.hover();
  await expect.poll(() => active.evaluate(node => getComputedStyle(node, "::after").opacity)).toBe("1");
  await active.focus();
  await expect.poll(() => active.evaluate(node => getComputedStyle(node, "::after").opacity)).toBe("1");

  await page.evaluate(() => document.getElementById("sidebar").classList.add("desktop-open"));
  await expect(sidebar).toHaveCSS("width", "185px");
  await expect(sidebar).toHaveCSS("padding-left", "8px");
  await expect(sidebar).toHaveCSS("padding-right", "8px");
  await expect(sidebar).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(main).toHaveCSS("margin-left", "60px");

  await expect(brand).toBeVisible();
  await expect(brand).toHaveCSS("gap", "6px");
  await expect(brandText).toBeVisible();
  await expect(brandText).toHaveText("Talaan");
  await expect(brandText).toHaveCSS("font-size", "25px");
  await expect(brandText).toHaveCSS("font-weight", "700");
  await expect(brandText).toHaveCSS("color", "rgb(24, 34, 48)");
  await expect(brandLogo).toBeVisible();
  await expect(brandLogo).toHaveCSS("width", "25px");
  await expect(brandLogo).toHaveCSS("height", "25px");
  await expect.poll(() => brandLogo.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);

  await expect(firstLabel).toHaveCSS("opacity", "1");
  await expect(firstLabel).toHaveCSS("font-size", "12px");
  await expect(firstLabel).toHaveCSS("font-weight", "700");
  await expect(firstLabel).toHaveCSS("color", "rgb(102, 112, 133)");
  await expect(activeLabel).toHaveCSS("color", "rgb(24, 34, 48)");
  await expect(active).toHaveCSS("background-color", "rgba(53, 111, 209, 0.18)");
  await expect(activeIcon).toHaveCSS("background-color", "rgb(53, 111, 209)");
  expect(await active.evaluate(node => getComputedStyle(node, "::after").content)).toBe("none");

  await page.evaluate(() => {
    const rail = document.getElementById("sidebar");
    rail.classList.add("sidebar-pinned");
    document.body.classList.add("sidebar-layout-pinned");
  });
  await expect(sidebar).toHaveCSS("width", "185px");
  await expect(main).toHaveCSS("margin-left", "185px");

  await page.evaluate(() => {
    const rail = document.getElementById("sidebar");
    rail.classList.remove("desktop-open", "sidebar-pinned");
    document.body.classList.remove("sidebar-layout-pinned");
  });
  await expect(sidebar).toHaveCSS("width", "60px");
  await expect(main).toHaveCSS("margin-left", "60px");
  await expect(brand).toBeVisible();
  await expect(brandLogo).toBeVisible();
  await expect(brandText).toBeHidden();
  await expect(firstLabel).toHaveCSS("opacity", "0");
});

test("mobile drawer keeps a roomy 320px shell, 48px rows, and the real Talaan brand", async ({ page, request }) => {
  await page.setViewportSize({ width:390, height:844 });
  const logoResponse = await request.get("http://127.0.0.1:3000/icons/talaan-brand-logo.png?v=2.2.0-talaan2");
  expect(logoResponse.ok()).toBeTruthy();
  expect(logoResponse.headers()["content-type"] || "").toContain("image/png");

  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });
  await installSidebarFixture(page, "open");

  const brand = page.locator(".brand");
  const mark = brand.locator(".talaan-brand-logo");
  const brandText = brand.locator("strong");
  const sidebar = page.locator("#sidebar");
  const firstButton = sidebar.locator(".nav-button").first();
  const firstLabel = firstButton.locator(".nav-label");
  await expect(sidebar).toHaveCSS("width", "320px");
  await expect(brand).toBeVisible();
  await expect(brand).toHaveCSS("gap", "6px");
  await expect(brandText).toHaveText("Talaan");
  await expect(brandText).toHaveCSS("font-size", "25px");
  await expect(brandText).toHaveCSS("font-weight", "700");
  await expect(brandText).toHaveCSS("color", "rgb(24, 34, 48)");
  await expect(mark).toBeVisible();
  await expect(mark).toHaveCSS("width", "25px");
  await expect(mark).toHaveCSS("height", "25px");
  await expect(firstButton).toHaveCSS("min-height", "48px");
  await expect(firstButton).toHaveCSS("border-radius", "12px");
  await expect(firstLabel).toHaveCSS("font-size", "12px");
  await expect(firstLabel).toHaveCSS("font-weight", "700");
  await expect.poll(() => mark.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
});

test("runtime preparation renders fresh real brand assets without changing release identity", () => {
  const prepare = fs.readFileSync("scripts/prepare-runtime.mjs", "utf8");
  const updater = fs.readFileSync("assets/js/pwa-update.js", "utf8");
  const index = fs.readFileSync("index.html", "utf8");
  const serviceWorker = fs.readFileSync("sw.js", "utf8");
  expect(prepare).toContain('"sidebar-compact-brand.css"');
  expect(prepare).toContain('const SIDEBAR_BRAND_ASSET_QUERY = "2.2.0-talaan2";');
  expect(prepare).toContain('class="talaan-brand-logo"');
  expect(prepare).toContain('src="./icons/talaan-brand-logo.png?v=${SIDEBAR_BRAND_ASSET_QUERY}"');
  expect(prepare).toContain('sidebar-compact-brand.css?v=${SIDEBAR_BRAND_ASSET_QUERY}');
  expect(index).toContain('sidebar-compact-brand.css?v=2.2.0-talaan2');
  expect(index).toContain('talaan-brand-logo.png?v=2.2.0-talaan2');
  expect(serviceWorker).toContain('url.pathname.endsWith("sidebar-compact-brand.css") ||');
  expect(updater).not.toContain("document");
  expect(updater).toContain('const CURRENT_CACHE_VERSION = "finance-v2-20260828-household-splits-r17"');
  expect(updater).toContain('const UI_HOTFIX_REFRESH_KEY = "finance-ui-hotfix-v2-0-1-talaan7"');
  expect(updater).toContain('"/sidebar-compact-brand.css"');
  expect(updater).toContain('"/talaan-brand-logo.png"');
});
