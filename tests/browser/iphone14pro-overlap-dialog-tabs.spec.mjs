import { expect, test } from "@playwright/test";
/* global data */

const APP_URL = "http://127.0.0.1:3000";
const IPHONE_14_PRO = { width:393, height:852 };

test.use({ serviceWorkers:"block" });

async function openAuthenticated(page, route) {
  await page.setViewportSize(IPHONE_14_PRO);
  await page.goto(`${APP_URL}/?page=${route}`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("body")).toHaveClass(/finance-signed-in/);
}

test("iPhone account modes keep their title, scroll origin, and fields contained", async ({ page }) => {
  await openAuthenticated(page, "money");
  await page.waitForFunction(() => Boolean(window.FinanceAccountLedger));
  await page.evaluate(() => {
    const account = Object.keys(data.accounts || {})[0];
    window.FinanceAccountLedger.openSpend(account);
  });

  const dialog = page.locator("#accountDialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#accountDialogTitle")).toHaveText("Record spending");

  await page.locator("#accountCorrectModeButton").click();
  await expect(page.locator("#accountDialogTitle")).toHaveText("Edit account");
  await page.locator("#accountDialog .modal-body").evaluate(node => {
    node.scrollTop = node.scrollHeight;
    node.scrollLeft = 100;
  });
  await page.locator("#accountSpendModeButton").click();
  await expect(page.locator("#accountDialogTitle")).toHaveText("Record spending");

  const geometry = await dialog.evaluate(node => {
    const body = node.querySelector(".modal-body");
    const bodyRect = body.getBoundingClientRect();
    const visibleFields = [...node.querySelectorAll("#accountSpendPanel .input, #accountSpendPanel .select")]
      .filter(field => field.getClientRects().length)
      .map(field => field.getBoundingClientRect());
    return {
      bodyScrollTop:body.scrollTop,
      bodyScrollLeft:body.scrollLeft,
      dialogInside:node.getBoundingClientRect().left >= -1 && node.getBoundingClientRect().right <= innerWidth + 1,
      fieldsInside:visibleFields.every(rect => rect.left >= bodyRect.left - 1 && rect.right <= bodyRect.right + 1),
      pageOverflow:document.documentElement.scrollWidth > innerWidth + 1
    };
  });

  expect(geometry.bodyScrollTop).toBe(0);
  expect(geometry.bodyScrollLeft).toBe(0);
  expect(geometry.dialogInside).toBe(true);
  expect(geometry.fieldsInside).toBe(true);
  expect(geometry.pageOverflow).toBe(false);
});

test("iPhone account balance correction updates the card and persisted finance data", async ({ page }) => {
  await openAuthenticated(page, "money");
  await page.waitForFunction(() => Boolean(window.FinanceAccountLedger && document.querySelector("#moneyAccounts [data-account-card]")));

  const setup = await page.evaluate(() => {
    const card = document.querySelector("#moneyAccounts [data-account-card]");
    const account = card?.dataset.accountCard || "";
    const original = Number(data.accounts?.[account] || 0);
    const target = Math.round(((original >= 123.45 ? original - 123.45 : original + 123.45) + Number.EPSILON) * 100) / 100;
    return { account, original, target };
  });
  expect(setup.account).not.toBe("");

  const firstCard = page.locator("#moneyAccounts [data-account-card]").first();
  await firstCard.locator("[data-edit-account]").click();
  await expect(page.locator("#accountDialog")).toBeVisible();
  await expect(page.locator("#accountDialogTitle")).toHaveText("Edit account");
  await expect(page.locator("#originalAccountName")).toHaveValue(setup.account);

  await page.locator("#accountBalance").fill(String(setup.target));
  await page.locator("#accountPrimaryAction").click();
  await expect(page.locator("#accountDialog")).not.toBeVisible();

  const result = await page.evaluate(({ account, target, original }) => {
    const card = [...document.querySelectorAll("#moneyAccounts [data-account-card]")]
      .find(node => node.dataset.accountCard === account);
    const cardAmount = Number(String(card?.querySelector(".account-card-main strong")?.textContent || "")
      .replace(/[^0-9.-]/g, ""));
    const persisted = JSON.parse(localStorage.getItem("simple-finance-project-records-v2") || "{}");
    const reconciliation = [...(data.accountReconciliations || [])]
      .reverse()
      .find(item => item.account === account && Number(item.statementBalance) === target);
    return {
      runtimeBalance:Number(data.accounts?.[account]),
      cardAmount,
      persistedBalance:Number(persisted.accounts?.[account]),
      reconciliationDifference:Number(reconciliation?.difference),
      expectedDifference:Math.round(((target - original) + Number.EPSILON) * 100) / 100
    };
  }, setup);

  expect(result.runtimeBalance).toBe(setup.target);
  expect(result.cardAmount).toBe(setup.target);
  expect(result.persistedBalance).toBe(setup.target);
  expect(result.reconciliationDifference).toBe(result.expectedDifference);
});

test("iPhone transaction totals remain in flow with 35px workspace controls", async ({ page }) => {
  await openAuthenticated(page, "money");
  await page.waitForFunction(() => Boolean(document.getElementById("monthlyBudgetPlannerCard") && document.getElementById("transactionTotals-expense")));

  const contract = await page.evaluate(() => {
    const footer = document.getElementById("transactionTotals-expense");
    const planner = document.getElementById("monthlyBudgetPlannerCard");
    const tabs = document.querySelector("#money .money-workspace-switcher");
    const tab = tabs.querySelector(".workspace-switcher-button");
    return {
      footerPosition:getComputedStyle(footer).position,
      plannerParent:planner.parentElement?.id || "",
      plannerBeforeIncomeSummary:planner.nextElementSibling?.classList.contains("income-kpi-grid") || false,
      plannerInMoney:Boolean(document.querySelector("#money #monthlyBudgetPlannerCard")),
      tabShellHeight:tabs.getBoundingClientRect().height,
      tabHeight:tab.getBoundingClientRect().height,
      tabShellShadow:getComputedStyle(tabs).boxShadow,
      pageOverflow:document.documentElement.scrollWidth > innerWidth + 1
    };
  });

  expect(contract.footerPosition).toBe("static");
  expect(contract.plannerParent).toBe("income");
  expect(contract.plannerBeforeIncomeSummary).toBe(true);
  expect(contract.plannerInMoney).toBe(false);
  expect(contract.tabShellHeight).toBe(35);
  expect(contract.tabHeight).toBe(35);
  expect(contract.tabShellShadow).toBe("none");
  expect(contract.pageOverflow).toBe(false);
});

test("iPhone Project Agenda actions stay compact inside their horizontal rail", async ({ page }) => {
  await openAuthenticated(page, "projects");
  await page.waitForFunction(() => Boolean(document.querySelector(".project-calendar-v13020 .pc-header-actions")));

  const contract = await page.evaluate(() => {
    const tabs = document.querySelector("#projects .project-workspace-switcher");
    const actions = document.querySelector(".project-calendar-v13020 .pc-header-actions");
    const view = actions.querySelector("[data-pc-view]");
    const column = actions.querySelector('[data-kanban-add-column="agenda"]');
    const add = actions.querySelector("[data-pc-add]");
    const board = document.querySelector(".project-calendar-v13020 .finance-kanban-board");
    const agenda = document.querySelector(".project-calendar-v13020 .pc-agenda");
    const rect = node => node.getBoundingClientRect();
    return {
      tabShellHeight:rect(tabs).height,
      viewWidth:rect(view).width,
      viewHeight:rect(view).height,
      columnWidth:rect(column).width,
      columnHeight:rect(column).height,
      addSize:[rect(add).width, rect(add).height],
      actionRowAligned:Math.abs(rect(view).top - rect(column).top) < 1 && Math.abs(rect(view).top - rect(add).top) < 1,
      columnTextFits:column.scrollWidth <= column.clientWidth + 1,
      agendaContainsBoard:rect(board).left >= rect(agenda).left - 1 && rect(board).right <= rect(agenda).right + 1,
      boardOverflow:getComputedStyle(board).overflowX,
      pageOverflow:document.documentElement.scrollWidth > innerWidth + 1
    };
  });

  expect(contract.tabShellHeight).toBe(35);
  expect(contract.viewWidth).toBeGreaterThanOrEqual(100);
  expect(contract.viewHeight).toBe(35);
  expect(contract.columnWidth).toBeGreaterThanOrEqual(100);
  expect(contract.columnHeight).toBe(35);
  expect(contract.addSize).toEqual([35, 35]);
  expect(contract.actionRowAligned).toBe(true);
  expect(contract.columnTextFits).toBe(true);
  expect(contract.agendaContainsBoard).toBe(true);
  expect(["auto", "scroll"]).toContain(contract.boardOverflow);
  expect(contract.pageOverflow).toBe(false);
});
