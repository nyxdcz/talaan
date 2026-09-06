import { test, expect } from "@playwright/test";

test.use({ serviceWorkers:"block" });

async function installFixture(page, { mobile = false } = {}) {
  await page.evaluate(({ mobile }) => {
    document.documentElement.dataset.theme = "light";
    document.body.className = "";
    document.body.innerHTML = `
      <div class="app">
        <aside class="sidebar ${mobile ? "open" : "desktop-open"}" id="sidebar">
          <button class="sidebar-close-button" type="button" aria-label="Pin navigation open"></button>
          <div class="brand">
            <img class="talaan-brand-logo" src="./icons/talaan-brand-logo.png?v=2.2.0-talaan2" alt="" aria-hidden="true">
            <strong>Talaan</strong>
          </div>
          <nav class="sidebar-navigation">
            <button class="nav-button" data-nav-label="Overview">
              <span class="nav-icon"><span class="nav-icon-image"></span></span>
              <span class="nav-label">Overview</span>
            </button>
            <button class="nav-button active" data-nav-label="Finance">
              <span class="nav-icon"><span class="nav-icon-image"></span></span>
              <span class="nav-label">Finance</span>
            </button>
          </nav>
        </aside>
        <main class="main">Workspace</main>
      </div>`;
  }, { mobile });

  await page.addStyleTag({ url:"http://127.0.0.1:3000/app.css?v=2.2.0-talaan1" });
  await page.addStyleTag({ url:"http://127.0.0.1:3000/shell-ui.css?v=2.2.0-talaan1" });
  await page.addStyleTag({ url:"http://127.0.0.1:3000/sidebar-compact-brand.css?v=2.2.0-talaan2" });
  await page.addStyleTag({ url:"http://127.0.0.1:3000/ui-radius.css?v=2.5.0-talaan4" });
  await page.addStyleTag({ url:"http://127.0.0.1:3000/assets/css/ui-icon-alignment.css?v=2.2.0-talaan1" });
  await page.addStyleTag({ url:"http://127.0.0.1:3000/liquid-glass.css?v=2.2.0-talaan1" });
}

test("desktop sidebar stays flat white in light mode and flat #080B10 in dark mode", async ({ page }) => {
  await page.setViewportSize({ width:1280, height:800 });
  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });
  await installFixture(page);

  const sidebar = page.locator("#sidebar");
  const brandText = sidebar.locator(".brand strong");
  const normalButton = sidebar.locator(".nav-button").first();
  const normalIcon = normalButton.locator(".nav-icon");
  const normalIconImage = normalButton.locator(".nav-icon-image");
  const normalLabel = normalButton.locator(".nav-label");
  const active = sidebar.locator(".nav-button.active");
  const activeIcon = active.locator(".nav-icon");
  const activeIconImage = active.locator(".nav-icon-image");
  const activeLabel = active.locator(".nav-label");

  await expect(sidebar).toHaveCSS("width", "185px");
  await expect(sidebar).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(sidebar).toHaveCSS("background-image", "none");
  await expect(sidebar).toHaveCSS("color", "rgb(24, 34, 48)");
  await expect(sidebar).toHaveCSS("box-shadow", "none");
  await expect(sidebar).toHaveCSS("backdrop-filter", "none");

  await expect(brandText).toHaveCSS("font-size", "20px");
  await expect(brandText).toHaveCSS("font-weight", "700");
  await expect(brandText).toHaveCSS("color", "rgb(24, 34, 48)");

  await expect(normalButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(normalButton).toHaveCSS("color", "rgb(24, 34, 48)");
  await expect(normalIcon).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(normalIconImage).toHaveCSS("filter", "brightness(0) saturate(1)");
  await expect(normalLabel).toHaveCSS("font-size", "12px");
  await expect(normalLabel).toHaveCSS("font-weight", "700");
  await expect(normalLabel).toHaveCSS("color", "rgb(24, 34, 48)");

  await expect(active).toHaveCSS("background-color", "rgba(53, 111, 209, 0.12)");
  await expect(active).toHaveCSS("border-radius", "12px");
  await expect(activeLabel).toHaveCSS("color", "rgb(24, 34, 48)");
  await expect(activeIcon).toHaveCSS("background-color", "rgb(53, 111, 209)");
  await expect(activeIconImage).toHaveCSS("filter", "brightness(0) invert(1)");

  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await expect(sidebar).toHaveCSS("background-color", "rgb(8, 11, 16)");
  await expect(sidebar).toHaveCSS("background-image", "none");
  await expect(sidebar).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(sidebar).toHaveCSS("box-shadow", "none");
  await expect(sidebar).toHaveCSS("backdrop-filter", "none");
  await expect(brandText).toHaveCSS("font-size", "20px");
  await expect(brandText).toHaveCSS("font-weight", "700");
  await expect(brandText).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(normalLabel).toHaveCSS("font-size", "12px");
  await expect(normalLabel).toHaveCSS("font-weight", "700");
  await expect(normalLabel).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(normalIconImage).toHaveCSS("filter", "brightness(0) invert(1)");
  await expect(activeLabel).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(active).toHaveCSS("background-color", "rgba(53, 111, 209, 0.22)");
  await expect(activeIcon).toHaveCSS("background-color", "rgb(53, 111, 209)");

  await page.evaluate(() => document.getElementById("sidebar").classList.remove("desktop-open"));
  await expect(sidebar).toHaveCSS("width", "60px");
  await expect(sidebar).toHaveCSS("background-color", "rgb(8, 11, 16)");
  await expect(sidebar.locator(".talaan-brand-logo")).toBeVisible();
  await expect(brandText).toBeHidden();
});

test("mobile light sidebar stays flat white with a 320px drawer and readable labels", async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });
  await installFixture(page, { mobile:true });

  const sidebar = page.locator("#sidebar");
  const brandText = sidebar.locator(".brand strong");
  const normalLabel = sidebar.locator(".nav-label").first();
  const normalIconImage = sidebar.locator(".nav-icon-image").first();
  const activeIcon = sidebar.locator(".nav-button.active .nav-icon");

  await expect(sidebar).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(sidebar).toHaveCSS("width", "320px");
  await expect(sidebar).toHaveCSS("background-image", "none");
  await expect(sidebar).toHaveCSS("box-shadow", "none");
  await expect(sidebar).toHaveCSS("backdrop-filter", "none");
  await expect(brandText).toHaveCSS("font-size", "20px");
  await expect(brandText).toHaveCSS("font-weight", "700");
  await expect(brandText).toHaveCSS("color", "rgb(24, 34, 48)");
  await expect(normalLabel).toHaveCSS("font-size", "12px");
  await expect(normalLabel).toHaveCSS("font-weight", "700");
  await expect(normalLabel).toHaveCSS("color", "rgb(24, 34, 48)");
  await expect(normalIconImage).toHaveCSS("filter", "brightness(0) saturate(1)");
  await expect(activeIcon).toHaveCSS("background-color", "rgb(53, 111, 209)");
});
