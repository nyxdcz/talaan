import { test, expect } from "@playwright/test";

const widths = [1024, 1280, 1366, 1440, 1920];
const css = [
  "app.css?v=2.5.0-talaan1",
  "shell-ui.css?v=2.5.0-talaan1",
  "reports-insights.css?v=2.5.0-talaan1",
  "budget-planning.css?v=2.5.0-talaan1",
  "security-profiles.css?v=2.5.0-talaan1",
  "projects-calendar.css?v=2.5.0-talaan1",
  "dashboard-interactions.css?v=2.5.0-talaan1",
  "liquid-glass.css?v=2.5.0-talaan1",
  "black-canvas.css?v=2.5.0-talaan1",
  "desktop-ui-phase1.css?v=2.5.0-talaan1",
  "ui-radius.css?v=2.5.0-talaan4"
];

const links = css.map(href => `<link rel="stylesheet" href="http://127.0.0.1:3000/${href}">`).join("");

async function desktopFixture(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(`<!doctype html><html data-theme="light"><head>${links}<style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body><main class="main"><div class="content"><section class="page" id="income"><div class="page-heading" id="incomeHeading"><div><h2>Income</h2><p>Income copy</p></div></div><div class="income-kpi-grid"><article class="card income-kpi-card" id="incomeKpi"><div class="kpi-label">Total income</div><div class="kpi-value">₱1,000</div><div class="kpi-meta">Included income</div></article></div></section><section id="projects"><div class="project-toolbar-compact" id="projectFilters"><input class="input" value="Search"><select class="select"><option>All</option></select><select class="select"><option>All</option></select><select class="select"><option>All</option></select><button class="button project-clear-filters">Clear</button></div></section><button class="context-help-button" id="helpButton" type="button">?</button><article class="pc-event-card pc-date-near" id="nearEvent">Near</article><article class="pc-event-card pc-date-overdue" id="overdueEvent">Overdue</article></div></main></body></html>`, { waitUntil:"networkidle" });
}

for (const width of widths) {
  test(`desktop Phase 1 hierarchy is stable at ${width}px`, async ({ page }) => {
    await desktopFixture(page, width);
    const metrics = await page.evaluate(() => {
      const style = selector => getComputedStyle(document.querySelector(selector));
      return {
        incomeHeading:style("#incomeHeading").display,
        incomeKpiMinHeight:style("#incomeKpi").minHeight,
        helpOpacity:style("#helpButton").opacity,
        nearBackground:style("#nearEvent").backgroundColor,
        overdueBackground:style("#overdueEvent").backgroundColor,
        projectFilterRadius:style("#projectFilters").borderRadius,
        hasHorizontalOverflow:document.documentElement.scrollWidth > window.innerWidth + 1
      };
    });
    expect(metrics.incomeHeading).toBe("none");
    expect(metrics.incomeKpiMinHeight).toBe("82px");
    expect(metrics.helpOpacity).toBe("0.28");
    expect(metrics.nearBackground).toBe("rgb(255, 255, 255)");
    expect(metrics.overdueBackground).not.toBe(metrics.nearBackground);
    expect(metrics.projectFilterRadius).toBe("12px");
    expect(metrics.hasHorizontalOverflow).toBe(false);
  });
}

test("desktop Phase 1 stylesheet does not own phone layout", async ({ page }) => {
  await page.setViewportSize({ width:700, height:900 });
  await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="http://127.0.0.1:3000/desktop-ui-phase1.css?v=2.5.0-talaan1"></head><body><section id="income"><div class="page-heading" id="incomeHeading">Income</div><article class="income-kpi-card" id="incomeKpi">KPI</article><button class="context-help-button" id="helpButton">?</button></section></body></html>`, { waitUntil:"networkidle" });
  const metrics = await page.evaluate(() => ({
    heading:getComputedStyle(document.querySelector("#incomeHeading")).display,
    kpiMinHeight:getComputedStyle(document.querySelector("#incomeKpi")).minHeight,
    helpOpacity:getComputedStyle(document.querySelector("#helpButton")).opacity
  }));
  expect(metrics).toEqual({ heading:"block", kpiMinHeight:"0px", helpOpacity:"1" });
});

test("Report export uses the existing accessible overflow-menu interaction", async ({ page }) => {
  await page.setViewportSize({ width:1440, height:900 });
  await page.setContent(`<!doctype html><html data-theme="light"><head>${links}</head><body><div class="overflow-menu report-export-menu"><button class="button button-secondary overflow-menu-trigger" id="reportExportTrigger" type="button" aria-haspopup="menu" aria-controls="reportExportMenuPanel" aria-expanded="false">Export</button><div class="record-more-panel report-export-menu-panel" id="reportExportMenuPanel" role="menu" hidden><button type="button" role="menuitem">Monthly report CSV</button><button type="button" role="menuitem">Monthly report JSON</button></div></div><script src="http://127.0.0.1:3000/interaction-patterns.js?v=2.5.0-talaan1"></script></body></html>`, { waitUntil:"networkidle" });
  const trigger = page.locator("#reportExportTrigger");
  const panel = page.locator("#reportExportMenuPanel");
  await expect(panel).toBeHidden();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
});
