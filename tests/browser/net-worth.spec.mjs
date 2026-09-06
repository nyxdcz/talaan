import { expect, test } from "@playwright/test";
/* global data */

test.use({ serviceWorkers:"block" });
const app = "http://127.0.0.1:3000/index.html?page=reports";

async function openNetWorth(page, viewport = { width:1366, height:900 }) {
  await page.setViewportSize(viewport);
  await page.goto(app, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinanceNetWorth && window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => {
    window.FinancePrivacyLock.setAuthenticated(true);
    window.FinanceNetWorth.open();
  });
  await expect(page.locator("#netWorthWorkspace")).toBeVisible();
}

async function addItem(page, { type, name, category, currency = "PHP", amount, rate = "1" }) {
  await page.locator(`[data-add-net-worth="${type}"]`).click();
  await expect(page.locator("#netWorthItemDialog")).toBeVisible();
  await page.locator("#netWorthItemName").fill(name);
  await page.locator("#netWorthItemCategory").fill(category);
  await page.locator("#netWorthItemCurrency").fill(currency);
  await page.locator("#netWorthInitialDate").fill("2026-08-27");
  await page.locator("#netWorthInitialAmount").fill(String(amount));
  if (currency !== "PHP") await page.locator("#netWorthInitialRate").fill(String(rate));
  await page.locator("#netWorthItemForm button[type=submit]").click();
  await expect(page.locator("#netWorthItemDialog")).toBeHidden();
}

test("manual assets and liabilities never mutate accounts or Account Ledger", async ({ page }) => {
  await openNetWorth(page);
  const before = await page.evaluate(() => ({ accounts:JSON.stringify(data.accounts), ledger:JSON.stringify(data.accountLedger || []), income:JSON.stringify(data.incomeRecords || []), expenses:JSON.stringify(data.expenses || []) }));
  await addItem(page, { type:"asset", name:"Family home", category:"Property", amount:4000000 });
  await addItem(page, { type:"liability", name:"Mortgage", category:"Housing debt", amount:1800000 });
  await addItem(page, { type:"asset", name:"USD fund", category:"Investments", currency:"USD", amount:1000, rate:58.25 });

  await expect(page.locator("#netWorthAssetsTotal")).toContainText("4,058,250.00");
  await expect(page.locator("#netWorthLiabilitiesTotal")).toContainText("1,800,000.00");
  await expect(page.locator("#netWorthTotal")).toContainText("2,258,250.00");
  await expect(page.locator("[data-net-worth-item-card]")).toHaveCount(3);
  await expect(page.locator("[data-net-worth-item-card]").filter({ hasText:"USD fund" })).toContainText("Converted");

  const after = await page.evaluate(() => ({ accounts:JSON.stringify(data.accounts), ledger:JSON.stringify(data.accountLedger || []), income:JSON.stringify(data.incomeRecords || []), expenses:JSON.stringify(data.expenses || []), store:data.ledgerSettings.netWorth }));
  expect(after.accounts).toBe(before.accounts);
  expect(after.ledger).toBe(before.ledger);
  expect(after.income).toBe(before.income);
  expect(after.expenses).toBe(before.expenses);
  expect(after.store.items).toHaveLength(3);
  expect(after.store.items.find(item => item.name === "USD fund").valuations[0].amountPhp).toBe(58250);
});

test("net worth remains compact and contained on a phone", async ({ page }) => {
  await openNetWorth(page, { width:390, height:844 });
  const geometry = await page.evaluate(() => ({
    overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    short:[...document.querySelectorAll("#netWorthWorkspace button, #netWorthWorkspace .button")].filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.height < 34.5 || rect.height > 35.5);
    }).map(node => ({ text:node.textContent.trim(), width:node.getBoundingClientRect().width, height:node.getBoundingClientRect().height }))
  }));
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.short).toEqual([]);
  await page.locator('[data-add-net-worth="asset"]').click();
  const dialogOverflow = await page.locator("#netWorthItemDialog").evaluate(dialog => dialog.scrollWidth - dialog.clientWidth);
  expect(dialogOverflow).toBeLessThanOrEqual(1);
});
