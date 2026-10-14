import { expect, test } from "../helpers/browser-fixtures.mjs";
/* global data */

test("household groups, allocation snapshots, and settlements round-trip through backup and Cloud V3", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=settings&settings=finance-tools", { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinanceHouseholdSplits && window.FinanceCloudSyncInternals && window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  const result = await page.evaluate(() => {
    const stamp = "2026-08-28T00:00:00.000Z";
    const group = { id:"backup-home", name:"Backup Home", ownerMemberId:"backup-you", createdAt:stamp, updatedAt:stamp, members:[
      { id:"backup-you", name:"You", sortIndex:0, createdAt:stamp, updatedAt:stamp },
      { id:"backup-alex", name:"Alex", sortIndex:1, createdAt:stamp, updatedAt:stamp }
    ] };
    data.ledgerSettings.householdSplits = window.FinanceHouseholdSplits.normalizeStore({ groups:[group], settlements:[{ id:"backup-settle", groupId:"backup-home", fromMemberId:"backup-you", toMemberId:"backup-alex", amount:250, date:"2026-08-28", createdAt:stamp, updatedAt:stamp }] });
    const allocation = window.FinanceHouseholdSplits.allocateShares(1000, group.members, "equal");
    data.expenses.push({ id:"backup-bill", name:"Shared bill", amount:1000, paid:true, date:"2026-08-28", householdSplit:window.FinanceHouseholdSplits.normalizeSplit({ groupId:group.id, groupName:group.name, ownerMemberId:group.ownerMemberId, method:"equal", totalAmount:1000, shares:allocation.shares, payerMemberId:"backup-alex", updatedAt:stamp }, 1000, group) });
    const bundle = window.buildBundle("my-finance-v12-recovery");
    const records = window.FinanceCloudSyncInternals.toRecordMap(bundle.data);
    const restored = window.FinanceCloudSyncInternals.fromRecordStore(records, {});
    return {
      schema:bundle.schemaVersion,
      backup:bundle.data.ledgerSettings.householdSplits,
      backupExpense:bundle.data.expenses.find(item => item.id === "backup-bill"),
      cloud:records["settings\u001fpreferences"].payload.ledgerSettings.householdSplits,
      restored:restored.ledgerSettings.householdSplits,
      separateCollection:Object.values(records).some(record => record.collection === "householdSplits")
    };
  });
  expect(result.schema).toBe(12);
  expect(result.backup.groups[0].name).toBe("Backup Home");
  expect(result.backupExpense.householdSplit.ownerShare).toBe(500);
  expect(result.cloud.settlements[0].amount).toBe(250);
  expect(result.restored.groups[0].id).toBe("backup-home");
  expect(result.separateCollection).toBe(false);
});
