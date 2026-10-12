import { expect, test } from "@playwright/test";

test.use({ serviceWorkers:"block", isMobile:true, hasTouch:true, deviceScaleFactor:3 });

const sections = ["availableMoneySection","firstHalfSection","secondHalfSection","otherExpensesSection"];

async function openBudget(page, height, theme, width = 393) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(new Date("2026-10-12T04:00:00Z"));
  await page.addInitScript(value => {
    window.FINANCE_SYNC_CONFIG = { supabaseUrl:"", supabasePublishableKey:"" };
    localStorage.setItem("simple-finance-theme-v1", value);
  }, theme);
  await page.goto("http://127.0.0.1:3000/?page=money", { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock) && !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
}

async function headerGeometry(header) {
  return header.evaluate(node => {
    const box = node.getBoundingClientRect();
    const button = node.querySelector(".collapse-toggle");
    const control = button.getBoundingClientRect();
    const icon = button.querySelector("svg").getBoundingClientRect();
    const total = node.querySelector("#moneyAvailableTotal,.period-total");
    const amount = total.getBoundingClientRect();
    const centerY = rect => rect.y + rect.height / 2;
    const visibleText = [...node.querySelectorAll("h3,p,#moneyAvailableTotal,.period-total")]
      .filter(n => n.checkVisibility())
      .every(n => {
        const rect = n.getBoundingClientRect();
        return rect.left >= box.left && rect.right <= box.right && n.scrollWidth <= n.clientWidth + 1;
      });
    return {
      height:box.height,
      headerCenterOffset:Math.abs(centerY(control) - centerY(box)),
      totalCenterOffset:Math.abs(centerY(amount) - centerY(control)),
      iconDx:Math.abs(icon.x + icon.width / 2 - control.x - control.width / 2),
      iconDy:Math.abs(centerY(icon) - centerY(control)),
      width:control.width, controlHeight:control.height,
      contained:visibleText && control.left >= box.left && control.right <= box.right && control.top >= box.top && control.bottom <= box.bottom,
      gap:control.left - amount.right
    };
  });
}

for (const height of [660,852]) {
  for (const theme of ["light","dark"]) {
    test(`iPhone Budget headers are compact and controls stay centered at 393x${height} in ${theme}`, async ({ page }) => {
      await openBudget(page, height, theme);
      for (const id of sections) {
        const header = page.locator(`#${id} > .collapsible-header`);
        const button = header.locator(".collapse-toggle");
        for (let state = 0; state < 2; state++) {
          const geometry = await headerGeometry(header);
          expect(geometry.height).toBeLessThanOrEqual(85);
          expect(geometry.headerCenterOffset).toBeLessThanOrEqual(1);
          expect(geometry.totalCenterOffset).toBeLessThanOrEqual(1);
          expect(geometry.iconDx).toBeLessThanOrEqual(1);
          expect(geometry.iconDy).toBeLessThanOrEqual(1);
          expect(geometry.width).toBeGreaterThanOrEqual(44);
          expect(geometry.controlHeight).toBeGreaterThanOrEqual(44);
          expect(geometry.contained).toBe(true);
          if (id !== "availableMoneySection") expect(geometry.gap).toBeCloseTo(8, 0);
          const expanded = await button.getAttribute("aria-expanded");
          await button.focus();
          await page.keyboard.press(state ? "Space" : "Enter");
          await expect(button).toHaveAttribute("aria-expanded", expanded === "true" ? "false" : "true");
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    });
  }
}

test("narrow Budget headers reflow long titles and financial totals without clipping", async ({ page }) => {
  await openBudget(page, 660, "dark", 320);
  for (const id of sections) {
    const header = page.locator(`#${id} > .collapsible-header`);
    await header.evaluate(node => {
      node.querySelector("h3").textContent = "Household shared expenses with a longer section name";
      node.querySelector("#moneyAvailableTotal,.period-total").textContent = "-₱123,456,789,012.34";
    });
    const geometry = await headerGeometry(header);
    expect(geometry.contained).toBe(true);
    expect(geometry.totalCenterOffset).toBeLessThanOrEqual(1);
    expect(geometry.width).toBeGreaterThanOrEqual(44);
    expect(geometry.controlHeight).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test("Budget header copy can grow to twice its text size without covering controls", async ({ page }) => {
  await openBudget(page, 660, "light");
  for (const id of sections) {
    const header = page.locator(`#${id} > .collapsible-header`);
    await header.evaluate(node => {
      for (const text of node.querySelectorAll("h3,p,#moneyAvailableTotal,.period-total")) {
        text.style.setProperty("font-size", `${parseFloat(getComputedStyle(text).fontSize) * 2}px`, "important");
      }
    });
    expect((await headerGeometry(header)).contained).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});
