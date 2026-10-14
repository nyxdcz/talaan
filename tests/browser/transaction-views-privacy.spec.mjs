import { expect, test } from "../helpers/browser-fixtures.mjs";
/* global data, renderPaidExpenses, selectedMonth */

const base="http://127.0.0.1:3000";
async function unlock(page,route="money"){
  await page.goto(`${base}/?page=${route}`,{waitUntil:"networkidle"});
  await page.waitForFunction(()=>Boolean(window.FinancePrivacyLock&&window.FinanceTransactionViews&&window.FinancePrivacyDisplay));
  await page.evaluate(()=>window.FinancePrivacyLock.setAuthenticated(true));
}

test("transaction preferences are profile-scoped presentation only",async({page})=>{
  await page.setViewportSize({width:1366,height:900}); await unlock(page);
  const before=await page.evaluate(()=>JSON.stringify(data));
  await expect(page.locator("#transactionToolbar-expense :is([data-transaction-saved-view],[data-save-transaction-view],[data-open-transaction-columns],[data-transaction-sort],[data-transaction-density])")).toHaveCount(0);
  await page.locator('#transactionToolbar-expense [data-transaction-mode="calendar"]').click();
  await expect(page.locator("#transactionCalendar-expense")).toBeVisible();
  await expect(page.locator("#money > .section-stack")).toBeHidden();
  await expect(page.locator("#transactionTotals-expense")).toContainText("visible");
  const result=await page.evaluate(beforeValue=>({same:JSON.stringify(data)===beforeValue,key:window.FinanceTransactionViews.storageKey,state:window.FinanceTransactionViews.getState().expense}),before);
  expect(result.same).toBe(true); expect(result.key).toMatch(/^simple-finance-transaction-views-v1:/); expect(result.state.mode).toBe("calendar");
  await page.reload({waitUntil:"networkidle"}); await page.evaluate(()=>window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("#transactionCalendar-expense")).toBeVisible();
  await expect(page.locator("#money > .section-stack")).toBeHidden();
  await page.setViewportSize({width:390,height:844});
  await page.locator('#transactionToolbar-expense [data-transaction-mode="list"]').click();
  await expect(page.locator("#money > .section-stack")).toBeVisible();
  await expect(page.locator('#money .record-row [data-transaction-column="account"]').first()).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1); expect(overflow).toBe(false);
});

test("Paid Expenses sorting reorders both list and calendar views",async({page})=>{
  await page.setViewportSize({width:1440,height:900}); await unlock(page,"paid-expenses");
  await page.evaluate(()=>{
    const month=selectedMonth(),account=Object.keys(data.accounts||{})[0]||"Cash";
    data.expenses.push(
      {id:"sort-low",name:"Sort low",amount:.01,category:"Other",notes:"",account,paidFromAccount:account,date:`${month}-02`,paidDate:`${month}-02`,paid:true,recurring:"One-time",includeInTotals:true,type:"normal"},
      {id:"sort-high",name:"Sort high",amount:999999999,category:"Other",notes:"",account,paidFromAccount:account,date:`${month}-28`,paidDate:`${month}-28`,paid:true,recurring:"One-time",includeInTotals:true,type:"normal"}
    );
    renderPaidExpenses();
  });
  const listNames=page.locator("#paidExpenseList [data-paid-expense-row] .record-title strong");
  await page.locator("#transactionToolbar-paid [data-transaction-sort]").selectOption("amount-high");
  await expect(listNames.first()).toHaveText("Sort high");
  await page.locator('#transactionToolbar-paid [data-transaction-mode="calendar"]').click();
  const calendarNames=page.locator("#transactionCalendar-paid .transaction-calendar-entry span");
  await expect(calendarNames.first()).toHaveText("Sort high");
  await page.locator("#transactionToolbar-paid [data-transaction-sort]").selectOption("amount-low");
  await expect(calendarNames.first()).toHaveText("Sort low");
});

test("Hide values masks visual and accessible money without changing balances",async({page})=>{
  await page.setViewportSize({width:1440,height:900}); await unlock(page,"dashboard");
  await page.locator("#dashboardViewTabOverview").click();
  await expect(page.locator("#dashAvailable")).toBeVisible();
  await expect(page.locator("#dashAvailable")).toHaveText(/₱\s*[-+]?\d/);
  const balances=await page.evaluate(()=>JSON.stringify(data.accounts));
  await page.locator("#topbarToolsTrigger").click(); await page.locator("#privacyDisplayToggle").click();
  await expect(page.locator("html")).toHaveClass(/finance-values-hidden/);
  expect(await page.locator("body").innerText()).not.toMatch(/₱\s*[-+]?\d/);
  const leakedLabel=await page.evaluate(()=>[...document.querySelectorAll("[aria-label],[title],[aria-valuetext]")].map(node=>`${node.getAttribute("aria-label")||""} ${node.getAttribute("title")||""} ${node.getAttribute("aria-valuetext")||""}`).find(value=>/₱\s*[-+]?\d/.test(value))||"");
  expect(leakedLabel).toBe("");
  expect(await page.evaluate(()=>JSON.stringify(data.accounts))).toBe(balances);
  const hiddenValue=page.locator(".privacy-value-mask:visible").first();
  await expect(hiddenValue).toBeVisible();
  await expect(hiddenValue).toHaveText("₱•••••");
  await hiddenValue.hover();
  await expect(hiddenValue).toHaveText(/₱\s*[-+]?\d/);
  await page.mouse.move(0,0);
  await expect(hiddenValue).toHaveText("₱•••••");
  await hiddenValue.focus();
  await expect(hiddenValue).toHaveText(/₱\s*[-+]?\d/);
  await page.evaluate(()=>document.activeElement?.blur());
  await expect(hiddenValue).toHaveText("₱•••••");
  await page.locator("#topbarToolsTrigger").click();
  await page.locator("#privacyDisplayToggle").click();
  await expect(page.locator("html")).not.toHaveClass(/finance-values-hidden/);
  expect(await page.locator("body").innerText()).toMatch(/₱\s*[-+]?\d/);
});
