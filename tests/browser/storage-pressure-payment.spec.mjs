import { expect, test } from "@playwright/test";

/* global data */
const APP_URL = "http://127.0.0.1:3000/?page=money";

async function authenticate(page) {
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await page.waitForFunction(() => Boolean(
    window.FinanceLedgerTransactions?.capabilities?.storagePressureRecovery
    && window.persistFinanceDataRaw?.__storagePressureCompat
    && window.FinanceProfileArchitecture?.persistCurrentData?.__storagePressureCompat
    && window.FinanceIntegrity?.scan
  ));
}

async function openApp(page) {
  await page.setViewportSize({ width:1440, height:1000 });
  await page.goto(APP_URL, { waitUntil:"networkidle" });
  await authenticate(page);
}

async function createPayableExpense(page, { name, amount }) {
  const setup = await page.evaluate(() => {
    const account = Object.keys(data.accounts || {})[0] || "";
    if (!account) throw new Error("No account is available for the storage-pressure payment test");
    return { account, before:Number(data.accounts[account] || 0) };
  });

  const target = Math.max(5000, setup.before + 1000);
  const reconciled = await page.evaluate(({ account, target }) => window.FinanceLedgerTransactions.reconcileAccounts(
    [{ account, target }],
    { note:"storage pressure setup", message:"Storage pressure account setup" }
  ), { account:setup.account, target });
  expect(reconciled.ok).toBe(true);

  const expenseId = await page.evaluate(({ account, expenseName, expenseAmount }) => {
    const expense = {
      id:`storage-pressure-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name:expenseName,
      amount:expenseAmount,
      category:"Utilities",
      date:new Date().toISOString().slice(0,10),
      account,
      recurring:false,
      includeInTotals:true,
      paid:false,
      paidDate:"",
      paidFromAccount:"",
      paidAmount:0,
      accountDeducted:false,
      paymentTransactionId:"",
      autoPaidAtMonthEnd:false
    };
    data.expenses.push(expense);
    localStorage.setItem("simple-finance-project-records-v2", JSON.stringify(data));
    const profileId = window.FinanceProfileArchitecture.activeProfileId();
    localStorage.setItem(`simple-finance-profile-data-v1:${profileId}`, JSON.stringify(data));
    return expense.id;
  }, { account:setup.account, expenseName:name, expenseAmount:amount });

  return { account:setup.account, expenseId, amount };
}

test("manual payment survives active finance-copy quota pressure", async ({ page }) => {
  await openApp(page);
  const setup = await createPayableExpense(page, { name:"Storage pressure active copy", amount:75 });

  const result = await page.evaluate(({ account, expenseId }) => {
    const activeKey = "simple-finance-project-records-v2";
    const redoKey = `${activeKey}-redo`;
    const profileId = window.FinanceProfileArchitecture.activeProfileId();
    const profileKey = `simple-finance-profile-data-v1:${profileId}`;
    const auditKey = `simple-finance-profile-audit-v1:${profileId}`;
    const productivityUndoKey = "simple-finance-productivity-undo-history-v1";
    localStorage.setItem(redoKey, JSON.stringify({ disposable:true }));
    localStorage.setItem(auditKey, JSON.stringify([{ id:"audit-pressure" }]));
    localStorage.setItem(productivityUndoKey, JSON.stringify([{ id:"productivity-audit-pressure", data:{ expenses:Array(20).fill({ amount:1 }) } }]));

    const originalSetItem = Storage.prototype.setItem;
    let failures = 0;
    Storage.prototype.setItem = function quotaInjectedSetItem(key, value) {
      if (this === localStorage && key === activeKey && failures < 2) {
        failures += 1;
        throw new DOMException("Injected active-data quota pressure", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };

    try {
      const expense = data.expenses.find(item => item.id === expenseId);
      const payment = window.FinanceLedgerTransactions.payExpenses([expense], account, { auto:false });
      const local = JSON.parse(localStorage.getItem(activeKey) || "{}");
      const profile = JSON.parse(localStorage.getItem(profileKey) || "{}");
      const audit = JSON.parse(localStorage.getItem(auditKey) || "[]");
      const savedExpense = local.expenses?.find(item => item.id === expenseId);
      return {
        payment,
        failures,
        redoRemoved:localStorage.getItem(redoKey) == null,
        pressureAuditRemoved:!audit.some(item => item?.id === "audit-pressure"),
        productivityUndoRemoved:localStorage.getItem(productivityUndoKey) == null,
        paid:Boolean(savedExpense?.paid),
        localBalance:Number(local.accounts?.[account]),
        profileBalance:Number(profile.accounts?.[account]),
        runtimeBalance:Number(data.accounts?.[account]),
        critical:window.FinanceIntegrity.scan(data, { includeStorage:true }).counts.critical
      };
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  }, setup);

  expect(result.failures).toBe(2);
  expect(result.payment.ok).toBe(true);
  expect(result.redoRemoved).toBe(true);
  expect(result.pressureAuditRemoved).toBe(true);
  expect(result.productivityUndoRemoved).toBe(true);
  expect(result.paid).toBe(true);
  expect(result.localBalance).toBe(result.runtimeBalance);
  expect(result.profileBalance).toBe(result.runtimeBalance);
  expect(result.critical).toBe(0);
});

test("manual payment survives active profile-copy quota pressure", async ({ page }) => {
  await openApp(page);
  const setup = await createPayableExpense(page, { name:"Storage pressure profile copy", amount:80 });

  const result = await page.evaluate(({ account, expenseId }) => {
    const activeKey = "simple-finance-project-records-v2";
    const redoKey = `${activeKey}-redo`;
    const profileId = window.FinanceProfileArchitecture.activeProfileId();
    const profileKey = `simple-finance-profile-data-v1:${profileId}`;
    const auditKey = `simple-finance-profile-audit-v1:${profileId}`;
    const productivityUndoKey = "simple-finance-productivity-undo-history-v1";
    localStorage.setItem(redoKey, JSON.stringify({ disposable:true }));
    localStorage.setItem(auditKey, JSON.stringify([{ id:"profile-audit-pressure" }]));
    localStorage.setItem(productivityUndoKey, JSON.stringify([{ id:"productivity-profile-pressure", data:{ expenses:Array(20).fill({ amount:1 }) } }]));

    const originalSetItem = Storage.prototype.setItem;
    let failures = 0;
    Storage.prototype.setItem = function quotaInjectedSetItem(key, value) {
      if (this === localStorage && key === profileKey && failures < 2) {
        failures += 1;
        throw new DOMException("Injected profile quota pressure", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };

    try {
      const expense = data.expenses.find(item => item.id === expenseId);
      const payment = window.FinanceLedgerTransactions.payExpenses([expense], account, { auto:false });
      const local = JSON.parse(localStorage.getItem(activeKey) || "{}");
      const profile = JSON.parse(localStorage.getItem(profileKey) || "{}");
      const audit = JSON.parse(localStorage.getItem(auditKey) || "[]");
      const savedExpense = profile.expenses?.find(item => item.id === expenseId);
      return {
        payment,
        failures,
        redoRemoved:localStorage.getItem(redoKey) == null,
        pressureAuditRemoved:!audit.some(item => item?.id === "profile-audit-pressure"),
        productivityUndoRemoved:localStorage.getItem(productivityUndoKey) == null,
        paid:Boolean(savedExpense?.paid),
        localBalance:Number(local.accounts?.[account]),
        profileBalance:Number(profile.accounts?.[account]),
        runtimeBalance:Number(data.accounts?.[account]),
        critical:window.FinanceIntegrity.scan(data, { includeStorage:true }).counts.critical
      };
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  }, setup);

  expect(result.failures).toBe(2);
  expect(result.payment.ok).toBe(true);
  expect(result.redoRemoved).toBe(true);
  expect(result.pressureAuditRemoved).toBe(true);
  expect(result.productivityUndoRemoved).toBe(true);
  expect(result.paid).toBe(true);
  expect(result.localBalance).toBe(result.runtimeBalance);
  expect(result.profileBalance).toBe(result.runtimeBalance);
  expect(result.critical).toBe(0);
});
