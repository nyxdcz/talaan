import { expect, test } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000";

async function openDashboard(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${APP_URL}/?page=dashboard`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("#dashboard .dashboard-view-tabs")).toBeVisible();
}

async function openFinance(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${APP_URL}/?page=money`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("#money .money-workspace-switcher")).toBeVisible();
}

async function captureSwitcherStyles(page, selector) {
  return page.evaluate(currentSelector => {
    const switcher = document.querySelector(currentSelector);
    const active = switcher.querySelector('[aria-selected="true"]');
    const inactive = switcher.querySelector('[aria-selected="false"]');
    const outerStyle = node => {
      const css = getComputedStyle(node);
      return {
        display:css.display,
        position:css.position,
        top:css.top,
        height:css.height,
        minHeight:css.minHeight,
        maxHeight:css.maxHeight,
        margin:css.margin,
        padding:css.padding,
        gap:css.gap,
        border:css.border,
        borderRadius:css.borderRadius,
        backgroundColor:css.backgroundColor,
        boxShadow:css.boxShadow,
        overflow:css.overflow,
        backdropFilter:css.backdropFilter,
        webkitBackdropFilter:css.webkitBackdropFilter
      };
    };
    const buttonStyle = node => {
      const css = getComputedStyle(node);
      return {
        boxSizing:css.boxSizing,
        display:css.display,
        height:css.height,
        minHeight:css.minHeight,
        maxHeight:css.maxHeight,
        padding:css.padding,
        border:css.border,
        borderRadius:css.borderRadius,
        backgroundColor:css.backgroundColor,
        color:css.color,
        boxShadow:css.boxShadow,
        fontSize:css.fontSize,
        fontWeight:css.fontWeight,
        lineHeight:css.lineHeight,
        textAlign:css.textAlign,
        whiteSpace:css.whiteSpace
      };
    };
    return {
      outer:outerStyle(switcher),
      active:buttonStyle(active),
      inactive:buttonStyle(inactive)
    };
  }, selector);
}

test("Dashboard defaults to Calendar and exposes the approved view order", async ({ page }) => {
  await openDashboard(page, { width:1440, height:1000 });

  const tabs = page.locator("#dashboard [data-dashboard-view-tab]");
  await expect(tabs).toHaveText(["Calendar", "Cash Flow", "Overview"]);
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(0)).toHaveAttribute("tabindex", "0");
  await expect(page.locator("#dashboardViewPanel")).toHaveAttribute("aria-labelledby", "dashboardViewTabCalendar");
  await expect(page.locator('[data-dashboard-card="calendar"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-card="cash-flow"]')).toBeHidden();
  await expect(page.locator('#dashboard > .dashboard-view-panel > [data-dashboard-view="overview"].kpi-grid')).toBeHidden();
});

test("Dashboard calendar follows the global month without duplicate controls", async ({ page }) => {
  await openDashboard(page, { width:1440, height:1000 });
  await expect(page.locator("#dashboardCalendarPrevious, #dashboardCalendarNext, #dashboardCalendarLabel")).toHaveCount(0);

  await page.locator("#monthPicker").evaluate(picker => {
    picker.value = "2026-08";
    picker.dispatchEvent(new Event("change", { bubbles:true }));
  });
  await expect(page.locator("#monthPicker")).toHaveValue("2026-08");
  await expect(page.locator("#dashboardCalendarGrid .calendar-day:not(.is-outside)").first()).toHaveAttribute("data-calendar-date", "2026-08-01");
  await expect(page.locator("#dashboardCalendarSelectedLabel")).toHaveText("August 1, 2026");

  await page.locator("#nextMonthButton").click();
  await expect(page.locator("#monthPicker")).toHaveValue("2026-09");
  await expect(page.locator("#dashboardCalendarGrid .calendar-day:not(.is-outside)").first()).toHaveAttribute("data-calendar-date", "2026-09-01");
  await expect(page.locator("#dashboardCalendarSelectedLabel")).toHaveText("September 1, 2026");

  await page.locator('#dashboardCalendarGrid .calendar-day[data-calendar-date="2026-08-31"]').click();
  await expect(page.locator("#monthPicker")).toHaveValue("2026-08");
  await expect(page.locator("#dashboardCalendarSelectedLabel")).toHaveText("August 31, 2026");
});

test("Dashboard tabs filter existing cards without duplicating finance content", async ({ page }) => {
  await openDashboard(page, { width:1440, height:1000 });

  await page.locator('[data-dashboard-view-tab="cash-flow"]').click();
  await expect(page.locator('[data-dashboard-view-tab="cash-flow"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-dashboard-card="calendar"]')).toBeHidden();
  await expect(page.locator('[data-dashboard-card="cash-flow"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-card="savings-trend"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-card="savings-goals"]')).toBeVisible();

  await page.locator('[data-dashboard-view-tab="overview"]').click();
  await expect(page.locator('#dashboard > .dashboard-view-panel > [data-dashboard-view="overview"].kpi-grid')).toBeVisible();
  await expect(page.locator('[data-dashboard-card="due-soon"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-card="accounts"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-card="activity"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-card="cash-flow"]')).toBeHidden();
});

test("Dashboard tabs support roving keyboard focus and customization preview", async ({ page }) => {
  await openDashboard(page, { width:1280, height:900 });

  const calendar = page.locator('[data-dashboard-view-tab="calendar"]');
  await calendar.focus();
  await calendar.press("ArrowRight");
  await expect(page.locator('[data-dashboard-view-tab="cash-flow"]')).toBeFocused();
  await expect(page.locator('[data-dashboard-view-tab="cash-flow"]')).toHaveAttribute("aria-selected", "true");
  await page.locator('[data-dashboard-view-tab="cash-flow"]').press("End");
  await expect(page.locator('[data-dashboard-view-tab="overview"]')).toBeFocused();

  await page.evaluate(() => window.setDashboardCustomizeMode(true));
  await expect(page.locator('[data-dashboard-card="calendar"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-card="cash-flow"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-card="activity"]')).toBeVisible();
  await page.evaluate(() => window.setDashboardCustomizeMode(false));
  await expect(page.locator('[data-dashboard-card="calendar"]')).toBeHidden();
  await expect(page.locator('[data-dashboard-card="activity"]')).toBeVisible();
});

for (const viewport of [{ width:1440, height:1000 }, { width:393, height:852 }]) {
  test(`Dashboard row dividers reach both card edges at ${viewport.width}px`, async ({ page }) => {
    await openDashboard(page, viewport);
    await page.locator('[data-dashboard-view-tab="overview"]').click();

    const geometry = await page.evaluate(() => {
      const measure = selector => {
        const row = document.querySelector(selector);
        const card = row?.closest(".card");
        if (!row || !card) return null;
        const rowRect = row.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const cardStyle = getComputedStyle(card);
        return {
          leftGap:Math.abs(rowRect.left - cardRect.left - parseFloat(cardStyle.borderLeftWidth)),
          rightGap:Math.abs(cardRect.right - parseFloat(cardStyle.borderRightWidth) - rowRect.right),
          borderBottom:getComputedStyle(row).borderBottomWidth
        };
      };
      return {
        list:measure("#dashDueSoon > li:first-child"),
        metric:measure('[data-dashboard-card="payment-progress"] > .dashboard-stat-line'),
        overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      };
    });

    for (const row of [geometry.list, geometry.metric]) {
      expect(row).not.toBeNull();
      expect(row.leftGap).toBeLessThanOrEqual(1);
      expect(row.rightGap).toBeLessThanOrEqual(1);
      expect(row.borderBottom).toBe("1px");
    }
    expect(geometry.overflow).toBe(false);
  });
}

for (const viewport of [{ width:1440, height:1000 }, { width:393, height:852 }]) {
  test(`Dashboard and Finance share the exact segmented-control styles at ${viewport.width}px`, async ({ page }) => {
    await openFinance(page, viewport);
    const finance = await captureSwitcherStyles(page, "#money .money-workspace-switcher");
    await openDashboard(page, viewport);
    const dashboard = await captureSwitcherStyles(page, "#dashboard .dashboard-view-tabs");

    expect(dashboard.outer).toEqual(finance.outer);
    expect(dashboard.active).toEqual(finance.active);
    expect(dashboard.inactive).toEqual(finance.inactive);
  });
}

for (const viewport of [{ width:1440, height:1000 }, { width:393, height:852 }]) {
  test(`Dashboard keeps its 12px cards, 12px workspace tabs, and contained tabs at ${viewport.width}px`, async ({ page }) => {
    await openDashboard(page, viewport);

    const contract = await page.evaluate(() => {
      const tabs = document.querySelector("#dashboard .dashboard-view-tabs");
      const calendar = document.querySelector('[data-dashboard-card="calendar"]');
      const calendarLayout = document.querySelector("#dashboard .dashboard-calendar-layout");
      const calendarGrid = document.getElementById("dashboardCalendarGrid");
      const calendarEvents = document.querySelector("#dashboard .dashboard-calendar-events");
      const calendarDays = [...document.querySelectorAll("#dashboard .calendar-day")];
      const grid = document.getElementById("dashboardCardGrid");
      const tabRect = tabs.getBoundingClientRect();
      const cardRect = calendar.getBoundingClientRect();
      const calendarGridRect = calendarGrid.getBoundingClientRect();
      const calendarEventsRect = calendarEvents.getBoundingClientRect();
      const tabButtons = [...tabs.querySelectorAll(".dashboard-view-tab")];
      return {
        tabRadius:parseFloat(getComputedStyle(tabs).borderRadius),
        tabHeight:tabRect.height,
        tabWidth:tabRect.width,
        tabPadding:parseFloat(getComputedStyle(tabs).paddingTop),
        tabGap:parseFloat(getComputedStyle(tabs).gap),
        tabButtonHeights:tabButtons.map(button => button.getBoundingClientRect().height),
        activeTabRadius:parseFloat(getComputedStyle(tabButtons[0]).borderRadius),
        cardRadius:parseFloat(getComputedStyle(calendar).borderRadius),
        gridGap:parseFloat(getComputedStyle(grid).gap),
        gridWidth:grid.getBoundingClientRect().width,
        calendarCardWidth:cardRect.width,
        calendarLayoutColumns:getComputedStyle(calendarLayout).gridTemplateColumns.trim().split(/\s+/).length,
        calendarGridWidth:calendarGridRect.width,
        calendarEventsWidth:calendarEventsRect.width,
        calendarDayMinHeight:Math.min(...calendarDays.map(day => day.getBoundingClientRect().height)),
        tabsContained:tabRect.left >= -1 && tabRect.right <= innerWidth + 1,
        cardContained:cardRect.left >= -1 && cardRect.right <= innerWidth + 1,
        pageOverflow:document.documentElement.scrollWidth > innerWidth + 1
      };
    });

    expect(contract.tabRadius).toBe(12);
    expect(contract.cardRadius).toBe(12);
    expect(contract.gridGap).toBe(12);
    expect(contract.tabsContained).toBe(true);
    expect(contract.cardContained).toBe(true);
    expect(contract.pageOverflow).toBe(false);

    if (viewport.width === 1440) {
      expect(contract.tabHeight).toBe(43);
      expect(contract.tabPadding).toBe(3);
      expect(contract.tabGap).toBe(3);
      expect(contract.activeTabRadius).toBe(12);
      expect(contract.tabWidth).toBeLessThanOrEqual(480);
      expect(contract.calendarLayoutColumns).toBe(2);
      expect(contract.calendarCardWidth).toBeGreaterThanOrEqual(contract.gridWidth - 1);
      expect(contract.calendarGridWidth / contract.calendarEventsWidth).toBeGreaterThan(2.3);
      expect(contract.calendarDayMinHeight).toBeGreaterThanOrEqual(68);
    } else {
      expect(contract.tabHeight).toBe(35);
      expect(contract.tabPadding).toBe(0);
      expect(contract.tabGap).toBe(0);
      expect(contract.tabButtonHeights).toEqual([35, 35, 35]);
      expect(contract.activeTabRadius).toBe(12);
      expect(contract.calendarLayoutColumns).toBe(1);
      expect(contract.calendarDayMinHeight).toBeGreaterThanOrEqual(56);
    }
  });
}

test("normal Dashboard views ignore stale card spans while Customize mode preserves them", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("simple-finance-project-records-v2-dashboard-phase4", JSON.stringify({
      customized:true,
      hidden:[],
      privacy:false,
      order:["activity", "projects", "accounts", "payment-progress", "expense-schedule", "due-soon", "savings-goals", "savings-trend", "cash-flow", "calendar"],
      sizes:{
        calendar:"large",
        "cash-flow":"large",
        "savings-goals":"small",
        "savings-trend":"large",
        "due-soon":"small",
        "expense-schedule":"wide",
        "payment-progress":"small",
        accounts:"small",
        projects:"wide",
        activity:"small"
      }
    }));
  });
  await openDashboard(page, { width:1440, height:1000 });

  const dashboard = page.locator("#dashboard");
  const grid = page.locator("#dashboardCardGrid");
  const calendar = page.locator('[data-dashboard-card="calendar"]');
  await expect(dashboard).not.toHaveClass(/dashboard-default-layout/);
  await expect(calendar).toHaveAttribute("data-size", "large");

  const fullWidthDifference = async locator => {
    const [gridBox, cardBox] = await Promise.all([grid.boundingBox(), locator.boundingBox()]);
    return Math.abs(gridBox.width - cardBox.width);
  };
  expect(await fullWidthDifference(calendar)).toBeLessThanOrEqual(1);

  await page.locator('[data-dashboard-view-tab="cash-flow"]').click();
  const cashFlow = page.locator('[data-dashboard-card="cash-flow"]');
  await expect(cashFlow).toBeVisible();
  expect(await fullWidthDifference(cashFlow)).toBeLessThanOrEqual(1);

  await page.locator('[data-dashboard-view-tab="overview"]').click();
  const overviewLayout = await page.evaluate(() => {
    const rect = key => document.querySelector(`[data-dashboard-card="${key}"]`).getBoundingClientRect();
    const gridRect = document.getElementById("dashboardCardGrid").getBoundingClientRect();
    const first = [rect("due-soon"), rect("expense-schedule"), rect("payment-progress")];
    const second = [rect("accounts"), rect("projects")];
    const activity = rect("activity");
    return {
      firstTops:first.map(item => item.top),
      firstWidths:first.map(item => item.width),
      secondTops:second.map(item => item.top),
      secondWidths:second.map(item => item.width),
      activityWidth:activity.width,
      gridWidth:gridRect.width
    };
  });
  expect(Math.max(...overviewLayout.firstTops) - Math.min(...overviewLayout.firstTops)).toBeLessThanOrEqual(1);
  expect(Math.max(...overviewLayout.firstWidths) - Math.min(...overviewLayout.firstWidths)).toBeLessThanOrEqual(1);
  expect(Math.max(...overviewLayout.secondTops) - Math.min(...overviewLayout.secondTops)).toBeLessThanOrEqual(1);
  expect(Math.max(...overviewLayout.secondWidths) - Math.min(...overviewLayout.secondWidths)).toBeLessThanOrEqual(1);
  expect(Math.abs(overviewLayout.activityWidth - overviewLayout.gridWidth)).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.setDashboardCustomizeMode(true));
  const customizedCalendarWidth = await calendar.evaluate(node => node.getBoundingClientRect().width);
  const customizedGridWidth = await grid.evaluate(node => node.getBoundingClientRect().width);
  expect(customizedCalendarWidth).toBeLessThan(customizedGridWidth * .6);
  await expect(calendar).toHaveAttribute("data-size", "large");
});
