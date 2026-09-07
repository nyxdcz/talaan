import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const read = file => fs.readFileSync(file, "utf8");
const index = read("index.html");
const worker = read("sw.js");
const updater = read("pwa-update.js");
const cashFlow = read("cash-flow-summary.js");
const headerTools = read("header-tools-compat.js");
const phoneFinance = read("phone-finance-compat.js");
const runtimeCompat = read("sync-runtime-compat.js");
const transactionDiagnostics = read("finance-transaction-diagnostics.js");
const mobileSource = read("assets/css/mobile.css");
const accountLedger = read("account-ledger.js");
const accountSubmitCompat = read("account-submit-compat.js");
const version = JSON.parse(read("version.json"));
const query = "2.5.0-talaan1";
const accountIntegritySources = ["assets/js/finance-transaction-diagnostics.js","assets/js/finance-integrity.js","assets/js/account-ledger.js","assets/js/account-submit-compat.js","assets/js/cloud-sync.js","assets/js/cloud-sync-lifecycle.js"];
const accountIntegrityHash = crypto.createHash("sha256");
for (const file of accountIntegritySources) { accountIntegrityHash.update(`${file}\0`); accountIntegrityHash.update(fs.readFileSync(file)); }
const accountIntegrityRevision = accountIntegrityHash.digest("hex").slice(0, 12);
const accountIntegrityQuery = `2.5.0-account-${accountIntegrityRevision}`;
const accountIntegrityRefreshKey = `finance-account-integrity-${accountIntegrityRevision}`;

assert.equal(version.version, "2.5.0");
assert.equal(version.cacheVersion, "finance-v2-20260828-household-splits-r17");
assert.match(index, /FinancePwaUpdate\.shellCacheName\(APP_CACHE_VERSION\)/);
assert.match(index, /FinancePwaUpdate\.clearFinanceCaches\(\)/);
assert.match(index, /FinancePwaUpdate\.serviceWorkerUrl\(APP_VERSION, APP_CACHE_VERSION\)/);
assert.match(index, /FinancePwaUpdate\.updateState\(remote, APP_VERSION, APP_CACHE_VERSION\)/);
assert.match(updater, /const FINANCE_CACHE_PATTERN = \/\^finance-v\\d\+-\//);
assert.match(updater, /const LEGACY_INDEX_CACHE = "finance-v15-20260816-mobile-ui-ux-r32";/, "pre-Talaan cache alias stays compatibility-only");
assert.match(updater, /const CURRENT_CACHE_VERSION = "finance-v2-20260828-household-splits-r17";/);
assert.match(updater, /const UI_HOTFIX_REFRESH_KEY = "finance-ui-hotfix-v2-0-1-talaan8";/);
assert.match(updater, /const DASHBOARD_PRESENTATION_REFRESH_KEY = "finance-dashboard-presentation-v2-5-0-talaan9";/);
assert.match(updater, /const EXPENSE_DARK_MODE_REFRESH_KEY = "finance-expense-dark-mode-v2-5-0-talaan1";/);
assert.match(updater, /const INCOME_PLANNING_REFRESH_KEY = "finance-income-planning-v2-5-0-talaan1";/);
assert.ok(updater.includes(`const ACCOUNT_INTEGRITY_REFRESH_KEY = "${accountIntegrityRefreshKey}";`));
assert.match(updater, /async function refreshAccountIntegrityRuntimeOnce\(\)/);
assert.match(updater, /void refreshAccountIntegrityRuntimeOnce\(\)\.then/);
assert.match(updater, /async function refreshExpenseDarkModeOnce\(\)/);
assert.match(updater, /void refreshExpenseDarkModeOnce\(\);/);
assert.match(updater, /async function refreshIncomePlanningOnce\(\)/);
assert.match(updater, /void refreshIncomePlanningOnce\(\);/);
assert.match(updater, /"\/phone-finance-compat\.js"/, "expense dark-mode hotfix must purge the cached compact finance runtime");
for (const file of ["budget-planning.js", "productivity-tools.js", "application-help.js", "desktop-ux.css"]) {
  assert.ok(updater.includes(`"/${file}"`), `${file} must be included in the Income & Planning cache refresh`);
}
for (const file of ["finance-transaction-diagnostics.js", "finance-integrity.js", "account-ledger.js", "account-submit-compat.js", "cloud-sync.js", "cloud-sync-lifecycle.js"]) {
  assert.ok(updater.includes(`"/${file}"`), `${file} must be included in the Account Integrity cache refresh`);
}
assert.match(updater, /"\/cash-flow-summary\.js"/, "dashboard analytics runtime must be included in the generic stale-cache purge list");
assert.match(updater, /"\/income-expenses-compact\.css"/, "dashboard presentation stylesheet must be included in the dedicated stale-cache purge list");
assert.match(updater, /"\/production-ui-audit\.css"/, "dashboard layout stylesheet must be included in the dedicated stale-cache purge list");
assert.match(updater, /const deletedCounts = await Promise\.all/, "targeted cache refresh must count actual deletions");
assert.match(updater, /return deletedCounts\.reduce\(\(sum, count\) => sum \+ count, 0\);/, "an empty cache scan must report zero deleted assets");
assert.match(updater, /if \(!removed\) return false;/, "one-time refresh must not reload when no stale target was removed");
assert.match(updater, /desktop-ui-phase1\.css/);
assert.match(updater, /black-canvas\.css/);
assert.match(updater, /production-ui-audit\.css/);
assert.doesNotMatch(updater, /desktop-ui-phase1-v15|black-canvas-v15|production-ui-audit-v15/);
assert.doesNotMatch(updater, /installSidebarBrand|installCashFlowStyles|installPhoneFinanceCompactUi/);
assert.match(phoneFinance, /function bindPhoneIconOnlyButton\(button, label, iconMarkup\)/);
assert.match(phoneFinance, /function enhancePhoneCompactButtons\(\)/);
assert.match(phoneFinance, /function installPhoneFinanceCompactUi\(\)/);
assert.doesNotMatch(runtimeCompat, /FINANCE_APP_VERSION_OVERRIDE|FINANCE_RELEASE_OVERRIDE|financeLiquidGlassStyles|ensureLiquidGlassStyles|synchronizeTalaanReleaseDisplay|releaseObserveBound/, "release metadata must have one canonical owner");
assert.ok(index.includes(`./liquid-glass.css?v=${query}`), "index must statically load liquid-glass.css");
assert.ok(worker.includes(`./liquid-glass.css?v=${query}`), "service worker must precache static liquid-glass.css");
assert.match(mobileSource, /html body #settings :is\(button, summary, \[role="tab"\]\)[\s\S]*min-width:\s*35px/, "Settings phone controls must use the approved 35px compact contract");
assert.doesNotMatch(phoneFinance, /phoneSettingsTouchContract|installPhoneSettingsTouchContract/, "phone runtime must keep the Settings touch contract out of JavaScript");
assert.match(headerTools, /function installQuickEntryToolsMenuRelocation\(\)/);
assert.match(headerTools, /function installHeaderToolsRelocation\(\)/);
assert.match(cashFlow, /function renderAnalytics\(force = false\)/);
assert.match(cashFlow, /function comparisonCopy\(current, previous\)/);
assert.match(cashFlow, /function rangeMonths\(rangeValue = activeRange, month = anchorMonth\(\)\)/);
assert.match(cashFlow, /FinanceIncomeExpensesDashboard/);
assert.match(cashFlow, /income-expenses-chart-card/);

for (const file of ["pwa-update.js", "phone-finance-compat.js", "header-tools-compat.js", "cash-flow-summary.js", "import-formats.js", "import-center.js", "import-center.css"]) {
  assert.ok(index.includes(`./${file}?v=${query}`), `index must load ${file}`);
  assert.ok(worker.includes(`./${file}?v=${query}`), `service worker must precache ${file}`);
}
assert.ok(index.includes(`./finance-transaction-diagnostics.js?v=${accountIntegrityQuery}`), "index must load verified persistence diagnostics on the Account Integrity asset query");
assert.ok(worker.includes(`./finance-transaction-diagnostics.js?v=${accountIntegrityQuery}`), "service worker must precache verified persistence diagnostics on the Account Integrity asset query");
assert.ok(index.includes(`./finance-integrity.js?v=${accountIntegrityQuery}`), "index must load finance-integrity on the Account Integrity asset query");
assert.ok(worker.includes(`./finance-integrity.js?v=${accountIntegrityQuery}`), "service worker must precache finance-integrity on the Account Integrity asset query");
assert.ok(index.includes(`./account-ledger.js?v=${accountIntegrityQuery}`), "index must load account-ledger on the Account Integrity asset query");
assert.ok(worker.includes(`./account-ledger.js?v=${accountIntegrityQuery}`), "service worker must precache account-ledger on the Account Integrity asset query");
assert.ok(worker.includes(`./account-submit-compat.js?v=${accountIntegrityQuery}`), "service worker must precache account-submit-compat on the Account Integrity asset query");
assert.ok(worker.includes(`./cloud-sync.js?v=${accountIntegrityQuery}`), "service worker must precache cloud-sync on the Account Integrity asset query");
assert.ok(worker.includes(`./cloud-sync-lifecycle.js?v=${accountIntegrityQuery}`), "service worker must precache cloud-sync-lifecycle on the Account Integrity asset query");
assert.match(index, /Account maintenance is unavailable\. Reload Talaan before changing account balances\./, "legacy account forms must delegate to the mutation owner and fail closed if it is unavailable");
assert.match(worker, /url\.pathname\.endsWith\("finance-transaction-diagnostics\.js"\)/);
assert.match(worker, /url\.pathname\.endsWith\("finance-integrity\.js"\)/);
assert.match(worker, /url\.pathname\.endsWith\("account-ledger\.js"\)/);
assert.match(worker, /url\.pathname\.endsWith\("account-submit-compat\.js"\)/);
assert.match(worker, /url\.pathname\.endsWith\("cloud-sync\.js"\)/);
assert.match(transactionDiagnostics, /verifiedPersistenceBarrier:true/);
assert.match(transactionDiagnostics, /rollbackCoalescing:true/);
assert.match(transactionDiagnostics, /cloudQueueAfterVerification:true/);
assert.match(transactionDiagnostics, /technicalOnlyDiagnostics:true/);
assert.match(transactionDiagnostics, /finance:verified-data-persisted/);
assert.match(transactionDiagnostics, /FinanceCloudSyncInternals/);
assert.match(transactionDiagnostics, /handlePersistedData/);
assert.match(accountLedger, /accountReconciliationOwner:true/);
assert.match(accountLedger, /transactionalAccountCorrection:true/);
assert.match(accountLedger, /profileVerifiedAccountCorrection:true/);
assert.match(accountLedger, /singleAccountMutationOwner:true/);
assert.match(accountLedger, /accountMutationInvariants:true/);
assert.match(accountLedger, /window\.FinanceAccountMutations =/);
assert.match(accountLedger, /function runAccountMutation\(/);
assert.match(accountLedger, /function accountMutationInvariantReport\(/);
assert.match(accountLedger, /function runLedgerTransaction\(/);
assert.match(accountLedger, /function moneyMutationInvariantReport\(/);
assert.match(accountLedger, /window\.FinanceLedgerTransactions = Object\.freeze/);
assert.match(accountLedger, /typeof persistFinanceDataRaw !== "function"/);
assert.match(accountLedger, /const saved = persistFinanceDataRaw\(message\)/);
assert.match(accountLedger, /if \(!moneyMutationCanWrite\(\)\) return \{ ok:false, reason:"read-only" \};/);
assert.match(accountSubmitCompat, /ledgerGuard:true/);
assert.match(accountSubmitCompat, /guardLedgerBackedAccountSubmit/);

assert.match(worker, /networkFirstCriticalAsset/);
assert.match(worker, /url\.pathname\.endsWith\("pwa-update\.js"\)/);
for (const file of ["finance-transaction-diagnostics.js", "budget-planning.js", "productivity-tools.js", "application-help.js", "desktop-ux.css"]) {
  assert.ok(worker.includes(`url.pathname.endsWith("${file}")`), `${file} must use network-first delivery`);
}
assert.match(worker, /url\.pathname\.endsWith\("production-ui-audit\.css"\)/);
assert.match(worker, /url\.pathname\.endsWith\("mobile\.css"\)/);
assert.match(worker, /url\.pathname\.endsWith\("black-canvas\.css"\)/);
assert.match(worker, /url\.pathname\.endsWith\("import-center\.js"\)/);
assert.match(worker, /url\.pathname\.endsWith\("import-formats\.js"\)/);
assert.match(worker, /url\.pathname\.endsWith\("import-center\.css"\)/);
assert.match(worker, /url\.pathname\.endsWith\("repeat-monthly-off\.png"\)/);
assert.match(worker, /url\.pathname\.endsWith\("repeat-monthly-on\.png"\)/);
assert.ok(worker.includes(version.cacheVersion));

console.log("Talaan PWA update, verified finance persistence delivery, service-worker runtime ownership, and cache refresh validated.");
