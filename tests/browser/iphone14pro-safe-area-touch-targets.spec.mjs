import { test, expect } from "@playwright/test";

const IPHONE_14_PRO = { width:393, height:852 };
const styles = [
  "app.css?v=2.5.0-talaan1",
  "shell-ui.css?v=2.5.0-talaan1",
  "projects-calendar.css?v=2.5.0-talaan1",
  "ui-icon-alignment.css?v=2.5.0-talaan1",
  "production-ui-audit.css?v=2.5.0-talaan1"
];

async function loadFixture(page, viewport) {
  await page.setViewportSize(viewport);
  const links = styles.map(href => `<link rel="stylesheet" href="http://127.0.0.1:3000/${href}">`).join("");
  await page.setContent(`<!doctype html><html data-theme="light"><head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    ${links}
    <style>*,*::before,*::after{animation:none!important;transition:none!important}.offset-probe{position:fixed;top:var(--mobile-topbar-offset);left:0;width:1px;height:1px}</style>
  </head><body class="finance-signed-out">
    <header class="topbar" id="phoneTopbar">
      <div class="topbar-left"><button class="menu-button" type="button">Menu</button><div><h1>Budget &amp; Expenses</h1><p>Friday, August 28, 2026</p></div></div>
      <div class="topbar-actions">
        <button class="cloud-sync-toolbar-button" type="button">Sync</button>
        <button class="topbar-add-button" type="button">Add</button>
        <div class="topbar-tools-menu"><summary>Tools</summary></div>
        <div class="month-navigator">
          <button class="month-nav-button" type="button">Previous</button>
          <div class="month-control"><button class="month-display-button" type="button">August 2026</button>
            <div class="month-picker-popover" id="monthPicker">
              <div class="month-picker-heading"><button class="month-picker-year-button" id="yearPrevious">‹</button><strong>2026</strong><button class="month-picker-year-button">›</button></div>
              <div class="month-picker-grid">${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(name => `<button class="month-picker-option">${name}</button>`).join("")}</div>
            </div>
          </div>
          <button class="month-nav-button" type="button">Next</button><span class="month-status-chip current">Current</span>
        </div>
      </div>
    </header>
    <div class="offset-probe" id="offsetProbe"></div>
    <button class="cloud-sync-popover-close" id="syncClose">×</button>
    <button class="compact-help-close" id="helpClose">×</button>
    <div class="settings-search-field"><span></span><input class="input"><button id="settingsClear">Clear</button></div>
    <div class="emoji-picker"><div class="emoji-picker-panel" id="emojiPanel"><div class="emoji-grid"><button class="emoji-option" id="emojiOption">💵</button><button class="emoji-option">🏦</button><button class="emoji-option">📱</button><button class="emoji-option">💳</button><button class="emoji-option">🪙</button><button class="emoji-custom-button" id="emojiCustom">Paste another emoji…</button></div></div></div>
    <span class="gym-override-chip"><span>Aug 28</span><button id="gymRemove">×</button></span>
    <div class="kanban-column-menu"><button class="button overflow-menu-trigger" id="kanbanMenu">⋮</button></div>
    <div class="pc-event-actions"><button class="button" id="agendaAction">Open</button></div>
    <section id="projects"><div class="project-kanban-board"><button class="button project-calendar-button" id="kanbanCalendar">Calendar</button><div class="project-row-actions"><button class="button" id="kanbanAction">Edit</button></div></div></section>
    <div class="structured-drag-toast"><button class="structured-drag-toast-undo" id="toastUndo">Undo</button><button class="structured-drag-toast-dismiss" id="toastDismiss">×</button></div>
    <section class="page"><div class="finance-privacy-lock-view" id="privacyLock">Private</div></section>
  </body></html>`, { waitUntil:"networkidle" });
}

test("iPhone 14 Pro safe areas and 35px compact controls stay contained", async ({ page }) => {
  await loadFixture(page, IPHONE_14_PRO);

  const state = await page.evaluate(() => {
    const rect = id => {
      const value = document.getElementById(id).getBoundingClientRect();
      return { width:value.width, height:value.height, left:value.left, right:value.right, top:value.top, bottom:value.bottom };
    };
    const ids = ["yearPrevious","syncClose","helpClose","settingsClear","emojiOption","emojiCustom","gymRemove","kanbanMenu","agendaAction","kanbanCalendar","kanbanAction","toastUndo","toastDismiss"];
    return {
      controls:Object.fromEntries(ids.map(id => [id, rect(id)])),
      monthOptionHeight:document.querySelector(".month-picker-option").getBoundingClientRect().height,
      monthPicker:rect("monthPicker"),
      emojiPanel:rect("emojiPanel"),
      emojiColumns:getComputedStyle(document.querySelector(".emoji-grid")).gridTemplateColumns.trim().split(/\s+/).length,
      topbarBottom:rect("phoneTopbar").bottom,
      offsetTop:rect("offsetProbe").top,
      privacyMinHeight:getComputedStyle(document.getElementById("privacyLock")).minHeight,
      scrollWidth:document.documentElement.scrollWidth,
      innerWidth:window.innerWidth
    };
  });

  const iconControlIds = new Set([
    "yearPrevious", "syncClose", "helpClose", "settingsClear", "emojiOption",
    "emojiCustom", "gymRemove", "kanbanMenu", "toastDismiss"
  ]);
  Object.entries(state.controls).forEach(([id, rect]) => {
    expect(rect.height, id + " height").toBe(35);
    expect(rect.width, id + " width").toBeGreaterThan(0);
    if (iconControlIds.has(id)) {
      expect(rect.width, id + " width").toBe(35);
    }
  });
  expect(state.monthOptionHeight).toBe(35);
  expect(state.monthPicker.left).toBeGreaterThanOrEqual(0);
  expect(state.monthPicker.right).toBeLessThanOrEqual(IPHONE_14_PRO.width);
  expect(state.emojiPanel.left).toBeGreaterThanOrEqual(0);
  expect(state.emojiPanel.right).toBeLessThanOrEqual(IPHONE_14_PRO.width);
  expect(state.emojiColumns).toBe(5);
  expect(Math.abs(state.offsetTop - state.topbarBottom)).toBeLessThanOrEqual(1);
  expect(state.privacyMinHeight).not.toBe("0px");
  expect(state.scrollWidth).toBeLessThanOrEqual(state.innerWidth);
});

test("iPhone refinements do not resize desktop compact controls", async ({ page }) => {
  await loadFixture(page, { width:1024, height:852 });
  const dimensions = await page.evaluate(() => ({
    help:document.getElementById("helpClose").getBoundingClientRect().height,
    emoji:document.getElementById("emojiOption").getBoundingClientRect().height,
    gym:document.getElementById("gymRemove").getBoundingClientRect().height,
    kanban:document.getElementById("kanbanMenu").getBoundingClientRect().height
  }));
  expect(dimensions).toEqual({ help:30, emoji:30, gym:24, kanban:30 });
});
