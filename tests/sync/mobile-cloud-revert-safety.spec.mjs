import { test, expect } from "../helpers/browser-fixtures.mjs";

function establishedPhoneData() {
  return {
    accounts:{ Wallet:4821.5 },
    accountTypes:{ Wallet:"Cash" },
    accountOrder:["Wallet"],
    accountIcons:{},
    iconLibrary:{},
    savingsSettings:{ defaultAccount:"", includeInAvailable:true, trendMonths:6 },
    savingsGoals:[],
    incomeRecords:[{ id:"income-phone-new", name:"Phone income", category:"Other", account:"Wallet", amount:1200, date:"2026-08-17", includeInTotals:true }],
    expenses:[{ id:"expense-phone-new", name:"Phone latest expense", category:"Bills", account:"Wallet", amount:345, date:"2026-08-17", group:"other", paid:false, includeInTotals:true, expenseType:"normal" }],
    expenseRecurrenceSkips:[],
    projects:[],
    monthlyReports:{},
    monthlyChecklists:{},
    monthlyBudgets:{},
    budgetTemplates:[],
    expenseTemplates:[],
    accountLedger:[],
    accountReconciliations:[],
    budgetSettings:{ version:1, defaultLowBalanceThreshold:1000, includeExpectedIncome:true, includeRecurringEstimates:true },
    projectCalendarSettings:{ autoPrepare:true, defaultReminder:"P1D", includeNotes:true, includeFinancialValues:false },
    salaryWorkSettings:{ includedProjectsPerMonth:3, officeDays:["Tuesday","Thursday","Saturday"], homeDays:["Monday","Wednesday","Friday"], compensationModel:"fixed-monthly-salary" },
    ledgerSettings:{ version:1 },
    productivitySettings:{ version:1, enabled:true, shortcuts:true },
    reminderSettings:{ version:1 }
  };
}

function matchingBaseline(finance) {
  return {
    "accounts\u001fWallet":{
      collection:"accounts", recordId:"Wallet",
      payload:{ name:"Wallet", balance:4821.5, type:"Cash", icon:null },
      sortIndex:0, revision:8, deletedAt:""
    },
    "incomeRecords\u001fincome-phone-new":{
      collection:"incomeRecords", recordId:"income-phone-new", payload:finance.incomeRecords[0], sortIndex:0, revision:9, deletedAt:""
    },
    "expenses\u001fexpense-phone-new":{
      collection:"expenses", recordId:"expense-phone-new", payload:finance.expenses[0], sortIndex:0, revision:10, deletedAt:""
    },
    "settings\u001fpreferences":{
      collection:"settings", recordId:"preferences",
      payload:{
        savingsSettings:finance.savingsSettings,
        projectCalendarSettings:finance.projectCalendarSettings,
        salaryWorkSettings:finance.salaryWorkSettings,
        ledgerSettings:finance.ledgerSettings,
        budgetSettings:finance.budgetSettings,
        productivitySettings:finance.productivitySettings,
        reminderSettings:finance.reminderSettings
      },
      sortIndex:0, revision:11, deletedAt:""
    }
  };
}

async function loadGuard(page, { baseline = "none" } = {}) {
  const finance = establishedPhoneData();
  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });
  await page.evaluate(({ finance, baseline, matching }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("simple-finance-project-records-v12-meta", JSON.stringify({ currentDeviceId:"device-phone", recoverySnapshots:[] }));
    localStorage.setItem("simple-finance-profiles-v1", JSON.stringify({
      version:1,
      activeProfileId:"profile-personal",
      profiles:[{ id:"profile-personal", name:"My Finances", type:"personal", role:"owner", cloudProfileId:"cloud-mobile", encryption:{enabled:false} }]
    }));
    localStorage.setItem("simple-finance-profile-data-v1:profile-personal", JSON.stringify(finance));
    localStorage.setItem("simple-finance-project-records-v2", JSON.stringify(finance));
    localStorage.setItem("simple-finance-cloud-config-v1", JSON.stringify({
      supabaseUrl:"https://mobileguard.supabase.co",
      supabasePublishableKey:"publishable-test-key-1234567890"
    }));
    localStorage.setItem("sb-mobileguard-auth-token", JSON.stringify({ user:{ id:"user-mobile" }, access_token:"" }));
    localStorage.setItem("simple-finance-cloud-sync-v3:profile-personal", JSON.stringify({ lastAuditId:77 }));
    localStorage.removeItem("simple-finance-cloud-record-queue-v3:profile-personal");

    if (baseline === "stale") {
      localStorage.setItem("simple-finance-cloud-record-base-v3:profile-personal", JSON.stringify({
        "accounts\u001fWallet":{
          collection:"accounts", recordId:"Wallet",
          payload:{ name:"Wallet", balance:1000, type:"Cash", icon:null },
          sortIndex:0, revision:8, deletedAt:""
        },
        "expenses\u001fexpense-phone-new":{
          collection:"expenses", recordId:"expense-phone-new",
          payload:{ ...finance.expenses[0], amount:100, name:"Older cloud expense" },
          sortIndex:0, revision:5, deletedAt:""
        }
      }));
    } else if (baseline === "matching") {
      localStorage.setItem("simple-finance-cloud-record-base-v3:profile-personal", JSON.stringify(matching));
    } else {
      localStorage.removeItem("simple-finance-cloud-record-base-v3:profile-personal");
    }
  }, { finance, baseline, matching:matchingBaseline(finance) });

  await page.addScriptTag({ url:"http://127.0.0.1:3000/privacy-lock.js?v=mobile-revert-test" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.FinanceCloudRevertGuard)), { timeout:10000 }).toBe(true);
}

test("missing baseline protects established phone data and repairs sync authority before first sync", async ({ page }) => {
  await loadGuard(page);

  const protectedState = await page.evaluate(() => {
    const meta = JSON.parse(localStorage.getItem("simple-finance-cloud-sync-v3:profile-personal") || "{}");
    const queue = JSON.parse(localStorage.getItem("simple-finance-cloud-record-queue-v3:profile-personal") || "{}");
    const active = JSON.parse(localStorage.getItem("simple-finance-project-records-v2") || "{}");
    const items = Object.values(queue);
    return {
      meta,
      queueCount:items.length,
      allReady:items.length > 0 && items.every(item => Number(item.nextAttemptAt || 0) === 0),
      expenseProtected:items.some(item => item.collection === "expenses" && item.recordId === "expense-phone-new" && item.status === "pending" && item.basePayload === null),
      accountProtected:items.some(item => item.collection === "accounts" && item.recordId === "Wallet" && Number(item.payload?.balance || 0) === 4821.5),
      activeExpense:active.expenses?.find(item => item.id === "expense-phone-new")?.name || "",
      activeBalance:Number(active.accounts?.Wallet || 0),
      guard:window.FinanceCloudRevertGuard.last
    };
  });

  expect(protectedState.meta.initializedUserId).toBe("user-mobile:cloud-mobile");
  expect(protectedState.meta.initializedProfileId).toBe("cloud-mobile");
  expect(protectedState.meta.lastAuditId).toBe(0);
  expect(protectedState.queueCount).toBeGreaterThan(0);
  expect(protectedState.allReady).toBe(true);
  expect(protectedState.expenseProtected).toBe(true);
  expect(protectedState.accountProtected).toBe(true);
  expect(protectedState.activeExpense).toBe("Phone latest expense");
  expect(protectedState.activeBalance).toBe(4821.5);
  expect(protectedState.guard?.armed).toBe(true);
  expect(protectedState.guard?.reason).toBe("baseline-missing");
});

test("an existing stale baseline no longer disables protection", async ({ page }) => {
  await loadGuard(page, { baseline:"stale" });

  const state = await page.evaluate(() => {
    const queue = JSON.parse(localStorage.getItem("simple-finance-cloud-record-queue-v3:profile-personal") || "{}");
    const meta = JSON.parse(localStorage.getItem("simple-finance-cloud-sync-v3:profile-personal") || "{}");
    return {
      guard:window.FinanceCloudRevertGuard.last,
      meta,
      account:queue["accounts\u001fWallet"],
      expense:queue["expenses\u001fexpense-phone-new"],
      income:queue["incomeRecords\u001fincome-phone-new"]
    };
  });

  expect(state.guard?.armed).toBe(true);
  expect(state.guard?.reason).toBe("local-diverged-from-baseline");
  expect(state.meta.initializedUserId).toBe("user-mobile:cloud-mobile");
  expect(state.meta.lastAuditId).toBe(77);
  expect(state.account?.baseRevision).toBe(8);
  expect(state.account?.basePayload?.balance).toBe(1000);
  expect(state.account?.payload?.balance).toBe(4821.5);
  expect(state.account?.nextAttemptAt).toBe(0);
  expect(state.expense?.baseRevision).toBe(5);
  expect(state.expense?.basePayload?.amount).toBe(100);
  expect(state.expense?.payload?.amount).toBe(345);
  expect(state.income?.baseRevision).toBe(0);
});

test("matching local and cloud baseline repairs lost metadata without creating fake pending changes", async ({ page }) => {
  await loadGuard(page, { baseline:"matching" });

  const first = await page.evaluate(() => ({
    guard:window.FinanceCloudRevertGuard.last,
    queue:JSON.parse(localStorage.getItem("simple-finance-cloud-record-queue-v3:profile-personal") || "{}")
  }));
  expect(first.guard?.reason).toBe("sync-metadata-repaired");
  expect(Object.keys(first.queue)).toHaveLength(0);

  const second = await page.evaluate(() => window.FinanceCloudRevertGuard.arm());
  expect(second.armed).toBe(false);
  expect(second.reason).toBe("baseline-matches-local");
});

test("Upload this device first-sync choice uses the protected device-authority path", async ({ page }) => {
  await loadGuard(page, { baseline:"matching" });

  await page.evaluate(finance => {
    window.data = finance;
    window.__replaceCalls = 0;
    window.FinanceCloudSync = {
      replaceCloudWithThisDevice: async () => {
        window.__replaceCalls += 1;
        return true;
      }
    };
    const shell = document.createElement("div");
    shell.innerHTML = `
      <label><input type="radio" name="cloudInitialMode" value="upload" checked>Upload this device</label>
      <button id="cloudInitialConfirm" type="button">Confirm first sync</button>`;
    document.body.appendChild(shell);
    document.getElementById("cloudInitialConfirm").click();
  }, establishedPhoneData());

  await expect.poll(async () => page.evaluate(() => window.__replaceCalls), { timeout:10000 }).toBe(1);
  await expect.poll(async () => page.evaluate(() => !document.getElementById("cloudInitialConfirm")?.disabled), { timeout:10000 }).toBe(true);
  const snapshots = await page.evaluate(() => window.FinancePrivacyLock.recoveryStorage.list());
  expect(snapshots.length).toBeGreaterThan(0);
});
