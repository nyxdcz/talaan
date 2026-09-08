import { test, expect } from "@playwright/test";

test.use({ serviceWorkers:"block" });

const widths = [320, 360, 390, 430];
const styles = [
  "budget-planning.css?v=2.5.0-talaan1",
  "mobile.css?v=2.5.0-talaan1",
  "app.css?v=2.5.0-talaan1",
  "shell-ui.css?v=2.5.0-talaan1",
  "dashboard-interactions.css?v=2.5.0-talaan1",
  "black-canvas.css?v=2.5.0-talaan1",
  "desktop-ui-phase1.css?v=2.5.0-talaan1",
  "desktop-ux.css?v=2.5.0-talaan1",
  "production-ui-audit.css?v=2.5.0-talaan1",
  "ui-radius.css?v=2.5.0-ui-e0c1fb9945cf",
  "ui-icon-alignment.css?v=2.5.0-talaan1"
];

async function loadFixture(page, width) {
  await page.setViewportSize({ width, height:900 });
  const links = styles.map(href => `<link rel="stylesheet" href="http://127.0.0.1:3000/${href}">`).join("");
  await page.setContent(`<!doctype html><html data-theme="light" data-theme-preference="light"><head>${links}<style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body>
    <header class="topbar">
      <div class="topbar-left"><div><h1>Budget &amp; Expenses</h1><p>Monthly finance workspace</p></div></div>
      <div class="topbar-actions">
        <button class="cloud-sync-toolbar-button"><span class="toolbar-icon"><svg viewBox="0 0 24 24"><path d="M5 12a7 7 0 0 1 13-3 4 4 0 0 1 1 8H6a4 4 0 0 1-1-8Z"/></svg></span></button>
        <div class="month-navigator">
          <button class="month-nav-button" id="previousMonthButton"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button>
          <div class="month-control"><button class="month-display-button"><span class="month-display-label">Month</span><span class="month-display-separator"></span><span class="month-display-value">2026-09</span></button></div>
          <button class="month-nav-button" id="nextMonthButton"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button>
          <button class="month-status-chip">Current</button>
        </div>
        <button class="topbar-add-button"><span class="toolbar-icon"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span></button>
        <div class="topbar-tools-menu" id="topbarToolsMenu">
          <button class="topbar-tools-trigger" id="topbarToolsTrigger"><span class="toolbar-icon"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></span></button>
          <div class="topbar-tools-panel" id="topbarToolsPanel" role="menu">
            <button class="topbar-tools-item theme-toggle-button" id="themeToggleButton" role="menuitem"><span class="toolbar-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg></span><span><strong>Theme</strong><small id="themeToggleText">Light</small></span></button>
            <button class="topbar-tools-item" id="globalSearchButton" role="menuitem"><span class="toolbar-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/></svg></span><span><strong>Search</strong><small>Find finance records</small></span></button>
            <button class="topbar-tools-item" id="productivityCenterButton" role="menuitem"><span class="toolbar-icon"><svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/></svg></span><span><strong>Quick actions</strong><small>Open productivity tools</small></span></button>
            <button class="topbar-tools-item" id="quickEntryMenuButton" role="menuitem"><span class="toolbar-icon"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span><strong>Quick add</strong><small>Add a finance or work record</small></span></button>
            <button class="topbar-tools-item" id="customizeDashboardMenuButton" role="menuitem"><span class="toolbar-icon"><svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg></span><span><strong>Customize dashboard</strong><small>Show, hide, reorder, and resize cards</small></span></button>
            <button class="topbar-tools-item" id="undoMoneyMenuButton" role="menuitem"><span class="toolbar-icon"></span><span><strong>Undo</strong><small>No change to undo</small></span></button>
            <button class="topbar-tools-item" id="redoMoneyMenuButton" role="menuitem"><span class="toolbar-icon"></span><span><strong>Redo</strong><small>No change to redo</small></span></button>
          </div>
        </div>
      </div>
    </header>
    <main class="main"><div class="content">
      <section class="page active" id="income">
        <article class="card budget-planner-card" id="monthlyBudgetPlannerCard">
          <div class="card-header budget-planner-header"><div class="budget-planner-heading-copy"><h3>Monthly budget plan</h3><p>Plan categories, compare actual spending, and forecast month-end cash.</p></div><div class="budget-planner-actions"><button class="button button-secondary button-small">Build from expenses</button><button class="button button-secondary button-small">Copy previous month</button><div class="overflow-menu"><button class="button button-secondary button-small overflow-menu-trigger">More</button></div><button class="button button-primary button-small">+ Add category…</button><button class="budget-planner-toggle budget-panel-collapse" id="monthlyBudgetPlannerToggle"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button></div></div>
          <div class="budget-planner-body"><div class="budget-planner-summary"><div class="budget-plan-kpi"><span>Planned budget</span><strong>₱34,282.00</strong></div><div class="budget-plan-kpi"><span>Actual spent</span><strong>₱16,090.00</strong></div><div class="budget-plan-kpi"><span>Committed</span><strong>₱33,982.00</strong></div></div>
            <div class="budget-planner-grid"><section class="budget-category-panel budget-bento-panel"><div class="budget-panel-heading"><div class="budget-panel-heading-copy"><h4>Category plan</h4><p>Fixed and flexible budgets for personal and project spending.</p></div><div class="budget-panel-heading-actions"><span class="status-chip info">8 categories</span><button class="budget-panel-collapse"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button></div></div><div class="budget-panel-body">Category content</div></section><aside class="cash-forecast-panel budget-bento-panel"><div class="budget-panel-heading"><div class="budget-panel-heading-copy"><h4>Cash-flow &amp; savings forecast</h4><p>Review this month, set a savings target, and track the next four months.</p></div><div class="budget-panel-heading-actions"><span class="status-chip success">Forecast ready</span><button class="budget-panel-collapse"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button></div></div><div class="budget-panel-body">Forecast content</div></aside></div>
          </div>
        </article>
        <article class="card income-records-card"><div class="card-header"><div><h3>Income records</h3><p>Manual income received during the selected month</p></div><button class="button button-secondary button-small" id="exportIncomeCsv">Export income CSV</button></div></article>
      </section>
      <section class="page active" id="money">
        <article class="card collapsible-section" id="availableMoneySection"><div class="card-header collapsible-header"><div><div class="section-title-row"><h3>Available money</h3></div><p>Edit balances, add accounts, reorder, or remove accounts here</p></div><div class="collapse-actions"><div class="available-money-total-wrap"><strong class="period-total text-green" id="moneyAvailableTotal">₱27,115.00</strong><small class="available-money-account-count">4 accounts</small></div><button class="button button-primary button-small" id="addAccountButton"><span class="phone-only-action-icon"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span class="phone-only-action-label">Add account</span></button><button class="collapse-toggle" data-collapse-toggle="available-money"><span class="collapse-icon"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></span></button></div></div><div class="account-grid"></div></article>
      </section>
    </div></main>
  </body></html>`, { waitUntil:"networkidle" });
}

for (const width of widths) {
  test(`phone finance headers stay contained at ${width}px`, async ({ page }) => {
    await loadFixture(page, width);
    const metrics = await page.evaluate(() => {
      const rect = node => node?.getBoundingClientRect() || { left:0, right:0, top:0, bottom:0, width:0, height:0 };
      const styles = node => node ? getComputedStyle(node) : null;
      const menuItems = [...document.querySelectorAll("#topbarToolsPanel > .topbar-tools-item")].map(node => {
        const copy = node.querySelector(":scope > span:last-child");
        const heading = node.querySelector(":scope > span:last-child > strong");
        const detail = node.querySelector(":scope > span:last-child > small");
        const icon = node.querySelector(":scope > .toolbar-icon");
        return { id:node.id, width:rect(node).width, height:rect(node).height, copyWidth:rect(copy).width, headingWidth:rect(heading).width, detailWidth:rect(detail).width, icon:[rect(icon).width,rect(icon).height] };
      });
      const plannerHeader = document.querySelector(".budget-planner-header");
      const plannerActions = document.querySelector(".budget-planner-actions");
      const plannerToggle = document.querySelector("#monthlyBudgetPlannerToggle");
      const bentoHeadings = [...document.querySelectorAll(".budget-bento-panel .budget-panel-heading")].map(node => {
        const title = node.querySelector("h4");
        const toggle = node.querySelector(".budget-panel-collapse");
        return { box:rect(node), title:rect(title), toggle:rect(toggle), overflow:styles(node).overflow, titleOverflow:styles(title).overflow };
      });
      const availableHeader = document.querySelector("#availableMoneySection .card-header");
      const availableAmount = document.querySelector("#moneyAvailableTotal");
      const availableAdd = document.querySelector("#addAccountButton");
      const availableToggle = document.querySelector("#availableMoneySection [data-collapse-toggle]");
      const incomeHeader = document.querySelector(".income-records-card .card-header");
      const exportButton = document.querySelector("#exportIncomeCsv");
      const navigator = document.querySelector(".month-navigator");
      return {
        menuItems,
        planner:{ header:rect(plannerHeader), actions:rect(plannerActions), toggle:rect(plannerToggle), overflow:styles(plannerHeader).overflow },
        bentoHeadings,
        available:{ header:rect(availableHeader), amount:rect(availableAmount), add:rect(availableAdd), toggle:rect(availableToggle), amountClipped:availableAmount.scrollWidth > availableAmount.clientWidth + 1 },
        income:{ header:rect(incomeHeader), export:rect(exportButton) },
        navigator:{ box:rect(navigator), controls:[...navigator.querySelectorAll(":scope > .month-nav-button, :scope > .month-control, :scope > .month-status-chip")].map(node => [rect(node).width,rect(node).height]) },
        overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth) > innerWidth + 1
      };
    });

    const labeledItems = metrics.menuItems.filter(item => ["globalSearchButton","productivityCenterButton","quickEntryMenuButton","customizeDashboardMenuButton","undoMoneyMenuButton","redoMoneyMenuButton"].includes(item.id));
    expect(labeledItems).toHaveLength(6);
    labeledItems.forEach(item => {
      expect(item.width, item.id).toBeGreaterThan(100);
      expect(item.height, item.id).toBeCloseTo(35, 0);
      expect(item.copyWidth, item.id).toBeGreaterThan(0);
      expect(item.headingWidth, item.id).toBeGreaterThan(0);
      expect(item.detailWidth, item.id).toBeGreaterThan(0);
      expect(item.icon).toEqual([20,20]);
    });
    expect(metrics.menuItems.find(item => item.id === "themeToggleButton")).toMatchObject({ height:35 });

    expect(metrics.planner.header.height).toBeGreaterThan(80);
    expect(metrics.planner.overflow).toBe("visible");
    expect(metrics.planner.actions.bottom).toBeLessThanOrEqual(metrics.planner.header.bottom + 1);
    expect(metrics.planner.toggle).toMatchObject({ width:35, height:35 });
    metrics.bentoHeadings.forEach(heading => {
      expect(heading.box.height).toBeGreaterThanOrEqual(50);
      expect(heading.overflow).toBe("visible");
      expect(heading.title.width).toBeGreaterThan(0);
      expect(heading.title.left).toBeGreaterThanOrEqual(heading.box.left - 1);
      expect(heading.title.right).toBeLessThanOrEqual(heading.box.right + 1);
      expect(heading.toggle).toMatchObject({ width:35, height:35 });
    });

    expect(metrics.available.header.height).toBeCloseTo(35, 0);
    expect(metrics.available.amountClipped).toBe(false);
    expect(metrics.available.amount.right).toBeLessThanOrEqual(metrics.available.add.left + 1);
    expect(metrics.available.add.right).toBeLessThanOrEqual(metrics.available.toggle.left + 1);
    expect(metrics.available.add).toMatchObject({ width:35, height:35 });
    expect(metrics.available.toggle).toMatchObject({ width:35, height:35 });

    expect(metrics.income.export.height).toBeCloseTo(35, 0);
    expect(metrics.income.export.right).toBeLessThanOrEqual(metrics.income.header.right + 1);
    expect(metrics.navigator.box.right).toBeLessThanOrEqual(width + 1);
    metrics.navigator.controls.forEach(([controlWidth,controlHeight]) => {
      expect(controlWidth).toBeGreaterThan(0);
      expect(controlHeight).toBeLessThanOrEqual(35.5);
    });
    expect(metrics.overflow).toBe(false);
  });
}

test("collapsed Monthly Budget Plan keeps its disclosure column clear", async ({ page }) => {
  await loadFixture(page, 390);
  await page.locator("#monthlyBudgetPlannerCard").evaluate(node => node.classList.add("is-planner-collapsed"));
  const metrics = await page.locator("#monthlyBudgetPlannerCard").evaluate(node => {
    const header = node.querySelector(".budget-planner-header");
    const toggle = node.querySelector("#monthlyBudgetPlannerToggle");
    const visibleActions = [...node.querySelectorAll(".budget-planner-actions > *")].filter(item => getComputedStyle(item).display !== "none");
    const headerRect = header.getBoundingClientRect();
    const toggleRect = toggle.getBoundingClientRect();
    return { headerHeight:headerRect.height, toggle:[toggleRect.width,toggleRect.height], actionCount:visibleActions.length, toggleInside:toggleRect.right <= headerRect.right + 1 && toggleRect.bottom <= headerRect.bottom + 1 };
  });
  expect(metrics.headerHeight).toBeCloseTo(50, 0);
  expect(metrics.toggle).toEqual([35,35]);
  expect(metrics.actionCount).toBe(1);
  expect(metrics.toggleInside).toBe(true);
});
