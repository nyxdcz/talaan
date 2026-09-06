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

async function fixture(page, width, theme) {
  await page.setViewportSize({ width, height:900 });
  const links = css.map(href => `<link rel="stylesheet" href="http://127.0.0.1:3000/${href}">`).join("");
  await page.setContent(`<!doctype html><html data-theme="${theme}"><head>${links}<style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body class="dashboard-view"><header class="topbar"><div class="topbar-actions"><button class="button">Action</button></div></header><main class="main"><div class="content"><section class="page-heading"><div><h2>Heading</h2><p>Copy</p></div></section><article class="card" id="card">Card</article><div class="finance-workspace-marquee-row" id="financeRow"><div class="workspace-switcher money-workspace-switcher"><button class="workspace-switcher-button">Tab</button></div><section class="dashboard-week-marquee finance-week-marquee"><strong>This week</strong></section></div><div class="expense-toolbar-compact"><input class="input" id="compactFilter"><div class="expense-view-toggle"><button class="button">View</button></div></div><div class="record-header" id="recordHeader">Header</div><section id="reports"><nav class="report-section-nav"><button id="reportTab">Report</button></nav></section><div class="report-insights-filters"><input class="input" id="reportFilter"></div><div class="budget-plan-kpi" id="budgetKpi">Budget</div><button class="budget-panel-collapse" id="budgetToggle" type="button">Toggle</button><div class="project-summary-strip"><div id="projectSummary">Project</div></div><section id="settings"><div class="settings-tablist"><button id="settingsTab">Settings</button></div></section><button class="sidebar-close-button" id="sidebarPin">Pin</button><aside class="sidebar desktop-open"><button class="nav-button insights-nav-button" id="insightsNav"><span class="nav-icon"><img class="nav-icon-image" id="insightsIcon" src="./icons/sidebar-insights.png" alt=""></span><span class="nav-label">Insights</span></button></aside><span class="v13-chip" id="profileChip">Private</span><div class="pc-event-card" id="calendarCard"><div class="pc-event-actions"><button class="button" id="calendarAction">Edit</button></div></div></div></main></body></html>`, { waitUntil:"networkidle" });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe(theme === "light" ? "#efefef" : "#000000");
}

for (const width of widths) {
  test(`desktop geometry is consistent at ${width}px`, async ({ page }) => {
    await fixture(page, width, "light");
    const metrics = await page.evaluate(() => {
      const value = (selector, property) => getComputedStyle(document.querySelector(selector))[property];
      return {
        bodyBackground:getComputedStyle(document.body).backgroundColor,
        topbarMin:value(".topbar", "minHeight"),
        contentTop:value(".content", "paddingTop"),
        contentRight:value(".content", "paddingRight"),
        contentBottom:value(".content", "paddingBottom"),
        cardRadius:value("#card", "borderRadius"),
        cardPadding:value("#card", "paddingTop"),
        buttonMin:value(".topbar .button", "minHeight"),
        compactHeight:value("#compactFilter", "height"),
        workspaceRadius:value(".workspace-switcher", "borderRadius"),
        workspaceButton:value(".workspace-switcher-button", "minHeight"),
        financeStickyTop:value("#financeRow", "top"),
        reportTab:value("#reportTab", "minHeight"),
        reportFilter:value("#reportFilter", "height"),
        settingsTab:value("#settingsTab", "minHeight"),
        sidebarPin:value("#sidebarPin", "height"),
        budgetKpi:value("#budgetKpi", "minHeight"),
        budgetToggle:value("#budgetToggle", "width"),
        profileChip:value("#profileChip", "minHeight"),
        calendarRadius:value("#calendarCard", "borderRadius"),
        calendarAction:value("#calendarAction", "minHeight"),
        insightsPseudo:getComputedStyle(document.querySelector("#insightsNav"), "::before").content,
        insightsIconWidth:value("#insightsIcon", "width"),
        insightsIconHeight:value("#insightsIcon", "height"),
        recordBackground:value("#recordHeader", "backgroundColor"),
        inputBackground:value("#compactFilter", "backgroundColor"),
        hasHorizontalOverflow:document.documentElement.scrollWidth > window.innerWidth + 1
      };
    });
    expect(metrics).toEqual({
      bodyBackground:"rgb(239, 239, 239)",
      topbarMin:"64px",
      contentTop:"18px",
      contentRight:"24px",
      contentBottom:"34px",
      cardRadius:"12px",
      cardPadding:"13px",
      buttonMin:"38px",
      compactHeight:"35px",
      workspaceRadius:"12px",
      workspaceButton:"35px",
      financeStickyTop:"64px",
      reportTab:"35px",
      reportFilter:"35px",
      settingsTab:"38px",
      sidebarPin:"44px",
      budgetKpi:"70px",
      budgetToggle:"30px",
      profileChip:"23px",
        calendarRadius:"12px",
      calendarAction:"32px",
      insightsPseudo:"none",
      insightsIconWidth:"20px",
      insightsIconHeight:"20px",
      recordBackground:"rgb(249, 250, 251)",
      inputBackground:"rgb(255, 255, 255)",
      hasHorizontalOverflow:false
    });
  });
}

test("light and dark appearance use distinct surfaces", async ({ page }) => {
  await fixture(page, 1440, "light");
  const light = await page.evaluate(() => ({
    body:getComputedStyle(document.body).backgroundColor,
    record:getComputedStyle(document.querySelector("#recordHeader")).backgroundColor,
    input:getComputedStyle(document.querySelector("#compactFilter")).backgroundColor
  }));
  expect(light).toEqual({
    body:"rgb(239, 239, 239)",
    record:"rgb(249, 250, 251)",
    input:"rgb(255, 255, 255)"
  });

  await fixture(page, 1440, "dark");
  const dark = await page.evaluate(() => ({
    body:getComputedStyle(document.body).backgroundColor,
    record:getComputedStyle(document.querySelector("#recordHeader")).backgroundColor,
    input:getComputedStyle(document.querySelector("#compactFilter")).backgroundColor
  }));
  expect(dark).toEqual({
    body:"rgb(0, 0, 0)",
    record:"rgb(8, 11, 16)",
    input:"rgb(8, 11, 16)"
  });
});
