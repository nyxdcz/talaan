import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = file => fs.readFileSync(file, "utf8");
const ledger = read("assets/js/account-ledger.js");
const productivity = read("assets/js/productivity-tools.js");
const household = read("assets/js/household-splits.js");
const privacy = read("assets/js/privacy-lock.js");
const html = read("index.html");

for (const token of [
  "function runLedgerTransaction(",
  "function requestLedgerEntries(",
  "markExpensesPaidExternally",
  "correctPaidExpenseAccounts",
  "reconcileAccounts",
  "centralizedOwnership:true",
  "idempotentRequests:true",
  "externalPayments:true",
  "paymentAccountCorrection:true",
  "reconciliationBatch:true"
]) assert(ledger.includes(token), `Missing centralized money ownership contract: ${token}`);

assert(ledger.includes("escapeHtml(money(fromBalance))"), "updateTransferPreview must sanitize money output with escapeHtml");

assert(productivity.includes("correctPaidExpenseAccounts"), "Paid-expense account correction must delegate to the ledger transaction owner");
assert(!productivity.includes("FinanceAccountLedger.appendLedgerEntries"), "Paid-expense account correction may not append ledger entries directly");
assert(household.includes("markExpensesPaidExternally"), "Household external payments must delegate to the ledger transaction owner");
assert(privacy.includes("reconcileAccounts"), "Backup/import balance reconciliation must delegate to the ledger transaction owner");
assert(!privacy.includes("FinanceAccountLedger.appendReconciliation"), "Backup/import code may not append reconciliations directly");

const runtimeFiles = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && full.endsWith(".js")) runtimeFiles.push(full.replaceAll("\\", "/"));
  }
};
walk("assets/js");
runtimeFiles.push("index.html");

// These files are explicit hydration/restore boundaries rather than user money-mutation owners.
const hydrationAllowlist = new Set([
  "assets/js/cloud-sync.js",
  "assets/js/finance-integrity.js",
  "assets/js/security-profiles.js",
  "assets/js/import-center.js",
  "assets/js/productivity-tools.js"
]);
const owner = "assets/js/account-ledger.js";
const forbidden = [
  ["direct account balance assignment", /\bdata\.accounts\s*\[[^\]]+\]\s*(?:=|\+=|-=|\*=|\/=)(?!=)/g],
  ["direct account ledger collection mutation", /\bdata\.accountLedger\s*(?:=|\.push\s*\(|\.splice\s*\(|\.unshift\s*\()/g],
  ["raw ledger append API outside the transaction owner", /FinanceAccountLedger[^\n]{0,120}append(?:LedgerEntries|Reconciliation)/g]
];

const violations = [];
for (const file of runtimeFiles) {
  if (file === owner || hydrationAllowlist.has(file)) continue;
  const source = read(file);
  for (const [label, pattern] of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) violations.push(`${file}: ${label}`);
  }
}
assert.deepEqual(violations, [], `Money mutation ownership violations:\n${violations.join("\n")}`);

for (const source of [household, html]) {
  assert(!/\b(?:item|expense|record|plan\.item)\.(?:paid|paidDate|paidFromAccount|paidAmount|accountDeducted|paymentTransactionId|autoPaidAtMonthEnd)\s*=(?!=)/.test(source),
    "Paid-expense lifecycle fields outside the transaction owner must not be mutated directly");
}

console.log("Money mutation ownership validation passed.");
