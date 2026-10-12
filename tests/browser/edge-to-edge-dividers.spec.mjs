import { expect, test } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000";

async function openDividerFixture(page, viewport, theme) {
  await page.setViewportSize(viewport);
  await page.goto(`${APP_URL}/`, { waitUntil:"networkidle" });
  await page.setContent(`<!doctype html><html data-theme="${theme}"><head>
    <link rel="stylesheet" href="${APP_URL}/budget-planning.css">
    <link rel="stylesheet" href="${APP_URL}/projects-calendar.css">
    <link rel="stylesheet" href="${APP_URL}/mobile.css">
    <link rel="stylesheet" href="${APP_URL}/app.css">
    <link rel="stylesheet" href="${APP_URL}/sidebar-compact-brand.css">
    <link rel="stylesheet" href="${APP_URL}/black-canvas.css">
    <link rel="stylesheet" href="${APP_URL}/desktop-ui-phase1.css">
    <link rel="stylesheet" href="${APP_URL}/desktop-ux.css">
    <link rel="stylesheet" href="${APP_URL}/production-ui-audit.css">
    <link rel="stylesheet" href="${APP_URL}/ui-radius.css">
  </head><body>
    <aside class="sidebar open" id="sidebar" aria-label="Main navigation"><nav class="sidebar-navigation">Navigation</nav></aside>
    <section id="projects">
      <div class="agenda-kanban-board"><article class="pc-event-card"><div class="pc-event-main">Agenda</div><div class="pc-event-actions" id="agendaActions"><button class="button">Complete</button></div></article></div>
      <div class="project-kanban-board"><article class="finance-kanban-card project-record"><div>Project</div><div class="project-row-actions" id="projectActions"><button class="button">Edit</button></div></article></div>
      <div class="finance-kanban-column" id="projectColumn">Column</div>
    </section>
    <section id="money">
      <article class="card" id="availableMoneySection"><div class="card-header" id="availableMoneyHeader"><div><h3>Available money</h3></div></div><div>Accounts</div></article>
      <div class="section-stack"><article class="card period-card period-early" id="periodCard"><div class="period-header" id="periodHeader"><div><h3>Early expenses</h3><p>First half</p></div><div class="collapse-actions"><strong class="period-total">1,000</strong><button class="collapse-toggle">Toggle</button></div></div><div id="periodBody">Expenses</div></article></div>
      <div id="earlyExpenses"><article class="record-row" data-expense-row><div class="expense-record-title">Expense</div><div class="desktop-record-actions" id="expenseActions"><button class="button">Mark paid</button></div></article></div>
    </section>
    <section id="income"><div class="cash-forecast-body" id="forecastBody"><section class="savings-outlook" id="savingsOutlook">Savings outlook</section></div></section>
    <section id="reports">
      <nav class="report-section-nav" id="reportNav"><button type="button">Overview</button></nav>
      <article class="card report-savings-goals-card" id="reportGoals"><div class="card-header"><div><h3>Savings goals</h3></div></div></article>
      <article class="card report-export-card" id="reportExport"><div class="card-header"><div><h3>Export</h3></div></div></article>
    </section>
    <section id="settings"><article class="card cloud-config-card" id="settingsCard"><div class="card-header"><div><h3>Advanced cloud connection</h3></div></div><details class="advanced-settings-disclosure" id="advancedSettings" open><summary>Connection details</summary><div class="advanced-settings-content">Settings</div></details></article></section>
  </body></html>`, { waitUntil:"networkidle" });
}

function dividerGeometry(page) {
  return page.evaluate(() => {
    const measure = (rowSelector, ownerSelector) => {
      const row = document.querySelector(rowSelector);
      const owner = document.querySelector(ownerSelector);
      if (!row || !owner) return null;
      const rowRect = row.getBoundingClientRect();
      const ownerRect = owner.getBoundingClientRect();
      const ownerStyle = getComputedStyle(owner);
      return {
        leftGap:Math.abs(rowRect.left - ownerRect.left - parseFloat(ownerStyle.borderLeftWidth || 0)),
        rightGap:Math.abs(ownerRect.right - parseFloat(ownerStyle.borderRightWidth || 0) - rowRect.right),
        dividerWidth:Math.max(
          parseFloat(getComputedStyle(row).borderTopWidth || 0),
          parseFloat(getComputedStyle(row).borderBottomWidth || 0)
        )
      };
    };
    const radius = selector => getComputedStyle(document.querySelector(selector)).borderRadius;
    const goalsRect = document.querySelector("#reportGoals").getBoundingClientRect();
    const exportRect = document.querySelector("#reportExport").getBoundingClientRect();
    const periodHeaderStyle = getComputedStyle(document.querySelector("#periodHeader"));

    const sidebar = document.querySelector("#sidebar");
    const sidebarStates = window.innerWidth >= 851
      ? [
          ["collapsed", "sidebar"],
          ["expanded", "sidebar desktop-open"],
          ["pinned", "sidebar sidebar-pinned"]
        ]
      : [["phone-open", "sidebar open"]];

    const sidebarEdges = sidebarStates.map(([state, className]) => {
      sidebar.className = className;
      const sidebarRect = sidebar.getBoundingClientRect();
      const sidebarStyle = getComputedStyle(sidebar);
      const edgeStyle = getComputedStyle(sidebar, "::after");
      return {
        state,
        edgeContent:edgeStyle.content,
        edgePosition:edgeStyle.position,
        edgeWidth:edgeStyle.width,
        edgeTop:edgeStyle.top,
        edgeBottom:edgeStyle.bottom,
        topGap:Math.abs(sidebarRect.top),
        bottomGap:Math.abs(window.innerHeight - sidebarRect.bottom),
        boxShadow:sidebarStyle.boxShadow
      };
    });

    return {
      agenda:measure("#agendaActions", ".agenda-kanban-board .pc-event-card"),
      project:measure("#projectActions", ".project-kanban-board .project-record"),
      available:measure("#availableMoneyHeader", "#availableMoneySection"),
      savings:measure("#savingsOutlook", "#forecastBody"),
      expense:measure("#expenseActions", "#earlyExpenses > [data-expense-row]"),
      period:measure("#periodHeader", "#periodCard"),
      advanced:measure("#advancedSettings", "#settingsCard"),
      expenseVisible:getComputedStyle(document.querySelector("#expenseActions")).display !== "none",
      reportGap:exportRect.top - goalsRect.bottom,
      radii:{
        period:radius("#periodCard"),
        projectColumn:radius("#projectColumn"),
        reportNav:radius("#reportNav")
      },
      periodHeaderBottomRadii:{
        left:periodHeaderStyle.borderBottomLeftRadius,
        right:periodHeaderStyle.borderBottomRightRadius
      },
      periodHeaderBorderColor:periodHeaderStyle.borderBottomColor,
      lineColor:getComputedStyle(document.querySelector("#reportNav")).borderTopColor,
      sidebarEdges
    };
  });
}

for (const theme of ["light", "dark"]) {
  for (const viewport of [
    { width:1920, height:1100 },
    { width:1440, height:1000 },
    { width:1024, height:1000 },
    { width:768, height:900 },
    { width:375, height:852 }
  ]) {
    test(`Structural dividers and boundaries stay consistent in ${theme} theme at ${viewport.width}px`, async ({ page }) => {
      await openDividerFixture(page, viewport, theme);
      const geometry = await dividerGeometry(page);
      const rows = {
        agenda:geometry.agenda,
        project:geometry.project,
        available:geometry.available,
        savings:geometry.savings
      };
      if (viewport.width <= 850) rows.period = geometry.period;
      if (viewport.width >= 851) rows.advanced = geometry.advanced;

      const failures = Object.entries(rows).filter(([, row]) => !row
        || row.leftGap > 1
        || row.rightGap > 1
        || row.dividerWidth !== 1);

      expect(failures, `Divider geometry:\n${JSON.stringify(geometry, null, 2)}`).toEqual([]);
      if (geometry.expenseVisible) {
        expect(geometry.expense, "Desktop expense footer geometry").toEqual({
          leftGap:10,
          rightGap:10,
          dividerWidth:0
        });
      }
      expect(geometry.reportGap).toBeGreaterThanOrEqual(8);
      expect(geometry.radii.period).toBe("14px");
      expect(geometry.radii.projectColumn).toBe("16px");
      expect(geometry.radii.reportNav).toBe("16px");

      if (viewport.width <= 850) {
        expect(geometry.periodHeaderBottomRadii.left).toBe("0px");
        expect(geometry.periodHeaderBottomRadii.right).toBe("0px");
        expect(geometry.periodHeaderBorderColor).toBe(geometry.lineColor);
      }

      for (const sidebar of geometry.sidebarEdges) {
        expect(sidebar.edgeContent, sidebar.state).toBe('""');
        expect(sidebar.edgePosition, sidebar.state).toBe("absolute");
        expect(sidebar.edgeWidth, sidebar.state).toBe("1px");
        expect(sidebar.edgeTop, sidebar.state).toBe("0px");
        expect(sidebar.edgeBottom, sidebar.state).toBe("0px");
        expect(sidebar.topGap, sidebar.state).toBe(0);
        expect(sidebar.bottomGap, sidebar.state).toBe(0);
        expect(sidebar.boxShadow, sidebar.state).toBe("none");
      }
    });
  }
}
