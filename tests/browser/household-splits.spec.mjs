import { expect, test } from "@playwright/test";
/* global data, goToPage, openExpenseDialog, openExpensePaymentDialog, saveData */

test.use({ serviceWorkers:"block" });
const app = "http://127.0.0.1:3000/index.html?page=settings&settings=finance-tools";

async function openHouseholdTools(page, viewport = { width:1366, height:900 }) {
  await page.setViewportSize(viewport);
  await page.goto(app, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinanceHouseholdSplits && window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => {
    window.FinancePrivacyLock.setAuthenticated(true);
    document.querySelector('[data-settings-tab="finance-tools"]')?.click();
  });
  await expect(page.locator("#financeToolsHouseholdSplits")).toBeVisible();
}

async function addHomeGroup(page) {
  await page.locator("[data-household-add-group]").click();
  await expect(page.locator("#householdGroupDialog")).toBeVisible();
  await page.locator("#householdGroupName").fill("Home");
  await page.locator("#householdGroupMembers").fill("You\nAlex");
  await page.locator("#householdGroupForm button[type=submit]").click();
  await expect(page.locator("#householdGroupDialog")).toBeHidden();
  await expect(page.locator("#householdSplitWorkspace")).toContainText("Home");
}

test("split bill counts only your share and another-member payment never deducts an account", async ({ page }) => {
  await openHouseholdTools(page);
  await addHomeGroup(page);
  const before = await page.evaluate(() => ({ accounts:JSON.stringify(data.accounts), ledger:JSON.stringify(data.accountLedger || []) }));

  await page.evaluate(() => goToPage("money", { smooth:false }));
  await expect(page.locator("#money")).toBeVisible();
  await page.evaluate(() => openExpenseDialog());
  await expect(page.locator("#expenseDialog")).toBeVisible();
  await page.locator("#expenseName").fill("Shared groceries");
  await page.locator("#expenseAmount").fill("1000");
  await page.locator("#expenseDate").fill("2026-08-28");
  await page.locator("#expenseBudgetPeriod").selectOption("other");
  await page.locator("#expenseCategory").selectOption("Groceries");
  await page.locator("#configureHouseholdSplit").click();
  await expect(page.locator("#householdSplitDialog")).toBeVisible();
  await page.locator("#householdSplitMethod").selectOption("equal");
  await page.locator("#householdSplitForm button[type=submit]").click();
  await expect(page.locator("#householdSplitExpenseSummary")).toContainText("Your share");
  await page.locator("#saveExpenseButton").click();
  await expect(page.locator("#expenseDialog")).toBeHidden();

  const expense = await page.evaluate(() => data.expenses.find(item => item.name === "Shared groceries"));
  expect(expense.householdSplit.ownerShare).toBe(500);
  await page.evaluate(id => openExpensePaymentDialog([data.expenses.find(item => item.id === id)]), expense.id);
  await expect(page.locator("#householdPaymentPayerField")).toBeVisible();
  await page.locator("#householdPaymentPayer").selectOption({ label:"Alex" });
  await page.locator("#confirmExpensePayment").click();

  const after = await page.evaluate(id => {
    const item = data.expenses.find(expense => expense.id === id);
    return { accounts:JSON.stringify(data.accounts), ledger:JSON.stringify(data.accountLedger || []), item, positions:window.FinanceHouseholdSplits.positions(data.ledgerSettings.householdSplits, data.expenses, item.householdSplit.groupId) };
  }, expense.id);
  expect(after.accounts).toBe(before.accounts);
  expect(after.ledger).toBe(before.ledger);
  expect(after.item.paid).toBe(true);
  expect(after.item.accountDeducted).toBe(false);
  expect(after.item.householdSplit.payerMemberId).not.toBe(after.item.householdSplit.ownerMemberId);
  expect(after.positions.find(member => member.isOwner).position).toBe(-500);
});

test("settlement clears a household debt without creating finance records", async ({ page }) => {
  await openHouseholdTools(page);
  const stamp = "2026-08-28T00:00:00.000Z";
  await page.evaluate(stampValue => {
    const group = window.FinanceHouseholdSplits.normalizeGroup({ id:"settle-home", name:"Home", ownerMemberId:"settle-you", createdAt:stampValue, updatedAt:stampValue, members:[{ id:"settle-you", name:"You", sortIndex:0, createdAt:stampValue, updatedAt:stampValue }, { id:"settle-alex", name:"Alex", sortIndex:1, createdAt:stampValue, updatedAt:stampValue }] });
    data.ledgerSettings.householdSplits = window.FinanceHouseholdSplits.normalizeStore({ groups:[group] });
    const allocation = window.FinanceHouseholdSplits.allocateShares(1000, group.members, "equal");
    data.expenses.push({ id:"settle-bill", name:"Shared rent", amount:1000, date:"2026-08-28", paid:true, paidAmount:0, accountDeducted:false, householdSplit:window.FinanceHouseholdSplits.normalizeSplit({ groupId:group.id, groupName:group.name, ownerMemberId:group.ownerMemberId, method:"equal", totalAmount:1000, shares:allocation.shares, payerMemberId:"settle-alex", updatedAt:stampValue }, 1000, group) });
    saveData("Settlement fixture ready"); window.FinanceHouseholdSplits.render();
  }, stamp);
  const before = await page.evaluate(() => ({ accounts:JSON.stringify(data.accounts), ledger:JSON.stringify(data.accountLedger || []), income:data.incomeRecords.length, expenses:data.expenses.length }));
  await page.locator('[data-household-settle="settle-home"]').click();
  await page.locator("#householdSettlementFrom").selectOption("settle-you");
  await page.locator("#householdSettlementTo").selectOption("settle-alex");
  await page.locator("#householdSettlementAmount").fill("500");
  await page.locator("#householdSettlementForm button[type=submit]").click();
  await expect(page.locator("#householdSettlementDialog")).toBeHidden();
  const after = await page.evaluate(() => ({ accounts:JSON.stringify(data.accounts), ledger:JSON.stringify(data.accountLedger || []), income:data.incomeRecords.length, expenses:data.expenses.length, positions:window.FinanceHouseholdSplits.positions(data.ledgerSettings.householdSplits, data.expenses, "settle-home") }));
  expect(after.accounts).toBe(before.accounts);
  expect(after.ledger).toBe(before.ledger);
  expect(after.income).toBe(before.income);
  expect(after.expenses).toBe(before.expenses);
  expect(after.positions.every(member => member.position === 0)).toBe(true);
});

test("household tools remain compact without phone overflow", async ({ page }) => {
  await openHouseholdTools(page, { width:390, height:844 });
  const geometry = await page.evaluate(() => ({
    overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    short:[...document.querySelectorAll("#financeToolsHouseholdSplits button, #financeToolsHouseholdSplits .button")].filter(node => {
      const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && (rect.height < 34.5 || rect.height > 35.5);
    }).map(node => ({ text:node.textContent.trim(), width:node.getBoundingClientRect().width, height:node.getBoundingClientRect().height }))
  }));
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.short).toEqual([]);
  await page.locator("[data-household-add-group]").click();
  const dialogOverflow = await page.locator("#householdGroupDialog").evaluate(dialog => dialog.scrollWidth - dialog.clientWidth);
  expect(dialogOverflow).toBeLessThanOrEqual(1);
});
