import { test, expect, refreshKeys } from "../helpers/browser-fixtures.mjs";

const origin = "http://127.0.0.1:3000";
const runtimeName = "finance-v2-20260828-household-splits-r17-runtime";
test.use({ viewport:{ width:393,height:852 },isMobile:true,hasTouch:true,legacyPwaRefresh:true });

async function controlledPage(page) {
  await page.goto(`${origin}/?page=money`, { waitUntil:"networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

test("cached exact revision responds before a stalled download and receives its background update", async ({ page, context }) => {
  await controlledPage(page);
  const url = `${origin}/phone-scale.css?v=deadline-fixture`;
  await page.evaluate(async ({ url, runtimeName }) => {
    await (await caches.open(runtimeName)).put(url,new Response("cached fixture", { headers:{ "Content-Type":"text/css" } }));
  }, { url,runtimeName });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await context.route(url,async route => {
    await gate;
    await route.fulfill({ status:200,contentType:"text/css",body:"fresh fixture" });
  });
  try {
    // The network is deliberately held until the cached response has arrived.
    expect(await page.evaluate(async url => (await fetch(url)).text(),url)).toBe("cached fixture");
  } finally {
    release();
  }
  await expect.poll(() => page.evaluate(async ({ url,runtimeName }) => (await (await caches.open(runtimeName)).match(url)).text(), { url,runtimeName })).toBe("fresh fixture");
});

test("all pending upgrade groups share a reload while preserving saved device records", async ({ page }) => {
  await controlledPage(page);
  await page.evaluate(async ({ origin,runtimeName,refreshKeys }) => {
    const cache = await caches.open(runtimeName);
    for (const file of ["phone-scale.css","brand-icons.js","phone-finance-compat.js","budget-planning.js","account-ledger.js"]) {
      await cache.put(`${origin}/${file}?pending-upgrade`,new Response("stale fixture"));
    }
    localStorage.setItem("startup-profile-fixture",JSON.stringify({ account:9265,expense:219 }));
    for (const key of refreshKeys) localStorage.removeItem(key);
  }, { origin,runtimeName,refreshKeys });
  let navigations = 0;
  page.on("framenavigated",frame => { if (frame === page.mainFrame()) navigations += 1; });
  await page.reload({ waitUntil:"networkidle" });
  await expect.poll(() => page.evaluate(keys => keys.every(key => localStorage.getItem(key) === "done"),refreshKeys)).toBe(true);
  await page.waitForLoadState("networkidle");
  expect(navigations).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem("startup-profile-fixture"))).toBe('{"account":9265,"expense":219}');
  expect(await page.evaluate(async runtimeName => (await (await caches.open(runtimeName)).keys()).filter(request => request.url.includes("pending-upgrade")).length,runtimeName)).toBe(0);
  await page.reload({ waitUntil:"networkidle" });
  expect(navigations).toBe(3);
});

test("offline reopening preserves an upgrade-pending shell and remains usable", async ({ page, context }) => {
  await controlledPage(page);
  const uiKey = refreshKeys.find(key => key.startsWith("finance-ui-hotfix-"));
  await page.evaluate(key => {
    localStorage.removeItem(key);
    localStorage.setItem("startup-offline-fixture","saved");
  },uiKey);
  await context.setOffline(true);
  await page.reload({ waitUntil:"networkidle" });
  await page.waitForFunction(() => window.FinancePrivacyLock && !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("#moneyPrioritySummary")).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key),uiKey)).toBe(null);
  expect(await page.evaluate(() => localStorage.getItem("startup-offline-fixture"))).toBe("saved");
  await page.locator("#addExpenseButton").click();
  await expect(page.locator("#expenseDialog")).toBeVisible();
});
