import { expect, test, refreshKeys } from "../helpers/browser-fixtures.mjs";

test.use({ serviceWorkers:"block" });

test("UI fixtures stay unlocked across navigation without loading hosted authentication", async ({ page }) => {
  const hostedRequests = [];
  page.on("request", request => {
    if (/supabase\.co|cdn\.jsdelivr\.net\/npm\/@supabase\//.test(request.url())) hostedRequests.push(request.url());
  });
  await page.setViewportSize({ width:393, height:852 });
  for (const route of ["money", "reports", "money"]) {
    await page.goto(`http://127.0.0.1:3000/?page=${route}`, { waitUntil:"networkidle" });
    await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
    await expect(page.locator(`#${route}.active`)).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator("body")).toHaveClass(/finance-signed-in/);
    expect(await page.evaluate(keys => keys.every(key => localStorage.getItem(key) === "done"), refreshKeys)).toBe(true);
  }
  expect(hostedRequests).toEqual([]);
});

test.describe("explicit authentication scenarios", () => {
  test.use({ hostedCloud:true });

  test("a delayed empty session still locks records, independent of UI fixture authentication", async ({ page }) => {
    await page.setViewportSize({ width:393, height:852 });
    await page.addInitScript(() => {
      window.FINANCE_SYNC_CONFIG = { supabaseUrl:"https://example.supabase.co", supabasePublishableKey:"sb_publishable_abcdefghijklmnopqrstuvwxyz" };
      window.financeLoadSupabase = async () => ({ createClient:() => ({ auth:{
        onAuthStateChange() {},
        getSession:() => new Promise(resolve => {
          window.__releaseTestSession = () => resolve({ data:{ session:null }, error:null });
        })
      } }) });
    });
    await page.goto("http://127.0.0.1:3000/?page=money", { waitUntil:"networkidle" });
    await page.waitForFunction(() => Boolean(window.__releaseTestSession));
    await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
    await expect(page.locator("#moneyPrioritySummary")).toBeVisible();
    await page.evaluate(() => window.__releaseTestSession());
    await expect(page.locator("body")).toHaveClass(/finance-signed-out/);
    await expect(page.locator("#moneyPrioritySummary")).toBeHidden();
  });
});
