import { test, expect } from "@playwright/test";

test.use({ serviceWorkers:"block" });

const widths = [320, 360, 375, 390, 430];
const css = [
  "budget-planning.css?v=2.5.0-talaan1",
  "projects-calendar.css?v=2.5.0-talaan1",
  "mobile.css?v=2.5.0-talaan1",
  "app.css?v=2.5.0-talaan1",
  "shell-ui.css?v=2.5.0-talaan1",
  "dashboard-interactions.css?v=2.5.0-talaan1",
  "ui-icon-alignment.css?v=2.5.0-talaan1",
  "black-canvas.css?v=2.5.0-talaan1",
  "desktop-ui-phase1.css?v=2.5.0-talaan1",
  "desktop-ux.css?v=2.5.0-talaan1",
  "production-ui-audit.css?v=2.5.0-talaan1"
];

async function financeFixture(page, width) {
  await page.setViewportSize({ width, height:900 });
  const links = css.map(href => `<link rel="stylesheet" href="http://127.0.0.1:3000/${href}">`).join("");
  await page.setContent(`<!doctype html><html data-theme="light"><head>${links}<style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body><main class="main"><div class="content">
    <div class="finance-workspace-marquee-row"><div class="workspace-switcher money-workspace-switcher" id="financeTabs"><button class="workspace-switcher-button" id="incomeTab">Income</button><button class="workspace-switcher-button">Budget &amp; Expenses</button><button class="workspace-switcher-button">Paid Expenses</button></div></div>

    <section class="page active" id="money">
      <article class="card budget-planner-card" id="monthlyBudgetPlannerCard"><div class="budget-planner-header"><div><h3>Monthly budget plan</h3></div><div class="budget-planner-actions"><button class="button" id="buildBudgetFromExpenses">Build</button><button class="button" id="addBudgetItem">Add category</button><button class="budget-planner-toggle budget-panel-collapse" id="monthlyBudgetPlannerToggle" aria-expanded="false">Toggle</button></div></div></article>

      <article class="card" id="availableMoneySection"><div class="card-header"><div><h3>Available Money</h3><p>Money available by account</p></div><div class="collapse-actions"><div class="available-money-total-wrap"><strong>₱12,345.67</strong><span class="available-money-account-count">2 accounts</span></div><button class="button phone-icon-only-action" id="addAccountButton" aria-label="Add account"><span class="phone-only-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span class="phone-only-action-label">Add account</span></button><button class="collapse-toggle" id="availableToggle">Toggle</button></div></div><div class="account-grid"></div></article>

      <section class="period-card"><div class="period-header"><div><h3>Budget &amp; Expenses</h3><p>Outstanding expenses</p></div><div class="collapse-actions"><strong class="period-total">₱1,250.00</strong><button class="collapse-toggle" id="periodToggle">Toggle</button></div></div><div class="record-row" data-expense-row id="expenseRow"><div class="record-title expense-record-title"><span class="record-title-copy"><strong>Internet bill</strong><small>Utilities</small></span></div><div class="amount">₱1,250.00</div><div class="due-cell">Aug 25</div><div data-label="Planned account">Main checking account</div><div class="mobile-record-actions" id="expenseActions"><button class="button">Mark paid</button><div class="record-more-menu"><button class="overflow-menu-trigger">More</button></div></div></div></section>
    </section>

    <section class="page active" id="income"><div class="income-record-row" id="incomeRow"><div class="record-title"><span class="record-title-copy"><strong>Salary</strong><small>Monthly income</small></span></div><div class="amount">₱20,000.00</div><div data-label="Category">Wages</div><div data-label="Date received">Aug 20</div><div data-label="Account">Main checking account</div><div class="record-actions"><button class="button" id="incomeAction">Edit</button></div></div></section>

    <section class="page active" id="paid-expenses"><div class="record-row" data-paid-expense-row id="paidRow"><div class="record-title"><span class="record-title-copy"><strong>Groceries</strong><small>Food</small></span></div><div class="amount">₱850.00</div><div data-label="Paid date">Aug 19</div><div data-label="Paid from">Main checking account</div><div class="mobile-record-actions" id="paidActions"><button class="button">Undo</button><button class="overflow-menu-trigger">More</button></div></div></section>
  </div></main></body></html>`, { waitUntil:"networkidle" });
}

for (const width of widths) {
  test(`static Phone Finance CSS preserves compact geometry at ${width}px`, async ({ page }) => {
    await financeFixture(page, width);
    const metrics = await page.evaluate(() => {
      const byId = id => document.getElementById(id);
      const px = (id, prop) => parseFloat(getComputedStyle(byId(id))[prop]);
      const gridAreas = id => getComputedStyle(byId(id)).gridTemplateAreas;
      return {
        financeTab: px("incomeTab", "minHeight"),
        plannerToggle: px("monthlyBudgetPlannerToggle", "minHeight"),
        addAccountWidth: px("addAccountButton", "width"),
        addAccountHeight: px("addAccountButton", "height"),
        availableToggleWidth: px("availableToggle", "width"),
        availableToggleHeight: px("availableToggle", "height"),
        periodToggleHeight: px("periodToggle", "height"),
        expenseAreas: gridAreas("expenseRow"),
        expenseActionsHeight: px("expenseActions", "height"),
        incomeDisplay: getComputedStyle(byId("incomeRow")).display,
        incomeActionHeight: px("incomeAction", "minHeight"),
        paidAreas: gridAreas("paidRow"),
        paidActionsHeight: px("paidActions", "height"),
        runtimeStylePresent:Boolean(document.getElementById("phoneFinanceCompactV1522")),
        horizontalOverflow:document.documentElement.scrollWidth > innerWidth + 1
      };
    });

    expect(metrics.financeTab).toBe(35);
    expect(metrics.plannerToggle).toBe(35);
    expect(metrics.addAccountWidth).toBe(35);
    expect(metrics.addAccountHeight).toBe(35);
    expect(metrics.availableToggleWidth).toBe(35);
    expect(metrics.availableToggleHeight).toBe(35);
    expect(metrics.periodToggleHeight).toBe(35);
    expect(metrics.expenseAreas).toContain("title amount");
    expect(metrics.expenseAreas).toContain("due account");
    expect(metrics.expenseAreas).toContain("actions actions");
    expect(metrics.expenseActionsHeight).toBe(35);
    expect(metrics.incomeDisplay).toBe("grid");
    expect(metrics.incomeActionHeight).toBe(35);
    expect(metrics.paidAreas).toContain("title amount");
    expect(metrics.paidAreas).toContain("date account");
    expect(metrics.paidAreas).toContain("actions actions");
    expect(metrics.paidActionsHeight).toBe(35);
    expect(metrics.runtimeStylePresent).toBe(false);
    expect(metrics.horizontalOverflow).toBe(false);
  });
}

test("live Talaan V2.5.0 shell owns Phone Finance compact styles statically", async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto("http://127.0.0.1:3000/index.html?page=money", { waitUntil:"networkidle" });
  await expect(page.locator("#phoneFinanceCompactV1522")).toHaveCount(0);
  const delivery = await page.evaluate(() => ({
    styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.getAttribute("href") || ""),
    scripts:[...document.scripts].map(script => script.getAttribute("src") || "").filter(Boolean)
  }));
  expect(delivery.styles.some(href => href.includes("mobile.css?v=2.5.0-talaan1"))).toBe(true);
  expect(delivery.scripts.some(src => src.includes("pwa-update.js?v=2.5.0-talaan1"))).toBe(true);
});
