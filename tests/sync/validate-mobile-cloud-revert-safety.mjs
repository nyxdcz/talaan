#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const privacy = read("privacy-lock.js");
const cloud = read("cloud-sync.js");
const worker = read("sw.js");

assert(privacy.includes("Talaan cloud authority guard"), "cloud authority guard is missing");
assert(privacy.includes("simple-finance-cloud-record-base-v3:"), "guard does not inspect the Cloud Sync baseline");
assert(privacy.includes("simple-finance-profile-data-v1:"), "guard does not require established profile-local Finance data");
assert(privacy.includes("const source=meaningfulFinanceData(profileData) ? profileData : activeData"), "profile-scoped saved Finance data is not preferred over the active shell copy");
assert(privacy.includes("localMatchesBase"), "guard does not compare local records with an existing baseline");
assert(privacy.includes("meta.initializedUserId=scope"), "guard does not repair initialized cloud scope before Cloud Sync boots");
assert(privacy.includes("baseRevision:Number(baseline?.revision || 0)"), "stale-baseline local changes are not rebased against the stored revision");
assert(privacy.includes("nextAttemptAt:0"), "protected local changes are not eligible for pull-before-push reconciliation");
assert(privacy.includes("if(!baselinePresent) meta.lastAuditId=0"), "missing baselines do not force cloud audit reconstruction");
assert(privacy.includes("save:persistRecoverySnapshot"), "recovery storage does not expose the pre-sync snapshot path");
assert(privacy.includes("runCloudFirstSyncRecovery"), "first-sync device authority interception is missing");
assert(privacy.includes("replaceCloudWithThisDevice"), "Upload this device does not use the protected cloud replacement path");
assert(privacy.includes("runGuard();\n        const sync=window.FinanceCloudSync?.syncNow"), "resume sync does not re-check local authority before cloud pull");
assert(privacy.includes('window.addEventListener("focus",()=>request("focus"))'), "focus does not request a guarded cloud reconciliation");
assert(privacy.includes('window.addEventListener("pageshow",()=>request("pageshow"))'), "pageshow does not request a guarded cloud reconciliation");
assert(privacy.includes('window.addEventListener("online",()=>request("online"))'), "online recovery does not request a guarded cloud reconciliation");
assert(worker.includes('url.pathname.endsWith("privacy-lock.js")'), "privacy-lock is no longer treated as a critical service-worker asset");
assert(worker.includes("networkFirstCriticalAsset(request, event)"), "critical privacy/sync guard delivery is not network-first");
assert(worker.includes('fetch(request, { cache:"no-store" })'), "critical sync guard fetch can still reuse an HTTP cache entry");

const syncStart = cloud.indexOf("async function syncNow");
const firstPull = cloud.indexOf("await pullChanges();", syncStart);
const pushLoop = cloud.indexOf("while (Object.values(pending)", syncStart);
assert(syncStart >= 0 && firstPull > syncStart && pushLoop > firstPull, "Cloud Sync must still pull current revisions before any pending upload");
assert(cloud.includes("5*60*1000"), "normal five-minute periodic synchronization cadence changed");

if (failures.length) {
  console.error(`Mobile cloud-revert safety validation failed (${failures.length}):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log("Mobile cloud-revert safety validation passed.");
