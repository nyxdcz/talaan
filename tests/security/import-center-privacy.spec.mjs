/* global data */

import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "../helpers/browser-fixtures.mjs";

test("statement files stay session-only and commit requires recovery without ledger mutation", () => {
const source = fs.readFileSync("assets/js/import-center.js", "utf8");
const worker = fs.readFileSync("sw.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

assert.doesNotMatch(source, /\bfetch\s*\(/);
assert.doesNotMatch(source, /XMLHttpRequest|sendBeacon|WebSocket/);
assert.doesNotMatch(source, /caches\.(?:open|put|add)/);
assert.match(source, /const MAX_FILE_SIZE = 10 \* 1024 \* 1024/);
assert.match(source, /const MAX_ROWS = 20000/);
assert.match(source, /const text = await file\.text\(\)/);
assert.match(source, /replace\(\/\[&<>'"\]\/g/);
assert.match(source, /accountDeducted:false/);
assert.match(source, /postToLedger:false/);
assert.match(source, /includeInTotals:type !== "transfer"/);
assert.match(source, /await saveRecovery\(`Before local \$\{label\} import`\)/);
assert.match(source, /pushUndo\(`Import local \$\{label\}`\)/);
assert.match(source, /persist\(`Imported \$\{selected\.length\} \$\{label\} record/);

const batchStart = source.indexOf("function buildBatch");
const batchEnd = source.indexOf("async function commitImport", batchStart);
const batchSource = source.slice(batchStart, batchEnd);
assert.ok(batchStart >= 0 && batchEnd > batchStart);
assert.doesNotMatch(batchSource, /fileName|description|rawRows|fileHash/);

assert.match(source, /accept="\.csv,\.ofx,\.qif,text\/csv,text\/plain,application\/x-ofx,application\/vnd\.intu\.qif" data-import-csv/);
assert.match(html, /import-formats\.js\?v=2\.5\.0-talaan1/);
assert.match(html, /import-center\.js\?v=2\.5\.0-talaan1/);
assert.match(worker, /import-formats\.js\?v=2\.5\.0-talaan1/);
assert.match(worker, /import-center\.js\?v=2\.5\.0-talaan1/);
assert.match(worker, /import-center\.css\?v=2\.5\.0-talaan1/);
assert.match(worker, /endsWith\("import-center\.js"\)/);

console.log("Statement import files remain session-only and the commit boundary requires recovery, Undo, and non-ledger records.");
});

test("mapping profiles and batch metadata round-trip through backup and encrypted Cloud V3 settings", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=settings&settings=finance-tools", { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinanceImportCenter && window.FinanceCloudSyncInternals && window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  const result = await page.evaluate(() => {
    data.ledgerSettings.importCenter = window.FinanceImportCenter.normalizeImportCenter({
      version:1,
      profiles:[{ id:"import-profile-test", name:"Test bank", format:"csv", mapping:{ date:"0", amount:"2", description:"1" }, dateFormat:"dmy", decimalSeparator:".", positiveMeans:"income" }],
      batches:[{ id:"import-batch-test", importedAt:"2026-08-26T00:00:00.000Z", account:"Cash", rowCount:1, expenseIds:["expense-import-test"], incomeIds:[], fingerprints:["csv-test"], rolledBackAt:"" }]
    });
    const bundle = window.buildBundle("my-finance-v12-recovery");
    const records = window.FinanceCloudSyncInternals.toRecordMap(bundle.data);
    const settings = records["settings\u001fpreferences"];
    const restored = window.FinanceCloudSyncInternals.fromRecordStore(records, {});
    return {
      schema:bundle.schemaVersion,
      backup:bundle.data.ledgerSettings.importCenter,
      cloud:settings.payload.ledgerSettings.importCenter,
      restored:restored.ledgerSettings.importCenter,
      separateCollection:Object.values(records).some(record => ["importCenter", "importProfiles", "importBatches"].includes(record.collection))
    };
  });
  assert.equal(result.schema, 12);
  assert.equal(result.backup.profiles[0].name, "Test bank");
  assert.equal(result.cloud.batches[0].id, "import-batch-test");
  assert.equal(result.restored.profiles[0].id, "import-profile-test");
  assert.equal(result.separateCollection, false);
});
