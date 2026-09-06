#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const errors = [];
const warnings = [];
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
const fail = message => errors.push(message);
const warn = message => warnings.push(message);
const CURRENT_VERSION = "2.5.0";
const DISPLAY_VERSION = "V2.5.0";
const BRAND = "Talaan";
const PREVIOUS_BRAND = ["My", "Finance", "Records"].join(" ");

const runtimeCssFiles = [
  "account-ledger.css", "app.css", "shell-ui.css", "black-canvas.css", "budget-planning.css",
  "dashboard-interactions-core.css", "dashboard-interactions.css", "desktop-ui-phase1.css", "desktop-ux.css",
  "liquid-glass.css", "mobile.css", "productivity-tools.css", "production-ui-audit.css", "projects-calendar.css",
  "payees-rules.css", "import-center.css", "net-worth.css", "household-splits.css",
  "reminders-alerts.css", "reports-insights.css", "security-profiles.css", "summary-mascots.css", "ui-icon-alignment.css"
];
const rootJsFiles = [
  "account-ledger.js", "brand-icons.js", "budget-planning.js", "cloud-conflict-resolution.js", "cloud-conflict-review.js",
  "cloud-sync-lifecycle.js", "cloud-sync.js", "form-inputs.js", "interaction-patterns.js", "privacy-lock.js", "productivity-tools.js",
  "payees-rules.js", "import-formats.js", "import-center.js", "net-worth.js", "household-splits.js",
  "projects-calendar.js", "pwa-update.js", "reminders-alerts.js", "reports-insights.js", "security-profiles.js"
];
const featureJsFiles = ["cash-flow-summary.js"];
const uiJsFiles = ["application-help.js", "header-tools-compat.js", "phone-finance-compat.js", "summary-mascots.js", "sync-runtime-compat.js"];
const sourcePathForRuntime = value => {
  const normalized = String(value || "").replace(/^\.\//, "");
  if (runtimeCssFiles.includes(normalized)) return `assets/css/${normalized}`;
  if (featureJsFiles.includes(normalized)) return `assets/js/features/${normalized}`;
  if (uiJsFiles.includes(normalized)) return `assets/js/ui/${normalized}`;
  if (rootJsFiles.includes(normalized)) return `assets/js/${normalized}`;
  return normalized;
};

const requiredFiles = [
  "index.html", "offline.html", "manifest.webmanifest", "version.json", "version.md", "sw.js",
  ...runtimeCssFiles.map(file => `assets/css/${file}`),
  ...rootJsFiles.map(file => `assets/js/${file}`),
  ...featureJsFiles.map(file => `assets/js/features/${file}`),
  ...uiJsFiles.map(file => `assets/js/ui/${file}`),
  "assets/css/expense-compact.css", "assets/js/ui/expense-compact.js",
  "package.json", "package-lock.json", "README.md", "CHANGELOG.md", "PRIVACY.md", "SECURITY.md",
  ".github/workflows/quality-pages.yml", ".github/workflows/release.yml", "scripts/prepare-runtime.mjs", "scripts/run_audit.sh",
  "vendor/supabase.min.js", "sync-config.js", "sync-config.example.js", "tests/run.mjs", "tests/helpers/check-maintainability.mjs"
];
for (const file of requiredFiles) if (!exists(file)) fail(`Missing required file: ${file}`);

let pkg = {}, lock = {}, version = {}, manifest = {};
for (const [file, assign] of [
  ["package.json", value => { pkg = value; }], ["package-lock.json", value => { lock = value; }],
  ["version.json", value => { version = value; }], ["manifest.webmanifest", value => { manifest = value; }]
]) {
  try { assign(JSON.parse(read(file))); } catch (error) { fail(`${file} is invalid JSON: ${error.message}`); }
}
if (pkg.version !== CURRENT_VERSION || lock.version !== CURRENT_VERSION || lock.packages?.[""]?.version !== CURRENT_VERSION || version.version !== CURRENT_VERSION) fail(`Release metadata must stay aligned at ${CURRENT_VERSION}`);
if (pkg.scripts?.["prepare:runtime"] !== "node scripts/prepare-runtime.mjs") fail("prepare:runtime must use only the neutral Talaan runtime preparer");
if (manifest.name !== BRAND || manifest.short_name !== BRAND) fail(`PWA manifest brand must be ${BRAND}`);
for (const icon of manifest.icons || []) if (!exists(icon.src || "")) fail(`Missing manifest icon: ${icon.src || "(empty)"}`);

const html = read("index.html");
const worker = read("sw.js");
if (!html.includes(`<title>${BRAND}</title>`)) fail(`Prepared browser title must be ${BRAND}`);
if (/<title>[^<]*V\d+\.\d+\.\d+[^<]*<\/title>/.test(html)) fail("Prepared browser title must not expose the app version");
if (!html.includes(`const APP_VERSION = "${CURRENT_VERSION}";`)) fail(`Prepared index runtime must be ${DISPLAY_VERSION}`);
if (/\bV(?:11|12|13|14|15)(?:\.\d+)*\b/.test(html)) fail("Prepared index still contains legacy product-version terminology");
if (html.includes(PREVIOUS_BRAND)) fail("Prepared index still contains the superseded product brand");
if (!worker.includes(`const APP_VERSION = "${CURRENT_VERSION}";`)) fail(`Prepared service worker must be ${DISPLAY_VERSION}`);
if (!worker.includes(`const CACHE_VERSION = "${version.cacheVersion}"`)) fail("Prepared service-worker cache must match version.json");

const versionedRuntimeFilenamePattern = /-v(?:1[345])(?:[-.][A-Za-z0-9.-]+)?\.(?:css|js|png|svg)\b/i;
for (const [file, text] of [["index.html", html], ["sw.js", worker]]) if (versionedRuntimeFilenamePattern.test(text)) fail(`${file} still exposes an legacy versioned runtime filename`);

for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
  const value = match[1];
  if (/^(?:https?:|data:|#|javascript:|\$\{)/.test(value)) continue;
  const local = value.split(/[?#]/, 1)[0];
  if (!local) continue;
  const source = sourcePathForRuntime(local);
  if (!exists(source)) fail(`Broken HTML local path: ${value} (source: ${source})`);
}
for (const match of worker.matchAll(/asset\("([^"]+)"\)/g)) {
  const value = match[1];
  const local = value.split("?", 1)[0];
  const source = sourcePathForRuntime(local);
  if (!exists(source)) fail(`Missing service-worker asset: ${value} (source: ${source})`);
}

const workflow = read(".github/workflows/quality-pages.yml");
for (const file of ["dashboard-interactions-core.css", "liquid-glass.css", "ui-icon-alignment.css", "black-canvas.css", "desktop-ui-phase1.css", "desktop-ux.css", "shell-ui.css", "production-ui-audit.css", "summary-mascots.css", "import-center.css", "import-formats.js", "import-center.js", "net-worth.css", "net-worth.js", "household-splits.css", "household-splits.js", "pwa-update.js", "brand-icons.js", "projects-calendar.js", "projects-calendar.css", "mobile.css"]) {
  if (!workflow.includes(`_site/${file}`) && !workflow.includes(`cp assets/css/*.css _site/`) && !workflow.includes(`cp assets/js/*.js _site/`)) fail(`Pages workflow does not validate/package ${file}`);
}

for (const file of ["README.md", "CHANGELOG.md", "CONTRIBUTING.md", "SECURITY.md", "PRIVACY.md", "version.md"]) {
  const text = read(file);
  if (text.includes("V2.0.0") || text.includes(PREVIOUS_BRAND)) fail(`${file} contains superseded current-product identity`);
}
const readmeHeading = read("README.md").split("\n", 1)[0];
const acceptedReadmeHeadings = [`# ${BRAND} · ${DISPLAY_VERSION}`, `# 💰 ${BRAND} · ${DISPLAY_VERSION}`];
if (!acceptedReadmeHeadings.includes(readmeHeading)) fail(`README heading is not ${BRAND} ${DISPLAY_VERSION}`);
if (!read("CHANGELOG.md").startsWith(`# Changelog\n\n## ${DISPLAY_VERSION} · ${BRAND}`)) fail(`CHANGELOG heading is not ${DISPLAY_VERSION} ${BRAND}`);

const repositorySurfaceFiles = [
  "README.md", ".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/config.yml",
  ".github/workflows/release.yml", "docs/architecture/README.md", "docs/setup/CLOUD_SYNC_SETUP.md",
  "docs/assets/repository-social-preview.svg"
];
for (const file of repositorySurfaceFiles) {
  const text = read(file);
  if (text.includes("nyxdcz/my-finance-record") || text.includes(PREVIOUS_BRAND)) fail(`${file} contains outdated public repository branding`);
}
const releaseWorkflow = read(".github/workflows/release.yml");
if (!releaseWorkflow.includes("npm run quality:ci")) fail("Tagged releases must run the complete quality and browser suite");
if (!releaseWorkflow.includes('title "Talaan $GITHUB_REF_NAME"')) fail("Tagged releases must use the Talaan product name");
const socialPreview = read("docs/assets/repository-social-preview.svg");
if (!socialPreview.includes(">TALAAN</text>") || !socialPreview.includes(`>${DISPLAY_VERSION}</text>`)) fail("Repository social preview must show the current Talaan release");
const gitignore = read(".gitignore");
for (const obsolete of ["expense-screenshot-ai.js", "expense-screenshot-detect.js", "expense-screenshot-parser.js"]) if (gitignore.includes(obsolete)) fail(`.gitignore still lists removed runtime output: ${obsolete}`);
for (const generated of ["household-splits.css", "household-splits.js", "import-center.css", "import-center.js", "import-formats.js", "net-worth.css", "net-worth.js", "payees-rules.css", "payees-rules.js"]) if (!gitignore.includes(`/${generated}`)) fail(`.gitignore is missing generated runtime output: ${generated}`);

const syncConfig = read("sync-config.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
if (/sb_secret_|service_role/i.test(syncConfig)) fail("sync-config.js contains a privileged secret pattern");
if (/OPENAI_API_KEY\s*[:=]\s*["'][^"']+/i.test(syncConfig)) fail("sync-config.js must not contain an OpenAI API key");
if (!/sb_publishable_|anon/i.test(syncConfig)) warn("sync-config.js may still require publishable/anon cloud configuration");

if (process.platform !== "win32" && (fs.statSync(path.join(root, "scripts/run_audit.sh")).mode & 0o100) === 0) fail("scripts/run_audit.sh lost its executable bit");

console.log(`Repository inspection: ${errors.length} error(s), ${warnings.length} warning(s)`);
for (const message of errors) console.error(`ERROR: ${message}`);
for (const message of warnings) console.warn(`WARN: ${message}`);
if (errors.length) process.exit(1);
console.log(`Repository inspection passed: active production runtime is ${BRAND} ${DISPLAY_VERSION} with neutral filenames; legacy data/cache identifiers remain compatibility-only.`);
