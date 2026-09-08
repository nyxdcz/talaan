import { test, expect } from "@playwright/test";

const IPHONE_14_PRO = { width:390, height:844 };
const styles = [
  "app.css?v=2.5.0-talaan1",
  "mobile.css?v=2.5.0-talaan1",
  "shell-ui.css?v=2.5.0-talaan1",
  "production-ui-audit.css?v=2.5.0-talaan1",
  "ui-radius.css?v=2.5.0-ui-e0c1fb9945cf"
];

async function loadAuditFixture(page, theme) {
  await page.setViewportSize(IPHONE_14_PRO);
  const links = styles.map(href => `<link rel="stylesheet" href="http://127.0.0.1:3000/${href}">`).join("");
  await page.setContent(`<!doctype html><html data-theme="${theme}"><head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    ${links}
    <style>*,*::before,*::after{animation:none!important;transition:none!important}</style>
  </head><body>
    <header class="topbar"><div class="topbar-left"><button class="menu-button">Menu</button><div><h1 id="topTitle">A very long Talaan page title that must truncate</h1><p id="todayLabel">A very long date label that must truncate</p></div></div><div class="topbar-actions"><button class="cloud-sync-toolbar-button">Sync</button><button class="topbar-add-button">Add</button><div class="month-navigator"><button class="month-nav-button">‹</button><div class="month-control"><button class="month-display-button">September 2026</button></div><button class="month-nav-button">›</button></div></div></header>
    <main class="main"><div class="content">
      <section id="money" class="page active">
        <div class="money-workspace-switcher workspace-switcher"><button class="workspace-switcher-button">Income</button><button class="workspace-switcher-button">Budget</button></div>
        <div class="section-stack">
          <article class="period-card is-collapsed" data-collapse-key="first-half"><div class="period-header"><div><div class="section-title-row"><h3 aria-describedby="help-description-fixture">First half of the month with a long label</h3><button class="section-help-button context-help-button" aria-label="Help: First half">?</button><span class="sr-only" id="help-description-fixture">First half: Unpaid expenses</span></div><p>Unpaid expenses due on days 1–15</p></div><div class="collapse-actions"><strong class="period-total">₱123,456.00</strong><button class="collapse-toggle" aria-expanded="false"><span class="collapse-icon"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"></path></svg></span></button></div></div><div class="record-list" hidden></div></article>
          <article class="card" id="availableMoneySection"><div class="card-header"><div><h3>Available money</h3></div><div class="collapse-actions"><button class="button" id="addAccountButton">Add</button><button class="collapse-toggle"><span class="collapse-icon"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"></path></svg></span></button></div></div><div class="account-card"><strong class="account-card-label" title="A very long account name that must truncate">A very long account name that must truncate</strong></div></article>
          <article class="card record-row" data-expense-row><div class="record-title-copy"><strong title="A very long expense name that must truncate">A very long expense name that must truncate</strong><small>Long expense metadata that must truncate</small></div><strong class="amount">₱12,345.00</strong><div class="mobile-record-actions"><button class="button">Mark paid</button><div class="record-more-menu overflow-menu"><button class="button overflow-menu-trigger" type="button" aria-haspopup="menu" aria-controls="iphoneExpenseMenu" aria-expanded="false">⋮</button><div class="record-more-panel" id="iphoneExpenseMenu" role="menu" hidden><button class="button" type="button" role="menuitem">Edit expense</button></div></div></div></article>
        </div>
      </section>
      <section id="settings" class="page active"><article class="card settings-panel"><div class="section-title-row"><h3>Sync &amp; Backup</h3><button class="section-help-button context-help-button" aria-label="Help: Sync">?</button></div><button class="button">Export recovery bundle</button></article></section>
    </div></main>
  </body></html>`, { waitUntil:"networkidle" });
}

for (const theme of ["light", "dark"]) {
  test(`iPhone 14 Pro phone contract holds in ${theme} mode`, async ({ page }) => {
    await loadAuditFixture(page, theme);
    const metrics = await page.evaluate(() => {
      const visible = selector => [...document.querySelectorAll(selector)].filter(node => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
      const style = selector => document.querySelector(selector) ? getComputedStyle(document.querySelector(selector)) : null;
      const help = [...document.querySelectorAll(".context-help-button, .section-help-button")];
      const periodHeader = rect("#money .period-header");
      const collapse = rect("#money .collapse-toggle");
      const icon = rect("#money .collapse-icon");
      const rowMore = document.querySelector("#money .record-row[data-expense-row] .record-more-menu");
      const rowMoreTrigger = document.querySelector("#money .record-row[data-expense-row] .overflow-menu-trigger");
      const compactButtons = visible("button").map(node => ({
        selector:node.className || node.id,
        height:node.getBoundingClientRect().height,
        width:node.getBoundingClientRect().width
      }));
      const overflowDetails = (() => {
        const round = value => Math.round(value * 10) / 10;
        const candidates = [...document.querySelectorAll("body *")].map(node => {
          const box = node.getBoundingClientRect();
          const computed = getComputedStyle(node);
          return {
            tag:node.tagName.toLowerCase(),
            id:node.id || "",
            className:typeof node.className === "string" ? node.className.slice(0,120) : "",
            left:round(box.left),
            right:round(box.right),
            width:round(box.width),
            overflowX:computed.overflowX,
            minWidth:computed.minWidth,
            maxWidth:computed.maxWidth,
            position:computed.position
          };
        }).filter(item => item.right > innerWidth + 1 || item.left < -1).slice(0,20);
        return {
          innerWidth,
          documentScrollWidth:document.documentElement.scrollWidth,
          bodyScrollWidth:document.body.scrollWidth,
          candidates
        };
      })();
      return {
        helpVisible:help.filter(node => node.getBoundingClientRect().width > 2 && node.getBoundingClientRect().height > 2).length,
        helpLayoutWidth:help.map(node => node.getBoundingClientRect().width),
        helpDescription:document.querySelector(".section-title-row h3")?.getAttribute("aria-describedby") || "",
        periodHeight:periodHeader?.height || 0,
        collapseSize:[collapse?.width || 0, collapse?.height || 0],
        iconSize:[icon?.width || 0, icon?.height || 0],
        rowMoreSurface:rowMore ? {
          borderTopWidth:getComputedStyle(rowMore).borderTopWidth,
          boxShadow:getComputedStyle(rowMore).boxShadow,
          backgroundImage:getComputedStyle(rowMore).backgroundImage
        } : null,
        rowMoreTrigger:rowMoreTrigger ? {
          width:rowMoreTrigger.getBoundingClientRect().width,
          height:rowMoreTrigger.getBoundingClientRect().height,
          boxShadow:getComputedStyle(rowMoreTrigger).boxShadow
        } : null,
        compactButtons,
        controlRadius:parseFloat(style("#money .collapse-toggle")?.borderRadius || "0"),
        cardShadow:style("#money .card")?.boxShadow || "",
        overflow:Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1,
        overflowDetails,
        longTextStyle:style("#money .record-title-copy > strong") ? {
          minWidth:style("#money .record-title-copy > strong").minWidth,
          overflow:style("#money .record-title-copy > strong").overflow,
          textOverflow:style("#money .record-title-copy > strong").textOverflow,
          whiteSpace:style("#money .record-title-copy > strong").whiteSpace,
          title:document.querySelector("#money .record-title-copy > strong")?.getAttribute("title") || ""
        } : null,
        offset:getComputedStyle(document.documentElement).getPropertyValue("--mobile-topbar-offset").trim()
      };
    });

    expect(metrics.helpVisible).toBe(0);
    expect(metrics.helpLayoutWidth.every(width => width <= 1)).toBe(true);
    expect(metrics.helpDescription).not.toBe("");
    expect(metrics.periodHeight).toBeGreaterThanOrEqual(50);
    expect(metrics.periodHeight).toBeLessThanOrEqual(56);
    expect(metrics.collapseSize).toEqual([35, 35]);
    expect(metrics.iconSize).toEqual([20, 20]);
    expect(metrics.rowMoreSurface).toEqual({ borderTopWidth:"0px", boxShadow:"none", backgroundImage:"none" });
    expect(metrics.rowMoreTrigger).toEqual({ width:35, height:35, boxShadow:"none" });
    expect(metrics.controlRadius).toBe(12);
    expect(metrics.cardShadow).toBe("none");
    expect(metrics.overflow, JSON.stringify(metrics.overflowDetails)).toBe(false);
    expect(metrics.offset).toContain("80px");
    expect(metrics.longTextStyle).toMatchObject({
      minWidth:"0px",
      overflow:"hidden",
      textOverflow:"ellipsis",
      whiteSpace:"nowrap"
    });
    expect(metrics.longTextStyle.title).not.toBe("");
    metrics.compactButtons.forEach(button => expect(button.height, button.selector).toBeLessThanOrEqual(35));
  });
}
