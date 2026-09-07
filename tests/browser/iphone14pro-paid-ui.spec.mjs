import { test, expect } from "@playwright/test";

const IPHONE_14_PRO = { width:393, height:852 };

async function loadPaidExpensesPhoneFixture(page) {
  await page.setViewportSize(IPHONE_14_PRO);
  await page.setContent(`<!doctype html><html data-theme="light"><head>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <link rel="stylesheet" href="http://127.0.0.1:3000/app.css?v=2.5.0-talaan1">
    <link rel="stylesheet" href="http://127.0.0.1:3000/mobile.css?v=2.5.0-talaan1">
    <link rel="stylesheet" href="http://127.0.0.1:3000/productivity-tools.css?v=2.5.0-talaan1">
    <link rel="stylesheet" href="http://127.0.0.1:3000/transaction-views.css?v=2.5.0-talaan1">
    <link rel="stylesheet" href="http://127.0.0.1:3000/production-ui-audit.css?v=2.5.0-talaan1">
  </head><body><div class="app"><main class="main"><div class="content">
    <section class="page active" id="paid-expenses">
      <div class="productivity-paid-bulk" id="paidProductivityBulk">
        <label class="productivity-paid-select"><input id="selectAllVisiblePaid" type="checkbox"> Select visible</label>
        <strong id="paidProductivitySelectedCount">21 selected</strong>
        <select class="select" id="paidProductivityAction"><option>Correct payment account</option></select>
        <select class="select" id="paidProductivityValue"><option>Very long payment account name for mobile fit testing</option></select>
        <button class="button button-primary button-small" type="button">Apply</button>
        <button class="button button-secondary button-small" type="button">Clear</button>
      </div>

      <div class="transaction-workspace-toolbar no-print" id="transactionToolbar-paid" data-transaction-workspace="paid">
        <div class="transaction-view-group" role="group" aria-label="Display mode">
          <button class="button button-secondary" type="button" aria-pressed="false">List</button>
          <button class="button button-secondary" type="button" aria-pressed="true">Calendar</button>
        </div>
        <label><select class="select" data-transaction-saved-view><option>Saved views</option></select></label>
        <button class="button button-secondary" type="button">Save view</button>
        <button class="button button-secondary transaction-columns-button" type="button">Columns</button>
        <label><select class="select" data-transaction-sort><option>Amount: high to low</option></select></label>
        <label><select class="select" data-transaction-density><option>Comfortable</option></select></label>
      </div>

      <div class="transaction-calendar" id="transactionCalendar-paid">
        <section class="transaction-calendar-day">
          <h4>Aug 15, 2026</h4>
          <button class="transaction-calendar-entry"><span>Electric &amp; Water Bill With A Deliberately Long Expense Name</span><strong>₱12,345.67</strong></button>
          <button class="transaction-calendar-entry"><span>Rent</span><strong>₱3,500.00</strong></button>
          <button class="transaction-calendar-entry"><span>Internet</span><strong>₱1,499.00</strong></button>
        </section>
        <section class="transaction-calendar-day">
          <h4>Aug 17, 2026</h4>
          <button class="transaction-calendar-entry"><span>Lunch</span><strong>₱170.00</strong></button>
        </section>
      </div>

      <div class="transaction-totals-footer" id="transactionTotals-paid"><span>21 visible</span><span>21 selected · <strong>₱31,157.49</strong></span></div>
    </section>
  </div></main></div></body></html>`, { waitUntil:"networkidle" });
}

function rectFits(innerWidth, rect, tolerance = 1) {
  return rect.left >= -tolerance && rect.right <= innerWidth + tolerance && rect.width <= innerWidth + tolerance;
}

test("Paid Expenses fits an iPhone 14 Pro viewport without horizontal overflow", async ({ page }) => {
  await loadPaidExpensesPhoneFixture(page);

  const state = await page.evaluate(() => {
    const host = document.getElementById("paid-expenses");
    const selectors = [
      "#paidProductivityBulk",
      "#transactionToolbar-paid",
      "#transactionCalendar-paid",
      "#transactionTotals-paid",
      "#transactionCalendar-paid .transaction-calendar-day",
      "#transactionCalendar-paid .transaction-calendar-entry"
    ];
    const rects = selectors.flatMap(selector => [...document.querySelectorAll(selector)]).map(node => {
      const rect = node.getBoundingClientRect();
      return { selector:node.id ? `#${node.id}` : node.className, left:rect.left, right:rect.right, width:rect.width };
    });
    const visibleToolbarControls = [...document.querySelectorAll("#transactionToolbar-paid .button,#transactionToolbar-paid .select")]
      .filter(node => getComputedStyle(node).display !== "none");
    const visibleBulkControls = [...document.querySelectorAll("#paidProductivityBulk .button,#paidProductivityBulk .select")]
      .filter(node => getComputedStyle(node).display !== "none");
    const visibleToolbarButtons = visibleToolbarControls.filter(node => node.matches(".button"));
    const visibleToolbarFields = visibleToolbarControls.filter(node => node.matches(".select"));
    const visibleBulkButtons = visibleBulkControls.filter(node => node.matches(".button"));
    const visibleBulkFields = visibleBulkControls.filter(node => node.matches(".select"));
    const calendar = document.getElementById("transactionCalendar-paid");
    const entry = calendar.querySelector(".transaction-calendar-entry");
    const entryName = entry.querySelector("span");
    const entryAmount = entry.querySelector("strong");
    const hostRect = host.getBoundingClientRect();
    return {
      innerWidth:window.innerWidth,
      innerHeight:window.innerHeight,
      documentClientWidth:document.documentElement.clientWidth,
      documentScrollWidth:document.documentElement.scrollWidth,
      bodyScrollWidth:document.body.scrollWidth,
      hostLeft:hostRect.left,
      hostRight:hostRect.right,
      hostWidth:hostRect.width,
      rects,
      toolbarHeights:visibleToolbarControls.map(node => node.getBoundingClientRect().height),
      bulkHeights:visibleBulkControls.map(node => node.getBoundingClientRect().height),
      toolbarButtonHeights:visibleToolbarButtons.map(node => node.getBoundingClientRect().height),
      toolbarFieldHeights:visibleToolbarFields.map(node => node.getBoundingClientRect().height),
      bulkButtonHeights:visibleBulkButtons.map(node => node.getBoundingClientRect().height),
      bulkFieldHeights:visibleBulkFields.map(node => node.getBoundingClientRect().height),
      calendarColumns:getComputedStyle(calendar).gridTemplateColumns,
      entryColumns:getComputedStyle(entry).gridTemplateColumns,
      entryNameWhiteSpace:getComputedStyle(entryName).whiteSpace,
      entryAmountWhiteSpace:getComputedStyle(entryAmount).whiteSpace,
      columnsButtonDisplay:getComputedStyle(document.querySelector(".transaction-columns-button")).display
    };
  });

  expect(state.innerWidth).toBe(393);
  expect(state.innerHeight).toBe(852);
  expect(state.documentClientWidth).toBe(393);
  expect(state.documentScrollWidth).toBeLessThanOrEqual(393);
  expect(state.bodyScrollWidth).toBeLessThanOrEqual(393);
  expect(rectFits(state.innerWidth, { left:state.hostLeft, right:state.hostRight, width:state.hostWidth })).toBe(true);
  state.rects.forEach(rect => expect(rectFits(state.innerWidth, rect), `${rect.selector} should stay inside the phone viewport`).toBe(true));
  state.toolbarButtonHeights.forEach(height => expect(height).toBe(35));
  state.bulkButtonHeights.forEach(height => expect(height).toBe(35));
  state.toolbarFieldHeights.forEach(height => expect(height).toBeGreaterThanOrEqual(44));
  state.bulkFieldHeights.forEach(height => expect(height).toBeGreaterThanOrEqual(44));
  expect(state.calendarColumns.trim().split(/\s+/)).toHaveLength(1);
  expect(state.entryColumns.trim().split(/\s+/)).toHaveLength(2);
  expect(state.entryNameWhiteSpace).toBe("nowrap");
  expect(state.entryAmountWhiteSpace).toBe("nowrap");
  expect(state.columnsButtonDisplay).toBe("none");
});
