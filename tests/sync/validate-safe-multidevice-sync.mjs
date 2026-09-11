#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const cloud = read("cloud-sync.js");
const worker = read("sw.js");
const resolution = read("cloud-conflict-resolution.js");
const review = read("cloud-conflict-review.js");
const version = JSON.parse(read("version.json"));
const accountIntegritySources = ["assets/js/finance-transaction-diagnostics.js","assets/js/finance-integrity.js","assets/js/account-ledger.js","assets/js/account-submit-compat.js","assets/js/cloud-sync.js","assets/js/cloud-sync-lifecycle.js"];
const accountIntegrityHash = crypto.createHash("sha256");
for (const file of accountIntegritySources) { accountIntegrityHash.update(`${file}\0`); accountIntegrityHash.update(fs.readFileSync(path.join(root, file))); }
const accountIntegrityQuery = `2.5.0-account-${accountIntegrityHash.digest("hex").slice(0, 12)}`;

for (const file of ["cloud-sync.js","cloud-conflict-resolution.js","cloud-conflict-review.js","sw.js"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding:"utf8" });
  assert(result.status === 0, `${file} syntax check failed: ${result.stderr || result.stdout}`);
}

assert(version.version === "2.5.0", "Talaan release version is not V2.5.0");
assert(cloud.includes("function reconcilePendingWithRemote"), "multi-device reconciliation helper is missing");
assert(cloud.includes("threeWayMerge(basePayload, local.payload, row.payload"), "non-overlapping device/cloud changes are not three-way merged");
assert(cloud.includes('local.status = "conflict"'), "overlapping changes are not preserved as explicit conflicts");
assert(cloud.includes("Safely merged non-overlapping changes from another device."), "safe merge state is not recorded");
assert(!cloud.includes("function adoptExistingCloudConflicts()"), "old auto-discard conflict recovery is still present");
assert(cloud.includes("function recoverStoredConflicts()"), "stored conflicts are not preserved across upgrade");
assert(cloud.includes("function recoverPendingConflicts()"), "orphaned queued conflicts are not reconstructed for review");
assert(cloud.includes("function recoverPendingConflictFromCloud"), "orphaned queued conflicts cannot reload a missing cloud snapshot");
assert(cloud.includes("Cloud snapshot returned"), "cloud snapshot recovery does not report an unsuccessful read");
assert(cloud.includes("This queued conflict is missing its cloud snapshot."), "incomplete queued conflicts do not explain why review cannot continue");
assert(cloud.includes('function keepLocal(key) { return resolveConflict(key,"device"); }'), "Use this device does not select the device version");
assert(cloud.includes("onUseDevice:token=>keepLocal(keyFromToken(token))"), "conflict review still routes Use this device to cloud");
assert(!cloud.includes("onUseDevice:token=>discardLocal"), "legacy Use this device discard path remains");
assert(resolution.includes("choice === \"device\""), "resolution helper cannot rebase a chosen device record");
assert(review.includes('data-conflict-review-action="device"'), "conflict review has no Use this device action");
assert(review.includes("if (dialog.open) dialog.close();"), "conflict review cannot safely reopen an already open dialog");
assert(cloud.includes("function replaceCloudWithThisDevice()"), "protected device-to-cloud recovery action is missing");
assert(cloud.includes('recoveryPoint("Before replacing cloud from this device")'), "device-to-cloud recovery does not create a recovery point first");
assert(cloud.includes("Make this device the current cloud copy"), "device-to-cloud recovery control is missing");
assert(cloud.includes("Reading current cloud revisions first"), "sync does not communicate pull-before-push ordering");
const syncStart = cloud.indexOf("async function syncNow");
const firstPull = cloud.indexOf("await pullChanges();", syncStart);
const pushLoop = cloud.indexOf("while (Object.values(pending)", syncStart);
assert(syncStart >= 0 && firstPull > syncStart && pushLoop > firstPull, "sync must pull current cloud revisions before queued device uploads");
assert(cloud.includes("5*60*1000"), "five-minute routine sync cadence changed");
assert(worker.includes(version.cacheVersion), "PWA cache does not match the current Talaan release");
assert(worker.includes(`asset("./cloud-sync.js?v=${accountIntegrityQuery}")`), "PWA shell does not precache the content-derived account-integrity cloud sync client");
assert(worker.includes('url.pathname.endsWith("cloud-sync.js")'), "cloud-sync is no longer delivered network-first");
assert(worker.includes('new Request(url, { cache:"reload" })'), "PWA precache no longer bypasses stale HTTP cache");

if (failures.length) {
  console.error(`Safe multi-device sync validation failed (${failures.length}):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log("Safe multi-device sync validation passed under Talaan V2.5.0.");
