import { test, expect } from "../helpers/browser-fixtures.mjs";

const styles = [
  "app.css?v=2.5.0-talaan1",
  "dashboard-interactions.css?v=2.5.0-talaan1",
  "summary-mascots.css?v=2.5.0-talaan1"
];

async function loadDashboardFixture(page, width = 1440) {
  await page.setViewportSize({ width, height:900 });
  const links = styles.map(href => `<link rel="stylesheet" href="http://127.0.0.1:3000/${href}">`).join("");
  await page.setContent(`<!doctype html><html data-theme="light"><head>${links}</head><body><div class="app"><main class="main"><div class="content"><section class="page active" id="dashboard"><div class="dashboard-card-grid" id="dashboardCardGrid"><article class="dashboard-detail-card" data-dashboard-card="calendar"><button type="button" class="dashboard-drag-handle">⠿</button><button type="button" class="dashboard-resize-handle">↔</button><p>Dashboard card</p></article></div></section></div></main></div><div id="overflowSentinel" style="width:calc(100vw + 120px);height:1px"></div></body></html>`, { waitUntil:"networkidle" });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector(".dashboard-drag-handle")).display)).toBe("none");
}

async function loadFinanceRailFixture(page, width = 1024) {
  await page.setViewportSize({ width, height:900 });
  const links = [
    "app.css?v=2.5.0-talaan1",
    "production-ui-audit.css?v=2.5.0-talaan1",
    "summary-mascots.css?v=2.5.0-talaan1"
  ].map(href => `<link rel="stylesheet" href="http://127.0.0.1:3000/${href}">`).join("");
  await page.setContent(`<!doctype html><html data-theme="light"><head>${links}</head><body><div class="app"><main class="main"><div class="content"><section class="page active" id="money"><div class="section-stack"><article style="flex:0 0 520px;height:180px">First half</article><article style="flex:0 0 520px;height:180px">Second half</article><article style="flex:0 0 520px;height:180px">Other expenses</article></div><div class="transaction-totals-footer"><span>5 visible</span><strong>₱77,890.00</strong></div></section></div></main></div></body></html>`, { waitUntil:"networkidle" });
}

async function loadFinanceToolbarFixture(page, width = 1440) {
  await page.setViewportSize({ width, height:900 });
  const links = ["app.css?v=2.5.0-talaan1", "summary-mascots.css?v=2.5.0-talaan1"]
    .map(href => `<link rel="stylesheet" href="http://127.0.0.1:3000/${href}">`).join("");
  await page.setContent(`<!doctype html><html data-theme="light"><head>${links}</head><body><div class="app"><main class="main"><div class="content"><section class="page active" id="money"><details class="expense-filters-panel" id="expenseFiltersPanel" open><summary>Filters</summary><div class="toolbar expense-toolbar-compact expense-toolbar-single-line"><div class="bulk-expense-inline"><label><input type="checkbox"> Select visible</label><span class="bulk-selected-count">0 selected</span></div><div class="field"><input class="input" placeholder="Name or note"></div><div class="field"><select class="select"><option>Selected month</option></select></div><div class="field"><select class="select"><option>All categories</option></select></div><button class="button button-secondary">More filters</button><button class="button button-secondary expense-clear-filters">Clear</button></div></details><div class="transaction-workspace-toolbar" id="transactionToolbar-expense"><div class="transaction-view-group"><button class="button button-secondary" aria-pressed="true">List</button><button class="button button-secondary" aria-pressed="false">Calendar</button></div><label><select class="select"><option>Saved views</option></select></label><button class="button button-secondary">Save view</button><button class="button button-secondary" data-open-transaction-columns>Columns</button><label><select class="select"><option>Newest first</option></select></label><label><select class="select"><option>Comfortable</option></select></label></div><div class="section-stack"></div></section></div></main></div></body></html>`, { waitUntil:"networkidle" });
}

test("Dashboard drag and resize controls appear only while Customize is active", async ({ page }) => {
  await loadDashboardFixture(page, 1440);

  const normal = await page.evaluate(() => ({
    drag:getComputedStyle(document.querySelector(".dashboard-drag-handle")).display,
    resize:getComputedStyle(document.querySelector(".dashboard-resize-handle")).display
  }));
  expect(normal).toEqual({ drag:"none", resize:"none" });

  await page.evaluate(() => document.getElementById("dashboard").classList.add("dashboard-customizing"));
  const customizing = await page.evaluate(() => ({
    drag:getComputedStyle(document.querySelector(".dashboard-drag-handle")).display,
    resize:getComputedStyle(document.querySelector(".dashboard-resize-handle")).display
  }));
  expect(customizing).toEqual({ drag:"grid", resize:"flex" });

  await page.evaluate(() => document.getElementById("dashboard").classList.remove("dashboard-customizing"));
  await expect(page.locator(".dashboard-drag-handle")).toHaveCSS("display", "none");
  await expect(page.locator(".dashboard-resize-handle")).toHaveCSS("display", "none");
});

test("phone Customize keeps resize controls hidden", async ({ page }) => {
  await loadDashboardFixture(page, 390);
  await page.evaluate(() => document.getElementById("dashboard").classList.add("dashboard-customizing"));

  await expect(page.locator(".dashboard-drag-handle")).toHaveCSS("display", "grid");
  await expect(page.locator(".dashboard-resize-handle")).toHaveCSS("display", "none");
});

test("page shell clips accidental horizontal overflow instead of drawing a bottom scrollbar artifact", async ({ page }) => {
  await loadDashboardFixture(page, 1440);

  const state = await page.evaluate(() => {
    document.documentElement.scrollLeft = 80;
    document.body.scrollLeft = 80;
    return {
      htmlOverflow:getComputedStyle(document.documentElement).overflowX,
      bodyOverflow:getComputedStyle(document.body).overflowX,
      htmlScrollLeft:document.documentElement.scrollLeft,
      bodyScrollLeft:document.body.scrollLeft,
      mainMaxWidth:getComputedStyle(document.querySelector(".main")).maxWidth,
      contentMaxWidth:getComputedStyle(document.querySelector(".content")).maxWidth
    };
  });

  expect(state.htmlOverflow).toBe("clip");
  expect(state.bodyOverflow).toBe("clip");
  expect(state.htmlScrollLeft).toBe(0);
  expect(state.bodyScrollLeft).toBe(0);
  expect(state.mainMaxWidth).toBe("100%");
  expect(state.contentMaxWidth).toBe("100%");
});

test("medium desktop Finance keeps horizontal card swipe without a visible bottom scrollbar gutter", async ({ page }) => {
  await loadFinanceRailFixture(page, 1024);

  const state = await page.evaluate(() => {
    const rail = document.querySelector("#money .section-stack");
    const app = document.querySelector(".app");
    const main = document.querySelector(".main");
    const content = document.querySelector(".content");
    const money = document.getElementById("money");
    rail.scrollLeft = 120;
    return {
      railOverflowX:getComputedStyle(rail).overflowX,
      railScrollbarGutter:getComputedStyle(rail).scrollbarGutter,
      railScrollbarWidth:getComputedStyle(rail).scrollbarWidth,
      railCanScroll:rail.scrollWidth > rail.clientWidth,
      railScrollLeft:rail.scrollLeft,
      appOverflowX:getComputedStyle(app).overflowX,
      mainOverflowX:getComputedStyle(main).overflowX,
      contentOverflowX:getComputedStyle(content).overflowX,
      pageOverflowX:getComputedStyle(money).overflowX
    };
  });

  expect(state.railOverflowX).toBe("auto");
  expect(state.railScrollbarGutter).toBe("auto");
  expect(state.railScrollbarWidth).toBe("none");
  expect(state.railCanScroll).toBe(true);
  expect(state.railScrollLeft).toBeGreaterThan(0);
  expect(state.appOverflowX).toBe("clip");
  expect(state.mainOverflowX).toBe("clip");
  expect(state.contentOverflowX).toBe("clip");
  expect(state.pageOverflowX).toBe("clip");
});

test("desktop Finance filters and view controls read as one organized toolbar", async ({ page }) => {
  await loadFinanceToolbarFixture(page, 1440);

  const state = await page.evaluate(() => {
    const filters = document.getElementById("expenseFiltersPanel");
    const toolbar = document.getElementById("transactionToolbar-expense");
    const columns = toolbar.querySelector("[data-open-transaction-columns]");
    const labels = toolbar.querySelectorAll(":scope > label");
    const active = toolbar.querySelector('.transaction-view-group [aria-pressed="true"]');
    const filtersRect = filters.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const columnsRect = columns.getBoundingClientRect();
    const sortRect = labels[1].getBoundingClientRect();
    return {
      joinedGap:Math.abs(filtersRect.bottom - toolbarRect.top),
      filtersBackground:getComputedStyle(filters).backgroundColor,
      toolbarBackground:getComputedStyle(toolbar).backgroundColor,
      toolbarDisplay:getComputedStyle(toolbar).display,
      toolbarWrap:getComputedStyle(toolbar).flexWrap,
      preferenceGap:sortRect.left - columnsRect.right,
      activeColor:getComputedStyle(active).color,
      activeHeight:active.getBoundingClientRect().height,
      savedWidth:labels[0].querySelector("select").getBoundingClientRect().width,
      sortWidth:labels[1].querySelector("select").getBoundingClientRect().width,
      densityWidth:labels[2].querySelector("select").getBoundingClientRect().width,
      sortStartsAfterColumns:sortRect.left > columnsRect.right
    };
  });

  expect(state.joinedGap).toBeLessThanOrEqual(1);
  expect(state.filtersBackground).toBe(state.toolbarBackground);
  expect(state.toolbarDisplay).toBe("flex");
  expect(state.toolbarWrap).toBe("nowrap");
  expect(state.preferenceGap).toBeGreaterThan(24);
  expect(state.activeHeight).toBeCloseTo(29, 0);
  expect(state.savedWidth).toBeCloseTo(150, 0);
  expect(state.sortWidth).toBeCloseTo(158, 0);
  expect(state.densityWidth).toBeCloseTo(126, 0);
  expect(state.sortStartsAfterColumns).toBe(true);
});
