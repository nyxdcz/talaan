import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { test } from "../helpers/browser-fixtures.mjs";

test("OFX and QIF normalize into the existing safe import analysis", () => {
  const context = vm.createContext({ console, structuredClone, Intl, Date, Math, JSON, Number, String, Object, Array, Set, Map, RegExp, Error, crypto:webcrypto });
  vm.runInContext(fs.readFileSync("assets/js/import-formats.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("assets/js/import-center.js", "utf8"), context);
  const formats = context.FinanceImportFormats;
  const engine = context.FinanceImportCenter;
  const plain = value => JSON.parse(JSON.stringify(value));
  const sourceData = { accounts:{ Cash:5000 }, expenses:[], incomeRecords:[] };

  assert.deepEqual(plain(formats.supportedFormats), ["csv", "ofx", "qif"]);
  assert.equal(formats.detectFormat("statement.ofx"), "ofx");
  assert.equal(formats.detectFormat("statement.qif"), "qif");

  const sgml = formats.parseOfx(fs.readFileSync("tests/fixtures/import/bank-sgml.ofx", "utf8"));
  assert.equal(sgml.format, "ofx");
  assert.equal(sgml.metadata.currency, "PHP");
  assert.equal(sgml.metadata.accountHint, "1234567890");
  assert.equal(sgml.rows.length, 2);
  assert.equal(sgml.rows[0][0], "2026-08-25");
  assert.equal(sgml.rows[0][2], "BDO-20260825-1");
  const sgmlAnalysis = engine.analyzeRows(sgml, { format:"ofx", mapping:sgml.mapping, account:"Cash", dateFormat:"dmy", decimalSeparator:".", positiveMeans:"income" }, sourceData);
  assert.equal(sgmlAnalysis.totals.ready, 2);
  assert.equal(sgmlAnalysis.totals.expenses, 1250.5);
  assert.equal(sgmlAnalysis.totals.income, 50000);
  assert.equal(sgmlAnalysis.rows[0].record.importSource, "ofx");
  assert.equal(sgmlAnalysis.rows[0].record.importReference, "BDO-20260825-1");
  const changedMemo = structuredClone(sgml);
  changedMemo.rows[0][1] = "Updated bank memo";
  const stableDuplicate = engine.analyzeRows(changedMemo, { format:"ofx", mapping:changedMemo.mapping, account:"Cash", dateFormat:"dmy", decimalSeparator:".", positiveMeans:"income" }, { ...sourceData, expenses:[{ importFingerprint:sgmlAnalysis.rows[0].fingerprint }] });
  assert.equal(stableDuplicate.rows[0].status, "duplicate");

  const xml = formats.parseOfx(fs.readFileSync("tests/fixtures/import/card-xml.ofx", "utf8"));
  assert.equal(xml.metadata.statementType, "Credit card");
  assert.match(xml.rows[0][1], /Monthly plan & add-on/);

  const qif = formats.parseQif(fs.readFileSync("tests/fixtures/import/bank-and-transfer.qif", "utf8"));
  assert.equal(qif.format, "qif");
  assert.equal(qif.metadata.accountHint, "BDO Savings");
  assert.equal(qif.rows.length, 4);
  const qifAnalysis = engine.analyzeRows(qif, { format:"qif", mapping:qif.mapping, account:"Cash", dateFormat:"auto", decimalSeparator:".", positiveMeans:"income" }, sourceData);
  assert.equal(qifAnalysis.totals.ready, 3);
  assert.equal(qifAnalysis.totals.ignored, 1);
  assert.equal(qifAnalysis.rows[2].type, "transfer");
  assert.equal(qifAnalysis.rows[2].record.includeInTotals, false);
  assert.equal(qifAnalysis.rows[0].record.importSource, "qif");

  const split = formats.parseQif(fs.readFileSync("tests/fixtures/import/unsupported-split.qif", "utf8"));
  const splitAnalysis = engine.analyzeRows(split, { format:"qif", mapping:split.mapping, account:"Cash", dateFormat:"auto", decimalSeparator:".", positiveMeans:"income" }, sourceData);
  assert.equal(splitAnalysis.rows[0].status, "invalid");
  assert.match(splitAnalysis.rows[0].errors.join(" "), /Split QIF transactions/);

  const missingFitid = formats.parseOfx("<OFX><STMTRS><CURDEF>PHP</CURDEF><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260825</DTPOSTED><TRNAMT>-1</TRNAMT><NAME>Test</NAME></STMTTRN></BANKTRANLIST></STMTRS></OFX>");
  const invalidAnalysis = engine.analyzeRows(missingFitid, { format:"ofx", mapping:missingFitid.mapping, account:"Cash", dateFormat:"dmy", decimalSeparator:".", positiveMeans:"income" }, sourceData);
  assert.equal(invalidAnalysis.rows[0].status, "invalid");
  assert.match(invalidAnalysis.rows[0].errors.join(" "), /missing FITID/);

  const foreign = formats.parseOfx("<OFX><STMTRS><CURDEF>USD</CURDEF><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260825</DTPOSTED><TRNAMT>-1</TRNAMT><FITID>USD-1</FITID><NAME>Test</NAME></STMTTRN></BANKTRANLIST></STMTRS></OFX>");
  assert.equal(foreign.metadata.currency, "USD");
  assert.match(foreign.warnings.join(" "), /does not convert currencies/);
  assert.throws(() => formats.parseOfx("<OFX><INVSTMTRS><INVTRANLIST></INVTRANLIST></INVSTMTRS></OFX>"), /Investment OFX/);
  assert.throws(() => formats.parseOfx("<!DOCTYPE OFX><OFX></OFX>"), /declarations and entities/);
});
