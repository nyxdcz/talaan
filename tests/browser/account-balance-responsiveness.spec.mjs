import { test, expect } from "../helpers/browser-fixtures.mjs";
/* global data, availableMoney, money, selectedExpenseIds, ensureSavedExpensesForMonth */

test.use({ serviceWorkers:"block" });

async function openMoney(page, width = 393) {
  await page.setViewportSize({ width, height:852 });
  await page.goto("http://127.0.0.1:3000/?page=money", { waitUntil:"networkidle" });
  await page.waitForFunction(() => window.FinanceAccountMutations && window.FinanceTransactionViews);
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
}

async function openCorrection(page) {
  const setup = await page.evaluate(() => {
    const card = document.querySelector("#moneyAccounts [data-account-card]");
    const account = card.dataset.accountCard;
    const original = data.accounts[account];
    window.__balanceCard = card;
    window.__expenseRow = document.querySelector("[data-expense-row]");
    window.__ledgerRow = document.querySelector("#accountLedgerBody tr");
    return { account, original, target:original + 1234.56 };
  });
  await page.locator("#moneyAccounts [data-edit-account]").first().click();
  await page.locator("#accountBalance").fill(String(setup.target));
  return setup;
}

for (const width of [393, 1440]) {
  test(`balance correction preserves expense rows and persists matching totals at ${width}px`, async ({ page }) => {
    await openMoney(page, width);
    await page.evaluate(() => {
      const item = data.expenses.find(item => !item.paid);
      if (item) selectedExpenseIds.add(item.id);
      window.__selectedBefore = [...selectedExpenseIds];
      window.__viewBefore = window.FinanceTransactionViews.getState();
    });
    const setup = await openCorrection(page);
    await page.locator("#accountPrimaryAction").click();
    await expect(page.locator("#accountDialog")).not.toBeVisible();
    const result = await page.evaluate(({ account, target }) => {
      const local = JSON.parse(localStorage.getItem("simple-finance-project-records-v2"));
      const profileId = window.FinanceProfileArchitecture.activeProfileId();
      const profile = JSON.parse(localStorage.getItem(`simple-finance-profile-data-v1:${profileId}`));
      return {
        sameCard:window.__balanceCard === document.querySelector("#moneyAccounts [data-account-card]"),
        sameRow:window.__expenseRow === document.querySelector("[data-expense-row]"),
        sameLedgerRow:window.__ledgerRow === document.querySelector("#accountLedgerBody tr"),
        selected:[...selectedExpenseIds], beforeSelected:window.__selectedBefore,
        view:window.FinanceTransactionViews.getState(), beforeView:window.__viewBefore,
        stored:local.accounts[account], profile:profile.accounts[account],
        total:document.getElementById("moneyAvailableTotal").textContent,
        expectedTotal:money(availableMoney()),
        displayed:window.__balanceCard.querySelector(".account-card-main strong").textContent,
        expectedDisplayed:money(target),
        valid:window.FinanceAccountMutations.invariantReport([{ account, target }]).ok,
        activity:window.FinanceProductivityTools.activity.some(item => item.collection === "accounts" && item.recordId === account)
      };
    }, setup);
    expect(result.sameCard).toBe(true);
    expect(result.sameRow).toBe(true);
    expect(result.sameLedgerRow).toBe(true);
    expect(result.selected).toEqual(result.beforeSelected);
    expect(result.view).toEqual(result.beforeView);
    expect(result.stored).toBeCloseTo(setup.target, 2);
    expect(result.profile).toBeCloseTo(setup.target, 2);
    expect(result.total).toBe(result.expectedTotal);
    expect(result.displayed).toBe(result.expectedDisplayed);
    expect(result.valid).toBe(true);
    expect(result.activity).toBe(true);
    if (width <= 700) await expect(page.locator("#moneyAccounts [data-account-card]").first().locator(".account-card-main strong")).toHaveAttribute("title", result.expectedDisplayed);
    await page.evaluate(() => { window.goToPage("settings", { smooth:false }); window.activateSettingsPanel("accounts", false); });
    await expect(page.locator("#accountReconciliationBody")).toContainText(result.expectedDisplayed);
    expect(await page.evaluate(() => window.__ledgerRow.isConnected)).toBe(false);
    await page.reload({ waitUntil:"networkidle" });
    expect(await page.evaluate(account => data.accounts[account], setup.account)).toBeCloseTo(setup.target, 2);
  });
}

test("typing a balance neither persists finance data nor rescans all phone labels", async ({ page }) => {
  await openMoney(page);
  await openCorrection(page);
  await page.evaluate(() => {
    window.__beforeTyping = JSON.stringify(data);
    window.__typingPersists = 0;
    window.addEventListener("finance:data-persisted", () => window.__typingPersists++);
    const query = document.querySelectorAll.bind(document);
    window.__phoneScans = 0;
    document.querySelectorAll = function(selector) {
      if (selector.includes(".transaction-calendar-entry span") && selector.includes(".account-card-label")) window.__phoneScans++;
      return query(selector);
    };
  });
  await page.locator("#accountBalance").fill("");
  await page.locator("#accountBalance").pressSequentially("12345+100", { delay:20 });
  await expect(page.locator("#accountDialog .calculation-preview.show").first()).toContainText("12,445.00");
  const result = await page.evaluate(() => ({ unchanged:window.__beforeTyping === JSON.stringify(data), persists:window.__typingPersists, scans:window.__phoneScans }));
  expect(result).toEqual({ unchanged:true, persists:0, scans:0 });
});

for (const change of ["name", "type", "icon"]) {
  test(`changing account ${change} retains the full refresh`, async ({ page }) => {
    await openMoney(page);
    const setup = await openCorrection(page);
    if (change === "name") await page.locator("#accountName").fill(`${setup.account} renamed`);
    if (change === "type") {
      await page.locator("#accountType").selectOption(await page.locator("#accountType").inputValue() === "Savings" ? "Cash" : "Savings");
    }
    if (change === "icon") await page.evaluate(() => { document.getElementById("accountIconType").value = "emoji"; document.getElementById("accountIconValue").value = "💰"; });
    await page.locator("#accountPrimaryAction").click();
    await expect(page.locator("#accountDialog")).not.toBeVisible();
    expect(await page.evaluate(() => window.__balanceCard.isConnected)).toBe(false);
    if (change === "name") await expect(page.locator("#moneyAccounts")).toContainText(`${setup.account} renamed`);
    if (change === "icon") await expect(page.locator("#moneyAccounts")).toContainText("💰");
  });
}

test("lifecycle changes to expenses invalidate a balance-only refresh", async ({ page }) => {
  await openMoney(page);
  await openCorrection(page);
  await page.evaluate(() => {
    const original = ensureSavedExpensesForMonth;
    window.ensureSavedExpensesForMonth = function(...args) {
      const result = original(...args);
      const row = document.querySelector("[data-expense-row]");
      const item = data.expenses.find(item => item.id === row?.dataset.expenseRow);
      if (item) item.name = "Lifecycle refresh regression";
      window.ensureSavedExpensesForMonth = original;
      return result;
    };
  });
  await page.locator("#accountPrimaryAction").click();
  await expect(page.locator("#accountDialog")).not.toBeVisible();
  await expect(page.locator("#money [data-expense-row]").filter({ hasText:"Lifecycle refresh regression" })).toHaveCount(1);
  expect(await page.evaluate(() => window.__expenseRow.isConnected)).toBe(false);
});

test("phone labels still enhance new and replaced matching elements", async ({ page }) => {
  await openMoney(page);
  await page.evaluate(() => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = '<span class="account-card-label" id="phoneLabelRegression">New label</span>';
    document.body.append(wrapper);
  });
  await expect(page.locator("#phoneLabelRegression")).toHaveAttribute("title", "New label");
  await page.evaluate(() => {
    const label = document.getElementById("phoneLabelRegression");
    label.removeAttribute("title");
    label.textContent = "Replaced label";
  });
  await expect(page.locator("#phoneLabelRegression")).toHaveAttribute("title", "Replaced label");
  await page.evaluate(() => {
    const label = document.getElementById("phoneLabelRegression");
    label.removeAttribute("title");
    label.replaceChildren(Object.assign(document.createElement("span"), { textContent:"Nested label" }));
  });
  await expect(page.locator("#phoneLabelRegression")).toHaveAttribute("title", "Nested label");
});

test("masked balance corrections reveal the updated value and Undo restores the original", async ({ page }) => {
  await openMoney(page);
  await page.evaluate(() => window.FinancePrivacyDisplay.setHidden(true));
  const setup = await openCorrection(page);
  await page.locator("#accountPrimaryAction").click();
  await expect(page.locator("#accountDialog")).not.toBeVisible();
  await page.evaluate(() => window.FinancePrivacyDisplay.mask());
  const amount = page.locator("#moneyAccounts [data-account-card]").first().locator(".account-card-main strong");
  await expect(amount).not.toContainText(String(Math.trunc(setup.target)));
  await page.evaluate(() => window.FinancePrivacyDisplay.setHidden(false));
  await expect(amount).toHaveText(await page.evaluate(target => money(target), setup.target));
  await expect(amount).toHaveAttribute("title", await page.evaluate(target => money(target), setup.target));
  await page.evaluate(() => window.undoLastChange());
  expect(await page.evaluate(account => data.accounts[account], setup.account)).toBe(setup.original);
});
