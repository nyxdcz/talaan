import { expect, test } from "../helpers/browser-fixtures.mjs";
/* global data */

const BASE = "http://127.0.0.1:3000";
const DESKTOP = { width:1440, height:900 };
const IPHONE_14_PRO = { width:393, height:852 };

async function unlockPaid(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/?page=paid-expenses`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock && window.FinanceTransactionViews));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await page.waitForFunction(() => Boolean(document.getElementById("transactionToolbar-paid") && document.getElementById("paidProductivityBulk")));
}

async function resetPaidViewPreferences(page) {
  await page.evaluate(() => {
    localStorage.removeItem(window.FinanceTransactionViews.storageKey);
    window.dispatchEvent(new CustomEvent("finance:profile-changed"));
  });
}

async function cleanupPaidUxFixtures(page) {
  await page.evaluate(() => {
    ["uxParityPaidSelection", "uxParityEditTarget", "uxParityCalendarEntry"].forEach(id => document.getElementById(id)?.remove());
    const dialog = document.getElementById("expenseDialog");
    if (dialog?.open) dialog.close();
    delete window.__paidUxEditOpened;
  });
}

async function controlContract(page) {
  return page.evaluate(() => {
    const toolbar = document.getElementById("transactionToolbar-paid");
    const bulk = document.getElementById("paidProductivityBulk");
    const visible = node => getComputedStyle(node).display !== "none" && !node.hidden;
    const options = selector => [...document.querySelector(selector).options].map(option => ({ value:option.value, text:option.textContent.trim() }));
    return {
      modes:[...toolbar.querySelectorAll("[data-transaction-mode]")].map(button => button.textContent.trim()),
      savedViewVisible:visible(toolbar.querySelector("[data-transaction-saved-view]")),
      saveViewVisible:visible(toolbar.querySelector("[data-save-transaction-view]")),
      columnsVisible:visible(toolbar.querySelector("[data-open-transaction-columns]")),
      sortVisible:visible(toolbar.querySelector("[data-transaction-sort]")),
      densityVisible:visible(toolbar.querySelector("[data-transaction-density]")),
      sortOptions:options("#transactionToolbar-paid [data-transaction-sort]"),
      densityOptions:options("#transactionToolbar-paid [data-transaction-density]"),
      bulkActionOptions:options("#paidProductivityAction"),
      applyVisible:visible(bulk.querySelector("#applyPaidProductivityAction")),
      clearVisible:visible(bulk.querySelector("#clearPaidProductivitySelection")),
      selectAllVisible:visible(bulk.querySelector("#selectAllVisiblePaid"))
    };
  });
}

async function exercisePaidUx(page) {
  await cleanupPaidUxFixtures(page);
  const beforeData = await page.evaluate(() => JSON.stringify(data));

  await page.locator('#transactionToolbar-paid [data-transaction-mode="calendar"]').click();
  await expect(page.locator("#transactionCalendar-paid")).toBeVisible();
  const calendarState = await page.evaluate(() => ({
    mode:window.FinanceTransactionViews.getState().paid.mode,
    pageClass:document.getElementById("paid-expenses").classList.contains("transaction-calendar-mode")
  }));

  await page.locator("#transactionToolbar-paid [data-transaction-sort]").selectOption("amount-high");
  const sortState = await page.evaluate(() => window.FinanceTransactionViews.getState().paid.sort);

  await page.locator("#transactionToolbar-paid [data-transaction-density]").selectOption("compact");
  const densityState = await page.evaluate(() => ({
    density:window.FinanceTransactionViews.getState().paid.density,
    compactClass:document.getElementById("paid-expenses").classList.contains("transaction-density-compact")
  }));

  await page.evaluate(() => { window.prompt = () => "UX parity view"; });
  await page.locator("#transactionToolbar-paid [data-save-transaction-view]").click();
  const savedView = await page.evaluate(() => {
    const state = window.FinanceTransactionViews.getState().paid;
    return state.views.at(-1)?.name || "";
  });

  await page.locator("#paidProductivityAction").selectOption("category");
  const bulkValueState = await page.locator("#paidProductivityValue").evaluate(select => ({
    disabled:select.disabled,
    optionCount:select.options.length
  }));

  await page.evaluate(() => {
    document.getElementById("uxParityPaidSelection")?.remove();
    const host = document.getElementById("paidProductivityBulk");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "uxParityPaidSelection";
    checkbox.dataset.selectPaidExpense = "ux-parity-paid";
    host.appendChild(checkbox);
  });
  await page.locator("#uxParityPaidSelection").check();
  await expect(page.locator("#paidProductivitySelectedCount")).toContainText("1 selected");
  await page.locator("#clearPaidProductivitySelection").click();
  await expect(page.locator("#paidProductivitySelectedCount")).toContainText("0 selected");

  await page.evaluate(() => {
    document.getElementById("uxParityEditTarget")?.remove();
    document.getElementById("uxParityCalendarEntry")?.remove();
    window.__paidUxEditOpened = false;
    const edit = document.createElement("button");
    edit.id = "uxParityEditTarget";
    edit.dataset.editExpense = "ux-parity-open";
    edit.addEventListener("click", () => { window.__paidUxEditOpened = true; });
    document.body.appendChild(edit);
    const entry = document.createElement("button");
    entry.id = "uxParityCalendarEntry";
    entry.dataset.transactionOpen = "ux-parity-open";
    entry.textContent = "Open paid expense";
    document.getElementById("transactionCalendar-paid").appendChild(entry);
  });
  await page.locator("#uxParityCalendarEntry").click();
  const calendarOpenWorked = await page.evaluate(() => window.__paidUxEditOpened === true);
  const editDialog = page.locator("#expenseDialog");
  await expect(editDialog).toBeVisible();
  const editDialogOpened = await editDialog.evaluate(dialog => dialog.open === true);
  await editDialog.evaluate(dialog => dialog.close());
  await expect(editDialog).toBeHidden();

  await page.locator('#transactionToolbar-paid [data-transaction-mode="list"]').click();
  await expect(page.locator("#transactionCalendar-paid")).toBeHidden();
  const listState = await page.evaluate(() => window.FinanceTransactionViews.getState().paid.mode);

  const dataUnchanged = await page.evaluate(before => JSON.stringify(data) === before, beforeData);
  await cleanupPaidUxFixtures(page);

  return {
    calendarState,
    sortState,
    densityState,
    savedView,
    bulkValueState,
    calendarOpenWorked,
    editDialogOpened,
    listState,
    dataUnchanged
  };
}

test("Paid Expenses phone exposes the same functional controls as desktop except desktop-only Columns", async ({ page }) => {
  await unlockPaid(page, DESKTOP);
  await resetPaidViewPreferences(page);
  const desktop = await controlContract(page);

  await page.setViewportSize(IPHONE_14_PRO);
  const phone = await controlContract(page);

  expect(phone.modes).toEqual(desktop.modes);
  expect(phone.savedViewVisible).toBe(desktop.savedViewVisible);
  expect(phone.saveViewVisible).toBe(desktop.saveViewVisible);
  expect(phone.sortVisible).toBe(desktop.sortVisible);
  expect(phone.densityVisible).toBe(desktop.densityVisible);
  expect(phone.sortOptions).toEqual(desktop.sortOptions);
  expect(phone.densityOptions).toEqual(desktop.densityOptions);
  expect(phone.bulkActionOptions).toEqual(desktop.bulkActionOptions);
  expect(phone.applyVisible).toBe(desktop.applyVisible);
  expect(phone.clearVisible).toBe(desktop.clearVisible);
  expect(phone.selectAllVisible).toBe(desktop.selectAllVisible);
  expect(desktop.columnsVisible).toBe(true);
  expect(phone.columnsVisible).toBe(false);
});

test("iPhone 14 Pro Paid Expenses interactions produce the same state transitions as desktop", async ({ page }) => {
  await unlockPaid(page, DESKTOP);
  await resetPaidViewPreferences(page);
  const desktop = await exercisePaidUx(page);

  await resetPaidViewPreferences(page);
  await cleanupPaidUxFixtures(page);
  await unlockPaid(page, IPHONE_14_PRO);
  await resetPaidViewPreferences(page);
  const phone = await exercisePaidUx(page);

  expect(phone).toEqual(desktop);
  expect(phone.calendarState).toEqual({ mode:"calendar", pageClass:true });
  expect(phone.sortState).toBe("amount-high");
  expect(phone.densityState).toEqual({ density:"compact", compactClass:true });
  expect(phone.savedView).toBe("UX parity view");
  expect(typeof phone.bulkValueState.disabled).toBe("boolean");
  expect(phone.bulkValueState.optionCount).toBeGreaterThanOrEqual(1);
  expect(phone.calendarOpenWorked).toBe(true);
  expect(phone.editDialogOpened).toBe(true);
  expect(phone.listState).toBe("list");
  expect(phone.dataUnchanged).toBe(true);
});
