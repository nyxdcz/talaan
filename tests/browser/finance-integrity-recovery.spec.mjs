/* global data */
import { test, expect } from "@playwright/test";

const appUrl = "http://127.0.0.1:3000/index.html?page=settings&settings=profiles";

async function stable(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => Boolean(window.FinanceIntegrity?.scan && window.FinanceLedgerTransactions?.repairSafeIntegrity));
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await page.waitForFunction(() => document.body.classList.contains("finance-signed-in"));
}

test("financial integrity UI scans without mutating records and Viewer cannot repair", async ({ page }) => {
  await page.goto(appUrl, { waitUntil:"networkidle" });
  await stable(page);
  await page.evaluate(() => window.activateSettingsPanel?.("profiles", false));
  await expect(page.locator("#settings-panel-profiles")).toBeVisible();
  const before = await page.evaluate(() => JSON.stringify(data));
  await expect(page.locator("#runIntegrityCheckButton")).toBeVisible();
  await page.locator("#runIntegrityCheckButton").click();
  await expect(page.locator("#financeIntegrityChip")).not.toHaveText("Not checked");
  expect(await page.evaluate(() => JSON.stringify(data))).toBe(before);

  const critical = await page.evaluate(() => {
    const sample = structuredClone(data);
    const accounts = Object.keys(sample.accounts || {});
    if (accounts.length < 2) {
      sample.accounts.Second = 0;
      sample.accountTypes = {...(sample.accountTypes || {}), Second:"Cash"};
    }
    const names = Object.keys(sample.accounts);
    sample.accountLedger = [...(sample.accountLedger || []), {
      id:"phase4-half-transfer",operationId:"phase4-half-transfer",transactionId:"phase4-half-transfer",transferId:"phase4-transfer",account:names[0],counterpartAccount:names[1],type:"transfer-out",amount:-1
    }];
    return window.FinanceIntegrity.scan(sample,{includeStorage:false});
  });
  expect(critical.counts.critical).toBeGreaterThan(0);
  expect(critical.issues.some(item => item.code === "transfer-pair-incomplete")).toBe(true);

  await page.evaluate(() => {
    const architecture = window.FinanceProfileArchitecture;
    const runtimeActive = architecture?.activeProfile?.() || { id:"profile-personal", name:"My Finances", type:"personal", role:"owner", cloudProfileId:"", encryption:{ enabled:false } };
    let meta = null;
    try { meta = JSON.parse(localStorage.getItem("simple-finance-profiles-v1") || "null"); } catch { meta = null; }
    if (!Array.isArray(meta?.profiles) || !meta.profiles.length) {
      meta = { version:1, activeProfileId:runtimeActive.id || "profile-personal", profiles:[structuredClone(runtimeActive)] };
    }
    if (!meta.activeProfileId) meta.activeProfileId = runtimeActive.id || meta.profiles[0].id;
    const active = meta.profiles.find(item => item.id === meta.activeProfileId) || meta.profiles[0];
    active.role = "viewer";
    localStorage.setItem("simple-finance-profiles-v1", JSON.stringify(meta));
  });
  await page.reload({ waitUntil:"networkidle" });
  await stable(page);
  await page.waitForFunction(() => window.FinanceProfileArchitecture?.canWrite?.() === false);
  const viewerResult = await page.evaluate(() => window.FinanceLedgerTransactions.repairSafeIntegrity());
  expect(viewerResult.ok).toBe(false);
  expect(viewerResult.reason).toBe("read-only");
});

test("failed post-import reconciliation restores the pre-import recovery snapshot", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=settings&settings=sync", { waitUntil:"networkidle" });
  await stable(page);
  await page.waitForFunction(() => typeof window.openSyncReview === "function" && typeof window.applyPendingSyncImport === "function" && Boolean(window.FinancePrivacyLock?.recoveryStorage));
  const baseline = await page.evaluate(() => ({ accounts:structuredClone(data.accounts), serialized:JSON.stringify(data) }));
  const importedName = `Phase4 rollback ${Date.now()}`;
  await page.evaluate(importedName => {
    const bundle = window.buildBundle("phase4-integrity-test");
    bundle.data.accounts = { ...(bundle.data.accounts || {}), [importedName]:123.45 };
    window.openSyncReview(bundle);
    const original = window.FinanceLedgerTransactions;
    window.FinanceLedgerTransactions = Object.freeze({ ...original, reconcileAccounts:()=>({ok:false,reason:"phase4-forced-reconciliation-failure"}) });
  }, importedName);
  await expect(page.locator("#syncReviewDialog")).toBeVisible();
  const mergeButton = page.locator("#mergeUseIncomingButton");
  await mergeButton.click();
  await expect.poll(() => page.evaluate(name => Object.prototype.hasOwnProperty.call(data.accounts || {}, name), importedName), { timeout:10000 }).toBe(false);
  await expect(mergeButton).toBeEnabled({ timeout:10000 });
  const after = await page.evaluate(() => JSON.stringify(data));
  expect(JSON.parse(after).accounts).toEqual(baseline.accounts);
});

test("legacy paid expenses are migrated before recovery import integrity checks", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=settings&settings=sync", { waitUntil:"networkidle" });
  await stable(page);
  await page.waitForFunction(() => typeof window.openSyncReview === "function" && typeof window.applyPendingSyncImport === "function");

  const bundle = await page.evaluate(() => {
    const source = structuredClone(data);
    const account = Object.keys(source.accounts || {})[0] || "Cash";
    const initializedAt = new Date().toISOString();
    source.accountLedger = Object.entries(source.accounts || {}).map(([name, balance]) => ({
      id:`legacy-opening-${name}`,
      transactionId:`legacy-opening-${name}`,
      operationId:`legacy-opening-${name}`,
      account:name,
      type:"opening-balance",
      amount:Number(balance || 0),
      date:initializedAt.slice(0, 10),
      description:`Opening balance for ${name}`,
      source:"migration"
    }));
    source.ledgerSettings = { version:1, migratedFrom:"12.19.1", initializedAt };
    source.expenses = Array.from({ length:6 }, (_, index) => ({
      id:`legacy-import-expense-${index}`,
      name:`Legacy import ${index}`,
      amount:10,
      date:initializedAt.slice(0, 10),
      category:"Other",
      account,
      recurring:"No",
      paid:true,
      paidDate:initializedAt.slice(0, 10),
      paidFromAccount:account,
      paidAmount:10,
      accountDeducted:true,
      paymentTransactionId:""
    }));
    return { ...window.buildBundle("my-finance-v12-recovery"), data:source };
  });

  await page.evaluate(value => window.openSyncReview(value), bundle);
  await expect(page.locator("#syncReviewDialog")).toBeVisible();
  await page.locator("#replaceWithIncomingButton").click();
  await expect(page.locator("#syncReviewDialog")).not.toBeVisible({ timeout:10000 });
  await expect.poll(() => page.evaluate(() => window.FinanceIntegrity.scan(data, { includeStorage:false }))).toMatchObject({ counts:{ critical:0 } });
  const migrated = await page.evaluate(() => ({
    legacyExpenses:data.expenses.filter(item => String(item.id || "").startsWith("legacy-import-expense-")).length,
    ledgerPayments:data.accountLedger.filter(item => item.source === "legacy-migration").length
  }));
  expect(migrated).toEqual({ legacyExpenses:6, ledgerPayments:6 });
});
