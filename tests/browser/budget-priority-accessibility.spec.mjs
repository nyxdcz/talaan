import { expect, test } from "../helpers/browser-fixtures.mjs";
/* global data, groupedExpenses, budgetExpenseItems, sumExpenseAmounts, money, availableMoney, renderMoneyPage */

test.use({ serviceWorkers:"block" });

async function openBudget(page, width, theme = "light") {
  await page.setViewportSize({ width, height:1000 });
  await page.clock.setFixedTime(new Date("2026-10-12T04:00:00Z"));
  await page.addInitScript(value => localStorage.setItem("simple-finance-theme-v1", value), theme);
  await page.goto("http://127.0.0.1:3000/?page=money", { waitUntil:"networkidle" });
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("#money.active")).toBeVisible();
}

for (const width of [320,375,768,1024,1440,1920]) {
  for (const theme of ["light","dark"]) {
    test(`priority budget remains readable and calculated from existing totals at ${width}px in ${theme}`, async ({ page }) => {
      await openBudget(page,width,theme);
      const before = await page.evaluate(() => JSON.stringify(data));
      const phone = width <= 850;
      await expect(page.locator("#moneyPrioritySummary")).toBeVisible({ visible:phone });
      await expect(page.locator("#moneyBudgetBreakdown")).toHaveJSProperty("open",!phone);
      const totals = await page.evaluate(() => {
        const groups = groupedExpenses(budgetExpenseItems().filter(item => !item.paid));
        const outstanding = sumExpenseAmounts(groups.early) + sumExpenseAmounts(groups.late) + sumExpenseAmounts(groups.other);
        return { outstanding:money(outstanding),remaining:money(availableMoney() - outstanding) };
      });
      await expect(page.locator("#moneyRemainingValue")).toHaveText(totals.remaining);
      await expect(page.locator("#moneyOutstandingValue")).toHaveText(totals.outstanding);
      if (phone) {
        await expect(page.locator("#moneyRemainingValue")).toHaveCSS("font-size",width <= 700 ? "28px" : "32px");
        await expect(page.locator("#moneyPrioritySummary")).toHaveCSS("border-radius",width <= 700 ? "12px" : "14px");
        await page.locator("#moneyBudgetBreakdown > summary").click();
        await expect(page.locator("#legendEarlyTotal")).toBeVisible();
        await page.locator("#moneyBudgetBreakdown > summary").click();
      }
      const geometry = await page.evaluate(() => {
        const date = document.querySelector(".month-display-value").getBoundingClientRect();
        const button = document.querySelector("#monthDisplayButton").getBoundingClientRect();
        return { overflow:document.documentElement.scrollWidth > innerWidth + 1, dateContained:date.left >= button.left && date.right <= button.right, headerContained:document.querySelector(".topbar").getBoundingClientRect().right <= innerWidth + 1 };
      });
      expect(geometry).toEqual({ overflow:false,dateContained:true,headerContained:true });
      expect(await page.evaluate(() => JSON.stringify(data))).toBe(before);
    });
  }
}

test("closed phone navigation skips hidden buttons, traps open focus, and restores the trigger", async ({ page }) => {
  await openBudget(page,375);
  await expect(page.locator("#sidebar")).toHaveJSProperty("inert",true);
  await page.locator("#menuButton").focus();
  await page.keyboard.press("Tab");
  expect(await page.locator("#sidebar").evaluate(node => node.contains(document.activeElement))).toBe(false);
  await page.locator("#menuButton").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#sidebar")).toHaveJSProperty("inert",false);
  await expect.poll(() => page.locator("#sidebar").evaluate(node => node.contains(document.activeElement))).toBe(true);
  for (let i=0;i<9;i++) {
    await page.keyboard.press("Tab");
    expect(await page.locator("#sidebar").evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("#sidebar")).toHaveJSProperty("inert",true);
  await expect(page.locator("#menuButton")).toBeFocused();
  await page.setViewportSize({ width:1440,height:1000 });
  await expect(page.locator("#sidebar")).toHaveJSProperty("inert",false);
});

test("phone primary actions have 44px targets and account totals remain readable with long amounts", async ({ page }) => {
  await openBudget(page,320);
  for (const selector of ["#menuButton","#previousMonthButton","#nextMonthButton","#topbarToolsTrigger","#addAccountButton","#addExpenseButton",".mobile-record-actions [data-mark-paid]"]) {
    const sizes = await page.locator(selector).evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().width).map(n => { const r=n.getBoundingClientRect();return { width:r.width,height:r.height }; }));
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) { expect(size.width).toBeGreaterThanOrEqual(44);expect(size.height).toBeGreaterThanOrEqual(44); }
  }
  await page.evaluate(() => { data.accounts.Cash=123456789;renderMoneyPage(); });
  const clipping = await page.locator("#moneyAvailableTotal").evaluate(node => node.scrollWidth > node.clientWidth + 1);
  expect(clipping).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test("display privacy masks the priority totals without changing stored finances", async ({ page }) => {
  await openBudget(page,375);
  const before = await page.evaluate(() => JSON.stringify(data));
  await page.evaluate(() => window.FinancePrivacyDisplay.setHidden(true));
  await expect(page.locator("#moneyRemainingValue")).not.toContainText(/\d/);
  await expect(page.locator("#moneyOutstandingValue")).not.toContainText(/\d/);
  await expect(page.locator("#moneyRemainingValue .privacy-value-mask")).toHaveAttribute("aria-label",/hidden/i);
  expect(await page.evaluate(() => JSON.stringify(data))).toBe(before);
});
