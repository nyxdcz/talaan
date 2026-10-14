import { expect, test } from "../helpers/browser-fixtures.mjs";

const BASE = "http://127.0.0.1:3000";
const IPHONE_14_PRO = { width:393, height:852 };

async function unlockFinance(page) {
  await page.setViewportSize(IPHONE_14_PRO);
  await page.goto(`${BASE}/?page=money`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
}

test("iPhone 14 Pro expense dialog scrolls naturally up and down", async ({ page }) => {
  await unlockFinance(page);

  await page.evaluate(() => {
    const dialog = document.getElementById("expenseDialog");
    if (!dialog) throw new Error("expenseDialog is missing");
    if (dialog.open) dialog.close();
    dialog.showModal();
  });

  const dialog = page.locator("#expenseDialog");
  const header = dialog.locator(".modal-header");
  const body = dialog.locator(".modal-body");
  const footer = dialog.locator(".modal-footer");

  await expect(dialog).toBeVisible();
  await expect(header).toBeVisible();
  await expect(body).toBeVisible();
  await expect(footer).toBeVisible();

  const contract = await body.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      overflowY:style.overflowY,
      overflowX:style.overflowX,
      touchAction:style.touchAction,
      scrollHeight:element.scrollHeight,
      clientHeight:element.clientHeight
    };
  });

  expect(contract.overflowY).toBe("auto");
  expect(contract.overflowX).toBe("hidden");
  expect(contract.touchAction).toBe("pan-y");
  expect(contract.scrollHeight).toBeGreaterThan(contract.clientHeight);

  await body.evaluate(element => { element.scrollTop = 0; });
  await body.hover();
  await page.mouse.wheel(0, 560);
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const scrolledDown = await body.evaluate(element => element.scrollTop);

  await page.mouse.wheel(0, -560);
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeLessThan(scrolledDown);

  const geometry = await page.evaluate(() => {
    const dialog = document.getElementById("expenseDialog");
    const header = dialog.querySelector(".modal-header");
    const footer = dialog.querySelector(".modal-footer");
    const body = dialog.querySelector(".modal-body");
    const rect = node => {
      const value = node.getBoundingClientRect();
      return { top:value.top, bottom:value.bottom, left:value.left, right:value.right };
    };
    return {
      viewport:{ width:innerWidth, height:innerHeight },
      dialog:rect(dialog),
      header:rect(header),
      footer:rect(footer),
      body:rect(body),
      pageHorizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  });

  expect(geometry.dialog.left).toBeGreaterThanOrEqual(0);
  expect(geometry.dialog.right).toBeLessThanOrEqual(geometry.viewport.width);
  expect(geometry.dialog.top).toBeGreaterThanOrEqual(0);
  expect(geometry.dialog.bottom).toBeLessThanOrEqual(geometry.viewport.height);
  expect(geometry.header.bottom).toBeLessThanOrEqual(geometry.body.top + 1);
  expect(geometry.footer.top).toBeGreaterThanOrEqual(geometry.body.bottom - 1);
  expect(geometry.pageHorizontalOverflow).toBe(false);
});
