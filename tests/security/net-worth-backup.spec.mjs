import { expect, test } from "../helpers/browser-fixtures.mjs";
/* global data */

test("net worth round-trips through Finance Schema 12 backup and encrypted Cloud V3 settings", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=reports", { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinanceNetWorth && window.FinanceCloudSyncInternals && window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  const result = await page.evaluate(() => {
    const stamp = "2026-08-27T00:00:00.000Z";
    data.ledgerSettings.netWorth = window.FinanceNetWorth.normalizeStore({ items:[{
      id:"worth-backup", name:"Backup property", type:"asset", category:"Property", currency:"PHP", createdAt:stamp, updatedAt:stamp,
      valuations:[{ id:"value-backup", date:"2026-08-27", nativeAmount:1234567, phpRate:1, createdAt:stamp, updatedAt:stamp }]
    }] });
    const bundle = window.buildBundle("my-finance-v12-recovery");
    const records = window.FinanceCloudSyncInternals.toRecordMap(bundle.data);
    const settings = records["settings\u001fpreferences"];
    const restored = window.FinanceCloudSyncInternals.fromRecordStore(records, {});
    return {
      schema:bundle.schemaVersion,
      backup:bundle.data.ledgerSettings.netWorth,
      cloud:settings.payload.ledgerSettings.netWorth,
      restored:restored.ledgerSettings.netWorth,
      separateCollection:Object.values(records).some(record => record.collection === "netWorth")
    };
  });
  expect(result.schema).toBe(12);
  expect(result.backup.items[0].name).toBe("Backup property");
  expect(result.cloud.items[0].valuations[0].amountPhp).toBe(1234567);
  expect(result.restored.items[0].id).toBe("worth-backup");
  expect(result.separateCollection).toBe(false);
});
