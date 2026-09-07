import { test, expect } from "@playwright/test";

async function loadFixture(page, width) {
  await page.setViewportSize({ width, height:900 });
  await page.setContent(`<!doctype html><html data-theme="light"><head>
    <link rel="stylesheet" href="http://127.0.0.1:3000/app.css?v=2.5.0-talaan1">
    <link rel="stylesheet" href="http://127.0.0.1:3000/summary-mascots.css?v=2.5.0-talaan1">
    <link rel="stylesheet" href="http://127.0.0.1:3000/transaction-views.css?v=2.5.0-talaan1">
    <link rel="stylesheet" href="http://127.0.0.1:3000/production-ui-audit.css?v=2.5.0-talaan1">
  </head><body><div class="app"><main class="main"><div class="content">
    <section class="page active" id="money">
      <details class="expense-filters-panel" id="expenseFiltersPanel" open>
        <summary><span>Filters &amp; actions</span><small>Search and manage expenses</small></summary>
        <div class="toolbar expense-toolbar-compact expense-toolbar-single-line" aria-label="Expense filters and actions">
          <div class="bulk-expense-inline" id="bulkExpenseBar" aria-label="Select visible expenses">
            <label class="bulk-select-label" for="selectAllVisibleExpenses"><input id="selectAllVisibleExpenses" type="checkbox"><span>Select visible</span></label>
            <span class="bulk-selected-count" id="bulkSelectedCount">0 selected</span>
          </div>
          <div class="field expense-search-field"><input class="input" id="expenseSearch" placeholder="Name or note"></div>
          <div class="field"><select class="select" id="expenseDateFilter"><option value="month">Selected month</option><option value="all">All dates</option></select></div>
          <div class="field"><select class="select" id="expenseCategoryFilter"><option value="">All categories</option><option>Bills</option></select></div>
          <button class="button button-secondary productivity-advanced-filter-button" type="button">More filters</button>
          <button class="button button-secondary expense-clear-filters" type="button">Clear</button>
        </div>
      </details>
      <div class="transaction-workspace-toolbar no-print" id="transactionToolbar-expense" data-transaction-workspace="expense">
        <div class="transaction-view-group" role="group" aria-label="Display mode"><button class="button button-secondary" type="button" aria-pressed="true">List</button><button class="button button-secondary" type="button" aria-pressed="false">Calendar</button></div>
        <label><select class="select" data-transaction-saved-view><option value="">Saved views</option><option value="0">Legacy all dates</option></select></label>
        <button class="button button-secondary" type="button">Save view</button>
        <button class="button button-secondary transaction-columns-button" type="button" data-open-transaction-columns>Columns</button>
        <label><select class="select" data-transaction-sort><option>Newest first</option></select></label>
        <label><select class="select" data-transaction-density><option>Comfortable</option><option>Compact</option></select></label>
      </div>
      <div class="section-stack">
        <article class="card period-card period-early"><div class="period-header"><div><h3>First half of the month</h3><p>Unpaid expenses due on days 1–15</p></div><div class="collapse-actions"><strong>₱0.00</strong></div></div></article>
        <article class="card period-card period-late"><div class="period-header"><div><h3>Second half of the month</h3><p>Unpaid expenses due on days 16–end</p></div><div class="collapse-actions"><strong>₱2,250.00</strong></div></div></article>
        <article class="card period-card period-other"><div class="period-header"><div><h3>Other expenses</h3><p>Unpaid one-time expenses</p></div><div class="collapse-actions"><strong>₱640.00</strong></div></div></article>
      </div>
    </section>
  </div></main></div>
  <script>window.renderCount=0;window.renderMoneyPage=()=>{window.renderCount+=1;};</script>
  <script src="http://127.0.0.1:3000/summary-mascots.js?v=2.5.0-talaan1"></script>
  </body></html>`, { waitUntil:"networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.FinanceCompactExpenseToolbar))).toBe(true);
}

test("desktop Budget & Expenses uses one compact aligned control system", async ({ page }) => {
  await loadFixture(page, 1440);

  const state = await page.evaluate(() => {
    const panel = document.getElementById("expenseFiltersPanel");
    const row = panel.querySelector(":scope > .expense-toolbar-single-line");
    const toolbar = document.getElementById("transactionToolbar-expense");
    const active = toolbar.querySelector('[aria-pressed="true"]');
    const saved = toolbar.querySelector("[data-transaction-saved-view]");
    const sort = toolbar.querySelector("[data-transaction-sort]");
    const bulk = document.getElementById("bulkExpenseBar");
    const date = document.getElementById("expenseDateFilter");
    const visibleControls = [...row.querySelectorAll(".input,.select,.button")].filter(control => getComputedStyle(control).display !== "none" && control.getBoundingClientRect().width > 0);
    const periodHeaders = [...document.querySelectorAll("#money .period-card>.period-header")];
    return {
      toolbarInsideRow:toolbar.parentElement === row,
      rowWrap:getComputedStyle(row).flexWrap,
      toolbarWrap:getComputedStyle(toolbar).flexWrap,
      bulkStillConnected:bulk.isConnected,
      bulkDisplay:getComputedStyle(bulk).display,
      dateDisplay:getComputedStyle(date.closest(".field")).display,
      monthValue:date.value,
      densityExists:Boolean(toolbar.querySelector("[data-transaction-density]")),
      compact:document.getElementById("money").classList.contains("transaction-density-compact"),
      activeHeight:active.getBoundingClientRect().height,
      savedHeight:saved.getBoundingClientRect().height,
      savedWidth:saved.getBoundingClientRect().width,
      sortWidth:sort.getBoundingClientRect().width,
      rowHeight:row.getBoundingClientRect().height,
      controlHeights:visibleControls.map(control => control.getBoundingClientRect().height),
      rowOverflows:row.scrollWidth > row.clientWidth + 1,
      periodHeaderHeights:periodHeaders.map(header => header.getBoundingClientRect().height)
    };
  });

  expect(state.toolbarInsideRow).toBe(true);
  expect(state.rowWrap).toBe("nowrap");
  expect(state.toolbarWrap).toBe("nowrap");
  expect(state.bulkStillConnected).toBe(true);
  expect(state.bulkDisplay).toBe("none");
  expect(state.dateDisplay).toBe("none");
  expect(state.monthValue).toBe("month");
  expect(state.densityExists).toBe(false);
  expect(state.compact).toBe(true);
  expect(state.activeHeight).toBeCloseTo(28, 0);
  expect(state.savedHeight).toBeCloseTo(34, 0);
  expect(state.savedWidth).toBeCloseTo(142, 0);
  expect(state.sortWidth).toBeCloseTo(146, 0);
  expect(state.rowHeight).toBeLessThanOrEqual(50);
  state.controlHeights.filter(height => height > 30).forEach(height => expect(height).toBeCloseTo(34, 0));
  expect(state.rowOverflows).toBe(false);
  state.periodHeaderHeights.forEach(height => expect(height).toBeCloseTo(54, 0));
});

test("tablet keeps transaction controls outside the collapsible filter panel", async ({ page }) => {
  await loadFixture(page, 1024);

  const state = await page.evaluate(() => {
    const panel = document.getElementById("expenseFiltersPanel");
    const toolbar = document.getElementById("transactionToolbar-expense");
    return {
      outside:!panel.contains(toolbar),
      followsPanel:panel.nextElementSibling === toolbar,
      monthValue:document.getElementById("expenseDateFilter").value,
      densityExists:Boolean(toolbar.querySelector("[data-transaction-density]"))
    };
  });

  expect(state).toEqual({ outside:true, followsPanel:true, monthValue:"month", densityExists:false });
});

test("phone keeps touch-safe transaction controls outside filters", async ({ page }) => {
  await loadFixture(page, 390);

  const state = await page.evaluate(() => {
    const panel = document.getElementById("expenseFiltersPanel");
    const toolbar = document.getElementById("transactionToolbar-expense");
    const modeButtons = [...toolbar.querySelectorAll(".transaction-view-group .button")];
    const saved = toolbar.querySelector("[data-transaction-saved-view]");
    return {
      outside:!panel.contains(toolbar),
      modeHeights:modeButtons.map(button => button.getBoundingClientRect().height),
      savedHeight:saved.getBoundingClientRect().height,
      columnsDisplay:getComputedStyle(toolbar.querySelector(".transaction-columns-button")).display
    };
  });

  expect(state.outside).toBe(true);
  state.modeHeights.forEach(height => expect(height).toBe(35));
  expect(state.savedHeight).toBeGreaterThanOrEqual(44);
  expect(state.columnsDisplay).toBe("none");
});

test("legacy saved views cannot switch Budget & Expenses away from the selected month", async ({ page }) => {
  await loadFixture(page, 1440);

  await page.evaluate(() => {
    document.addEventListener("change", event => {
      if (event.target?.matches?.("#transactionToolbar-expense [data-transaction-saved-view]")) {
        document.getElementById("expenseDateFilter").value = "all";
      }
    });
    const saved = document.querySelector("#transactionToolbar-expense [data-transaction-saved-view]");
    saved.value = "0";
    saved.dispatchEvent(new Event("change", { bubbles:true }));
  });

  await expect.poll(() => page.evaluate(() => document.getElementById("expenseDateFilter").value)).toBe("month");
  await expect.poll(() => page.evaluate(() => window.renderCount)).toBeGreaterThan(0);
});
