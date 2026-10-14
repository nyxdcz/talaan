import { test, expect } from "../helpers/browser-fixtures.mjs";

for (const theme of ["light","dark"]) {
  test(`Talaan V2.5.0 ${theme} final chrome is readable`, async ({ page }) => {
    await page.setViewportSize({width:1440,height:900});
    await page.setContent(`<!doctype html><html data-theme="${theme}"><head>
      <link rel="stylesheet" href="http://127.0.0.1:3000/app.css?v=2.5.0-talaan1">
      <link rel="stylesheet" href="http://127.0.0.1:3000/shell-ui.css?v=2.5.0-talaan1">
      <link rel="stylesheet" href="http://127.0.0.1:3000/dashboard-interactions.css?v=2.5.0-talaan1">
      <link rel="stylesheet" href="http://127.0.0.1:3000/black-canvas.css?v=2.5.0-talaan1">
      <link rel="stylesheet" href="http://127.0.0.1:3000/liquid-glass.css?v=2.5.0-talaan1">
      <style>*,*::before,*::after{animation:none!important;transition:none!important}</style>
    </head><body>
      <aside class="sidebar desktop-open" id="sidebar">
        <button class="nav-button" id="inactiveNav"><span class="nav-icon"><img id="inactiveIcon" class="nav-icon-image" src="http://127.0.0.1:3000/icons/sidebar-overview.png" alt=""></span><span>Overview</span></button>
        <button class="nav-button active" id="activeNav"><span class="nav-icon"><img id="activeIcon" class="nav-icon-image" src="http://127.0.0.1:3000/icons/sidebar-finance.png" alt=""></span><span>Finance</span></button>
      </aside>
      <header class="topbar" id="topbar"><div class="topbar-actions"><div class="month-navigator"><button class="month-nav-button" id="monthPrev">‹</button><div class="month-control" id="monthControl"><button class="month-display-button" id="monthDisplay">August 2026</button></div><button class="month-nav-button">›</button></div><div class="topbar-history-actions"><button class="topbar-history-button" id="undo">↶</button></div></div></header>
      <div class="workspace-switcher"><button class="workspace-switcher-button active" id="workspaceActive">Budget & Expenses</button></div>
      <section class="dashboard-week-marquee" id="marquee"><div class="dashboard-week-marquee-heading"><strong>This week</strong></div><div class="dashboard-week-marquee-window"><div class="dashboard-week-marquee-track"><div class="dashboard-week-marquee-group"><article class="dashboard-week-day" id="weekDay"><div class="dashboard-week-copy"><strong>15th Month Salary</strong><small>Paycheck</small></div></article></div></div></div></section>
      <section id="availableMoneySection"><button class="button button-secondary button-small account-spend-button"><span id="spendLabel">Spend</span></button></section>
      <dialog open><form><header class="modal-header" id="modalHeader"><h3>Edit account</h3></header><div class="modal-body">Body</div><footer class="modal-footer" id="modalFooter"><button class="button button-secondary">Cancel</button><button class="button button-primary">Record spending</button></footer></form></dialog>
    </body></html>`,{waitUntil:"load"});
    const r=await page.evaluate(()=>{
      const bg=(el)=>{const s=getComputedStyle(el); return {image:s.backgroundImage,color:s.backgroundColor};};
      return {
        body:getComputedStyle(document.body).backgroundColor,
        strong:getComputedStyle(document.documentElement).getPropertyValue("--liquid-glass-surface-strong").trim(),
        sidebar:bg(document.querySelector("#sidebar")),
        inactive:getComputedStyle(document.querySelector("#inactiveNav")).color,
        active:getComputedStyle(document.querySelector("#activeNav")).color,
        inactiveFilter:getComputedStyle(document.querySelector("#inactiveIcon")).filter,
        activeFilter:getComputedStyle(document.querySelector("#activeIcon")).filter,
        workspace:getComputedStyle(document.querySelector("#workspaceActive")).color,
        marquee:bg(document.querySelector("#marquee")),
        day:bg(document.querySelector("#weekDay")),
        monthControl:bg(document.querySelector("#monthControl")),
        monthPrev:bg(document.querySelector("#monthPrev")),
        monthColor:getComputedStyle(document.querySelector("#monthDisplay")).color,
        undo:bg(document.querySelector("#undo")),
        undoColor:getComputedStyle(document.querySelector("#undo")).color,
        spend:getComputedStyle(document.querySelector("#spendLabel")).color,
        header:bg(document.querySelector("#modalHeader")),
        headerColor:getComputedStyle(document.querySelector("#modalHeader")).color,
        footer:bg(document.querySelector("#modalFooter"))
      };
    });
    if(theme==="light"){
      expect(r.body).toBe("rgb(239, 239, 239)");
      expect(r.strong).toContain("255,255,255");
      expect(r.sidebar.image).toContain("rgba(255, 255, 255");
      expect(r.inactive).toBe("rgb(24, 34, 48)");
      expect(r.active).toBe("rgb(255, 255, 255)");
      expect(r.inactiveFilter).toContain("brightness(0)");
      expect(r.activeFilter).toContain("invert(1)");
      expect(r.workspace).toBe("rgb(255, 255, 255)");
      expect(r.marquee.image).toContain("rgba(247, 249, 252");
      expect(r.day.image).toContain("rgba(247, 249, 252");
      expect(r.monthControl.color).toBe("rgb(249, 250, 251)");
      expect(r.monthPrev.color).toBe("rgb(255, 255, 255)");
      expect(r.monthColor).toBe("rgb(24, 34, 48)");
      expect(r.undo.color).toBe("rgb(255, 255, 255)");
      expect(r.undoColor).toBe("rgb(24, 34, 48)");
      expect(r.spend).toBe("rgb(24, 34, 48)");
      expect(r.header.image).toContain("rgba(255, 255, 255");
      expect(r.headerColor).toBe("rgb(24, 34, 48)");
      expect(r.footer.image).toContain("rgba(255, 255, 255");
    } else {
      expect(r.body).toBe("rgb(0, 0, 0)");
      expect(r.strong).toContain("7,12,20");
      expect(r.spend).toBe("rgb(255, 255, 255)");
      const sidebarEffective=r.sidebar.image!=="none"?r.sidebar.image:r.sidebar.color;
      expect(sidebarEffective).not.toContain("255, 255, 255");
    }
  });
}
