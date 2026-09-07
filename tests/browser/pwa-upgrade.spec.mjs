import { test, expect } from "@playwright/test";

test("Talaan V2.5.0 registers the cache-qualified worker and clears stale Finance caches", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=settings", { waitUntil:"networkidle" });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await caches.open("finance-v15-20260815-ui-align-r11-shell");
    await caches.open("finance-v14-legacy-shell");
    await caches.open("unrelated-test-cache");
  });

  await expect.poll(async () => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ""), { timeout:15000 }).toContain("v=2.5.0");
  const workerUrl = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || "");
  expect(workerUrl).toContain("cache=finance-v2-20260828-household-splits-r17");

  await page.evaluate(async () => { await window.clearAppCaches(); });
  const names = await page.evaluate(async () => caches.keys());
  expect(names.filter(name => /^finance-v\d+-/.test(name))).toEqual([]);
  expect(names).toContain("unrelated-test-cache");
});


test("cached UI styles refresh online and remain available offline", async ({ page, context }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=settings", { waitUntil:"networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const url = "http://127.0.0.1:3000/ui-radius.css?v=2.5.0-talaan1";
  await page.evaluate(async url => {
    localStorage.setItem("upgrade-test-record", "preserved");
    const names = await caches.keys();
    for (const name of names.filter(name => /^finance-v/.test(name))) {
      const cache = await caches.open(name);
      await cache.put(url, new Response("/* stale stylesheet */", { headers:{ "Content-Type":"text/css" } }));
    }
  }, url);
  const fresh = await page.evaluate(async url => (await fetch(url)).text(), url);
  expect(fresh).toContain("Toasts stay flat");
  await expect.poll(() => page.evaluate(async url => {
    const cache = await caches.open("finance-v2-20260828-household-splits-r17-runtime");
    return (await (await cache.match(url)).text()).includes("Toasts stay flat");
  }, url)).toBe(true);
  await context.setOffline(true);
  expect(await page.evaluate(async url => (await fetch(url)).text(), url)).toBe(fresh);
  expect(await page.evaluate(() => localStorage.getItem("upgrade-test-record"))).toBe("preserved");
});
