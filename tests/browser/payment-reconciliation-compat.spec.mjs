import { expect, test } from "../helpers/browser-fixtures.mjs";

/* global data */
const APP_URL = "http://127.0.0.1:3000/?page=money";

async function authenticate(page) {
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await page.waitForFunction(() => Boolean(
    window.FinanceLedgerTransactions?.capabilities?.paymentCompatibilityRepair
    && window.FinanceIntegrity?.scan
    && window.FinanceProfileArchitecture
  ));
}

async function openApp(page) {
  await page.setViewportSize({ width:1440, height:1000 });
  await page.goto(APP_URL, { waitUntil:"networkidle" });
  await authenticate(page);
}

test("manual payment repairs an unambiguous stale reconciliation link before committing", async ({ page }) => {
  await openApp(page);

  const setup = await page.evaluate(() => {
    const account = Object.keys(data.accounts || {})[0] || "";
    if (!account) throw new Error("No account is available for the payment compatibility test");
    return { account, before:Number(data.accounts[account] || 0) };
  });

  const target = Math.max(5000, setup.before + 1000);
  const reconciled = await page.evaluate(({ account, target }) => window.FinanceLedgerTransactions.reconcileAccounts(
    [{ account, target }],
    { note:"payment compatibility setup", message:"Payment compatibility account setup" }
  ), { account:setup.account, target });
  expect(reconciled.ok).toBe(true);

  const fixture = await page.evaluate(({ account }) => {
    const reconciliation = [...(data.accountReconciliations || [])].reverse().find(item => item.account === account);
    if (!reconciliation?.ledgerEntryId) throw new Error("Expected a reconciliation with a ledger link");
    const linked = (data.accountLedger || []).find(entry => entry.id === reconciliation.ledgerEntryId);
    if (!linked) throw new Error("Expected linked reconciliation ledger entry");

    reconciliation.ledgerEntryId = "stale-safe-reconciliation-link";
    const expense = {
      id:`payment-compat-${Date.now()}`,
      name:"Electric & Water Bill",
      amount:125,
      electricBillAmount:100,
      waterBillAmount:25,
      expenseType:"utility",
      category:"Utilities",
      date:new Date().toISOString().slice(0,10),
      account:"Wallet",
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

    const report = window.FinanceIntegrity.scan(data, { includeStorage:false });
    return {
      expenseId:expense.id,
      reconciliationId:reconciliation.id,
      expectedLedgerEntryId:linked.id,
      critical:report.counts.critical,
      repairable:report.issues.some(item => item.severity === "safe-repair" && item.code === "reconciliation-link-missing"),
      before:Number(data.accounts[account])
    };
  }, { account:setup.account });

  expect(fixture.critical).toBe(0);
  expect(fixture.repairable).toBe(true);

  const payment = await page.evaluate(({ account, expenseId }) => {
    const expense = data.expenses.find(item => item.id === expenseId);
    return window.FinanceLedgerTransactions.payExpenses([expense], account, { auto:false });
  }, { account:setup.account, expenseId:fixture.expenseId });

  expect(payment.ok).toBe(true);

  const state = await page.evaluate(({ account, expenseId, reconciliationId }) => {
    const expense = data.expenses.find(item => item.id === expenseId);
    const reconciliation = data.accountReconciliations.find(item => item.id === reconciliationId);
    const local = JSON.parse(localStorage.getItem("simple-finance-project-records-v2") || "{}");
    const profileId = window.FinanceProfileArchitecture.activeProfileId();
    const profile = JSON.parse(localStorage.getItem(`simple-finance-profile-data-v1:${profileId}`) || "{}");
    const report = window.FinanceIntegrity.scan(data, { includeStorage:true });
    return {
      paid:Boolean(expense?.paid),
      paidFromAccount:expense?.paidFromAccount || "",
      paidAmount:Number(expense?.paidAmount || 0),
      link:reconciliation?.ledgerEntryId || "",
      balance:Number(data.accounts?.[account]),
      localBalance:Number(local.accounts?.[account]),
      profileBalance:Number(profile.accounts?.[account]),
      critical:report.counts.critical
    };
  }, { account:setup.account, expenseId:fixture.expenseId, reconciliationId:fixture.reconciliationId });

  expect(state.paid).toBe(true);
  expect(state.paidFromAccount).toBe(setup.account);
  expect(state.paidAmount).toBe(125);
  expect(state.link).toBe(fixture.expectedLedgerEntryId);
  expect(state.balance).toBeCloseTo(fixture.before - 125, 2);
  expect(state.localBalance).toBe(state.balance);
  expect(state.profileBalance).toBe(state.balance);
  expect(state.critical).toBe(0);
  await page.locator('#money [data-workspace-page="paid-expenses"]').click();
  await expect(page.locator('.paid-expenses-info-note')).toContainText('deducts its payment from the actual account you choose');
  await expect(page.locator('.paid-expenses-info-note')).toContainText('Moving it back to unpaid reverses that recorded payment');
});

test("generic payment toast is replaced with the ledger rollback reason", async ({ page }) => {
  test.setTimeout(45000);
  await openApp(page);

  const setup = await page.evaluate(() => {
    const account = Object.keys(data.accounts || {})[0] || "";
    const expense = {
      id:`payment-failure-${Date.now()}`,
      name:"Payment failure visibility",
      amount:1,
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
    data.accountReconciliations.push({
      id:`broken-reconciliation-${Date.now()}`,
      account,
      date:new Date().toISOString().slice(0,10),
      previousBalance:Number(data.accounts[account] || 0),
      statementBalance:Number(data.accounts[account] || 0),
      difference:0,
      note:"unrecoverable test reconciliation",
      ledgerEntryId:"missing-ledger-entry",
      createdAt:new Date().toISOString(),
      createdByDevice:""
    });
    return { account, expenseId:expense.id };
  });

  const failed = await page.evaluate(({ account, expenseId }) => {
    const expense = data.expenses.find(item => item.id === expenseId);
    return window.FinanceLedgerTransactions.payExpenses([expense], account, { auto:false });
  }, setup);
  expect(failed.ok).toBe(false);
  expect(String(failed.reason)).toContain("safety checks");

  const toastMessage = await page.evaluate(() => {
    window.showToast("Payment could not be completed", "warning");
    return document.querySelector("#toast .toast-message")?.textContent?.trim() || "";
  });
  expect(toastMessage).toBe("The money update failed its safety checks. Nothing was saved.");
});
