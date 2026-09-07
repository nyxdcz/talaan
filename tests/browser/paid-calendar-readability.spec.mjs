import { test, expect } from "@playwright/test";

async function loadPaidCalendarFixture(page, width) {
  await page.setViewportSize({ width, height:900 });
  await page.setContent(`<!doctype html><html data-theme="light"><head>
    <link rel="stylesheet" href="http://127.0.0.1:3000/app.css?v=2.5.0-talaan1">
    <link rel="stylesheet" href="http://127.0.0.1:3000/ui-radius.css?v=2.5.0-talaan4">
    <link rel="stylesheet" href="http://127.0.0.1:3000/productivity-tools.css?v=2.5.0-talaan1">
    <link rel="stylesheet" href="http://127.0.0.1:3000/transaction-views.css?v=2.5.0-talaan1">
    <link rel="stylesheet" href="http://127.0.0.1:3000/production-ui-audit.css?v=2.5.0-talaan1">
  </head><body><div class="app"><main class="main"><div class="content">
    <section class="page active" id="paid-expenses">
      <div class="productivity-paid-bulk" id="paidProductivityBulk">
        <label class="productivity-paid-select"><input id="selectAllVisiblePaid" type="checkbox"> Select visible</label>
        <strong id="paidProductivitySelectedCount">0 selected</strong>
        <select class="select" id="paidProductivityAction"><option>Bulk action</option></select>
        <select class="select" id="paidProductivityValue"><option>Choose a value</option></select>
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
        <label><select class="select" data-transaction-sort><option>Default sort</option></select></label>
        <label><select class="select" data-transaction-density><option>Comfortable</option></select></label>
      </div>

      <div class="transaction-calendar" id="transactionCalendar-paid">
        <section class="transaction-calendar-day"><h4>Aug 3, 2026</h4><button class="transaction-calendar-entry"><span>Gloan</span><strong>₱3,447.00</strong></button><button class="transaction-calendar-entry"><span>Maya Credit</span><strong>₱9,815.00</strong></button><button class="transaction-calendar-entry"><span>PLDT</span><strong>₱1,499.00</strong></button></section>
        <section class="transaction-calendar-day"><h4>Aug 5, 2026</h4><button class="transaction-calendar-entry"><span>Electric &amp; Water Bill</span><strong>₱2,435.00</strong></button></section>
        <section class="transaction-calendar-day"><h4>Aug 11, 2026</h4><button class="transaction-calendar-entry"><span>GLoan 2</span><strong>₱1,916.00</strong></button></section>
        <section class="transaction-calendar-day"><h4>Aug 14, 2026</h4><button class="transaction-calendar-entry"><span>SPayLater</span><strong>₱546.00</strong></button></section>
        <section class="transaction-calendar-day"><h4>Aug 15, 2026</h4><button class="transaction-calendar-entry"><span>dogfood</span><strong>₱40.00</strong></button><button class="transaction-calendar-entry"><span>lunch</span><strong>₱471.00</strong></button><button class="transaction-calendar-entry"><span>Rent</span><strong>₱3,500.00</strong></button></section>
        <section class="transaction-calendar-day"><h4>Aug 16, 2026</h4><button class="transaction-calendar-entry"><span>breakfast</span><strong>₱200.00</strong></button></section>
        <section class="transaction-calendar-day"><h4>Aug 17, 2026</h4><button class="transaction-calendar-entry"><span>lunch</span><strong>₱170.00</strong></button></section>
      </div>

      <div class="transaction-totals-footer" id="transactionTotals-paid"><span>21 visible</span><span><strong>₱31,157.49</strong></span></div>
    </section>
  </div></main></div></body></html>`, { waitUntil:"networkidle" });
  await page.evaluate(() => {
    const money = document.createElement("section");
    money.className = "page active";
    money.id = "money";
    const budgetCalendar = document.getElementById("transactionCalendar-paid").cloneNode(true);
    budgetCalendar.id = "transactionCalendar-expense";
    money.append(budgetCalendar);
    document.querySelector(".content").append(money);
  });
}

function columnCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

test("desktop paid calendar separates dates and keeps names and amounts easy to scan", async ({ page }) => {
  await loadPaidCalendarFixture(page, 1440);

  const state = await page.evaluate(() => {
    const calendar = document.getElementById("transactionCalendar-paid");
    const day = calendar.querySelector(".transaction-calendar-day");
    const heading = day.querySelector("h4");
    const entry = day.querySelector(".transaction-calendar-entry");
    const name = entry.querySelector("span");
    const amount = entry.querySelector("strong");
    const toolbar = document.getElementById("transactionToolbar-paid");
    const toolbarSelect = toolbar.querySelector("select");
    const activeMode = toolbar.querySelector('[aria-pressed="true"]');
    const inactiveMode = toolbar.querySelector('[aria-pressed="false"]');
    const bulk = document.getElementById("paidProductivityBulk");
    const bulkSelect = bulk.querySelector("select");
    const footer = document.getElementById("transactionTotals-paid");
    const footerLast = footer.lastElementChild;
    const total = footer.querySelector("strong");
    const budgetCalendar = document.getElementById("transactionCalendar-expense");
    const budgetDay = budgetCalendar.querySelector(".transaction-calendar-day");
    const budgetEntry = budgetDay.querySelector(".transaction-calendar-entry");
    return {
      calendarColumns:getComputedStyle(calendar).gridTemplateColumns,
      calendarGap:parseFloat(getComputedStyle(calendar).gap),
      dayHeight:day.getBoundingClientRect().height,
      dayBorder:getComputedStyle(day).borderStyle,
      dayRadius:parseFloat(getComputedStyle(day).borderRadius),
      headingWeight:Number(getComputedStyle(heading).fontWeight),
      entryDisplay:getComputedStyle(entry).display,
      entryHeight:entry.getBoundingClientRect().height,
      entryBorder:getComputedStyle(entry).borderStyle,
      nameWhiteSpace:getComputedStyle(name).whiteSpace,
      amountWhiteSpace:getComputedStyle(amount).whiteSpace,
      amountWeight:Number(getComputedStyle(amount).fontWeight),
      toolbarSelectHeight:toolbarSelect.getBoundingClientRect().height,
      activeBorder:getComputedStyle(activeMode).borderColor,
      inactiveBorder:getComputedStyle(inactiveMode).borderColor,
      bulkColumns:getComputedStyle(bulk).gridTemplateColumns,
      bulkSelectHeight:bulkSelect.getBoundingClientRect().height,
      footerHeight:footer.getBoundingClientRect().height,
      footerLabel:getComputedStyle(footerLast,"::before").content,
      totalSize:parseFloat(getComputedStyle(total).fontSize),
      totalWeight:Number(getComputedStyle(total).fontWeight),
      budgetCalendarColumns:getComputedStyle(budgetCalendar).gridTemplateColumns,
      budgetCalendarGap:parseFloat(getComputedStyle(budgetCalendar).gap),
      budgetDayHeight:budgetDay.getBoundingClientRect().height,
      budgetDayPadding:getComputedStyle(budgetDay).padding,
      budgetEntryDisplay:getComputedStyle(budgetEntry).display,
      budgetEntryHeight:budgetEntry.getBoundingClientRect().height,
      budgetEntryPadding:getComputedStyle(budgetEntry).padding
    };
  });

  expect(columnCount(state.calendarColumns)).toBe(7);
  expect(state.calendarGap).toBeCloseTo(10, 0);
  expect(state.dayHeight).toBeGreaterThanOrEqual(176);
  expect(state.dayBorder).toBe("solid");
  expect(state.dayRadius).toBeCloseTo(12, 0);
  expect(state.headingWeight).toBeGreaterThanOrEqual(800);
  expect(state.entryDisplay).toBe("grid");
  expect(state.entryHeight).toBeGreaterThanOrEqual(40);
  expect(state.entryBorder).toBe("solid");
  expect(state.nameWhiteSpace).toBe("normal");
  expect(state.amountWhiteSpace).toBe("nowrap");
  expect(state.amountWeight).toBeGreaterThanOrEqual(800);
  expect(state.toolbarSelectHeight).toBeCloseTo(34, 0);
  expect(state.activeBorder).not.toBe(state.inactiveBorder);
  expect(columnCount(state.bulkColumns)).toBe(6);
  expect(state.bulkSelectHeight).toBeCloseTo(38, 0);
  expect(state.footerHeight).toBeGreaterThanOrEqual(58);
  expect(state.footerLabel).toContain("Total paid");
  expect(state.totalSize).toBeGreaterThanOrEqual(16);
  expect(state.totalWeight).toBeGreaterThanOrEqual(800);
  expect(state.budgetCalendarColumns).toBe(state.calendarColumns);
  expect(state.budgetCalendarGap).toBe(state.calendarGap);
  expect(state.budgetDayHeight).toBeCloseTo(state.dayHeight, 2);
  expect(state.budgetDayPadding).toBe("9px");
  expect(state.budgetEntryDisplay).toBe(state.entryDisplay);
  expect(state.budgetEntryHeight).toBeCloseTo(state.entryHeight, 2);
  expect(state.budgetEntryPadding).toBe("8px 9px");
});

test("tablet paid calendar reduces to four readable date columns", async ({ page }) => {
  await loadPaidCalendarFixture(page, 1024);
  const columns = await page.evaluate(() => ["paid","expense"].map(name=>getComputedStyle(document.getElementById(`transactionCalendar-${name}`)).gridTemplateColumns));
  columns.forEach(value=>expect(columnCount(value)).toBe(4));
});

test("phone paid calendar becomes one column and preserves touch targets", async ({ page }) => {
  await loadPaidCalendarFixture(page, 390);

  const state = await page.evaluate(() => {
    const calendar = document.getElementById("transactionCalendar-paid");
    const toolbar = document.getElementById("transactionToolbar-paid");
    const toolbarControls = [...toolbar.querySelectorAll(".select,.button")].filter(control=>getComputedStyle(control).display !== "none");
    const bulkControls = [...document.querySelectorAll("#paidProductivityBulk .select,#paidProductivityBulk .button")].filter(control=>getComputedStyle(control).display !== "none");
    const toolbarButtons = toolbarControls.filter(control=>control.matches(".button"));
    const toolbarFields = toolbarControls.filter(control=>control.matches(".select"));
    const bulkButtons = bulkControls.filter(control=>control.matches(".button"));
    const bulkFields = bulkControls.filter(control=>control.matches(".select"));
    const budgetCalendar = document.getElementById("transactionCalendar-expense");
    return {
      calendarColumns:getComputedStyle(calendar).gridTemplateColumns,
      budgetCalendarColumns:getComputedStyle(budgetCalendar).gridTemplateColumns,
      toolbarHeights:toolbarControls.map(control=>control.getBoundingClientRect().height),
      bulkHeights:bulkControls.map(control=>control.getBoundingClientRect().height),
      toolbarButtonHeights:toolbarButtons.map(control=>control.getBoundingClientRect().height),
      toolbarFieldHeights:toolbarFields.map(control=>control.getBoundingClientRect().height),
      bulkButtonHeights:bulkButtons.map(control=>control.getBoundingClientRect().height),
      bulkFieldHeights:bulkFields.map(control=>control.getBoundingClientRect().height),
      dayMinHeight:getComputedStyle(calendar.querySelector(".transaction-calendar-day")).minHeight,
      budgetDayMinHeight:getComputedStyle(budgetCalendar.querySelector(".transaction-calendar-day")).minHeight,
      columnsButtonDisplay:getComputedStyle(toolbar.querySelector(".transaction-columns-button")).display
    };
  });

  expect(columnCount(state.calendarColumns)).toBe(1);
  expect(columnCount(state.budgetCalendarColumns)).toBe(1);
  state.toolbarButtonHeights.forEach(height=>expect(height).toBe(35));
  state.bulkButtonHeights.forEach(height=>expect(height).toBe(35));
  state.toolbarFieldHeights.forEach(height=>expect(height).toBeGreaterThanOrEqual(44));
  state.bulkFieldHeights.forEach(height=>expect(height).toBeGreaterThanOrEqual(44));
  expect(state.dayMinHeight).toBe("0px");
  expect(state.budgetDayMinHeight).toBe("0px");
  expect(state.columnsButtonDisplay).toBe("none");
});
