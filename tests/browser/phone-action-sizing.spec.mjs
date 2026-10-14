import { expect, test } from "../helpers/browser-fixtures.mjs";

test.use({ serviceWorkers:"block" });

for (const theme of ["light","dark"]) {
  test(`account actions retain touch targets with narrow font metrics in ${theme}`, async ({ page }) => {
    await openPage(page, "money", 393, theme);
    const actions = page.locator("#money .account-card").first().locator(".account-card-actions > .button");
    await actions.evaluateAll(buttons => {
      for (const button of buttons) {
        button.style.setProperty("font-family", "Arial, sans-serif", "important");
        button.style.setProperty("font-weight", "400", "important");
        button.style.setProperty("font-size", "12px", "important");
      }
    });
    for (const button of await actions.all()) await expectCenteredContent(button);
    const boxes = await actions.evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()));
    expect(boxes[1].left - boxes[0].right).toBeCloseTo(8, 0);
    expect(Math.abs(boxes[0].y + boxes[0].height / 2 - boxes[1].y - boxes[1].height / 2)).toBeLessThanOrEqual(1);
  });
}

async function openPage(page, route, width, theme) {
  await page.setViewportSize({ width, height:660 });
  await page.addInitScript(value => {
    window.FINANCE_SYNC_CONFIG = { supabaseUrl:"", supabasePublishableKey:"" };
    localStorage.setItem("simple-finance-theme-v1", value);
  }, theme);
  await page.goto(`http://127.0.0.1:3000/?page=${route}`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock) && !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
}

async function expectCenteredContent(button) {
  const metrics = await button.evaluate(node => {
    const box = node.getBoundingClientRect();
    const rects = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (!text.textContent.trim() || !text.parentElement.checkVisibility()) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      rects.push(...range.getClientRects());
    }
    rects.push(...[...node.querySelectorAll("svg")].filter(n => n.checkVisibility()).map(n => n.getBoundingClientRect()));
    const left = Math.min(...rects.map(r => r.left));
    const right = Math.max(...rects.map(r => r.right));
    const top = Math.min(...rects.map(r => r.top));
    const bottom = Math.max(...rects.map(r => r.bottom));
    return {
      width:box.width, height:box.height,
      dx:Math.abs((left + right - box.left - box.right) / 2),
      dy:Math.abs((top + bottom - box.top - box.bottom) / 2),
      contained:left >= box.left + 1 && right <= box.right - 1 && top >= box.top && bottom <= box.bottom
    };
  });
  expect(metrics.width).toBeGreaterThanOrEqual(44);
  expect(metrics.height).toBeGreaterThanOrEqual(44);
  expect(metrics.contained).toBe(true);
  expect(metrics.dx).toBeLessThanOrEqual(2);
  expect(metrics.dy).toBeLessThanOrEqual(3);
}

for (const width of [375,393,430]) {
  for (const theme of ["light","dark"]) {
    test(`Planning labels fit and action content stays centered at ${width}px in ${theme}`, async ({ page }) => {
      await openPage(page, "income", width, theme);
      for (const id of ["buildBudgetFromExpenses","copyPreviousBudget","addBudgetItem"]) {
        await expectCenteredContent(page.locator(`#${id}`));
      }
      const more = page.locator(".budget-planner-more-menu > button");
      await expectCenteredContent(more);
      const category = await page.locator("#addBudgetItem").boundingBox();
      const trigger = await more.boundingBox();
      expect(Math.abs(category.y + category.height / 2 - trigger.y - trigger.height / 2)).toBeLessThanOrEqual(1);
      expect(trigger.x - category.x - category.width).toBeCloseTo(8, 0);
      await more.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#budgetPlannerMorePanel")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#budgetPlannerMorePanel")).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    });

    test(`Expense and account actions have compact centered content at ${width}px in ${theme}`, async ({ page }) => {
      await openPage(page, "money", width, theme);
      const row = page.locator("#money .record-row[data-expense-row]").first();
      const paid = row.locator(".mobile-record-actions > .button");
      await expectCenteredContent(paid);
      const actions = await row.locator(".mobile-record-actions").boundingBox();
      const trigger = row.locator(".mobile-record-actions > .record-more-menu > button");
      await trigger.focus();
      await expectCenteredContent(trigger);
      const geometry = await row.evaluate(node => ({
        paid:node.querySelector(".mobile-record-actions > .button").getBoundingClientRect().toJSON(),
        more:node.querySelector(".mobile-record-actions .overflow-menu-trigger").getBoundingClientRect().toJSON()
      }));
      const button = geometry.paid;
      const more = geometry.more;
      expect(button.width).toBeLessThan(actions.width / 2);
      expect(more.x - button.x - button.width).toBeCloseTo(8, 0);
      expect(Math.abs(button.y + button.height / 2 - more.y - more.height / 2)).toBeLessThanOrEqual(1);
      for (const control of await page.locator("#money .account-card").first().locator(".account-card-actions > .button").all()) {
        await expectCenteredContent(control);
      }
      await paid.click();
      await expect(page.locator("#expensePaymentDialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.locator("#addExpenseButton").click();
      const dialog = page.locator("#expenseDialog");
      await dialog.evaluate(node => Promise.all(node.getAnimations().map(a => a.finished)));
      await expect(page.locator("#deleteExpenseFromDialog")).toBeHidden();
      await expect(page.locator("#duplicateExpenseFromDialog")).toBeHidden();
      for (const control of await dialog.locator(".expense-dialog-footer > .button:visible").all()) {
        await expectCenteredContent(control);
        const box = await control.boundingBox();
        expect(box.y + box.height).toBeLessThanOrEqual(660);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    });
  }
}
