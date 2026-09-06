import { expect, test } from "@playwright/test";
import path from "node:path";
/* global data */

test.use({ serviceWorkers:"block" });
const app = "http://127.0.0.1:3000/index.html?page=settings&settings=finance-tools";
const fixture = path.resolve("tests/fixtures/import/philippine-debit-credit.csv");

async function openImportCenter(page, viewport = { width:1366, height:900 }) {
  await page.setViewportSize(viewport);
  await page.goto(app, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinanceImportCenter && window.FinancePayeeRules && window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => {
    window.FinancePrivacyLock.setAuthenticated(true);
    window.FinanceImportCenter.open();
  });
  await expect(page.locator("#settings-panel-finance-tools")).toBeVisible();
  await expect(page.locator("#financeImportCenter")).toBeVisible();
}

test("local CSV preview commits once, blocks duplicates, and rolls back without balance changes", async ({ page }) => {
  await openImportCenter(page);
  const before = await page.evaluate(() => ({ accounts:JSON.stringify(data.accounts), ledger:JSON.stringify(data.accountLedger || []), expenses:data.expenses.length, income:data.incomeRecords.length }));
  await page.evaluate(() => {
    data.ledgerSettings.financeTools = window.FinancePayeeRules.normalizeTools({ payees:[], transactionRules:[{
      id:"rule-import-groceries", name:"Tag imported groceries", enabled:true, priority:10,
      match:{ mode:"all", conditions:[{ field:"description", operator:"contains", value:"SM Supermarket" }] },
      actions:{ tags:["Imported grocery"] }, continue:false,
      createdAt:"2026-08-26T00:00:00.000Z", updatedAt:"2026-08-26T00:00:00.000Z"
    }] });
  });

  await page.locator("[data-import-csv]").setInputFiles(fixture);
  await expect(page.locator("#importCenterDialog")).toBeVisible();
  await expect(page.locator("#importCenterFileSummary")).toContainText("parsed locally");
  await page.locator("[data-preview-import]").click();
  await expect(page.locator("#importPreviewSection")).toContainText("3 ready");
  await expect(page.locator("#importPreviewSection")).toContainText("₱50,000.00");
  await expect(page.locator("#importPreviewSection")).toContainText("₱1,250.50");
  await expect(page.locator(".import-preview-row")).toHaveCount(3);
  await expect(page.locator(".import-rule-suggestions")).toContainText("Tag imported groceries: Tags · None → Imported grocery");

  await page.locator("#commitCsvImport").click();
  await expect(page.locator("#expenseActionConfirmDialog")).toBeVisible();
  await page.locator("#expenseActionConfirmAccept").click();
  await expect(page.locator("#importCenterDialog")).toBeHidden();
  await expect(page.locator("#financeImportCenter")).toContainText("3 CSV records");

  const committed = await page.evaluate(() => ({
    accounts:JSON.stringify(data.accounts), ledger:JSON.stringify(data.accountLedger || []),
    batch:data.ledgerSettings.importCenter.batches[0],
    expenses:data.expenses.filter(item => item.importSource === "csv"),
    income:data.incomeRecords.filter(item => item.importSource === "csv"),
    localValues:Array.from({ length:localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)))
  }));
  expect(committed.accounts).toBe(before.accounts);
  expect(committed.ledger).toBe(before.ledger);
  expect(committed.batch.rowCount).toBe(3);
  expect(committed.expenses).toHaveLength(2);
  expect(committed.income).toHaveLength(1);
  expect(committed.expenses.every(item => item.paid && !item.accountDeducted && !item.paymentTransactionId)).toBe(true);
  expect(committed.expenses.find(item => item.name === "SM Supermarket")?.tags).toEqual(["Imported grocery"]);
  expect(committed.income.every(item => item.postToLedger === false && !item.ledgerTransactionId)).toBe(true);
  expect(committed.expenses.find(item => item.category === "Internal transfer")?.includeInTotals).toBe(false);
  expect(committed.localValues.join(" ")).not.toContain("philippine-debit-credit.csv");

  await page.locator("[data-import-csv]").setInputFiles(fixture);
  await page.locator("[data-preview-import]").click();
  await expect(page.locator("#importPreviewSection")).toContainText("3");
  await expect(page.locator(".import-preview-row.is-duplicate")).toHaveCount(3);
  await expect(page.locator("#commitCsvImport")).toBeDisabled();
  await page.locator("[data-close-import-center]").first().click();

  await page.locator("[data-rollback-import]").click();
  await expect(page.locator("#expenseActionConfirmDialog")).toBeVisible();
  await page.locator("#expenseActionConfirmAccept").click();
  await expect(page.locator("#financeImportCenter")).toContainText("Rolled back");
  const rolledBack = await page.evaluate(() => ({ accounts:JSON.stringify(data.accounts), ledger:JSON.stringify(data.accountLedger || []), expenses:data.expenses.length, income:data.incomeRecords.length, batch:data.ledgerSettings.importCenter.batches[0] }));
  expect(rolledBack.accounts).toBe(before.accounts);
  expect(rolledBack.ledger).toBe(before.ledger);
  expect(rolledBack.expenses).toBe(before.expenses);
  expect(rolledBack.income).toBe(before.income);
  expect(rolledBack.batch.rolledBackAt).toBeTruthy();
});

test("CSV import remains keyboard-accessible and compact on a phone", async ({ page }) => {
  await openImportCenter(page, { width:390, height:844 });
  const geometry = await page.evaluate(() => ({
    overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    short:[...document.querySelectorAll("#financeImportCenter button, #financeImportCenter .button")].filter(node => {
      const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && (rect.height < 34.5 || rect.height > 35.5);
    }).map(node => ({ text:node.textContent.trim(), width:node.getBoundingClientRect().width, height:node.getBoundingClientRect().height }))
  }));
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.short).toEqual([]);
  await page.locator("[data-import-csv]").setInputFiles(fixture);
  await expect(page.locator("#importCenterDialog")).toBeVisible();
  await page.locator("[data-import-map='date']").focus();
  await expect(page.locator("[data-import-map='date']")).toBeFocused();
  const dialogOverflow = await page.locator("#importCenterDialog").evaluate(dialog => dialog.scrollWidth - dialog.clientWidth);
  expect(dialogOverflow).toBeLessThanOrEqual(1);
});
