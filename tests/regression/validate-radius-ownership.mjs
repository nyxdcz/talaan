import assert from "node:assert/strict";
import fs from "node:fs";

const read = file => fs.readFileSync(file, "utf8");
const radius = read("assets/css/ui-radius.css");
const app = read("assets/css/app.css");
const blackCanvas = read("assets/css/black-canvas.css");
const production = read("assets/css/production-ui-audit.css");
const transactions = read("assets/css/transaction-views.css");
const budget = read("assets/css/budget-planning.css");
const sidebar = read("assets/css/sidebar-compact-brand.css");
const accountLedger = read("assets/css/account-ledger.css");
const household = read("assets/css/household-splits.css");
const imports = read("assets/css/import-center.css");
const netWorth = read("assets/css/net-worth.css");
const payees = read("assets/css/payees-rules.css");
const reminders = read("assets/css/reminders-alerts.css");
const security = read("assets/css/security-profiles.css");
const projects = read("assets/css/projects-calendar.css");
const cloudSync = read("assets/js/cloud-sync.js");

for (const token of [
  "--talaan-control-radius: 8px",
  "--talaan-card-radius: 12px",
  "--talaan-section-radius: 16px",
  "--talaan-dialog-radius: 20px",
  "--talaan-popover-radius: 12px"
]) {
  assert.ok(radius.includes(token), `canonical radius stylesheet must retain ${token}`);
}

assert.doesNotMatch(radius, /\.period-card \.record-row,\s*html body #money \.period-card \.record-row/);
assert.doesNotMatch(radius, /\[class\$="-panel"\]|\[class\*="-panel "\]/);
assert.match(app, /dialog \{[^}]*border-radius:var\(--talaan-dialog-radius\);[^}]*overflow:visible;/s);
assert.match(radius, /\.finance-privacy-lock-card,\.finance-device-lock-card\) \{\s*border-radius: var\(--talaan-dialog-radius\) !important/s);
assert.match(radius, /\.cloud-sync-toolbar-popover,\s*\.month-picker-popover,[\s\S]*border-radius: var\(--talaan-popover-radius\) !important/s);
assert.match(radius, /Dashboard and Finance workspace navigation share the card tier\.[\s\S]*#dashboard \.dashboard-view-tabs,#money \.money-workspace-switcher,#income \.money-workspace-switcher,#paid-expenses \.money-workspace-switcher\) \{\s*border-radius: var\(--talaan-card-radius\) !important/s);
assert.match(radius, /#dashboard \.dashboard-view-tabs > \.workspace-switcher-button,#money \.money-workspace-switcher > \.workspace-switcher-button,#income \.money-workspace-switcher > \.workspace-switcher-button,#paid-expenses \.money-workspace-switcher > \.workspace-switcher-button\) \{\s*border-radius: var\(--talaan-card-radius\) !important/s);
assert.match(radius, /:is\(\.dashboard-week-marquee,\.finance-week-marquee,\.work-week-marquee\) \{\s*border-radius: var\(--talaan-card-radius\) !important/s);
assert.match(radius, /:is\(\.dashboard-week-marquee,\.finance-week-marquee,\.work-week-marquee\) \.dashboard-week-day \{\s*border-radius: var\(--talaan-card-radius\) !important/s);
const cardRadiusSelectorBlock = radius.split("/* Structural surfaces", 1)[0];
assert.doesNotMatch(cardRadiusSelectorBlock, /\.dashboard-week-marquee,\s*\.finance-week-marquee,\s*\.work-week-marquee,\s*\.dashboard-week-day,/s);
assert.match(production, /#money \.record-row\[data-expense-row\] > \.desktop-record-actions \{[\s\S]*border-top: 0 !important/);
assert.match(production, /#money \.period-card \{[\s\S]*border-radius: var\(--talaan-card-radius\) !important/);
assert.match(production, /#money \.record-row\[data-expense-row\] > \.desktop-record-actions > \.button \{[\s\S]*border-radius: var\(--talaan-control-radius\)/);
assert.doesNotMatch(blackCanvas, /#money \.period-card|#money \.period-card \.period-header|#money \.period-card \.record-row/);
assert.doesNotMatch(transactions, /section-stack>\.period-card\{border-radius:10px|border-radius:10px!important;overflow:hidden!important/);
assert.doesNotMatch(transactions, /border-radius:calc\(var\(--talaan-control-radius\) - 2px\)/);
assert.match(budget, /\.budget-category-panel,\.cash-forecast-panel \{[^}]*border-radius:var\(--talaan-section-radius\);/);
assert.ok((sidebar.match(/border-radius:var\(--talaan-control-radius\) !important/g) || []).length >= 6);
assert.match(accountLedger, /ledger-summary-grid > div[^}]*border-radius:var\(--talaan-card-radius\)/);
assert.match(household, /\.household-group,.household-empty,.household-split-total,.household-expense-control\{border-radius:var\(--talaan-card-radius\)\}/);
assert.match(imports, /\.import-batch-row,.import-preview-row\{border-radius:var\(--talaan-card-radius\)\}/);
assert.match(netWorth, /\.net-worth-kpis>div,.net-worth-grid>section,.net-worth-item\{border-radius:var\(--talaan-card-radius\)\}/);
assert.match(payees, /\.finance-tool-row,.finance-preview-item\{border-radius:var\(--talaan-card-radius\)\}/);
assert.match(reminders, /\.finance-alert-row\{border-radius:var\(--talaan-card-radius\)\}/);
assert.match(security, /\.finance-device-lock-card\{border-radius:var\(--talaan-dialog-radius\)\}/);
assert.match(projects, /\.finance-kanban-empty[^}]*border-radius:var\(--talaan-control-radius\)/);
assert.match(app, /\.button \{[^}]*border-radius: var\(--talaan-control-radius\)/s);
assert.match(app, /\.account-card \{[^}]*border-radius: var\(--talaan-card-radius\)/s);
assert.match(app, /dialog \{[^}]*border-radius: var\(--talaan-dialog-radius\)/s);
assert.match(cloudSync, /cloud-v3-health-grid>div\{[^}]*border-radius:var\(--talaan-card-radius\)/);
assert.match(cloudSync, /cloud-pending-item\{[^}]*border-radius:var\(--talaan-card-radius\)/);

console.log("Radius tokens are canonical and Finance geometry is owned without clipping overlays.");
