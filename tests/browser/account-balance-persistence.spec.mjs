import { expect, test } from "../helpers/browser-fixtures.mjs";
import fs from "node:fs";
/* global data */

const APP_URL = "http://127.0.0.1:3000";
const preparedIndex = fs.readFileSync("index.html", "utf8");
const accountAssetMatch = preparedIndex.match(/account-ledger\.js\?v=(2\.5\.0-account-([a-f0-9]{12}))/);
if (!accountAssetMatch) throw new Error("Prepared Account Integrity asset key is unavailable");
const ACCOUNT_ASSET_QUERY = accountAssetMatch[1];
const ACCOUNT_INTEGRITY_REVISION = accountAssetMatch[2];
const ACCOUNT_REFRESH_KEY = `finance-account-integrity-${ACCOUNT_INTEGRITY_REVISION}`;

test.use({ serviceWorkers:"allow" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, "done"), ACCOUNT_REFRESH_KEY);
});

async function authenticate(page) {
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("body")).toHaveClass(/finance-signed-in/);
  await page.waitForFunction(() => Boolean(
    window.FinanceAccountLedger?.capabilities?.accountReconciliationOwner
    && window.FinanceAccountMutations?.capabilities?.singleOwner
    && window.FinanceAccountSubmitCompat?.ledgerGuard
    && window.FinanceProfileArchitecture
  ));
}

async function openControlledPwa(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${APP_URL}/?page=money`, { waitUntil:"networkidle" });
  await authenticate(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil:"networkidle" });
    await authenticate(page);
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

async function accountSetup(page, delta = 12345.67) {
  return page.evaluate(deltaValue => {
    const card = document.querySelector("#moneyAccounts [data-account-card]");
    const account = card?.dataset.accountCard || "";
    const original = Number(data.accounts?.[account] || 0);
    const target = Math.round((original + deltaValue + Number.EPSILON) * 100) / 100;
    return { account, original, target };
  }, delta);
}

async function saveCorrection(page, setup) {
  const card = page.locator(`#moneyAccounts [data-account-card="${setup.account}"]`);
  await card.locator("[data-edit-account]").click();
  await expect(page.locator("#accountDialogTitle")).toHaveText("Edit account");
  await page.locator("#accountBalance").fill(setup.target.toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 }));
  await page.locator("#accountPrimaryAction").click();
  await expect(page.locator("#accountDialog")).not.toBeVisible();
}

async function readAccountState(page, setup) {
  return page.evaluate(({ account, target, accountAssetQuery }) => {
    const persisted = JSON.parse(localStorage.getItem("simple-finance-project-records-v2") || "{}");
    const profileId = window.FinanceProfileArchitecture?.activeProfileId?.() || "";
    const profile = JSON.parse(localStorage.getItem(`simple-finance-profile-data-v1:${profileId}`) || "{}");
    const reconciliation = (data.accountReconciliations || []).find(item => item.account === account && Number(item.statementBalance) === target) || null;
    const ledgerEntry = reconciliation ? (data.accountLedger || []).find(entry => entry.id === reconciliation.ledgerEntryId) : null;
    return {
      runtime:Number(data.accounts?.[account]),
      persisted:Number(persisted.accounts?.[account]),
      profilePersisted:Number(profile.accounts?.[account]),
      reconciliationId:reconciliation?.id || "",
      ledgerEntryId:ledgerEntry?.id || "",
      ledgerAmount:Number(ledgerEntry?.amount || 0),
      mutationOwner:Boolean(window.FinanceAccountMutations?.capabilities?.singleOwner),
      invariantsOk:Boolean(window.FinanceAccountMutations?.invariantReport?.([{ account, target }])?.ok),
      controlled:Boolean(navigator.serviceWorker.controller),
      ledgerAsset:[...document.scripts].some(script => script.src.includes(`account-ledger.js?v=${accountAssetQuery}`))
    };
  }, { ...setup, accountAssetQuery:ACCOUNT_ASSET_QUERY });
}

for (const viewport of [{ name:"desktop", width:1440, height:1000 }, { name:"phone", width:393, height:852 }]) {
  test(`${viewport.name} account correction survives profile persistence and a controlled-PWA reload`, async ({ page }) => {
    await openControlledPwa(page, viewport);
    const setup = await accountSetup(page);
    expect(setup.account).not.toBe("");
    await saveCorrection(page, setup);

    const saved = await readAccountState(page, setup);
    expect(saved.runtime).toBe(setup.target);
    expect(saved.persisted).toBe(setup.target);
    expect(saved.profilePersisted).toBe(setup.target);
    expect(saved.reconciliationId).not.toBe("");
    expect(saved.ledgerEntryId).not.toBe("");
    expect(saved.ledgerAmount).toBeCloseTo(setup.target - setup.original, 2);
    expect(saved.mutationOwner).toBe(true);
    expect(saved.invariantsOk).toBe(true);
    expect(saved.controlled).toBe(true);
    expect(saved.ledgerAsset).toBe(true);

    await page.reload({ waitUntil:"networkidle" });
    await authenticate(page);
    const reloaded = await readAccountState(page, setup);
    expect(reloaded.runtime).toBe(setup.target);
    expect(reloaded.persisted).toBe(setup.target);
    expect(reloaded.profilePersisted).toBe(setup.target);
    expect(reloaded.reconciliationId).toBe(saved.reconciliationId);
    expect(reloaded.ledgerEntryId).toBe(saved.ledgerEntryId);
  });
}

test("account correction remains saved when post-persistence rendering fails", async ({ page }) => {
  await openControlledPwa(page, { width:1440, height:1000 });
  const setup = await accountSetup(page, 4321.09);
  expect(setup.account).not.toBe("");

  const card = page.locator(`#moneyAccounts [data-account-card="${setup.account}"]`);
  await card.locator("[data-edit-account]").click();
  await page.locator("#accountBalance").fill(setup.target.toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 }));
  await page.evaluate(() => {
    window.__accountIntegrityOriginalRenderAll = window.renderAll;
    window.renderAll = () => { throw new Error("simulated post-save render failure"); };
  });

  await page.locator("#accountPrimaryAction").click();
  await expect(page.locator("#accountDialog")).not.toBeVisible();
  await expect(page.getByText("Account changes could not be saved on this device.")).toHaveCount(0);

  const saved = await readAccountState(page, setup);
  expect(saved.runtime).toBe(setup.target);
  expect(saved.persisted).toBe(setup.target);
  expect(saved.profilePersisted).toBe(setup.target);
  expect(saved.reconciliationId).not.toBe("");
  expect(saved.ledgerEntryId).not.toBe("");

  await page.evaluate(() => {
    if (window.__accountIntegrityOriginalRenderAll) window.renderAll = window.__accountIntegrityOriginalRenderAll;
    delete window.__accountIntegrityOriginalRenderAll;
  });
});

test("Settings account balance update is reconciled and profile-persisted", async ({ page }) => {
  await openControlledPwa(page, { width:1440, height:1000 });
  const setup = await accountSetup(page, 8765.43);
  expect(setup.account).not.toBe("");

  await page.goto(`${APP_URL}/index.html?page=settings&settings=accounts`, { waitUntil:"networkidle" });
  await authenticate(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.evaluate(() => {
    window.renderSettings?.();
    window.activateSettingsPanel?.("accounts", false);
  });
  await expect(page.locator("#settings-panel-accounts")).toBeVisible();

  const moreOptions = page.locator('#settings-panel-accounts details[data-settings-more-options="accounts"]');
  await expect(moreOptions).toBeVisible();
  if (!await moreOptions.evaluate(node => node.open)) await moreOptions.locator("summary").click();
  await expect.poll(() => moreOptions.evaluate(node => node.open)).toBe(true);

  await page.evaluate(({ account, target }) => {
    const input = [...document.querySelectorAll(".account-input")].find(node => node.dataset.account === account);
    if (!input) throw new Error("Settings account input is unavailable");
    input.value = target.toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 });
    input.dispatchEvent(new Event("input", { bubbles:true }));
    input.dispatchEvent(new Event("change", { bubbles:true }));
  }, setup);

  const submit = page.locator('#accountsForm button[type="submit"]');
  await expect(submit).toBeVisible();
  await submit.click();
  await expect.poll(async () => (await readAccountState(page, setup)).runtime).toBe(setup.target);
  const result = await readAccountState(page, setup);
  expect(result.persisted).toBe(setup.target);
  expect(result.profilePersisted).toBe(setup.target);
  expect(result.reconciliationId).not.toBe("");
  expect(result.ledgerEntryId).not.toBe("");
});

test("Viewer account correction is rejected before ledger or profile mutation", async ({ page }) => {
  await openControlledPwa(page, { width:1440, height:1000 });
  const setup = await accountSetup(page);
  expect(setup.account).not.toBe("");

  await page.evaluate(() => {
    const meta = JSON.parse(localStorage.getItem("simple-finance-profiles-v1") || "{}");
    const active = (meta.profiles || []).find(profile => profile.id === meta.activeProfileId);
    if (!active) throw new Error("Active profile metadata is unavailable");
    active.role = "viewer";
    localStorage.setItem("simple-finance-profiles-v1", JSON.stringify(meta));
  });
  await page.reload({ waitUntil:"networkidle" });
  await authenticate(page);
  await page.waitForFunction(() => window.FinanceProfileArchitecture?.activeRole?.() === "viewer");

  const before = await readAccountState(page, setup);
  const card = page.locator(`#moneyAccounts [data-account-card="${setup.account}"]`);
  await card.locator("[data-edit-account]").click();
  await page.locator("#accountBalance").fill(setup.target.toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 }));
  await page.locator("#accountPrimaryAction").click();
  await expect(page.locator("#accountDialog")).toBeVisible();

  const after = await readAccountState(page, setup);
  expect(after.runtime).toBe(before.runtime);
  expect(after.persisted).toBe(before.persisted);
  expect(after.profilePersisted).toBe(before.profilePersisted);
  expect(after.reconciliationId).toBe("");
});