import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { test } from "../helpers/browser-fixtures.mjs";

test("local CSV engine parses, previews, deduplicates, and preserves balances", () => {
const source = fs.readFileSync("assets/js/import-center.js", "utf8");
const context = vm.createContext({ console, structuredClone, Intl, Date, Math, JSON, Number, String, Object, Array, Set, Map, RegExp, Error, crypto:webcrypto });
vm.runInContext(source, context);
const engine = context.FinanceImportCenter;
const plain = value => JSON.parse(JSON.stringify(value));

assert.equal(engine.version, 1);
assert.equal(engine.maxFileSize, 10 * 1024 * 1024);
assert.equal(engine.maxRows, 20000);

const standardText = fs.readFileSync("tests/fixtures/import/philippine-debit-credit.csv", "utf8");
const standard = engine.parseCsv(standardText);
assert.equal(standard.delimiter, ",");
assert.equal(standard.rows.length, 3);
assert.deepEqual(plain(engine.guessMapping(standard.headers)), {
  date:"0", amount:"", debit:"3", credit:"4", description:"1", reference:"2", type:"5", category:"6", payee:"7"
});

context.FinancePayeeRules = {
  previewRecord(record, collection) {
    return { collection, before:structuredClone(record), after:{ ...structuredClone(record), tags:["Imported"] }, matches:[{ id:"rule-import", name:"Imported record" }], changes:[{ field:"tags" }] };
  }
};
const balances = { Cash:5000, Maya:1000 };
const data = { accounts:balances, expenses:[], incomeRecords:[] };
const analysis = engine.analyzeRows(standard, {
  mapping:engine.guessMapping(standard.headers), account:"Cash", dateFormat:"dmy", decimalSeparator:".", positiveMeans:"income"
}, data);
assert.deepEqual(plain(analysis.errors), []);
assert.equal(analysis.totals.ready, 3);
assert.equal(analysis.totals.expenses, 1250.5);
assert.equal(analysis.totals.income, 50000);
assert.equal(analysis.rows[0].record.paid, true);
assert.equal(analysis.rows[0].record.accountDeducted, false);
assert.equal(analysis.rows[0].record.paymentTransactionId, "");
assert.equal(analysis.rows[1].record.postToLedger, false);
assert.equal(analysis.rows[2].record.includeInTotals, false);
assert.deepEqual(plain(analysis.rows[0].record.tags), ["Imported"]);
assert.deepEqual(balances, { Cash:5000, Maya:1000 }, "preview must not mutate balances");

const duplicateSource = { ...data, expenses:[{ importFingerprint:analysis.rows[0].fingerprint }] };
const duplicateAnalysis = engine.analyzeRows(standard, {
  mapping:engine.guessMapping(standard.headers), account:"Cash", dateFormat:"dmy", decimalSeparator:".", positiveMeans:"income"
}, duplicateSource);
assert.equal(duplicateAnalysis.rows[0].status, "duplicate");
assert.equal(duplicateAnalysis.rows[0].selected, false);

const duplicateFile = engine.parseCsv(fs.readFileSync("tests/fixtures/import/duplicates.csv", "utf8"));
const withinFile = engine.analyzeRows(duplicateFile, {
  mapping:engine.guessMapping(duplicateFile.headers), account:"Cash", dateFormat:"dmy", decimalSeparator:".", positiveMeans:"income"
}, data);
assert.equal(withinFile.rows[0].status, "ready");
assert.equal(withinFile.rows[1].status, "duplicate");

const semicolon = engine.parseCsv(fs.readFileSync("tests/fixtures/import/semicolon-decimal-comma.csv", "utf8"));
assert.equal(semicolon.delimiter, ";");
const semicolonAnalysis = engine.analyzeRows(semicolon, {
  mapping:engine.guessMapping(semicolon.headers), account:"Cash", dateFormat:"dmy", decimalSeparator:",", positiveMeans:"income"
}, data);
assert.equal(semicolonAnalysis.totals.expenses, 125.5);
assert.equal(semicolonAnalysis.totals.income, 250.75);

const multiline = engine.parseCsv(fs.readFileSync("tests/fixtures/import/quoted-multiline.csv", "utf8"));
assert.equal(multiline.rows.length, 2);
assert.match(multiline.rows[1][1], /renewal\nwith annual discount/);

const hostile = engine.parseCsv(fs.readFileSync("tests/fixtures/import/invalid-and-hostile.csv", "utf8"));
const hostileAnalysis = engine.analyzeRows(hostile, {
  mapping:engine.guessMapping(hostile.headers), account:"Cash", dateFormat:"dmy", decimalSeparator:".", positiveMeans:"income"
}, data);
assert.equal(hostileAnalysis.totals.ready, 0);
assert.equal(hostileAnalysis.totals.invalid, 2);

assert.equal(engine.parseDateValue("25/08/2026", "dmy").value, "2026-08-25");
assert.match(engine.parseDateValue("08/09/2026", "auto").error, /Ambiguous/);
assert.equal(engine.parseAmountValue("(₱1,250.50)", ".").value, -1250.5);
assert.match(engine.hashText("stable import identity"), /^[a-f0-9]{16}$/);
assert.notEqual(engine.hashText("stable import identity"), engine.hashText("different import identity"));
const tooManyRows = ["Date,Description,Amount", ...Array.from({ length:engine.maxRows + 1 }, (_, index) => `2026-08-25,Row ${index + 1},1`)].join("\n");
assert.throws(() => engine.parseCsv(tooManyRows), /20,000 data rows/);

console.log("Local CSV import engine passed Philippine parsing, preview, deduplication, transfer, and safety checks.");
});
