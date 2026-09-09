/* global appMeta, writeMeta, data, saveData */
import { test, expect } from "@playwright/test";
import fs from "node:fs";

const privacySource = fs.readFileSync(new URL("../../privacy-lock.js", import.meta.url), "utf8");
const serviceWorkerSource = fs.readFileSync(new URL("../../sw.js", import.meta.url), "utf8");

const allowedRecoveryControls = [
  "label[for='importSyncBundleInput']",
  "#importSyncBundleInput",
  "#closeSyncReviewButton",
  "#cancelSyncImportButton",
  "#mergeKeepCurrentButton",
  "#mergeUseIncomingButton",
  "#replaceWithIncomingButton"
];

const appUrl = "http://127.0.0.1:3000/index.html?page=settings&settings=sync";

async function waitForStableRuntime(page) {
  await expect.poll(async () => {
    try { return await page.evaluate(() => navigator.serviceWorker?.controller?.scriptURL || ""); }
    catch { return ""; }
  }, { timeout:15000 }).toContain("cache=finance-v2-20260828-household-splits-r17");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(350);
  await page.waitForFunction(() => typeof window.openSyncReview === "function" && typeof window.buildBundle === "function" && typeof window.applyPendingSyncImport === "function" && Boolean(window.FinancePrivacyLock?.recoveryStorage));
  await page.evaluate(() => window.FinancePrivacyLock.recoveryStorage.ready());
}

test("recovery import controls and quota-safe storage are wired through the privacy guard", async () => {
  for (const selector of allowedRecoveryControls) expect(privacySource).toContain(selector);
  expect(privacySource).toContain("runRecoveryImportAction");
  expect(privacySource).toContain("window.applyPendingSyncImport");
  expect(privacySource).toContain('const RECOVERY_DB_VERSION = 2');
  expect(privacySource).toContain('const RECOVERY_STORE = "recoverySnapshots"');
  expect(privacySource).toContain("compactLegacyRecoverySnapshots");
  expect(privacySource).toContain("migrateLegacyBackup");
  expect(privacySource).toContain("migrateCloudRecoveryPoints");
  expect(privacySource).toContain("saveAuxiliary");
  expect(privacySource).toContain("persistRecoverySnapshot");
  expect(serviceWorkerSource).toContain('const DB_VERSION = 2');
  expect(serviceWorkerSource).toContain('createObjectStore("recoverySnapshots"');
});

test("recovery import review actions execute and persist while the privacy guard is locked", async ({ page }) => {
  await page.goto(appUrl, { waitUntil:"networkidle" });
  await waitForStableRuntime(page);

  const dialog = page.locator("#syncReviewDialog");
  const lock = async () => page.evaluate(() => window.FinancePrivacyLock.lock());
  const openReview = async (name, amount) => {
    const expectedAccounts = await page.evaluate(({ name, amount }) => {
      const bundle = window.buildBundle("my-finance-v12-recovery");
      const beforeCount = Object.keys(bundle.data.accounts || {}).length;
      bundle.exportedAt = new Date().toISOString();
      bundle.sourceDevice = { id:`playwright-${name}`, name:"Playwright recovery source" };
      bundle.data.accounts = { ...(bundle.data.accounts || {}), [name]:amount };
      window.openSyncReview(bundle);
      return beforeCount + 1;
    }, { name, amount });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#syncReviewAccounts")).toHaveText(String(expectedAccounts));
  };
  const expectPersisted = async (name, amount) => {
    await expect.poll(() => page.evaluate(name => window.buildBundle().data.accounts?.[name] ?? null, name)).toBe(amount);
    await page.reload({ waitUntil:"networkidle" });
    await waitForStableRuntime(page);
    await expect.poll(() => page.evaluate(name => window.buildBundle().data.accounts?.[name] ?? null, name)).toBe(amount);
  };

  await lock();
  await openReview("Import close guard", 11);
  await page.locator("#closeSyncReviewButton").click();
  await expect(dialog).not.toBeVisible();

  await lock();
  await openReview("Import cancel guard", 12);
  await page.locator("#cancelSyncImportButton").click();
  await expect(dialog).not.toBeVisible();

  const actions = [
    ["#mergeKeepCurrentButton", "Import merge current", 101.01],
    ["#mergeUseIncomingButton", "Import merge incoming", 202.02],
    ["#replaceWithIncomingButton", "Import replace", 303.03]
  ];

  for (const [selector, name, amount] of actions) {
    await lock();
    await openReview(name, amount);
    await page.locator(selector).click();
    await expect(dialog).not.toBeVisible({ timeout:10000 });
    await expectPersisted(name, amount);
  }
});

test("large legacy recovery metadata is compacted and import survives a simulated localStorage quota", async ({ page }) => {
  await page.goto(appUrl, { waitUntil:"networkidle" });
  await waitForStableRuntime(page);

  const legacyId = `legacy-quota-${Date.now()}`;
  await page.evaluate(async legacyId => {
    const legacySnapshot = {
      id:legacyId,
      label:"Legacy oversized recovery snapshot",
      createdAt:new Date().toISOString(),
      sourceDeviceId:"legacy-test-device",
      checksum:"legacy-quota",
      summary:{ accounts:1, expenses:350, projects:0 },
      data:{
        accounts:{ Legacy:1 },
        expenses:Array.from({ length:350 }, (_, index) => ({ id:`legacy-expense-${index}`, name:`Legacy ${index}`, notes:"x".repeat(240) })),
        projects:[]
      }
    };
    appMeta.recoverySnapshots = [legacySnapshot, ...(appMeta.recoverySnapshots || []).filter(item => item.id !== legacyId)];
    writeMeta();
    await window.FinancePrivacyLock.recoveryStorage.compact();
  }, legacyId);

  const migrated = await page.evaluate(async legacyId => {
    const meta = JSON.parse(localStorage.getItem("simple-finance-project-records-v12-meta") || "{}");
    const indexed = await window.FinancePrivacyLock.recoveryStorage.list();
    return {
      metadata:meta.recoverySnapshots?.find(item => item.id === legacyId) || null,
      indexed:indexed.find(item => item.id === legacyId) || null,
      serializedMetaLength:JSON.stringify(meta).length
    };
  }, legacyId);
  expect(migrated.metadata).toBeTruthy();
  expect(migrated.metadata.data).toBeUndefined();
  expect(migrated.metadata.storage).toBe("indexeddb-v2");
  expect(migrated.indexed?.data?.expenses?.length).toBe(350);
  expect(migrated.serializedMetaLength).toBeLessThan(100000);

  await page.evaluate(() => {
    const account = Object.keys(data.accounts || {})[0] || "Cash";
    const quotaExpenses = Array.from({ length:800 }, (_, index) => ({
      id:`quota-expense-${index}`,
      name:`Quota seed ${index}`,
      amount:1,
      date:`2026-08-${String((index % 28) + 1).padStart(2,"0")}`,
      category:"Other",
      group:"Other",
      account,
      recurring:"No",
      paid:false,
      notes:"quota-test-" + "q".repeat(220),
      includeInTotals:false
    }));
    data.expenses = [...data.expenses.filter(item => !String(item.id || "").startsWith("quota-expense-")), ...quotaExpenses];
    saveData("Seed quota recovery test");

    const originalSetItem = Storage.prototype.setItem;
    const metaKey = "simple-finance-project-records-v12-meta";
    const baseline = String(localStorage.getItem(metaKey) || "").length;
    const quotaLimit = baseline + 80000;
    Storage.prototype.setItem = function(key, value) {
      if (key === metaKey && String(value).length > quotaLimit) {
        throw new DOMException("Setting the value exceeded the quota.", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
  });

  const importedName = "Quota-safe imported account";
  const importedAmount = 404.04;
  await page.evaluate(({ importedName, importedAmount }) => {
    const bundle = window.buildBundle("my-finance-v12-recovery");
    bundle.exportedAt = new Date().toISOString();
    bundle.sourceDevice = { id:"playwright-quota-import", name:"Quota import source" };
    bundle.data.accounts = { ...(bundle.data.accounts || {}), [importedName]:importedAmount };
    window.openSyncReview(bundle);
  }, { importedName, importedAmount });

  const dialog = page.locator("#syncReviewDialog");
  await expect(dialog).toBeVisible();
  await page.locator("#mergeUseIncomingButton").click();
  await expect(dialog).not.toBeVisible({ timeout:10000 });
  await expect.poll(() => page.evaluate(name => window.buildBundle().data.accounts?.[name] ?? null, importedName)).toBe(importedAmount);

  const quotaSafeState = await page.evaluate(async () => {
    const meta = JSON.parse(localStorage.getItem("simple-finance-project-records-v12-meta") || "{}");
    const snapshots = await window.FinancePrivacyLock.recoveryStorage.list();
    return {
      metadataSnapshots:meta.recoverySnapshots || [],
      indexedSnapshots:snapshots.map(snapshot => ({ id:snapshot.id, expenseCount:snapshot.data?.expenses?.length || 0 })),
      serializedMetaLength:JSON.stringify(meta).length
    };
  });
  expect(quotaSafeState.metadataSnapshots.length).toBeGreaterThan(0);
  expect(quotaSafeState.metadataSnapshots.every(snapshot => !Object.prototype.hasOwnProperty.call(snapshot, "data"))).toBe(true);
  expect(quotaSafeState.metadataSnapshots.every(snapshot => snapshot.storage === "indexeddb-v2")).toBe(true);
  expect(quotaSafeState.indexedSnapshots.some(snapshot => snapshot.expenseCount >= 800)).toBe(true);
  expect(quotaSafeState.serializedMetaLength).toBeLessThan(100000);

  await page.reload({ waitUntil:"networkidle" });
  await waitForStableRuntime(page);
  await expect.poll(() => page.evaluate(name => window.buildBundle().data.accounts?.[name] ?? null, importedName)).toBe(importedAmount);
});

test("legacy and cloud recovery copies are moved out of localStorage", async ({ page }) => {
  await page.goto(appUrl, { waitUntil:"networkidle" });
  await waitForStableRuntime(page);

  const cloudKey = `simple-finance-cloud-recovery-test-${Date.now()}`;
  const result = await page.evaluate(async cloudKey => {
    const legacyKey = "simple-finance-project-records-v11-backup";
    const legacy = {
      format:"my-finance-v11-recovery",
      createdAt:new Date().toISOString(),
      data:{ accounts:{ Legacy:42 }, expenses:[] }
    };
    const cloud = {
      format:"my-finance-cloud-recovery-v3",
      createdAt:new Date().toISOString(),
      data:{ accounts:{ Cloud:84 }, expenses:[] },
      pending:{ sample:true }
    };
    localStorage.setItem(legacyKey, JSON.stringify(legacy));
    localStorage.setItem(cloudKey, JSON.stringify(cloud));
    const compacted = await window.FinancePrivacyLock.recoveryStorage.compact();
    const storedLegacy = await window.FinancePrivacyLock.recoveryStorage.getLegacyBackup();
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("simple-finance-project-records-v12-db", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise((resolve, reject) => {
      const transaction = db.transaction("recoverySnapshots", "readonly");
      const request = transaction.objectStore("recoverySnapshots").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return {
      compacted,
      legacyKeyPresent:localStorage.getItem(legacyKey) !== null,
      cloudKeyPresent:localStorage.getItem(cloudKey) !== null,
      legacyStorage:storedLegacy?.storage || "",
      cloudRecord:records.find(record => record?.sourceKey === cloudKey) || null
    };
  }, cloudKey);

  expect(result.legacyKeyPresent).toBe(false);
  expect(result.cloudKeyPresent).toBe(false);
  expect(result.legacyStorage).toBe("indexeddb-v2");
  expect(result.cloudRecord?.kind).toBe("cloud-recovery");
  expect(result.cloudRecord?.pending?.sample).toBe(true);
  expect(result.compacted.legacyBackup).toBeGreaterThanOrEqual(1);
  expect(result.compacted.cloudRecovery).toBeGreaterThanOrEqual(1);
});
