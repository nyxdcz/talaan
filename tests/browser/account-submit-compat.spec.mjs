import { expect, test } from "../helpers/browser-fixtures.mjs";
/* global data */

const APP_URL = "http://127.0.0.1:3000";
const IPHONE_14_PRO = { width:393, height:852 };

test.use({ serviceWorkers:"block" });

async function openAuthenticated(page) {
  await page.setViewportSize(IPHONE_14_PRO);
  await page.goto(`${APP_URL}/?page=money`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("body")).toHaveClass(/finance-signed-in/);
  await page.waitForFunction(() => Boolean(window.FinanceAccountLedger?.capabilities?.accountReconciliationOwner && window.FinanceAccountSubmitCompat?.ledgerGuard));
}

test("iPhone correction-mode Save is explicitly submitted instead of relying on dynamic button type", async ({ page }) => {
  await openAuthenticated(page);

  const setup = await page.evaluate(() => {
    const card = document.querySelector("#moneyAccounts [data-account-card]");
    const account = card?.dataset.accountCard || "";
    const original = Number(data.accounts?.[account] || 0);
    const target = Math.round(((original >= 63 ? original - 63 : original + 63) + Number.EPSILON) * 100) / 100;
    return { account, original, target };
  });
  expect(setup.account).not.toBe("");

  const card = page.locator(`#moneyAccounts [data-account-card="${setup.account}"]`);
  await card.locator("[data-edit-account]").click();
  await expect(page.locator("#accountDialogTitle")).toHaveText("Edit account");
  await page.locator("#accountBalance").fill(setup.target.toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 }));

  await page.evaluate(() => {
    window.__accountCorrectionClickPrevented = false;
    document.getElementById("accountPrimaryAction")?.addEventListener("click", event => {
      window.__accountCorrectionClickPrevented = event.defaultPrevented;
    }, { once:true });
  });

  await page.locator("#accountPrimaryAction").click();
  await expect(page.locator("#accountDialog")).not.toBeVisible();

  const result = await page.evaluate(({ account, target }) => {
    const persisted = JSON.parse(localStorage.getItem("simple-finance-project-records-v2") || "{}");
    const cardNode = [...document.querySelectorAll("#moneyAccounts [data-account-card]")]
      .find(node => node.dataset.accountCard === account);
    const cardAmount = Number(String(cardNode?.querySelector(".account-card-main strong")?.textContent || "").replace(/[^0-9.-]/g, ""));
    return {
      clickPrevented:Boolean(window.__accountCorrectionClickPrevented),
      runtime:Number(data.accounts?.[account]),
      persisted:Number(persisted.accounts?.[account]),
      cardAmount,
      reconciliation:Boolean((data.accountReconciliations || []).some(item => item.account === account && Number(item.statementBalance) === target))
    };
  }, setup);

  expect(result.clickPrevented).toBe(true);
  expect(result.runtime).toBe(setup.target);
  expect(result.persisted).toBe(setup.target);
  expect(result.cardAmount).toBe(setup.target);
  expect(result.reconciliation).toBe(true);
});
