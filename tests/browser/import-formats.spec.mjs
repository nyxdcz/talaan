import { expect, test } from "../helpers/browser-fixtures.mjs";
import path from "node:path";
/* global data */

test.use({ serviceWorkers:"block" });
const app = "http://127.0.0.1:3000/index.html?page=settings&settings=finance-tools";
const ofxFixture = path.resolve("tests/fixtures/import/bank-sgml.ofx");
const qifFixture = path.resolve("tests/fixtures/import/bank-and-transfer.qif");
const splitFixture = path.resolve("tests/fixtures/import/unsupported-split.qif");

async function openImportCenter(page, viewport = { width:1366, height:900 }) {
  await page.setViewportSize(viewport);
  await page.goto(app, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinanceImportFormats && window.FinanceImportCenter && window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => {
    window.FinancePrivacyLock.setAuthenticated(true);
    window.FinanceImportCenter.open();
  });
  await expect(page.locator("#financeImportCenter")).toBeVisible();
}

test("OFX preview commits once and reports a stable duplicate reason", async ({ page }) => {
  await openImportCenter(page);
  const before = await page.evaluate(() => ({ accounts:JSON.stringify(data.accounts), ledger:JSON.stringify(data.accountLedger || []) }));
  await page.locator("[data-import-csv]").setInputFiles(ofxFixture);
  await expect(page.locator("#importCenterDialog")).toBeVisible();
  await expect(page.locator("#importMappingSection")).toContainText("OFX");
  await expect(page.locator("#importMappingSection")).toContainText("Currency: PHP");
  await page.locator("[data-preview-import]").click();
  await expect(page.locator("#importPreviewSection")).toContainText("2 ready");
  await page.locator("#commitCsvImport").click();
  await expect(page.locator("#expenseActionConfirmDialog")).toBeVisible();
  await page.locator("#expenseActionConfirmAccept").click();
  await expect(page.locator("#financeImportCenter")).toContainText("2 OFX records");

  const committed = await page.evaluate(() => ({
    accounts:JSON.stringify(data.accounts), ledger:JSON.stringify(data.accountLedger || []),
    batch:data.ledgerSettings.importCenter.batches[0],
    records:[...data.expenses, ...data.incomeRecords].filter(item => item.importSource === "ofx")
  }));
  expect(committed.accounts).toBe(before.accounts);
  expect(committed.ledger).toBe(before.ledger);
  expect(committed.batch.format).toBe("ofx");
  expect(committed.records).toHaveLength(2);
  expect(committed.records.every(item => item.importReference && !item.accountDeducted)).toBe(true);

  await page.locator("[data-import-csv]").setInputFiles(ofxFixture);
  await page.locator("[data-preview-import]").click();
  await expect(page.locator(".import-preview-row.is-duplicate")).toHaveCount(2);
  await expect(page.locator("#importPreviewSection")).toContainText("Already imported");
  await expect(page.locator("#commitCsvImport")).toBeDisabled();
});

test("QIF requires PHP confirmation and isolates unsupported splits", async ({ page }) => {
  await openImportCenter(page, { width:390, height:844 });
  await page.locator("[data-import-csv]").setInputFiles(qifFixture);
  await expect(page.locator("#importMappingSection")).toContainText("QIF does not declare a reliable currency");
  await page.locator("[data-preview-import]").click();
  await expect(page.locator("#importCenterError")).toContainText("Confirm that this QIF statement uses Philippine pesos");
  await expect(page.locator("#commitCsvImport")).toBeDisabled();
  await page.locator("#confirmQifCurrency").check();
  await page.locator("[data-preview-import]").click();
  await expect(page.locator("#importPreviewSection")).toContainText("3 ready");
  await expect(page.locator("#importPreviewSection")).toContainText("1");
  await expect(page.locator(".import-preview-row.is-ignored")).toHaveCount(1);
  const geometry = await page.locator("#importCenterDialog").evaluate(dialog => ({ overflow:dialog.scrollWidth - dialog.clientWidth, confirmationHeight:document.querySelector(".import-currency-confirmation")?.getBoundingClientRect().height }));
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.confirmationHeight).toBeGreaterThanOrEqual(44);

  await page.locator("[data-close-import-center]").first().click();
  await page.locator("[data-import-csv]").setInputFiles(splitFixture);
  await page.locator("#confirmQifCurrency").check();
  await page.locator("[data-preview-import]").click();
  await expect(page.locator(".import-preview-row.is-invalid")).toHaveCount(1);
  await expect(page.locator("#importPreviewSection")).toContainText("Split QIF transactions are not supported yet");
});

test("non-PHP and undeclared OFX statements are blocked before preview", async ({ page }) => {
  await openImportCenter(page);
  const statement = currency => `<OFX><STMTRS>${currency ? `<CURDEF>${currency}</CURDEF>` : ""}<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260825</DTPOSTED><TRNAMT>-1</TRNAMT><FITID>BLOCK-1</FITID><NAME>Test</NAME></STMTTRN></BANKTRANLIST></STMTRS></OFX>`;
  await page.locator("[data-import-csv]").setInputFiles({ name:"foreign.ofx", mimeType:"application/x-ofx", buffer:Buffer.from(statement("USD")) });
  await page.locator("[data-preview-import]").click();
  await expect(page.locator("#importCenterError")).toContainText("does not convert currencies");
  await page.locator("[data-close-import-center]").first().click();
  await page.locator("[data-import-csv]").setInputFiles({ name:"unknown.ofx", mimeType:"application/x-ofx", buffer:Buffer.from(statement("")) });
  await page.locator("[data-preview-import]").click();
  await expect(page.locator("#importCenterError")).toContainText("does not declare PHP");
});
