import { test, expect } from "../helpers/browser-fixtures.mjs";

async function loadQuickAddRelocation(page, width = 1280) {
  await page.setViewportSize({ width, height:900 });
  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });
  await page.evaluate(() => {
    window.__quickAddCalls = 0;
    window.FinanceProductivityTools = {
      openQuickAdd() { window.__quickAddCalls += 1; }
    };
    document.body.innerHTML = `
      <header class="topbar">
        <div class="topbar-actions">
          <button id="mobileAddExpenseButton" type="button" aria-label="Quick add">Grid add</button>
          <div class="topbar-tools-menu" id="topbarToolsMenu">
            <button class="topbar-tools-trigger" id="topbarToolsTrigger" type="button" aria-controls="topbarToolsPanel" aria-expanded="false">More</button>
            <div class="topbar-tools-panel" id="topbarToolsPanel" role="menu">
              <button class="topbar-tools-item" id="themeToggleButton" type="button" role="menuitem">Theme</button>
              <button class="topbar-tools-item" id="globalSearchButton" type="button" role="menuitem">Search</button>
              <button class="topbar-tools-item" id="productivityCenterButton" type="button" role="menuitem">Quick actions</button>
            </div>
          </div>
        </div>
      </header>`;
  });
  await page.addScriptTag({ url:"http://127.0.0.1:3000/header-tools-compat.js?v=quick-add-menu-test" });
  await expect(page.locator("#quickEntryMenuButton")).toHaveCount(1);
}

test("moves Quick add immediately after Theme and hides the standalone topbar control", async ({ page }) => {
  await loadQuickAddRelocation(page);

  const quickAdd = page.locator("#quickEntryMenuButton");
  await expect(quickAdd).toHaveAttribute("role", "menuitem");
  await expect(quickAdd).toHaveAttribute("aria-label", "Quick add");
  await expect(quickAdd.locator("strong")).toHaveText("Quick add");
  expect(await page.evaluate(() => document.getElementById("themeToggleButton")?.nextElementSibling?.id)).toBe("quickEntryMenuButton");

  const standalone = page.locator("#mobileAddExpenseButton");
  await expect(standalone).toBeHidden();
  await expect(standalone).toHaveAttribute("aria-hidden", "true");
  await expect(standalone).toHaveAttribute("tabindex", "-1");

  await quickAdd.click({ force:true });
  await expect.poll(() => page.evaluate(() => window.__quickAddCalls)).toBe(1);
});

test("keeps the relocated Quick add available on phone and re-hides a recreated standalone control", async ({ page }) => {
  await loadQuickAddRelocation(page, 390);

  await expect(page.locator("#quickEntryMenuButton")).toHaveCount(1);
  await page.evaluate(() => {
    document.getElementById("mobileAddExpenseButton")?.remove();
    const replacement = document.createElement("button");
    replacement.id = "mobileAddExpenseButton";
    replacement.type = "button";
    replacement.textContent = "Grid add again";
    document.querySelector(".topbar-actions")?.prepend(replacement);
  });

  const replacement = page.locator("#mobileAddExpenseButton");
  await expect(replacement).toBeHidden();
  await expect(replacement).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#quickEntryMenuButton")).toHaveCount(1);
});