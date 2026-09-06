import { expect, test } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000/?page=income";
const DATA_KEY = "simple-finance-project-records-v2";

async function openSavingsForecast(page, width = 1440) {
  await page.setViewportSize({ width, height:1000 });
  await page.addInitScript(({ key }) => {
    const stamp = "2026-09-01T00:00:00.000Z";
    localStorage.setItem(key, JSON.stringify({
      accounts:{ Wallet:5000 },
      accountTypes:{ Wallet:"Cash" },
      accountOrder:["Wallet"],
      accountIcons:{},
      iconLibrary:{},
      savingsSettings:{ defaultAccount:"", includeInAvailable:true, trendMonths:6 },
      savingsGoals:[],
      incomeRecords:[
        { id:"fixture-income-first", name:"Fixture income A", amount:5000, date:"2026-09-15", category:"Paycheck", account:"Wallet", recurring:"Monthly", includeInTotals:true },
        { id:"fixture-income-second", name:"Fixture income B", amount:5000, date:"2026-09-30", category:"Paycheck", account:"Wallet", recurring:"Monthly", includeInTotals:true }
      ],
      expenseRecurrenceSkips:[],
      expenses:[
        { id:"fixture-expense", name:"Fixture expense", amount:9092, date:"2026-09-30", dueDay:30, category:"Fixture", account:"Wallet", recurring:"Monthly", paid:false, includeInTotals:true }
      ],
      projects:[],
      monthlyReports:{},
      monthlyChecklists:{},
      monthlyBudgets:{
        "2026-09":{
          month:"2026-09",
          items:[{ id:"fixture-plan", category:"Fixture", plannedAmount:9092, group:"flexible", scope:"personal", rollover:false, notes:"", createdAt:stamp, updatedAt:stamp }],
          savingsAllocation:{ mode:"fixed", value:0, account:"" },
          savingsTargetSet:false,
          savingsProgress:{ confirmed:false, actualAmount:0, confirmedAt:"", updatedAt:"" },
          lowBalanceThreshold:1000,
          createdAt:stamp,
          updatedAt:stamp
        }
      },
      budgetTemplates:[],
      budgetSettings:{ version:1, defaultLowBalanceThreshold:1000, includeExpectedIncome:true, includeRecurringEstimates:true },
      projectCalendarSettings:{ autoPrepare:true, defaultReminder:"P1D", includeNotes:true, includeFinancialValues:false },
      projectKanban:{ version:1, projectColumns:[], agendaColumns:[] },
      salaryWorkSettings:{ includedProjectsPerMonth:3, officeDays:[], homeDays:[], compensationModel:"fixed-monthly-salary" }
    }));
  }, { key:DATA_KEY });
  await page.goto(APP_URL, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("#monthlyBudgetPlannerCard")).toBeVisible();
}

test("Savings outlook previews, confirms, persists, and never changes balances", async ({ page }) => {
  await openSavingsForecast(page);
  await expect(page.locator(".cash-forecast-panel h4")).toHaveText("Cash-flow & savings forecast");
  await expect(page.locator("#savingsOutlookSummary")).toContainText("₱10,000.00");
  await expect(page.locator("#savingsOutlookSummary")).toContainText("₱9,092.00");
  await expect(page.locator("#savingsOutlookSummary")).toContainText("₱908.00");
  await expect(page.locator("#monthlySavingsTarget")).toHaveValue("1000");
  await expect(page.locator("#savingsTargetSuggestion")).toContainText("₱92.00");
  await expect(page.locator("#savingsProjectionCaption")).toContainText("₱4,000.00 projected by December 2026");

  const confirmation = page.locator("#savingsMonthConfirmed");
  await expect(confirmation).toBeDisabled();
  await page.locator("#setMonthlySavingsTarget").click();
  await expect(confirmation).toBeEnabled();
  await expect(page.locator("#savingsProgressStatus")).toHaveText("Target ready");

  const beforeBalance = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).accounts.Wallet, DATA_KEY);
  await confirmation.check();
  await expect(page.locator("#actualSavingsAmount")).toBeEnabled();
  await expect(page.locator("#savingsActualStatus")).toContainText("Target reached");
  await page.locator("#actualSavingsAmount").fill("750");
  await page.locator("#actualSavingsAmount").blur();
  await expect(page.locator("#savingsActualStatus")).toContainText("₱250.00 below target");
  await expect(page.locator("#savingsProjectionCaption")).toContainText("₱3,750.00 projected by December 2026");
  const afterBalance = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).accounts.Wallet, DATA_KEY);
  expect(afterBalance).toBe(beforeBalance);

  await page.reload({ waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("#savingsMonthConfirmed")).toBeChecked();
  await expect(page.locator("#actualSavingsAmount")).toHaveValue("750");
  await expect(page.locator("#savingsProgressStatus")).toHaveText("Saved");
});

for (const contract of [{ width:1440, touch:false }, { width:390, touch:true }]) {
  test(`Savings controls follow the shared radius hierarchy without overflow at ${contract.width}px`, async ({ page }) => {
    await openSavingsForecast(page,contract.width);
    const metrics = await page.locator("#monthlyBudgetPlannerCard").evaluate(card => {
      const radius = selector => parseFloat(getComputedStyle(card.querySelector(selector)).borderRadius);
      return {
        panel:radius(".cash-forecast-panel"),
        target:radius("#monthlySavingsTarget"),
        button:radius("#setMonthlySavingsTarget"),
        checkbox:radius("#savingsMonthConfirmed"),
        confirmation:radius(".savings-confirmation"),
        row:radius(".savings-projection-row"),
        overflow:document.documentElement.scrollWidth > innerWidth + 1
      };
    });
    expect(metrics.panel).toBe(16);
    expect(metrics.target).toBe(12);
    expect(metrics.button).toBe(12);
    expect(metrics.checkbox).toBe(12);
    expect(metrics.confirmation).toBe(12);
    expect(metrics.row).toBe(12);
    expect(metrics.overflow).toBe(false);
  });
}
