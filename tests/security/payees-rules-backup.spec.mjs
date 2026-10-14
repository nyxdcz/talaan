import { expect, test } from "../helpers/browser-fixtures.mjs";
/* global data */

test("payees and rules round-trip through backup and encrypted Cloud V3 settings", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=settings&settings=finance-tools", { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePayeeRules && window.FinanceCloudSyncInternals && window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  const result = await page.evaluate(() => {
    data.ledgerSettings.financeTools = window.FinancePayeeRules.normalizeTools({ version:1, payees:[{id:"payee-backup",name:"Backup Payee",aliases:["Backup Alias"]}], transactionRules:[{id:"rule-backup",name:"Backup Rule",enabled:true,priority:10,match:{mode:"all",conditions:[{field:"description",operator:"contains",value:"backup"}]},actions:{category:"Backups"},continue:false}] });
    const bundle = window.buildBundle("my-finance-v12-recovery");
    const records = window.FinanceCloudSyncInternals.toRecordMap(bundle.data);
    const settings = records["settings\u001fpreferences"];
    const restored = window.FinanceCloudSyncInternals.fromRecordStore(records, {});
    return {
      schema:bundle.schemaVersion,
      backup:bundle.data.ledgerSettings.financeTools,
      cloud:settings.payload.ledgerSettings.financeTools,
      restored:restored.ledgerSettings.financeTools,
      exposesSeparateCloudCollection:Object.values(records).some(record => ["payees","transactionRules"].includes(record.collection))
    };
  });
  expect(result.schema).toBe(12);
  expect(result.backup.payees[0].name).toBe("Backup Payee");
  expect(result.cloud.transactionRules[0].id).toBe("rule-backup");
  expect(result.restored.payees[0].id).toBe("payee-backup");
  expect(result.exposesSeparateCloudCollection).toBe(false);
});
