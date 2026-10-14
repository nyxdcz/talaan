import { expect, test } from "@playwright/test";

test.use({ serviceWorkers:"block", isMobile:true, hasTouch:true, deviceScaleFactor:3 });
const routes = ["money","income","paid-expenses","dashboard","projects","payments","reports","settings"];

async function open(page, route, width, height, theme) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(new Date("2026-10-14T04:00:00Z"));
  await page.addInitScript(value => {
    window.FINANCE_SYNC_CONFIG = { supabaseUrl:"", supabasePublishableKey:"" };
    localStorage.setItem("simple-finance-theme-v1", value);
  }, theme);
  await page.goto(`http://127.0.0.1:3000/?page=${route}`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => window.FinancePrivacyLock && !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator(`#${route}.active`)).toBeVisible();
}

async function readableCopy(root) {
  return root.evaluate(node => [...node.querySelectorAll("p,small,label")]
    .filter(n => n.checkVisibility() && n.getBoundingClientRect().width > 1 && !n.closest(".sr-only,.filter-label-visually-hidden") && (!n.closest("details:not([open])") || n.closest("summary")))
    .map(n => ({ label:n.id || n.className || n.tagName, size:parseFloat(getComputedStyle(n).fontSize) })));
}

for (const theme of ["light","dark"]) {
  for (const height of [660,852]) {
    test(`compact phone scale stays readable across screens and forms at 393x${height} in ${theme}`, async ({ page }) => {
      test.setTimeout(90000);
      for (const route of routes) {
        await open(page, route, 393, height, theme);
        const root = page.locator(`#${route}`);
        for (const text of await readableCopy(root)) expect(text.size, text.label).toBeGreaterThanOrEqual(12);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
        for (const button of await root.locator(".workspace-switcher-button:visible,.button:visible").all()) {
          const css = await button.evaluate(n => ({ size:parseFloat(getComputedStyle(n).fontSize), height:n.getBoundingClientRect().height, width:n.getBoundingClientRect().width, clipped:getComputedStyle(n).clipPath.includes("50%") }));
          if (css.clipped || css.width < 2 || css.height < 2 || await button.locator(".phone-only-action-icon").count()) continue;
          expect(css.size, `${route}: ${await button.getAttribute("id") || await button.textContent()}`).toBe(13);
          expect(css.height).toBeGreaterThanOrEqual(44);
        }
        if (route === "money") {
          await expect(page.locator("#moneyRemainingValue")).toHaveCSS("font-size","28px");
          await expect(page.locator("#moneyOutstandingValue")).toHaveCSS("font-size","18px");
          await expect(page.locator("#moneyPrioritySummary")).toHaveCSS("border-radius","12px");
          await expect(page.locator("#addExpenseButton")).toHaveCSS("border-radius","10px");
          const available = page.locator("#availableMoneySection .collapse-toggle");
          if (await available.getAttribute("aria-expanded") === "false") await available.click();
          for (const [button,dialog] of [["#addExpenseButton","#expenseDialog"],["#addAccountButton","#accountDialog"]]) {
            await page.locator(button).click();
            const modal = page.locator(dialog);await expect(modal).toBeVisible();
            await modal.evaluate(n => Promise.all(n.getAnimations().map(a => a.finished)));
            await expect(modal).toHaveCSS("border-radius","16px");
            for (const text of await readableCopy(modal)) expect(text.size, text.label).toBeGreaterThanOrEqual(12);
            for (const input of await modal.locator("input.input:visible,select:visible,textarea:visible").all()) await expect(input).toHaveCSS("font-size","16px");
            const icon = modal.locator(".record-icon-preview").first();
            const box = await icon.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
            await page.keyboard.press("Escape");
          }
        }
        if (route === "income") {
          await page.locator("#addIncomeButton").click();
          const modal = page.locator("#incomeDialog");await expect(modal).toBeVisible();
          for (const text of await readableCopy(modal)) expect(text.size,text.label).toBeGreaterThanOrEqual(12);
          await expect(page.locator("#incomeName")).toHaveCSS("font-size","16px");
          expect((await page.locator("#incomeIconPreview").boundingBox()).width).toBeGreaterThanOrEqual(44);
          await page.keyboard.press("Escape");
        }
        if (route === "dashboard") {
          await page.locator("#dashboardViewTabCashFlow").click();
          await page.locator("#addSavingsGoalButton").click();
          const modal = page.locator("#savingsGoalDialog");await expect(modal).toBeVisible();
          for (const text of await readableCopy(modal)) expect(text.size,text.label).toBeGreaterThanOrEqual(12);
          expect((await page.locator("#savingsGoalIconPreview").boundingBox()).width).toBeGreaterThanOrEqual(44);
          await page.keyboard.press("Escape");
        }
      }
    });
  }

  test(`landscape touch controls keep phone tap areas through rotation in ${theme}`, async ({ page }) => {
    await open(page,"money",393,852,theme);
    const available = page.locator("#availableMoneySection .collapse-toggle");
    if (await available.getAttribute("aria-expanded") === "false") await available.click();
    await page.setViewportSize({ width:852,height:393 });
    expect(await page.evaluate(() => matchMedia("(pointer:coarse)").matches)).toBe(true);
    for (const selector of ["#addAccountButton","#availableMoneySection .collapse-toggle","#firstHalfSection .collapse-toggle","#firstHalfSection .section-help-button","#money .account-card-actions .button"]) {
      for (const button of await page.locator(selector).all()) {
        const box = await button.boundingBox();expect(box.width,selector).toBeGreaterThanOrEqual(44);expect(box.height,selector).toBeGreaterThanOrEqual(44);
      }
    }
    for (let state = 0; state < 2; state++) {
      const toolbar = await page.locator(".topbar").evaluate(node => {
        const root = node.getBoundingClientRect();
        const buttons = [...node.querySelectorAll("button")].filter(n => n.checkVisibility() && n.getBoundingClientRect().width > 2 && !n.closest("[hidden]"));
        const boxes = buttons.map(n => n.getBoundingClientRect());
        return {
          contained:boxes.every(r => r.left >= root.left && r.right <= root.right && r.top >= root.top && r.bottom <= root.bottom),
          overlaps:boxes.some((r,i) => boxes.slice(i + 1).some(b => Math.min(r.right,b.right) - Math.max(r.left,b.left) > 1 && Math.min(r.bottom,b.bottom) - Math.max(r.top,b.top) > 1)),
          escapedIcons:buttons.filter(b => [...b.querySelectorAll("svg")].some(svg => {
            const r = svg.getBoundingClientRect(),box = b.getBoundingClientRect();if (!svg.checkVisibility() || r.width < 2 || r.height < 2) return false;return r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1;
          })).map(n => n.id)
        };
      });
      expect(toolbar.contained).toBe(true);expect(toolbar.overlaps).toBe(false);expect(toolbar.escapedIcons).toEqual([]);
      if (!state) await page.locator("#previousMonthButton").click();
    }
    await expect(page.locator("#addAccountButton")).toHaveCSS("font-size","13px");
    await expect(page.locator("#firstHalfSection h3")).toHaveCSS("font-size","14px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await page.setViewportSize({ width:393,height:852 });
    await expect(page.locator("#moneyRemainingValue")).toHaveCSS("font-size","28px");
    expect((await available.boundingBox()).height).toBe(44);
  });
}

test.describe("fine pointer boundary", () => {
  test.use({ isMobile:false,hasTouch:false,deviceScaleFactor:1 });
  for (const width of [1024,1440,1920]) {
    test(`desktop keeps the existing amount and radius contract at ${width}px`, async ({ page }) => {
      await open(page,"money",width,1000,"dark");
      await expect(page.locator("#addAccountButton")).toHaveCSS("border-radius","12px");
      await expect(page.locator("#availableMoneySection")).toHaveCSS("border-radius","14px");
      expect((await page.locator("#availableMoneySection .collapse-toggle").boundingBox()).height).toBe(30);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--phone-action-size").trim())).toBe("");
    });
  }
});
