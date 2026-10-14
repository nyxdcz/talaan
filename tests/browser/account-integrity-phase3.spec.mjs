import { expect, test } from "../helpers/browser-fixtures.mjs";

/* global data */
const APP_URL = "http://127.0.0.1:3000/?page=money";
const ACTIVE_DATA_KEY = "simple-finance-project-records-v2";

test.use({ serviceWorkers:"allow" });

async function authenticate(page) {
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await page.waitForFunction(() => Boolean(
    window.FinanceTransactionDiagnostics?.capabilities?.verifiedPersistenceBarrier
    && window.FinanceLedgerTransactions?.capabilities?.unifiedMoneyMutations
    && window.FinanceProfileArchitecture
    && window.FinanceCloudSyncInternals?.handlePersistedData
  ));
}

async function openControlledPwa(page, viewport = { width:1440, height:1000 }) {
  await page.setViewportSize(viewport);
  await page.goto(APP_URL, { waitUntil:"networkidle" });
  await authenticate(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil:"networkidle" });
    await authenticate(page);
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

async function accountFixture(page, delta = 321.45) {
  return page.evaluate(deltaValue => {
    const account = Object.keys(data.accounts || {})[0] || "";
    const original = Number(data.accounts?.[account] || 0);
    const target = Math.round((original + deltaValue + Number.EPSILON) * 100) / 100;
    const architecture = window.FinanceProfileArchitecture;
    const profileId = architecture?.activeProfileId?.() || "";
    return { account, original, target, profileId };
  }, delta);
}

async function readBalanceCopies(page, fixture) {
  return page.evaluate(({ account, profileId }) => {
    const local = JSON.parse(localStorage.getItem("simple-finance-project-records-v2") || "{}");
    const profile = JSON.parse(localStorage.getItem(`simple-finance-profile-data-v1:${profileId}`) || "{}");
    return {
      runtime:Number(data.accounts?.[account]),
      local:Number(local.accounts?.[account]),
      profile:Number(profile.accounts?.[account])
    };
  }, fixture);
}

async function installVerifiedEventProbe(page) {
  await page.evaluate(() => {
    window.__phase3VerifiedEvents = [];
    window.addEventListener("finance:verified-data-persisted", event => {
      window.__phase3VerifiedEvents.push(structuredClone(event.detail || {}));
    });
  });
}

async function reconcile(page, fixture) {
  return page.evaluate(({ account, target }) => window.FinanceLedgerTransactions.reconcileAccounts(
    [{ account, target }],
    { note:"phase3-test", message:"Phase 3 reconciliation test" }
  ), fixture);
}

test("verified persistence barrier records technical-only success after local/profile verification", async ({ page }) => {
  await openControlledPwa(page);
  await page.evaluate(() => window.FinanceTransactionDiagnostics.clear());
  await installVerifiedEventProbe(page);
  const fixture = await accountFixture(page, 741.23);
  expect(fixture.account).not.toBe("");

  const result = await reconcile(page, fixture);
  expect(result.ok).toBe(true);
  await expect.poll(() => page.evaluate(() => window.FinanceTransactionDiagnostics.latest()?.syncQueueResult)).toMatch(/queued|no-diff/);

  const state = await readBalanceCopies(page, fixture);
  expect(state.runtime).toBe(fixture.target);
  expect(state.local).toBe(fixture.target);
  expect(state.profile).toBe(fixture.target);

  const audit = await page.evaluate(account => {
    const entry = window.FinanceTransactionDiagnostics.latest();
    const serialized = JSON.stringify(window.FinanceTransactionDiagnostics.list());
    const events = window.__phase3VerifiedEvents || [];
    return { entry, serialized, eventCount:events.length, accountLeaked:serialized.includes(account) };
  }, fixture.account);
  expect(audit.entry.operationType).toBe("reconciliation");
  expect(audit.entry.localPersistence).toBe("verified");
  expect(audit.entry.profilePersistence).toBe("verified");
  expect(audit.entry.integrityResult).toBe("passed");
  expect(audit.entry.renderResult).not.toBe("failed");
  expect(audit.eventCount).toBeGreaterThan(0);
  expect(audit.accountLeaked).toBe(false);
  expect(Object.keys(audit.entry).sort()).toEqual([
    "completedAt","createdAt","id","integrityResult","localPersistence","operationType","profilePersistence","renderResult","syncQueueResult","transactionId"
  ].sort());
});

test("profile persistence failure rolls back before Cloud Sync can observe the failed balance", async ({ page }) => {
  await openControlledPwa(page);
  await page.evaluate(() => window.FinanceTransactionDiagnostics.clear());
  await installVerifiedEventProbe(page);
  const fixture = await accountFixture(page, 852.34);
  const before = await readBalanceCopies(page, fixture);

  const result = await page.evaluate(({ account, target }) => {
    const architecture = window.FinanceProfileArchitecture;
    const originalPersist = architecture.persistCurrentData;
    architecture.persistCurrentData = function phase3FailProfile(source, action) {
      if (Number(source?.accounts?.[account]) === Number(target)) throw new Error("simulated profile persistence failure");
      return originalPersist.call(this, source, action);
    };
    try {
      return window.FinanceLedgerTransactions.reconcileAccounts([{ account, target }], { note:"phase3-profile-failure", message:"Phase 3 profile failure" });
    } finally {
      architecture.persistCurrentData = originalPersist;
    }
  }, fixture);
  expect(result.ok).toBe(false);

  await expect.poll(() => page.evaluate(() => (window.__phase3VerifiedEvents || []).length)).toBeGreaterThan(0);
  const after = await readBalanceCopies(page, fixture);
  expect(after).toEqual(before);

  const verification = await page.evaluate(({ account, target }) => {
    const leakedFailedBalance = (window.__phase3VerifiedEvents || []).some(event => Number(event?.data?.accounts?.[account]) === Number(target));
    const failed = window.FinanceTransactionDiagnostics.list().find(item => item.operationType === "reconciliation" && item.profilePersistence === "failed");
    return { leakedFailedBalance, failed };
  }, fixture);
  expect(verification.leakedFailedBalance).toBe(false);
  expect(verification.failed).toBeTruthy();
  expect(verification.failed.syncQueueResult).toBe("blocked");
});

test("local storage failure restores the prior balance and never releases the failed state", async ({ page }) => {
  await openControlledPwa(page);
  await page.evaluate(() => window.FinanceTransactionDiagnostics.clear());
  await installVerifiedEventProbe(page);
  const fixture = await accountFixture(page, 963.45);
  const before = await readBalanceCopies(page, fixture);

  const result = await page.evaluate(({ account, target, activeDataKey }) => {
    const originalSetItem = Storage.prototype.setItem;
    let injected = false;
    Storage.prototype.setItem = function phase3StorageFailure(key, value) {
      if (!injected && String(key) === activeDataKey) {
        injected = true;
        throw new Error("simulated active finance storage failure");
      }
      return originalSetItem.call(this, key, value);
    };
    try {
      return window.FinanceLedgerTransactions.reconcileAccounts([{ account, target }], { note:"phase3-storage-failure", message:"Phase 3 storage failure" });
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  }, { ...fixture, activeDataKey:ACTIVE_DATA_KEY });
  expect(result.ok).toBe(false);

  await expect.poll(() => page.evaluate(() => (window.__phase3VerifiedEvents || []).length)).toBeGreaterThan(0);
  const after = await readBalanceCopies(page, fixture);
  expect(after).toEqual(before);

  const verification = await page.evaluate(({ account, target }) => {
    const leakedFailedBalance = (window.__phase3VerifiedEvents || []).some(event => Number(event?.data?.accounts?.[account]) === Number(target));
    const failed = window.FinanceTransactionDiagnostics.list().find(item => item.localPersistence === "failed");
    return { leakedFailedBalance, failed };
  }, fixture);
  expect(verification.leakedFailedBalance).toBe(false);
  expect(verification.failed).toBeTruthy();
  expect(verification.failed.syncQueueResult).toBe("blocked");
});

test("network-first account runtime ignores a stale cached ledger script", async ({ page }) => {
  await openControlledPwa(page, { width:393, height:852 });
  const assetUrl = await page.evaluate(() => {
    const script = [...document.scripts].find(node => /account-ledger\.js\?v=2\.5\.0-account-/.test(node.src));
    if (!script) throw new Error("Account Ledger runtime URL was not found");
    return script.src;
  });

  await page.evaluate(async url => {
    const keys = await caches.keys();
    for (const key of keys.filter(name => /^finance-v\d+-/.test(name))) {
      const cache = await caches.open(key);
      await cache.put(url, new Response("window.__phase3StaleLedgerExecuted = true;", { headers:{ "content-type":"application/javascript" } }));
    }
  }, assetUrl);

  await page.reload({ waitUntil:"networkidle" });
  await authenticate(page);
  const state = await page.evaluate(() => ({
    stale:Boolean(window.__phase3StaleLedgerExecuted),
    owner:Boolean(window.FinanceLedgerTransactions?.capabilities?.unifiedMoneyMutations),
    barrier:Boolean(window.FinanceTransactionDiagnostics?.capabilities?.verifiedPersistenceBarrier),
    controlled:Boolean(navigator.serviceWorker.controller)
  }));
  expect(state.stale).toBe(false);
  expect(state.owner).toBe(true);
  expect(state.barrier).toBe(true);
  expect(state.controlled).toBe(true);
});
