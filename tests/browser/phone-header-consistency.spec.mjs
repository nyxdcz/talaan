import { expect, test } from "../helpers/browser-fixtures.mjs";
/* global data, selectedMonth, renderIncomePage */

test.use({ serviceWorkers:"block", isMobile:true, hasTouch:true, deviceScaleFactor:3 });
const panelKey = "simple-finance-budget-panel-state-v1";
const actionIds = ["buildBudgetFromExpenses", "copyPreviousBudget", "addBudgetItem"];

async function open(page, route = "income", width = 393, height = 852, theme = "dark") {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(new Date("2026-10-15T04:00:00Z"));
  await page.addInitScript(({ theme, panelKey }) => {
    localStorage.setItem("simple-finance-theme-v1", theme);
    if (!localStorage.getItem(panelKey)) localStorage.setItem(panelKey, JSON.stringify({ planner:true }));
  }, { theme, panelKey });
  await page.goto(`http://127.0.0.1:3000/?page=${route}`, { waitUntil:"networkidle" });
  await authenticate(page);
}

async function authenticate(page) {
  await page.waitForFunction(() => Boolean(window.FinanceCloudSync) && Boolean(window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("body")).toHaveClass(/finance-signed-in/);
}

async function controlGeometry(control) {
  return control.evaluate(node => {
    const box = node.getBoundingClientRect(), style = getComputedStyle(node), pieces = [];
    const visible = n => n.checkVisibility({ checkVisibilityCSS:true }) && n.getBoundingClientRect().width > 0;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (text.textContent.trim() && visible(text.parentElement) && !text.parentElement.closest(".sr-only")) {
        const range = document.createRange();
        range.selectNodeContents(text);
        pieces.push(...range.getClientRects());
      }
    }
    for (const part of node.querySelectorAll("svg,input[type=checkbox]")) if (visible(part)) pieces.push(part.getBoundingClientRect());
    const left = Math.min(...pieces.map(r => r.left)), right = Math.max(...pieces.map(r => r.right));
    const top = Math.min(...pieces.map(r => r.top)), bottom = Math.max(...pieces.map(r => r.bottom));
    // Wide collapsed planners anchor the disclosure to the whole summary card.
    const parent = (node.closest(".budget-planner-card.is-planner-collapsed") || node.closest(".card-header"))?.getBoundingClientRect();
    return {
      x:box.x, y:box.y, width:box.width, height:box.height, bottom:box.bottom, right:box.right,
      font:style.fontSize, radius:style.borderRadius,
      dx:Math.abs((left + right - box.left - box.right) / 2),
      dy:Math.abs((top + bottom - box.top - box.bottom) / 2),
      contained:pieces.length > 0 && left >= box.left - 1 && right <= box.right + 1 && top >= box.top - 1 && bottom <= box.bottom + 1,
      inSurface:!parent || (box.left >= parent.left && box.right <= parent.right && box.top >= parent.top && box.bottom <= parent.bottom)
    };
  });
}

function expectCentered(geometry) {
  expect(geometry.width).toBeGreaterThanOrEqual(44);
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(geometry.radius).toBe("10px");
  expect(geometry.contained).toBe(true);
  expect(geometry.dx).toBeLessThan(1);
  expect(geometry.dy).toBeLessThan(1);
  expect(geometry.inSurface).toBe(true);
}

async function expectCollapsed(page) {
  await expect(page.locator("#monthlyBudgetPlannerCard")).toHaveClass(/is-planner-collapsed/);
  await expect(page.locator("#monthlyBudgetPlannerToggle")).toHaveAttribute("aria-expanded", "false");
  for (const id of actionIds) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator(".budget-planner-more-menu")).toBeHidden();
  expectCentered(await controlGeometry(page.locator("#monthlyBudgetPlannerToggle")));
}

for (const theme of ["light", "dark"]) {
  test(`month glyphs stay centered through navigation and focus on every phone route in ${theme}`, async ({ page }) => {
    for (const route of ["dashboard", "money", "income", "paid-expenses", "projects", "payments", "reports", "settings"]) {
      await open(page, route, 393, 852, theme);
      const previous = page.locator("#previousMonthButton"), next = page.locator("#nextMonthButton");
      const month = await page.evaluate(() => selectedMonth());
      for (const button of [previous, next]) {
        expectCentered(await controlGeometry(button));
        await expect(button.locator("svg")).toHaveCSS("width", "24px");
        await expect(button.locator("svg")).toHaveCSS("height", "24px");
      }
      await previous.focus();
      expectCentered(await controlGeometry(previous));
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => selectedMonth())).not.toBe(month);
      expectCentered(await controlGeometry(previous));
      expectCentered(await controlGeometry(next));
      await next.click();
      await expect.poll(() => page.evaluate(() => selectedMonth())).toBe(month);
    }
  });

  for (const [width, height] of [[320,852], [384,1069], [393,660], [430,852]]) {
    test(`phone planner and annual header retain their state and spacing at ${width}x${height} in ${theme}`, async ({ page }) => {
      await open(page, "income", width, height, theme);
      const before = await page.evaluate(() => JSON.stringify({ accounts:data.accounts, expenses:data.expenses, incomeRecords:data.incomeRecords }));
      await expectCollapsed(page);
      expect(await page.locator(".budget-planner-summary").evaluate(n => getComputedStyle(n).gridTemplateColumns.split(" ").length)).toBe(3);
      await page.locator("#monthlyBudgetPlannerToggle").click();
      for (const id of actionIds) {
        await expect(page.locator(`#${id}`)).toBeVisible();
        const g = await controlGeometry(page.locator(`#${id}`));
        expectCentered(g);
        expect(g.font).toBe("13px");
        expect(g.height).toBe(44);
      }
      const build = await controlGeometry(page.locator("#buildBudgetFromExpenses"));
      const copy = await controlGeometry(page.locator("#copyPreviousBudget"));
      const add = await controlGeometry(page.locator("#addBudgetItem"));
      const more = await controlGeometry(page.locator(".budget-planner-more-menu > button"));
      expectCentered(more);
      expect(build.width).toBeCloseTo(copy.width, 1);
      expect(build.width).toBeCloseTo(add.width + more.width + 8, 1);
      expect(more.x - add.right).toBeCloseTo(8, 1);
      expect(build.y - add.bottom).toBeCloseTo(8, 1);
      expect(copy.y - build.bottom).toBeCloseTo(8, 1);
      const annual = await page.locator(".annual-income-card").evaluate(card => {
        const header = card.querySelector(".card-header"), title = header.firstElementChild.getBoundingClientRect();
        const headerBox = header.getBoundingClientRect(), actions = card.querySelector(".annual-income-actions");
        const year = card.querySelector("#incomeYearPicker").getBoundingClientRect();
        const show = card.querySelector(".annual-show-all").getBoundingClientRect();
        const csv = card.querySelector("#exportAnnualIncomeCsv").getBoundingClientRect();
        return { titleWidth:title.width, headerWidth:headerBox.width, yearTop:year.top, showTop:show.top, rowGap:csv.top - show.bottom, columnGap:show.left - year.right, topGap:year.top - title.bottom, exportWidth:csv.width, actionsWidth:actions.getBoundingClientRect().width, gap:getComputedStyle(actions).gap };
      });
      expect(annual.titleWidth).toBeCloseTo(annual.headerWidth, 1);
      expect(annual.yearTop).toBeCloseTo(annual.showTop, 1);
      expect(annual.rowGap).toBeCloseTo(8, 1);
      expect(annual.columnGap).toBeCloseTo(8, 1);
      expect(annual.topGap).toBeCloseTo(8, 1);
      expect(annual.exportWidth).toBeCloseTo(annual.actionsWidth, 1);
      expect(annual.gap).toBe("8px");
      expectCentered(await controlGeometry(page.locator(".annual-show-all")));
      expectCentered(await controlGeometry(page.locator("#exportAnnualIncomeCsv")));
      await expect(page.locator("#incomeYearPicker")).toHaveCSS("font-size", "16px");
      await page.reload({ waitUntil:"networkidle" });
      await authenticate(page);
      await expect(page.locator("#monthlyBudgetPlannerToggle")).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator("#buildBudgetFromExpenses")).toBeVisible();
      await page.locator("#monthlyBudgetPlannerToggle").focus();
      await page.keyboard.press("Space");
      await expectCollapsed(page);
      await page.reload({ waitUntil:"networkidle" });
      await authenticate(page);
      await expectCollapsed(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      expect(await page.evaluate(() => JSON.stringify({ accounts:data.accounts, expenses:data.expenses, incomeRecords:data.incomeRecords }))).toBe(before);
    });
  }
}

test("phone planner actions, annual controls, and rotation preserve balances", async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => {
    const month = selectedMonth();
    data.monthlyBudgets[month] = { month, items:[] };
    data.monthlyBudgets["2026-09"] = { month:"2026-09", items:[{ id:"prior-plan-fixture", category:"Prior plan fixture", plannedAmount:321, group:"flexible", scope:"personal", rollover:false }], savingsAllocation:{ mode:"fixed", value:0, account:"" } };
    renderIncomePage();
    return JSON.stringify(data.accounts);
  });
  await page.locator("#monthlyBudgetPlannerToggle").click();
  await page.locator("#buildBudgetFromExpenses").click();
  await expect.poll(() => page.evaluate(() => data.monthlyBudgets[selectedMonth()].items.length)).toBeGreaterThan(0);
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#copyPreviousBudget").click();
  await expect.poll(() => page.evaluate(() => data.monthlyBudgets[selectedMonth()].items[0]?.category)).toBe("Prior plan fixture");
  expect(await page.evaluate(() => data.monthlyBudgets[selectedMonth()].items[0].plannedAmount)).toBe(321);
  await page.locator(".annual-show-all").click();
  await expect(page.locator("#incomeShowAllCategories")).toBeChecked();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportAnnualIncomeCsv").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  expect(await download.failure()).toBe(null);
  await page.locator("#monthlyBudgetPlannerToggle").click();
  await page.setViewportSize({ width:852, height:393 });
  await expectCollapsed(page);
  await page.setViewportSize({ width:393, height:852 });
  await expectCollapsed(page);
  expect(await page.evaluate(() => JSON.stringify(data.accounts))).toBe(before);
});

test.describe("mouse breakpoints", () => {
  test.use({ isMobile:false, hasTouch:false, deviceScaleFactor:1 });
  test("phone header reflow ends at 700px and desktop navigation retains 30px controls", async ({ page }) => {
    await open(page, "income", 700, 950);
    await expect(page.locator(".annual-income-card > .card-header")).toHaveCSS("display", "block");
    await page.setViewportSize({ width:701, height:950 });
    await expect(page.locator(".annual-income-card > .card-header")).toHaveCSS("display", "flex");
    await page.setViewportSize({ width:1440, height:950 });
    for (const id of ["previousMonthButton", "nextMonthButton"]) {
      await expect(page.locator(`#${id}`)).toHaveCSS("height", "30px");
      await expect(page.locator(`#${id}`)).toHaveCSS("border-radius", "12px");
    }
    await expect(page.locator(".annual-income-actions")).toHaveCSS("display", "flex");
  });
});
