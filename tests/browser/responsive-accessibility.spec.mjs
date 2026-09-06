import { test, expect } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000/?page=money";
const widths = [320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920];

test.use({ serviceWorkers:"block" });

async function openApp(page, width) {
  const height = width <= 430 ? 852 : width <= 1024 ? 900 : 1000;
  await page.setViewportSize({ width, height });
  await page.goto(APP_URL, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("body")).toHaveClass(/finance-signed-in/);
  await page.waitForFunction(() => Boolean(document.querySelector("#money")));
}

for (const width of widths) {
  test(`real app has no viewport overflow at ${width}px`, async ({ page }) => {
    await openApp(page, width);
    const metrics = await page.evaluate(() => {
      const row = document.querySelector("#money > .finance-workspace-marquee-row");
      const switcher = row?.querySelector(":scope > .money-workspace-switcher");
      const topbar = document.querySelector(".topbar");
      const rect = element => element?.getBoundingClientRect();
      const inside = box => !box || (box.left >= -1 && box.right <= innerWidth + 1);
      return {
        overflow:Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1,
        topbarInside:inside(rect(topbar)),
        switcherInside:inside(rect(switcher))
      };
    });
    expect(metrics.overflow).toBe(false);
    expect(metrics.topbarInside).toBe(true);
    expect(metrics.switcherInside).toBe(true);
  });
}

test("collapsed Monthly Budget Plan stays compact and readable at narrow phone widths", async ({ page }) => {
  for (const width of [320, 360, 390, 430]) {
    await openApp(page, width);
    await page.locator('#money [data-workspace-page="income"]').click();
    await expect(page.locator("#income")).toHaveClass(/active/);
    const card = page.locator("#monthlyBudgetPlannerCard");
    await expect(card).toBeVisible();
    await expect(page.locator("#income > #monthlyBudgetPlannerCard + .income-kpi-grid")).toHaveCount(1);
    await expect(page.locator("#money #monthlyBudgetPlannerCard")).toHaveCount(0);
    await page.evaluate(() => {
      const planner = document.getElementById("monthlyBudgetPlannerCard");
      if (planner) planner.classList.add("is-planner-collapsed");
    });
    const metrics = await card.evaluate(node => {
      const visible = [...node.querySelectorAll(".budget-plan-kpi")].filter(item => getComputedStyle(item).display !== "none");
      const labels = visible.map(item => parseFloat(getComputedStyle(item.querySelector("span")).fontSize));
      const rects = visible.map(item => item.getBoundingClientRect());
      const cardRect = node.getBoundingClientRect();
      return {
        count:visible.length,
        readable:labels.every(size => size >= 10),
        sameRow:rects.length === 3 && rects.every(box => Math.abs(box.top - rects[0].top) < 2),
        inside:rects.every(box => box.left >= -1 && box.right <= innerWidth + 1),
        height:cardRect.height
      };
    });
    expect(metrics.count).toBe(3);
    expect(metrics.readable).toBe(true);
    expect(metrics.sameRow).toBe(true);
    expect(metrics.inside).toBe(true);
    expect(metrics.height).toBeLessThanOrEqual(130);
  }
});

test("phone controls and content cards keep the approved compact rhythm", async ({ page }) => {
  for (const width of [320, 360, 390, 430]) {
    await openApp(page, width);
    const metrics = await page.evaluate(() => {
      const visible = element => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const sizes = selector => [...document.querySelectorAll(selector)]
        .filter(visible)
        .map(element => {
          const box = element.getBoundingClientRect();
          return {
            id:element.id || "",
            className:String(element.className || ""),
            text:(element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60),
            width:box.width,
            height:box.height
          };
        });
      const controls = sizes('button:not(.settings-status-card), input[type="button"], input[type="submit"], input[type="reset"], summary, [role="button"]:not(.settings-status-card)');
      const collapse = sizes('#money .collapse-toggle, #availableMoneySection [data-collapse-toggle], .budget-planner-toggle, .budget-panel-collapse');
      const collapseIcons = sizes('#money .collapse-icon svg, #availableMoneySection .collapse-icon svg');
      const headers = sizes('#money .period-header, #availableMoneySection .card-header');
      const contentCards = sizes('#money .legend-item, #money .summary-item');
      const values = [...document.querySelectorAll('#money .legend-total, #money .summary-card-value, #moneyAvailableTotal')]
        .filter(visible)
        .map(element => ({
          id:element.id || "",
          text:(element.textContent || "").trim(),
          clipped:element.scrollWidth > element.clientWidth + 1
        }));
      return {
        controls,
        oversized:controls.filter(size => size.height > 35.5),
        collapse,
        collapseIcons,
        headers,
        contentCards,
        values,
        overflow:Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1
      };
    });
    expect(metrics.controls.length).toBeGreaterThan(0);
    expect(metrics.oversized, JSON.stringify(metrics.oversized, null, 2)).toEqual([]);
    expect(metrics.collapse.length).toBeGreaterThan(0);
    metrics.collapse.forEach(size => {
      expect(size.width).toBeGreaterThanOrEqual(34.5);
      expect(size.width).toBeLessThanOrEqual(35.5);
      expect(size.height).toBeGreaterThanOrEqual(34.5);
      expect(size.height).toBeLessThanOrEqual(35.5);
    });
    expect(metrics.collapseIcons.length).toBeGreaterThan(0);
    metrics.collapseIcons.forEach(size => {
      expect(size.width).toBeGreaterThanOrEqual(19.5);
      expect(size.width).toBeLessThanOrEqual(20.5);
      expect(size.height).toBeGreaterThanOrEqual(19.5);
      expect(size.height).toBeLessThanOrEqual(20.5);
    });
    expect(metrics.headers.every(size => size.height <= 35.5)).toBe(true);
    expect(metrics.contentCards.length).toBeGreaterThanOrEqual(8);
    metrics.contentCards.forEach(size => {
      expect(size.height).toBeGreaterThanOrEqual(55.5);
      expect(size.height).toBeLessThanOrEqual(62.5);
    });
    expect(metrics.values.length).toBeGreaterThan(0);
    expect(metrics.values.every(value => value.text && !value.clipped)).toBe(true);
    expect(metrics.overflow).toBe(false);
  }
});

test("phone Settings status cards remain readable content cards", async ({ page }) => {
  for (const width of [320, 360, 390, 430]) {
    await openApp(page, width);
    await page.evaluate(() => document.querySelector(".settings-nav-button")?.click());
    await expect(page.locator("#settings")).toHaveClass(/active/);
    const cards = await page.evaluate(() => [...document.querySelectorAll("#settings .settings-status-card")]
      .filter(card => {
        const box = card.getBoundingClientRect();
        const style = getComputedStyle(card);
        return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map(card => {
        const box = card.getBoundingClientRect();
        const copy = card.querySelector(".settings-status-copy");
        const status = card.querySelector(".settings-status-copy strong");
        const statusBox = status?.getBoundingClientRect();
        return {
          height:box.height,
          inside:box.left >= -1 && box.right <= innerWidth + 1,
          copyVisible:Boolean(copy && copy.getBoundingClientRect().width > 0),
          statusText:(status?.textContent || "").trim(),
          statusInside:Boolean(statusBox && statusBox.left >= -1 && statusBox.right <= innerWidth + 1),
          statusOverflowX:Boolean(status && status.scrollWidth > status.clientWidth + 1)
        };
      }));
    expect(cards.length).toBe(6);
    cards.forEach(card => {
      expect(card.height).toBeGreaterThanOrEqual(70);
      expect(card.inside).toBe(true);
      expect(card.copyVisible).toBe(true);
      expect(card.statusText).not.toBe("");
      expect(card.statusInside).toBe(true);
      expect(card.statusOverflowX).toBe(false);
    });
  }
});


test("dark mode keyboard focus indicator is visible", async ({ page }) => {
  await openApp(page, 390);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themePreference = "dark";
  });
  const button = page.locator("#menuButton");
  await button.focus();
  const focus = await button.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      width:parseFloat(style.outlineWidth),
      color:style.outlineColor,
      offset:parseFloat(style.outlineOffset)
    };
  });
  expect(focus.width).toBeGreaterThanOrEqual(3);
  expect(focus.color).not.toBe("rgba(0, 0, 0, 0)");
  expect(focus.offset).toBeGreaterThanOrEqual(2);
});

test("touch tablets keep visible primary controls touch safe", async ({ browser }) => {
  for (const width of [768, 820, 1024]) {
    const context = await browser.newContext({ viewport:{ width, height:900 }, hasTouch:true, isMobile:true });
    const page = await context.newPage();
    await page.goto(APP_URL, { waitUntil:"domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
    await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
    const sizes = await page.evaluate(() => {
      const visibleHeight = selector => {
        const node = [...document.querySelectorAll(selector)].find(candidate => {
          const box = candidate.getBoundingClientRect();
          const style = getComputedStyle(candidate);
          return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        });
        return node ? node.getBoundingClientRect().height : null;
      };
      return {
        coarse:matchMedia("(pointer:coarse)").matches,
        hoverNone:matchMedia("(hover:none)").matches,
        workspace:visibleHeight(".workspace-switcher-button"),
        month:visibleHeight(".month-nav-button"),
        tools:visibleHeight("#topbarToolsTrigger")
      };
    });
    expect(sizes.coarse || sizes.hoverNone).toBe(true);
    const visibleTargets = [sizes.workspace, sizes.month, sizes.tools].filter(Number.isFinite);
    expect(visibleTargets.length).toBeGreaterThanOrEqual(2);
    visibleTargets.forEach(height => expect(height).toBeGreaterThanOrEqual(44));
    await context.close();
  }
});
