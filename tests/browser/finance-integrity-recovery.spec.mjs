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

test("schema-12 bundle with real ledger history is not blocked by false integrity failures", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=settings&settings=sync", { waitUntil:"networkidle" });
  await stable(page);
  await page.waitForFunction(() => typeof window.openSyncReview === "function" && typeof window.applyPendingSyncImport === "function");

  const bundle = await page.evaluate(() => {
    // Build a Schema 12 bundle with real income-deposit and expense-payment ledger entries.
    // This is the shape of data that was working before e6c8a47 and must continue to work.
    const source = structuredClone(data);
    const accounts = Object.keys(source.accounts || {});
    const account = accounts[0] || "Cash";
    const initializedAt = new Date(Date.now() - 86400000).toISOString();
    const txnIncome = `schema12-income-txn-1`;
    const txnExpense = `schema12-expense-txn-1`;
    const incomeId = `schema12-income-1`;
    const expenseId = `schema12-expense-1`;

    // Real income record posted to the ledger
    const incomeRecord = {
      id: incomeId,
      name: "Schema 12 income",
      amount: 1000,
      date: initializedAt.slice(0, 10),
      category: "Other income",
      categoryGroup: "Other income",
      account,
      recurring: "No",
      seriesId: "",
      includeInTotals: true,
      notes: "",
      postToLedger: true,
      ledgerTransactionId: txnIncome
    };

    // Paid expense with a real payment ledger entry
    const paidExpense = {
      id: expenseId,
      name: "Schema 12 expense",
      amount: 100,
      date: initializedAt.slice(0, 10),
      category: "Other",
      expenseType: "normal",
      recurring: "No",
      paid: true,
      paidDate: initializedAt.slice(0, 10),
      paidFromAccount: account,
      paidAmount: 100,
      accountDeducted: true,
      paymentTransactionId: txnExpense
    };

    // Matching ledger entries
    const incomeDeposit = {
      id: `schema12-income-deposit-1`,
      transactionId: txnIncome,
      operationId: `income-deposit:${txnIncome}`,
      account,
      type: "income-deposit",
      amount: 1000,
      date: initializedAt.slice(0, 10),
      description: "Income deposit: Schema 12 income",
      incomeId,
      source: "app"
    };
    const expenseDebit = {
      id: `schema12-expense-debit-1`,
      transactionId: txnExpense,
      operationId: `expense-payment:${txnExpense}`,
      account,
      type: "expense-payment",
      amount: -100,
      date: initializedAt.slice(0, 10),
      description: "Expense payment: Schema 12 expense",
      expenseId,
      source: "app"
    };

    source.incomeRecords = [incomeRecord];
    source.expenses = [paidExpense];
    source.accountLedger = [
      ...Object.entries(source.accounts || {}).map(([name, balance]) => ({
        id: `opening-${name}`, transactionId: `opening-${name}`, operationId: `opening-${name}`,
        account: name, type: "opening-balance", amount: Number(balance || 0),
        date: initializedAt.slice(0, 10), description: `Opening balance for ${name}`, source: "migration"
      })),
      incomeDeposit,
      expenseDebit
    ];
    source.ledgerSettings = { version: 1, initializedAt }; // no migratedFrom — this is a real Schema 12 bundle

    // Recalculate the declared balance to match the ledger
    source.accounts[account] = (Number(source.accounts[account] || 0) + 1000 - 100);

    return { ...window.buildBundle("my-finance-v12-recovery"), data: source };
  });

  const preScanResult = await page.evaluate(b => {
    return window.FinanceIntegrity.scan(b.data, { includeStorage: false });
  }, bundle);
  expect(preScanResult.counts.critical).toBe(0);

  await page.evaluate(value => window.openSyncReview(value), bundle);
  await expect(page.locator("#syncReviewDialog")).toBeVisible();
  await page.locator("#replaceWithIncomingButton").click();
  await expect(page.locator("#syncReviewDialog")).not.toBeVisible({ timeout: 10000 });

  const errorToast = page.locator(".toast-message", { hasText: "Import failed" });
  await expect(errorToast).not.toBeVisible();

  const finalReport = await page.evaluate(() => window.FinanceIntegrity.scan(data, { includeStorage: false }));
  expect(finalReport.counts.critical).toBe(0);
});

test("mixed ledger history migrates legacy paid expenses before import checks", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=settings&settings=sync", { waitUntil:"networkidle" });
  await stable(page);
  await page.waitForFunction(() => typeof window.openSyncReview === "function" && typeof window.applyPendingSyncImport === "function");

  const bundle = await page.evaluate(() => {
    const source = structuredClone(data);
    const account = Object.keys(source.accounts || {})[0] || "Cash";
    const initializedAt = new Date(Date.now() - 86400000).toISOString();
    const date = initializedAt.slice(0, 10);
    const existingExpenseId = "mixed-history-expense";
    const existingTransactionId = "mixed-history-payment";
    const existingAmount = 25;
    const openingEntries = Object.entries(source.accounts || {}).map(([name, balance]) => ({
      id:`mixed-opening-${name}`,
      transactionId:`mixed-opening-${name}`,
      operationId:`mixed-opening-${name}`,
      account:name,
      type:"opening-balance",
      amount:Number(balance || 0) + (name === account ? existingAmount : 0),
      date,
      description:`Opening balance for ${name}`,
      source:"migration"
    }));
    const existingExpense = {
      id:existingExpenseId,
      name:"Existing ledger expense",
      amount:existingAmount,
      date,
      category:"Other",
      expenseType:"normal",
      recurring:"No",
      paid:true,
      paidDate:date,
      paidFromAccount:account,
      paidAmount:existingAmount,
      accountDeducted:true,
      paymentTransactionId:existingTransactionId
    };
    const existingDebit = {
      id:"mixed-history-debit",
      transactionId:existingTransactionId,
      operationId:`expense-payment:${existingTransactionId}`,
      account,
      type:"expense-payment",
      amount:-existingAmount,
      date,
      description:"Expense payment: Existing ledger expense",
      expenseId:existingExpenseId,
      source:"app"
    };
    const legacyExpenses = Array.from({ length:6 }, (_, index) => ({
      id:`mixed-legacy-expense-${index}`,
      name:`Mixed legacy ${index}`,
      amount:10,
      date,
      category:"Other",
      expenseType:"normal",
      recurring:"No",
      paid:true,
      paidDate:date,
      paidFromAccount:account,
      paidAmount:10,
      accountDeducted:true,
      paymentTransactionId:""
    }));
    source.expenses = [existingExpense, ...legacyExpenses];
    source.accountLedger = [...openingEntries, existingDebit];
    source.ledgerSettings = { version:1, migratedFrom:"12.19.1", initializedAt };
    return { ...window.buildBundle("my-finance-v12-recovery"), data:source };
  });

  const beforeMigration = await page.evaluate(b => window.FinanceIntegrity.scan(b.data, { includeStorage:false }), bundle);
  expect(beforeMigration.counts.critical).toBe(6);
  expect(beforeMigration.issues.filter(item => item.code === "expense-payment-ledger-missing")).toHaveLength(6);

  await page.evaluate(value => window.openSyncReview(value), bundle);
  await expect(page.locator("#syncReviewDialog")).toBeVisible();
  await page.locator("#replaceWithIncomingButton").click();
  await expect(page.locator("#syncReviewDialog")).not.toBeVisible({ timeout:10000 });
  await expect(page.locator(".toast-message", { hasText:"Import failed" })).not.toBeVisible();

  const finalState = await page.evaluate(() => ({
    report:window.FinanceIntegrity.scan(data, { includeStorage:false }),
    migrated:data.accountLedger.filter(item => item.source === "legacy-migration").length
  }));
  expect(finalState.report.counts.critical).toBe(0);
  expect(finalState.migrated).toBe(6);
});

test("unused declared payment IDs repair their missing ledger debit", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=settings&settings=sync", { waitUntil:"networkidle" });
  await stable(page);
  const bundle = await page.evaluate(() => {
    const source = structuredClone(data);
    const account = Object.keys(source.accounts || {})[0] || "Cash";
    const expenseId = "declared-payment-without-debit";
    const transactionId = "declared-payment-tx-1";
    const initializedAt = new Date(Date.now() - 86400000).toISOString();
    const date = initializedAt.slice(0, 10);
    source.accountLedger = Object.entries(source.accounts || {}).map(([name, balance]) => ({
      id:`declared-payment-opening-${name}`, transactionId:`declared-payment-opening-${name}`, operationId:`declared-payment-opening-${name}`,
      account:name, type:"opening-balance", amount:Number(balance || 0), date, description:`Opening balance for ${name}`, source:"migration"
    }));
    source.expenses = [{ id:expenseId, name:"Declared payment", amount:40, date, category:"Other", expenseType:"normal", recurring:"No", paid:true, paidDate:date, paidFromAccount:account, paidAmount:40, accountDeducted:true, paymentTransactionId:transactionId }];
    source.ledgerSettings = { version:1, migratedFrom:"12.19.1", initializedAt };
    return { ...window.buildBundle("my-finance-v12-recovery"), data:source };
  });
  const before = await page.evaluate(value => window.FinanceIntegrity.scan(value.data, { includeStorage:false }), bundle);
  expect(before.counts.critical).toBe(1);
  expect(before.issues[0].code).toBe("expense-payment-ledger-missing");
  await page.evaluate(value => window.openSyncReview(value), bundle);
  await expect(page.locator("#syncReviewDialog")).toBeVisible();
  await page.locator("#replaceWithIncomingButton").click();
  await expect(page.locator("#syncReviewDialog")).not.toBeVisible({ timeout:10000 });
  await expect(page.locator(".toast-message", { hasText:"Import failed" })).not.toBeVisible();
  const finalState = await page.evaluate(() => ({
    report:window.FinanceIntegrity.scan(data, { includeStorage:false }),
    payment:data.accountLedger.find(item => item.expenseId === "declared-payment-without-debit") || null
  }));
  expect(finalState.report.counts.critical).toBe(0);
  expect(finalState.payment).toMatchObject({ transactionId:"declared-payment-tx-1", amount:-40, source:"legacy-repair" });
});

test("deleted-account ledger history is archived and repairs its legacy payment", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=settings&settings=sync", { waitUntil:"networkidle" });
  await stable(page);
  await page.waitForFunction(() => typeof window.openSyncReview === "function" && typeof window.applyPendingSyncImport === "function");

  const bundle = await page.evaluate(() => {
    const source = structuredClone(data);
    const activeAccounts = Object.keys(source.accounts || {});
    const archivedAccount = "Legacy Wallet";
    const initializedAt = new Date(Date.now() - 86400000).toISOString();
    const date = initializedAt.slice(0, 10);
    source.accountLedger = activeAccounts.map(name => ({
      id:`archived-active-opening-${name}`,
      transactionId:`archived-active-opening-${name}`,
      operationId:`archived-active-opening-${name}`,
      account:name,
      type:"opening-balance",
      amount:Number(source.accounts[name] || 0),
      date,
      description:`Opening balance for ${name}`,
      source:"migration"
    }));
    // Five historical entries close at zero, matching the zero-balance account
    // deletion rule. The account itself is intentionally absent from accounts.
    source.accountLedger.push(
      { id:"legacy-wallet-opening", transactionId:"legacy-wallet-opening", operationId:"legacy-wallet-opening", account:archivedAccount, type:"opening-balance", amount:0, date, description:"Opening balance for Legacy Wallet", source:"migration" },
      { id:"legacy-wallet-payment-1", transactionId:"legacy-wallet-payment-1", operationId:"legacy-wallet-payment-1", account:archivedAccount, type:"expense-payment", amount:-100, date, description:"Expense payment 1", source:"app" },
      { id:"legacy-wallet-payment-2", transactionId:"legacy-wallet-payment-2", operationId:"legacy-wallet-payment-2", account:archivedAccount, type:"expense-payment", amount:-150, date, description:"Expense payment 2", source:"app" },
      { id:"legacy-wallet-credit-1", transactionId:"legacy-wallet-credit-1", operationId:"legacy-wallet-credit-1", account:archivedAccount, type:"income-deposit", amount:100, date, description:"Income deposit 1", source:"app" },
      { id:"legacy-wallet-credit-2", transactionId:"legacy-wallet-credit-2", operationId:"legacy-wallet-credit-2", account:archivedAccount, type:"income-deposit", amount:150, date, description:"Income deposit 2", source:"app" }
    );
    source.expenses = [{
      id:"legacy-wallet-unlinked-expense",
      name:"Legacy Wallet expense",
      amount:40,
      date,
      category:"Other",
      expenseType:"normal",
      recurring:"No",
      paid:true,
      paidDate:date,
      paidFromAccount:archivedAccount,
      paidAmount:40,
      accountDeducted:true,
      paymentTransactionId:""
    }];
    source.ledgerSettings = { version:1, migratedFrom:"12.19.1", initializedAt };
    return { ...window.buildBundle("my-finance-v12-recovery"), data:source };
  });

  const beforeMigration = await page.evaluate(b => window.FinanceIntegrity.scan(b.data, { includeStorage:false }), bundle);
  expect(beforeMigration.counts.critical).toBe(6);
  expect(beforeMigration.issues.filter(item => item.code === "ledger-account-missing")).toHaveLength(5);
  expect(beforeMigration.issues.filter(item => item.code === "expense-payment-ledger-missing")).toHaveLength(1);

  await page.evaluate(value => window.openSyncReview(value), bundle);
  await expect(page.locator("#syncReviewDialog")).toBeVisible();
  await page.locator("#replaceWithIncomingButton").click();
  await expect(page.locator("#syncReviewDialog")).not.toBeVisible({ timeout:10000 });
  await expect(page.locator(".toast-message", { hasText:"Import failed" })).not.toBeVisible();

  const finalState = await page.evaluate(() => ({
    report:window.FinanceIntegrity.scan(data, { includeStorage:false }),
    archived:data.ledgerSettings?.archivedAccounts?.["Legacy Wallet"] || null,
    active:Object.prototype.hasOwnProperty.call(data.accounts || {}, "Legacy Wallet"),
    payment:data.expenses.find(item => item.id === "legacy-wallet-unlinked-expense")?.paymentTransactionId || "",
    migrated:data.accountLedger.find(item => item.expenseId === "legacy-wallet-unlinked-expense") || null
  }));
  expect(finalState.report.counts.critical).toBe(0);
  expect(finalState.archived).toMatchObject({ inferred:true, source:"legacy-import" });
  expect(finalState.active).toBe(false);
  expect(finalState.payment).toBe("legacy-expense-payment:legacy-wallet-unlinked-expense");
  expect(finalState.migrated).toMatchObject({ account:"Legacy Wallet", amount:-40, source:"legacy-migration" });
});
