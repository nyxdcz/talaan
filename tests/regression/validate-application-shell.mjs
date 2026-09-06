import assert from "node:assert/strict";
import fs from "node:fs";

const read = file => fs.readFileSync(file, "utf8");
const index = read("index.html");
const shell = read("assets/css/shell-ui.css");
const app = read("assets/css/app.css");
const sidebar = read("assets/css/sidebar-compact-brand.css");
const help = read("assets/js/ui/application-help.js");
const headerTools = read("assets/js/ui/header-tools-compat.js");
const privacyLock = read("assets/js/privacy-lock.js");
const worker = read("sw.js");
const workflow = read(".github/workflows/quality-pages.yml");
const query = "2.5.0-talaan1";

for (const contract of [".pwa-install-guide-dialog", ".finance-privacy-lock-view", "--nav-active-bg", ".settings-search-panel", "body.sidebar-layout-pinned .main"]) {
  assert.ok(shell.includes(contract), `shell stylesheet must own ${contract}`);
  assert.ok(!app.includes(contract), `app.css must not duplicate ${contract}`);
}
for (const marker of ["const HELP_CONTENT =", "function helpButtonFor", "function setupApplicationHelp", "function openContextHelp"]) {
  assert.ok(help.includes(marker), `Application Help must contain ${marker}`);
}
for (const topic of ["dashboard-overview", "budget-page", "paid-page", "projects-page", "income-page", "settings-salary-work"]) {
  assert.ok(help.includes(`"${topic}"`) || help.includes(`${topic}:`), `Application Help must retain ${topic}`);
}
for (const forbidden of ["function clearAccountDropTargets", "function runLegacyDataMigration", "saveData(", "const SCHEMA_VERSION"]) {
  assert.ok(!help.includes(forbidden), `Application Help crossed a finance-data boundary: ${forbidden}`);
}
assert.ok(!index.includes("const HELP_CONTENT ="));
assert.ok(!index.includes("function setupApplicationHelp"));
for (const marker of ["data-privacy-signin", "Sign in &amp; sync", "handlePrivacySignInSubmit", "financePrivacyInlineSigninStyles", "data-privacy-forgot"]) {
  assert.ok(privacyLock.includes(marker), `privacy lock must retain inline sign-in contract ${marker}`);
}
assert.match(privacyLock, /window\.FinanceCloudSync/);
assert.match(headerTools, /function installQuickEntryToolsMenuRelocation\(\)/);
assert.match(headerTools, /function installHeaderToolsRelocation\(\)/);
for (const file of ["shell-ui.css", "application-help.js", "header-tools-compat.js"]) {
  assert.ok(index.includes(`./${file}?v=${query}`), `index must load ${file}`);
  assert.ok(worker.includes(`./${file}?v=${query}`), `service worker must precache ${file}`);
}
assert.ok(workflow.includes("cp assets/js/ui/*.js _site/"));
assert.ok(workflow.includes("test -f _site/application-help.js"));
assert.ok(app.split(/\r?\n/).length < 5500, "app.css must retain maintainability headroom");

for (const sidebarContract of [
  "--sidebar-compact-expanded-width:185px",
  ".nav-group + .nav-group",
  "margin-top:8px !important",
  "width:min(320px,calc(100vw - 24px)) !important",
  "min-height:48px !important",
  "font-size:12px !important",
  "font-weight:700 !important",
  "border-radius:var(--talaan-control-radius) !important",
  "left:18px !important",
  "right:44px !important",
  "right:8px !important"
]) {
  assert.ok(sidebar.includes(sidebarContract), `sidebar stylesheet must retain ${sidebarContract}`);
}
assert.match(sidebar, /html\[data-theme="light"\] body #sidebar\.sidebar \.nav-button\.active \{[\s\S]*background:rgba\(53,111,209,\.12\) !important/);
assert.match(sidebar, /html\[data-theme="dark"\] body #sidebar\.sidebar \.nav-button\.active \{[\s\S]*background:rgba\(53,111,209,\.22\) !important/);

console.log("Application shell, Help boundaries, header tools, CSS ownership, and sidebar navigation validated.");
