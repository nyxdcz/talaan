import { expect, test } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000";

test.use({ serviceWorkers:"block" });

async function openAuthenticatedPage(page, route, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${APP_URL}/?page=${route}`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("body")).toHaveClass(/finance-signed-in/);
  await expect(page.locator(`#${route}`)).toHaveClass(/active/);
}

for (const width of [1024, 1440]) {
  test(`desktop Paid Expenses keeps every primary filter action on one row at ${width}px`, async ({ page }) => {
    await openAuthenticatedPage(page, "paid-expenses", { width, height:1000 });

    const toolbar = page.locator("#paidExpensesSection .paid-toolbar-compact");
    const controls = toolbar.locator(":scope > .field, :scope > button");
    await expect(controls).toHaveCount(4);

    const geometry = await controls.evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { top:rect.top, bottom:rect.bottom, left:rect.left, right:rect.right };
    }));

    geometry.forEach(rect => expect(Math.abs(rect.top - geometry[0].top)).toBeLessThan(2));
    geometry.forEach(rect => expect(Math.abs(rect.bottom - geometry[0].bottom)).toBeLessThan(2));
    geometry.forEach((rect, index) => {
      if (index > 0) expect(rect.left).toBeGreaterThanOrEqual(geometry[index - 1].right);
    });
  });
}

test("app shell publishes the refreshed responsive stylesheet revision", async ({ page }) => {
  await page.goto(APP_URL, { waitUntil:"networkidle" });

  await expect(page.locator('link[rel="stylesheet"][href*="app.css?v=2.5.0-talaan2"]')).toHaveCount(1);
  const workerSource = await page.evaluate(() => fetch("./sw.js", { cache:"no-store" }).then(response => response.text()));
  const dashboardStyleSource = await page.evaluate(() => fetch("./dashboard-interactions.css", { cache:"no-store" }).then(response => response.text()));
  expect(workerSource).toContain('asset("./app.css?v=2.5.0-talaan2")');
  expect(workerSource).toContain('url.pathname.endsWith("app.css")');
  expect(dashboardStyleSource).toContain('@import url("./dashboard-interactions-core.css")');
});

test("Escape closes the Income dialog and returns focus to its opener", async ({ page }) => {
  await openAuthenticatedPage(page, "income", { width:393, height:852 });

  const opener = page.locator("#addIncomeButton");
  const dialog = page.locator("#incomeDialog");
  await opener.click();
  await expect(dialog).toBeVisible();
  await expect(page.locator("#incomeName")).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

for (const viewport of [{ width:375, height:812 }, { width:768, height:1024 }]) {
  test(`responsive Settings uses the overview cards as its single category entry point at ${viewport.width}px`, async ({ page }) => {
    await openAuthenticatedPage(page, "settings", viewport);
    await page.evaluate(() => document.getElementById("settingsBackButton")?.click());

    await expect(page.locator("#settings")).not.toHaveClass(/settings-category-open/);
    await expect(page.locator("#settings > .settings-navigation")).toBeHidden();
    await expect(page.locator("#settings-panel-overview")).toBeVisible();
    await expect(page.locator("#settings-panel-overview .settings-status-card")).toHaveCount(6);

    await page.locator("#settings-panel-overview [data-settings-open='accounts']").click();
    await expect(page.locator("#settings")).toHaveClass(/settings-category-open/);
    await expect(page.locator("#settingsMobileBack")).toBeVisible();
    await expect(page.locator("#settings-panel-accounts")).toBeVisible();
  });
}

test("iPhone annual Income reads vertically without a horizontal table swipe", async ({ page }) => {
  await openAuthenticatedPage(page, "income", { width:393, height:852 });

  const tableWrap = page.locator(".annual-income-table-wrap");
  const totalRow = page.locator(".annual-income-table .income-total-row");
  await expect(totalRow.locator("td")).toHaveCount(14);

  const contract = await page.evaluate(() => {
    const wrap = document.querySelector(".annual-income-table-wrap");
    const table = document.getElementById("annualIncomeTable");
    const row = table?.querySelector(".income-total-row");
    const labels = [...(row?.querySelectorAll("td") || [])].map(cell => cell.dataset.label);
    return {
      pageOverflow:document.documentElement.scrollWidth > innerWidth + 1,
      tableOverflow:wrap.scrollWidth > wrap.clientWidth + 1,
      tableFits:table.getBoundingClientRect().width <= wrap.getBoundingClientRect().width + 1,
      rowDisplay:getComputedStyle(row).display,
      labels
    };
  });

  expect(contract.pageOverflow).toBe(false);
  expect(contract.tableOverflow).toBe(false);
  expect(contract.tableFits).toBe(true);
  expect(contract.rowDisplay).toBe("grid");
  expect(contract.labels).toEqual(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Total","Average"]);
  await expect(page.locator(".annual-income-scroll-hint")).not.toContainText("Scroll horizontally");
  await expect(tableWrap).toBeVisible();
});
