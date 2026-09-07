import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const read = file => fs.readFileSync(file, "utf8");
const index = read("index.html");
const worker = read("sw.js");
const interaction = read("interaction-patterns.js");
const budget = read("budget-planning.js");
const productivity = read("productivity-tools.js");
const ledger = read("account-ledger.js");
const formInputs = read("form-inputs.js");
const compactCss = read("assets/css/expense-compact.css");
const compactJs = read("assets/js/ui/expense-compact.js");
const budgetCss = read("assets/css/budget-planning.css");
const version = JSON.parse(read("version.json"));
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const query = "2.5.0-talaan1";
const accountIntegritySources = ["assets/js/finance-transaction-diagnostics.js","assets/js/finance-integrity.js","assets/js/account-ledger.js","assets/js/account-submit-compat.js","assets/js/cloud-sync.js","assets/js/cloud-sync-lifecycle.js"];
const accountIntegrityHash = crypto.createHash("sha256");
for (const file of accountIntegritySources) { accountIntegrityHash.update(`${file}\0`); accountIntegrityHash.update(fs.readFileSync(file)); }
const accountIntegrityQuery = `2.5.0-account-${accountIntegrityHash.digest("hex").slice(0, 12)}`;

for (const [pageId, marqueeId] of [["income", "incomeFinanceWeekMarquee"], ["money", "financeWeekMarquee"], ["paid-expenses", "paidFinanceWeekMarquee"]]) {
  const start = index.indexOf(`id="${pageId}"`);
  assert.notEqual(start, -1, `${pageId} page must exist`);
  const next = index.indexOf('<section class="page', start + 1);
  const segment = index.slice(start, next === -1 ? index.length : next);
  const row = segment.indexOf('class="finance-workspace-marquee-row no-print"');
  const switcher = segment.indexOf('class="workspace-switcher money-workspace-switcher"', row);
  const marquee = segment.indexOf(`id="${marqueeId}"`, row);
  assert.ok(row >= 0 && switcher > row && marquee > switcher, `${pageId} tabs and marquee must share the Finance row`);
}

assert.equal(interaction.includes("alignFinanceWorkspaceMarquees"), false, "Finance marquee placement must be source-owned");
assert.match(budget, /budgetRenderDashboard\(\.\.\.args\).*injectUi\(\); return result;/s, "Budget dashboard wrapper must preserve supported UI injection");
assert.match(index, /<h2 id="income-title">Income &amp; Planning<\/h2>/, "Income page must expose its planning role");
assert.equal((index.match(/workspace-label-desktop">Income &amp; Planning/g) || []).length, 3, "Every Finance switcher must use the renamed desktop label");
assert.match(budget, /incomeSummary\?\.insertAdjacentHTML\("beforebegin"/, "Monthly budget plan must be inserted before the Income summary");
assert.match(budget, /PAGE_RENDERERS\.income = renderIncomePage/, "Income renderer must own monthly budget presentation");
assert.doesNotMatch(budget, /PAGE_RENDERERS\.money = renderMoneyPage/, "Budget & Expenses must no longer own monthly budget presentation");
assert.match(productivity, /monthlyBudgets:\{label:"Monthly budget",page:"income"\}/, "Monthly budget navigation must target Income & Planning");
assert.match(productivity, /budgetTemplates:\{label:"Budget template",page:"income"\}/, "Budget template navigation must follow the planner");
assert.match(budget, /<h4>Cash-flow &amp; savings forecast<\/h4>/, "The existing forecast panel must own the savings outlook");
assert.match(budget, /id="monthlySavingsTarget"/, "Savings target must be directly editable");
assert.match(budget, /id="savingsMonthConfirmed" type="checkbox"/, "Each selected month must have an explicit savings confirmation");
assert.match(budget, /savingsProgress:normalizeSavingsProgress\(value\?\.savingsProgress\)/, "Savings confirmation must persist independently on each monthly plan");
assert.match(budget, /Tracking only:<\/strong> confirming savings does not change any account balance/, "Savings confirmation must not imply a balance transfer");
assert.match(budget, /function savingsProjection\(startMonth, previewTarget = null\)/, "Savings outlook must calculate a four-month projection");
assert.match(budget, /plan\.savingsProgress = \{confirmed,actualAmount/, "Savings confirmation must preserve the actual amount");
assert.match(budgetCss, /\.budget-category-panel,\.cash-forecast-panel \{[^}]*border-radius:var\(--talaan-section-radius\);/, "The integrated savings panels must use the section radius");
assert.match(budgetCss, /\.savings-money-input \.input,\.savings-target-controls \.button \{ border-radius:var\(--talaan-control-radius\) !important; \}/, "Savings controls must use the control radius");
assert.match(budgetCss, /\.savings-check-row input \{[^}]*border-radius:var\(--talaan-control-radius\);/, "Savings confirmation must use the control radius");
const legacyAccountHandler = index.match(/document\.getElementById\("accountForm"\)\.addEventListener\("submit"[\s\S]*?document\.getElementById\("expenseForm"\)/)?.[0] || "";
const legacyAccountsHandler = index.match(/document\.getElementById\("accountsForm"\)\.addEventListener\("submit"[\s\S]*?document\.getElementById\("exportBackup"\)/)?.[0] || "";
assert.match(legacyAccountHandler, /FinanceAccountMutations/, "Edit/Add account fallback must delegate to the single mutation owner");
assert.match(legacyAccountsHandler, /FinanceAccountMutations/, "Settings account fallback must delegate to the single mutation owner");
assert.doesNotMatch(legacyAccountHandler, /data\.accounts\[/, "legacy Edit/Add account handler must not write balances directly");
assert.doesNotMatch(legacyAccountsHandler, /data\.accounts\[/, "legacy Settings account handler must not write balances directly");
assert.match(ledger, /window\.FinanceAccountMutations =/, "Account Ledger must expose the single maintenance mutation owner");
assert.match(ledger, /function accountMutationInvariantReport\(/, "Account mutations must enforce ledger and reconciliation invariants");
assert.match(ledger, /function runAccountMutation\(/, "Account maintenance must use one transaction runner");
assert.match(ledger, /function runLedgerTransaction\(/, "Money-changing features must use the unified ledger transaction runner");
assert.match(ledger, /const saved = persistFinanceDataRaw\(message\)/, "Unified money transactions must persist through the persistence-only path");
assert.match(ledger, /function quickSpendStateErrors\(/, "Record spending must have a dedicated domain invariant check");
assert.match(ledger, /verify:quickSpendStateErrors/, "Record spending must verify its paid expense and ledger debit before success");
assert.match(ledger, /refreshReconciledAccountState\(account, result\.after\)/, "Record spending may refresh the UI only after the transaction succeeds");
assert.match(formInputs, /function evaluateArithmeticExpression/);
assert.match(formInputs, /function validateMoneyInput/);
assert.match(formInputs, /function setupNumericInputs/);
assert.match(formInputs, /Object\.assign\(root/);
assert.match(compactCss, /\.period-header h3[\s\S]*font-size:\s*15px !important;[\s\S]*font-weight:\s*700 !important/);
assert.match(compactCss, /\.period-card \.period-header \.collapse-toggle[\s\S]*width:\s*30px !important;[\s\S]*height:\s*30px !important/);
assert.match(compactCss, /\[data-mark-paid\][\s\S]*width:\s*74px !important;[\s\S]*height:\s*30px !important/);
assert.match(compactCss, /\[data-edit-expense\][\s\S]*width:\s*48px !important;[\s\S]*height:\s*30px !important/);
assert.match(compactJs, /statuses\.insertBefore\(warning/);
assert.match(compactJs, /ensureCollapseChanged/);
assert.match(compactJs, /toggleCollapsibleSection/);

for (const icon of ["repeat-monthly-off.png", "repeat-monthly-on.png"]) {
  assert.ok(fs.existsSync(`icons/${icon}`), `${icon} must exist`);
  assert.ok(compactCss.includes(`./icons/${icon}?v=${query}`), `compact expense styles must use ${icon}`);
  assert.ok(worker.includes(`./icons/${icon}?v=${query}`), `service worker must precache ${icon}`);
}
assert.match(compactCss, /\[data-toggle-saved\] \.saved-icon\s*\{[\s\S]*opacity:\s*0 !important;/, "text star must remain visually hidden behind PNG artwork");
assert.match(index, /class="button button-saved button-small repeat-icon-control/, "desktop repeat controls must use the icon-only contract");
assert.doesNotMatch(index, /class="monthly-repeat-label"/, "repeat labels must not be rendered by the page source");
assert.match(compactCss, /Repeat controls are permanently icon-only/, "compact expense CSS must own the permanent icon-only guard");
assert.match(compactCss, /:is\(\.monthly-repeat-label, \.saved-button-text\)[\s\S]*display: none !important;/, "legacy repeat label elements must stay hidden");
assert.doesNotMatch(compactJs, /readableStyle/, "runtime must not inject a readable repeat-label style");

for (const file of ["interaction-patterns.js", "budget-planning.js", "form-inputs.js"]) {
  assert.ok(index.includes(`./${file}?v=${query}`), `index must load ${file} with the Talaan query`);
  assert.ok(worker.includes(`./${file}?v=${query}`), `service worker must precache ${file}`);
}
assert.ok(index.includes(`./finance-transaction-diagnostics.js?v=${accountIntegrityQuery}`), "index must load finance-transaction-diagnostics.js with the Account Integrity query");
assert.ok(worker.includes(`./finance-transaction-diagnostics.js?v=${accountIntegrityQuery}`), "service worker must precache finance-transaction-diagnostics.js with the Account Integrity query");
assert.ok(index.includes(`./finance-integrity.js?v=${accountIntegrityQuery}`), "index must load finance-integrity.js with the Account Integrity query");
assert.ok(worker.includes(`./finance-integrity.js?v=${accountIntegrityQuery}`), "service worker must precache finance-integrity.js with the Account Integrity query");
assert.ok(index.includes(`./account-ledger.js?v=${accountIntegrityQuery}`), "index must load account-ledger.js with the Account Integrity query");
assert.ok(worker.includes(`./account-ledger.js?v=${accountIntegrityQuery}`), "service worker must precache account-ledger.js with the Account Integrity query");
assert.equal(version.version, "2.5.0");
assert.equal(version.schemaVersion, 12);
assert.equal(version.cloudSchemaVersion, 3);
assert.equal(pkg.version, version.version);
assert.equal(lock.version, version.version);
assert.equal(lock.packages[""].version, version.version);

// Phase 2 money-mutation ownership: Account Ledger is the only balance-changing runtime owner.
assert(ledger.includes("function runLedgerTransaction("), "unified ledger transaction runner is missing");
assert(ledger.includes("window.FinanceLedgerTransactions = Object.freeze"), "money mutation service is not exposed");
for (const capability of ["unifiedMoneyMutations:true","transactionalPersistence:true","domainInvariants:true","rollback:true"]) assert(ledger.includes(capability), `money mutation capability ${capability} is missing`);
assert(!index.includes("data.accounts[account] = roundMoney(balance - total)"), "legacy expense payment still writes account balances directly");
assert(!index.includes("data.accounts[item.paidFromAccount] = roundMoney"), "legacy payment reversal still writes account balances directly");

console.log("Finance UI, spending persistence, form inputs, compact expenses, replaceable repeat icons, and Talaan runtime pins validated.");
