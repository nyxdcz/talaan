import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const BRAND = "Talaan";
const PREVIOUS_BRAND = ["My", "Finance", "Records"].join(" ");

const RELEASE = Object.freeze({
  version:"2.5.0",
  displayVersion:"V2.5.0",
  name:"Talaan",
  date:"August 28, 2026",
  dateIso:"2026-08-28",
  cache:"finance-v2-20260828-household-splits-r17",
  assetQuery:"2.5.0-talaan1"
});
const APP_STYLE_ASSET_QUERY = "2.5.0-talaan2";
const SIDEBAR_BRAND_ASSET_QUERY = "2.2.0-talaan2";
const UI_RADIUS_ASSET_QUERY = `2.5.0-ui-${crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "assets/css/ui-radius.css"))).digest("hex").slice(0, 12)}`;
const applyUiAssetQuery = source => source
  .replace(/ui-radius\.css\?v=[^"'\s<>)]+/g, `ui-radius.css?v=${UI_RADIUS_ASSET_QUERY}`)
  .replace(/summary-mascots\.css\?v=[^"'\s<>)]+/g, `summary-mascots.css?v=${UI_RADIUS_ASSET_QUERY}`);

const ACCOUNT_INTEGRITY_SOURCES = Object.freeze([
  "assets/js/finance-transaction-diagnostics.js",
  "assets/js/finance-integrity.js",
  "assets/js/account-ledger.js",
  "assets/js/account-submit-compat.js",
  "assets/js/cloud-sync.js",
  "assets/js/cloud-sync-lifecycle.js"
]);
const accountIntegrityHash = crypto.createHash("sha256");
for (const file of ACCOUNT_INTEGRITY_SOURCES) {
  accountIntegrityHash.update(`${file}\0`);
  accountIntegrityHash.update(fs.readFileSync(path.join(root, file)));
}
const ACCOUNT_INTEGRITY_REVISION = accountIntegrityHash.digest("hex").slice(0, 12);
const ACCOUNT_INTEGRITY_ASSET_QUERY = `2.5.0-account-${ACCOUNT_INTEGRITY_REVISION}`;
const ACCOUNT_INTEGRITY_REFRESH_KEY = `finance-account-integrity-${ACCOUNT_INTEGRITY_REVISION}`;

const CURRENT_VERSION_HISTORY = Object.freeze([{
  version:RELEASE.displayVersion,
  title:RELEASE.name,
  changes:[
    "Current production release under the Talaan product name.",
    "Adds household groups, expense-level equal, percentage, and exact shares, payer tracking, member balances, and explicit settlement history.",
    "Counts only the owner's allocated share in personal expense totals while preserving the full amount actually paid in Account Ledger cash movements.",
    "Keeps settlements separate from income, expenses, paid state, and automatic account mutations, with recovery snapshots and Undo for material changes.",
    "Uses responsibility-based runtime filenames instead of legacy product-era filenames.",
    "Includes the complete local-first Finance workspace, Account Ledger, budgeting, reports, projects, productivity tools, reminders, and responsive desktop and phone layouts.",
    "Includes encrypted multi-profile Cloud Schema V3 synchronization, offline PWA support, recovery safeguards, and five-minute routine sync.",
    "Hardens Account Ledger balance corrections with transactional persistence, Viewer protection, profile verification, and fresh PWA delivery for account and sync runtimes.",
    "Queues account-changing Cloud Sync records only after verified local/profile persistence and records technical-only transaction diagnostics.",
    "Preserves Finance Schema 12, Cloud Schema V3, account balances, paid state, recurrence, project payments, backups, encryption, persistent storage identifiers, and synchronization behavior."
  ]
}]);

const runtimeGroups = {
  "assets/css": [
    "account-ledger.css",
    "app.css",
    "shell-ui.css",
    "sidebar-compact-brand.css",
    "black-canvas.css",
    "budget-planning.css",
    "dashboard-interactions-core.css",
    "dashboard-interactions.css",
    "desktop-ui-phase1.css",
    "desktop-ux.css",
    "liquid-glass.css",
    "mobile.css",
    "productivity-tools.css",
    "payees-rules.css",
    "import-center.css",
    "transaction-views.css",
    "privacy-display.css",
    "production-ui-audit.css",
    "projects-calendar.css",
    "reminders-alerts.css",
    "reports-insights.css",
    "net-worth.css",
    "household-splits.css",
    "security-profiles.css",
    "summary-mascots.css",
    "ui-radius.css",
    "ui-icon-alignment.css"
  ],
  "assets/js": [
    "finance-transaction-diagnostics.js",
    "finance-integrity.js",
    "account-ledger.js",
    "account-submit-compat.js",
    "brand-icons.js",
    "budget-planning.js",
    "cloud-conflict-resolution.js",
    "cloud-conflict-review.js",
    "cloud-sync-lifecycle.js",
    "cloud-sync.js",
    "form-inputs.js",
    "interaction-patterns.js",
    "privacy-lock.js",
    "productivity-tools.js",
    "payees-rules.js",
    "import-formats.js",
    "import-center.js",
    "transaction-views.js",
    "privacy-display.js",
    "projects-calendar.js",
    "pwa-update.js",
    "reminders-alerts.js",
    "reports-insights.js",
    "net-worth.js",
    "household-splits.js",
    "security-profiles.js"
  ],
  "assets/js/features": ["cash-flow-summary.js"],
  "assets/js/ui": [
    "application-help.js",
    "header-tools-compat.js",
    "phone-finance-compat.js",
    "summary-mascots.js",
    "sync-runtime-compat.js"
  ]
};


let changed = 0;
const writeIfChanged = (target, content) => {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (fs.existsSync(target) && Buffer.compare(next, fs.readFileSync(target)) === 0) return false;
  fs.writeFileSync(target, next);
  changed += 1;
  return true;
};

for (const [sourceDirectory, files] of Object.entries(runtimeGroups)) {
  for (const file of files) {
    const source = path.join(root, sourceDirectory, file);
    const target = path.join(root, file);
    if (!fs.existsSync(source)) throw new Error(`Missing runtime source: ${path.relative(root, source)}`);
    writeIfChanged(target, fs.readFileSync(source));
  }
}

function appendRuntimeOverlay(targetFile, overlayFile, marker) {
  const target = path.join(root, targetFile);
  const overlay = path.join(root, overlayFile);
  if (!fs.existsSync(target)) throw new Error(`Missing runtime target: ${targetFile}`);
  if (!fs.existsSync(overlay)) throw new Error(`Missing runtime overlay: ${overlayFile}`);
  const base = fs.readFileSync(target, "utf8").replace(new RegExp(`\\n?${marker}[\\s\\S]*$`), "").trimEnd();
  const overlayText = fs.readFileSync(overlay, "utf8").trim();
  writeIfChanged(target, `${base}\n\n${marker}\n${overlayText}\n`);
}

appendRuntimeOverlay(
  "production-ui-audit.css",
  "assets/css/expense-compact.css",
  "/* TALAAN RUNTIME OVERLAY */"
);
appendRuntimeOverlay(
  "phone-finance-compat.js",
  "assets/js/ui/expense-compact.js",
  "/* TALAAN RUNTIME OVERLAY */"
);

function patchTextFile(file, transform) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) throw new Error(`Missing release file: ${file}`);
  const current = fs.readFileSync(target, "utf8");
  writeIfChanged(target, transform(current));
}

const runtimeJsTargets = [...new Set(Object.values(runtimeGroups).flat().filter(file => file.endsWith(".js")))];
for (const file of runtimeJsTargets) {
  patchTextFile(file, source => source
    .replaceAll(PREVIOUS_BRAND, BRAND)
    .replaceAll("Finance Records installed", `${BRAND} installed`));
}


patchTextFile("pwa-update.js", source => source
  .replace(/const CURRENT_CACHE_VERSION = "finance-v[^"]+";/, `const CURRENT_CACHE_VERSION = "${RELEASE.cache}";`)
  .replace(/const ACCOUNT_INTEGRITY_REFRESH_KEY = "[^"]+";/, `const ACCOUNT_INTEGRITY_REFRESH_KEY = "${ACCOUNT_INTEGRITY_REFRESH_KEY}";`)
  .replace(/const ACCOUNT_INTEGRITY_ASSET_QUERY = "[^"]+";/, `const ACCOUNT_INTEGRITY_ASSET_QUERY = "${ACCOUNT_INTEGRITY_ASSET_QUERY}";`));

patchTextFile("summary-mascots.css", source => source
  .replace(/\.\/ui-radius\.css\?v=[^"')]+/g, `./ui-radius.css?v=${UI_RADIUS_ASSET_QUERY}`));

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeRuntimeReferences = source => {
  let next = source;
  const queryFiles = new Set([
    ...Object.values(runtimeGroups).flat(),
    "phone-finance-compat.js",
    "sync-runtime-compat.js"
  ]);
  for (const file of queryFiles) {
    next = next.replace(new RegExp(`${escapeRegExp(file)}\\?v=[^\"'\\s<>)]+`, "g"), `${file}?v=${RELEASE.assetQuery}`);
  }
  return next;
};
const normalizeReleaseAssetQuery = source => source.replace(
  /\?v=\d+\.\d+\.\d+-talaan\d+/g,
  `?v=${RELEASE.assetQuery}`
);

const applyAccountIntegrityAssetQuery = source => source
  .replace(/finance-transaction-diagnostics\.js\?v=[^\"'\s<>)]+/g, `finance-transaction-diagnostics.js?v=${ACCOUNT_INTEGRITY_ASSET_QUERY}`)
  .replace(/finance-integrity\.js\?v=[^\"'\s<>)]+/g, `finance-integrity.js?v=${ACCOUNT_INTEGRITY_ASSET_QUERY}`)
  .replace(/account-ledger\.js\?v=[^\"'\s<>)]+/g, `account-ledger.js?v=${ACCOUNT_INTEGRITY_ASSET_QUERY}`)
  .replace(/account-submit-compat\.js\?v=[^\"'\s<>)]+/g, `account-submit-compat.js?v=${ACCOUNT_INTEGRITY_ASSET_QUERY}`)
  .replace(/cloud-sync\.js\?v=[^\"'\s<>)]+/g, `cloud-sync.js?v=${ACCOUNT_INTEGRITY_ASSET_QUERY}`)
  .replace(/cloud-sync-lifecycle\.js\?v=[^\"'\s<>)]+/g, `cloud-sync-lifecycle.js?v=${ACCOUNT_INTEGRITY_ASSET_QUERY}`);

patchTextFile("index.html", source => {
  let next = applyUiAssetQuery(applyAccountIntegrityAssetQuery(normalizeReleaseAssetQuery(normalizeRuntimeReferences(source))))
  if (!next.includes("finance-transaction-diagnostics.js")) {
    next = next.replace(
      /(<script src="\.\/security-profiles\.js\?v=[^"]+"><\/script>)/,
      `<script src="./finance-transaction-diagnostics.js?v=${ACCOUNT_INTEGRITY_ASSET_QUERY}"></script>\n  $1`
    );
  }
  if (!next.includes("finance-integrity.js")) {
    next = next.replace(/(<script src="\.\/account-ledger\.js\?v=[^"]+"><\/script>)/, `<script src="./finance-integrity.js?v=${ACCOUNT_INTEGRITY_ASSET_QUERY}"></script>\n  $1`);
  }
  next = next
    .replace(/app\.css\?v=[^"']+/, `app.css?v=${APP_STYLE_ASSET_QUERY}`)
    .replaceAll(PREVIOUS_BRAND, BRAND)
    .replaceAll("Finance Records installed", `${BRAND} installed`)
    .replaceAll("My_Finance_Records_Calendar_Test.ics", "Talaan_Calendar_Test.ics")
    .replace(/<meta name="application-name" content="[^"]+">/, `<meta name="application-name" content="${BRAND}">`)
    .replace(/<meta name="apple-mobile-web-app-title" content="[^"]+">/, `<meta name="apple-mobile-web-app-title" content="${BRAND}">`)
    .replace(/<title>[^<]+<\/title>/, `<title>${BRAND}</title>`)
    .replace(/<small id="buildBadge" title="[^"]+">V\d+\.\d+\.\d+<\/small>/, `<small id="buildBadge" title="${RELEASE.displayVersion} · ${RELEASE.name} · ${RELEASE.date}">${RELEASE.displayVersion}</small>`)
    .replace(/const APP_VERSION = "\d+\.\d+\.\d+";/, `const APP_VERSION = "${RELEASE.version}";`)
    .replace(/const APP_RELEASE_NAME = "[^"]+";/, `const APP_RELEASE_NAME = "${RELEASE.name}";`)
    .replace(/const APP_RELEASE_DATE = "[^"]+";/, `const APP_RELEASE_DATE = "${RELEASE.date}";`)
    .replace(/const APP_CACHE_VERSION = "finance-v[^"]+";/, `const APP_CACHE_VERSION = "${RELEASE.cache}";`);

  const brandMarkup = `<div class="brand">\n        <img class="talaan-brand-logo" src="./icons/talaan-brand-logo.png?v=${SIDEBAR_BRAND_ASSET_QUERY}" alt="" aria-hidden="true">\n        <strong>${BRAND}</strong>\n      </div>`;
  next = next.replace(
    /<div class="brand">\s*(?:<img[^>]*class="talaan-brand-logo"[^>]*>\s*)?<strong>Talaan<\/strong>\s*<\/div>/,
    brandMarkup
  );

  const sidebarCssTag = `<link rel="stylesheet" href="./sidebar-compact-brand.css?v=${SIDEBAR_BRAND_ASSET_QUERY}">`;
  if (!next.includes("sidebar-compact-brand.css")) {
    next = next.replace(
      /(<link rel="stylesheet" href="\.\/shell-ui\.css\?v=[^"]+">)/,
      `$1\n  ${sidebarCssTag}`
    );
  } else {
    next = next.replace(/sidebar-compact-brand\.css\?v=[^"']+/, `sidebar-compact-brand.css?v=${SIDEBAR_BRAND_ASSET_QUERY}`);
  }

  const cssTag = `<link rel="stylesheet" href="./summary-mascots.css?v=${RELEASE.assetQuery}">`;
  if (!next.includes("summary-mascots.css")) {
    next = next.replace(
      /(<link rel="stylesheet" href="\.\/production-ui-audit\.css\?v=[^"]+">)/,
      `$1\n  ${cssTag}`
    );
  }
  const jsTag = `<script src="./summary-mascots.js?v=${RELEASE.assetQuery}"></script>`;
  if (!next.includes("summary-mascots.js")) {
    next = next.replace(
      /(<script src="\.\/phone-finance-compat\.js\?v=[^"]+"><\/script>)/,
      `$1\n  ${jsTag}`
    );
  }

  const historySource = `    const VERSION_HISTORY = ${JSON.stringify(CURRENT_VERSION_HISTORY)};`;
  next = next.replace(
    /    const VERSION_HISTORY = \[[\s\S]*?\n\n    function normalizeSettingsPanelKey\(/,
    `${historySource}\n\n    function normalizeSettingsPanelKey(`
  );
  next = next.replace(
    /<h3>Version history<\/h3><p>[^<]*<\/p>/,
    "<h3>Version history</h3><p>Latest release details</p>"
  );
  if (next.includes(PREVIOUS_BRAND)) throw new Error("Prepared index still contains the superseded display brand.");
  return next;
});

patchTextFile("manifest.webmanifest", source => {
  const manifest = JSON.parse(source);
  manifest.name = BRAND;
  manifest.short_name = BRAND;
  manifest.description = "Talaan is a local-first personal and household finance PWA for income, expenses, budgets, projects, payments, calendar planning, savings, and financial reports.";
  return `${JSON.stringify(manifest, null, 2)}\n`;
});

patchTextFile("offline.html", source => source
  .replaceAll(PREVIOUS_BRAND, BRAND)
  .replaceAll("Finance Records", BRAND)
  .replace(/<title>[^<]+ · Offline<\/title>/, `<title>${BRAND} · Offline</title>`)
  .replace(/Open [^<]+<\/button>/, `Open ${BRAND}</button>`));

patchTextFile("sw.js", source => {
  let next = applyUiAssetQuery(applyAccountIntegrityAssetQuery(normalizeReleaseAssetQuery(normalizeRuntimeReferences(source))))
    .replace(/app\.css\?v=[^"')]+/, `app.css?v=${APP_STYLE_ASSET_QUERY}`)
    .replace(/sidebar-compact-brand\.css\?v=[^"')]+/g, `sidebar-compact-brand.css?v=${SIDEBAR_BRAND_ASSET_QUERY}`)
    .replace(
      /(?:url\.pathname\.endsWith\("sidebar-compact-brand\.css"\) \|\| )*url\.pathname\.endsWith\("ui-icon-alignment\.css"\) \|\|/,
      'url.pathname.endsWith("sidebar-compact-brand.css") || url.pathname.endsWith("ui-icon-alignment.css") ||'
    )
    .replace(/const APP_VERSION = "\d+\.\d+\.\d+";/, `const APP_VERSION = "${RELEASE.version}";`)
    .replace(/const CACHE_VERSION = "finance-v[^"]+";/, `const CACHE_VERSION = "${RELEASE.cache}";`)
    .replaceAll("Open My Finance Records", `Open ${BRAND}`);

  if (!next.includes('asset("./finance-transaction-diagnostics.js')) {
    next = next.replace(
      /(asset\("\.\/finance-integrity\.js\?v=[^"')]+"\),)/,
      `asset("./finance-transaction-diagnostics.js?v=${ACCOUNT_INTEGRITY_ASSET_QUERY}"),\n  $1`
    );
  }
  if (!next.includes('asset("./finance-integrity.js')) {
    next = next.replace(
      /(asset\("\.\/account-ledger\.js\?v=[^"')]+"\),)/,
      `asset("./finance-integrity.js?v=${ACCOUNT_INTEGRITY_ASSET_QUERY}"),\n  $1`
    );
  }
  if (!next.includes('asset("./account-submit-compat.js')) {
    next = next.replace(
      /(asset\("\.\/account-ledger\.js\?v=[^"')]+"\),)/,
      `$1\n  asset("./account-submit-compat.js?v=${ACCOUNT_INTEGRITY_ASSET_QUERY}"),`
    );
  }
  if (!next.includes('url.pathname.endsWith("account-ledger.js")')) {
    next = next.replace(
      'url.pathname.endsWith("cloud-sync-lifecycle.js") || url.pathname.endsWith("interaction-patterns.js") ||',
      'url.pathname.endsWith("cloud-sync-lifecycle.js") || url.pathname.endsWith("cloud-sync.js") || url.pathname.endsWith("account-ledger.js") || url.pathname.endsWith("account-submit-compat.js") || url.pathname.endsWith("interaction-patterns.js") ||'
    );
  }
  if (!next.includes('url.pathname.endsWith("finance-integrity.js")')) {
    next = next.replace(
      'url.pathname.endsWith("cloud-sync.js") || url.pathname.endsWith("account-ledger.js") ||',
      'url.pathname.endsWith("cloud-sync.js") || url.pathname.endsWith("finance-integrity.js") || url.pathname.endsWith("account-ledger.js") ||'
    );
  }
  if (!next.includes('url.pathname.endsWith("finance-transaction-diagnostics.js")')) {
    next = next.replace(
      'url.pathname.endsWith("finance-integrity.js") || url.pathname.endsWith("account-ledger.js") ||',
      'url.pathname.endsWith("finance-transaction-diagnostics.js") || url.pathname.endsWith("finance-integrity.js") || url.pathname.endsWith("account-ledger.js") ||'
    );
  }
  return next;
});


const lockPath = path.join(root, "package-lock.json");
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.version = RELEASE.version;
  if (lock.packages?.[""]) lock.packages[""].version = RELEASE.version;
  writeIfChanged(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

const changelogPath = path.join(root, "CHANGELOG.md");
if (fs.existsSync(changelogPath)) {
  const changelog = fs.readFileSync(changelogPath, "utf8");
  const heading = `## ${RELEASE.displayVersion} · ${RELEASE.name}`;
  if (!changelog.includes(heading)) throw new Error(`CHANGELOG.md must describe the current ${RELEASE.displayVersion} release.`);
}

console.log(`Talaan runtime ready for ${RELEASE.displayVersion}${changed ? ` · refreshed ${changed}` : ""}.`);
