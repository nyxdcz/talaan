"use strict";
const APP_VERSION = "2.5.0";
self.__FINANCE_APP_VERSION = APP_VERSION;
const CACHE_VERSION = "finance-v2-20260828-household-splits-r17";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
// Persistent IndexedDB name is intentionally retained so existing saved data remains available after the product rename.
const DB_NAME = "simple-finance-project-records-v12-db";
const DB_VERSION = 2;
let financeAuthState = "signed-out";

const scopeUrl = self.registration.scope;
const asset = path => new URL(path, scopeUrl).toString();
const APP_SHELL = [
  asset("./index.html"),
  asset("./offline.html"),
  asset("./manifest.webmanifest"),
  asset("./version.json"),
  asset("./app.css?v=2.5.0-talaan2"),
  asset("./shell-ui.css?v=2.5.0-talaan1"),
  asset("./dashboard-interactions.css?v=2.5.0-talaan1"),
  asset("./ui-icon-alignment.css?v=2.5.0-talaan1"),
  asset("./black-canvas.css?v=2.5.0-talaan1"),
  asset("./desktop-ui-phase1.css?v=2.5.0-talaan1"),
  asset("./desktop-ux.css?v=2.5.0-talaan1"),
  asset("./production-ui-audit.css?v=2.5.0-talaan1"),
  asset("./summary-mascots.css?v=2.5.0-ui-e0c1fb9945cf"),
  asset("./form-inputs.js?v=2.5.0-talaan1"),
  asset("./application-help.js?v=2.5.0-talaan1"),
  asset("./pwa-update.js?v=2.5.0-talaan1"),
  asset("./brand-icons.js?v=2.5.0-talaan1"),
  asset("./phone-finance-compat.js?v=2.5.0-talaan1"),
  asset("./summary-mascots.js?v=2.5.0-talaan1"),
  asset("./cash-flow-summary.js?v=2.5.0-talaan1"),
  asset("./header-tools-compat.js?v=2.5.0-talaan1"),
  asset("./dashboard-interactions-core.css?v=2.5.0-talaan1"),
  asset("./liquid-glass.css?v=2.5.0-talaan1"),
  asset("./mobile.css?v=2.5.0-talaan1"),
  asset("./interaction-patterns.js?v=2.5.0-talaan1"),
  asset("./privacy-lock.js?v=2.5.0-talaan1"),
  asset("./security-profiles.js?v=2.5.0-talaan1"),
  asset("./security-profiles.css?v=2.5.0-talaan1"),
  asset("./cloud-conflict-review.js?v=2.5.0-talaan1"),
  asset("./cloud-conflict-resolution.js?v=2.5.0-talaan1"),
  asset("./cloud-sync-lifecycle.js?v=2.5.0-account-b70450d0b1ee"),
  asset("./cloud-sync.js?v=2.5.0-account-b70450d0b1ee"),
  asset("./finance-transaction-diagnostics.js?v=2.5.0-account-b70450d0b1ee"),
  asset("./finance-integrity.js?v=2.5.0-account-b70450d0b1ee"),
  asset("./account-ledger.js?v=2.5.0-account-b70450d0b1ee"),
  asset("./account-submit-compat.js?v=2.5.0-account-b70450d0b1ee"),
  asset("./account-ledger.css?v=2.5.0-talaan1"),
  asset("./budget-planning.js?v=2.5.0-talaan1"),
  asset("./budget-planning.css?v=2.5.0-talaan1"),
  asset("./reports-insights.js?v=2.5.0-talaan1"),
  asset("./reports-insights.css?v=2.5.0-talaan1"),
  asset("./net-worth.js?v=2.5.0-talaan1"),
  asset("./net-worth.css?v=2.5.0-talaan1"),
  asset("./household-splits.js?v=2.5.0-talaan1"),
  asset("./household-splits.css?v=2.5.0-talaan1"),
  asset("./productivity-tools.js?v=2.5.0-talaan1"),
  asset("./productivity-tools.css?v=2.5.0-talaan1"),
  asset("./payees-rules.js?v=2.5.0-talaan1"),
  asset("./payees-rules.css?v=2.5.0-talaan1"),
  asset("./import-formats.js?v=2.5.0-talaan1"),
  asset("./import-center.js?v=2.5.0-talaan1"),
  asset("./import-center.css?v=2.5.0-talaan1"),
  asset("./transaction-views.js?v=2.5.0-talaan1"),
  asset("./transaction-views.css?v=2.5.0-talaan1"),
  asset("./privacy-display.js?v=2.5.0-talaan1"),
  asset("./privacy-display.css?v=2.5.0-talaan1"),
  asset("./reminders-alerts.js?v=2.5.0-talaan1"),
  asset("./reminders-alerts.css?v=2.5.0-talaan1"),
  asset("./projects-calendar.js?v=2.5.0-talaan1"),
  asset("./projects-calendar.css?v=2.5.0-talaan1"),
  asset("./sync-config.js?v=2.5.0-talaan1"),
  asset("./sync-runtime-compat.js?v=2.5.0-talaan1"),
  asset("./vendor/supabase.min.js"),
  asset("./icons/icon-192-logo2.png"),
  asset("./icons/icon-512-logo2.png"),
  asset("./icons/icon-maskable-512-logo2.png"),
  asset("./icons/apple-touch-icon-logo2.png"),
  asset("./icons/favicon-32-logo2.png"),
  asset("./icons/action-add-record.png"),
  asset("./icons/action-add-widget.png"),
  asset("./icons/customize-dashboard.png"),
  asset("./icons/action-add-sparkle.png"),
  asset("./icons/repeat-monthly-off.png?v=2.5.0-talaan1"),
  asset("./icons/repeat-monthly-on.png?v=2.5.0-talaan1"),
  asset("./icons/theme-moon.png"),
  asset("./icons/theme-sun.png"),
  asset("./icons/utility-badge.png"),
  asset("./icons/utility-controls.png"),
  asset("./icons/utility-menu-list.png"),
  asset("./icons/utility-savings.png"),
  asset("./icons/utility-search.png"),
  asset("./icons/utility-sync-status.png"),
  asset("./icons/sync-syncing-alternate.png"),
  asset("./icons/sync-error.png"),
  asset("./icons/sync-success.png"),
  asset("./icons/sync-needs-sync.png"),
  asset("./icons/sync-issue-offline.png"),
  asset("./icons/sync-syncing.png"),
  asset("./icons/sync-synced.png"),
  asset("./icons/theme-night.png"),
  asset("./icons/theme-day.png"),
  asset("./icons/theme-auto.png"),
  asset("./assets/mascots/mascot-red.png?v=2.5.0-talaan1"),
  asset("./assets/mascots/mascot-green.png?v=2.5.0-talaan1"),
  asset("./assets/mascots/mascot-blue.png?v=2.5.0-talaan1"),
  asset("./assets/mascots/mascot-orange.png?v=2.5.0-talaan1")
];

async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  const freshRequests = APP_SHELL.map(url => new Request(url, { cache:"reload" }));
  await cache.addAll(freshRequests);
}

self.addEventListener("install", event => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Compatibility cleanup only: remove caches created by pre-Talaan releases.
    await Promise.all(keys.filter(key => /^finance-v(?:12|13|14|15)-/.test(key) && ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match(asset("./index.html"))) || (await caches.match(asset("./offline.html")));
  }
}

async function cacheFirst(request) {
  const shell = await caches.open(SHELL_CACHE);
  const runtime = await caches.open(RUNTIME_CACHE);
  const cached = (await shell.match(request)) || (await runtime.match(request));
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && new URL(request.url).origin === self.location.origin) runtime.put(request, response.clone());
  return response;
}

async function networkFirstCriticalAsset(request) {
  const shell = await caches.open(SHELL_CACHE);
  const runtime = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request, { cache:"no-store" });
    if (response && response.ok) runtime.put(request, response.clone());
    return response;
  } catch {
    return (await runtime.match(request)) || (await shell.match(request)) || new Response("Offline", { status:503, statusText:"Offline" });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || network || new Response("Offline", { status: 503, statusText: "Offline" });
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith(".css") || url.pathname.endsWith("app.css") || url.pathname.endsWith("privacy-lock.js") || url.pathname.endsWith("privacy-display.js") || url.pathname.endsWith("transaction-views.js") || url.pathname.endsWith("payees-rules.js") || url.pathname.endsWith("import-formats.js") || url.pathname.endsWith("import-center.js") || url.pathname.endsWith("net-worth.js") || url.pathname.endsWith("household-splits.js") || url.pathname.endsWith("cloud-sync-lifecycle.js") || url.pathname.endsWith("cloud-sync.js") || url.pathname.endsWith("finance-transaction-diagnostics.js") || url.pathname.endsWith("finance-integrity.js") || url.pathname.endsWith("account-ledger.js") || url.pathname.endsWith("account-submit-compat.js") || url.pathname.endsWith("interaction-patterns.js") || url.pathname.endsWith("pwa-update.js") || url.pathname.endsWith("budget-planning.js") || url.pathname.endsWith("productivity-tools.js") || url.pathname.endsWith("application-help.js") || url.pathname.endsWith("desktop-ux.css") || url.pathname.endsWith("sidebar-compact-brand.css") || url.pathname.endsWith("ui-icon-alignment.css") || url.pathname.endsWith("mobile.css") || url.pathname.endsWith("production-ui-audit.css") || url.pathname.endsWith("budget-planning.css") || url.pathname.endsWith("black-canvas.css") || url.pathname.endsWith("transaction-views.css") || url.pathname.endsWith("privacy-display.css") || url.pathname.endsWith("payees-rules.css") || url.pathname.endsWith("import-center.css") || url.pathname.endsWith("net-worth.css") || url.pathname.endsWith("household-splits.css") || url.pathname.endsWith("summary-mascots.css") || url.pathname.endsWith("summary-mascots.js") || url.pathname.endsWith("repeat-monthly-off.png") || url.pathname.endsWith("repeat-monthly-on.png")) {
    event.respondWith(networkFirstCriticalAsset(request));
    return;
  }
  if (url.pathname.endsWith("version.json") || url.pathname.endsWith("manifest.webmanifest")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

self.addEventListener("message", event => {
  if (event.data?.type === "FINANCE_AUTH_STATE") financeAuthState = event.data?.authenticated ? "signed-in" : "signed-out";
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "PRECACHE") event.waitUntil(precache());
  if (event.data?.type === "CLEAR_CACHES") {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => /^finance-v(?:12|13|14|15)-/.test(key)).map(key => caches.delete(key)))).then(precache));
  }
  if (event.data?.type === "FINANCE_ALERT_NOTIFY") {
    event.waitUntil(showFinanceNotification(event.data.payload || {}, { force:true }));
  }
  if (event.data?.type === "FINANCE_ALERT_CHECK") {
    event.waitUntil(showScheduledFinanceAlert());
  }
});

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("accountSnapshots")) db.createObjectStore("accountSnapshots", { keyPath: "id" });
      if (!db.objectStoreNames.contains("pdfPacks")) db.createObjectStore("pdfPacks", { keyPath: "id" });
      if (!db.objectStoreNames.contains("reminderIndex")) db.createObjectStore("reminderIndex", { keyPath: "id" });
      if (!db.objectStoreNames.contains("recoverySnapshots")) db.createObjectStore("recoverySnapshots", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readReminderIndex() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("reminderIndex", "readonly");
    const request = tx.objectStore("reminderIndex").get("current");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function writeReminderIndex(value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("reminderIndex", "readwrite");
    tx.objectStore("reminderIndex").put(value);
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function scheduledTimeReached(value, date = new Date()) {
  const match = String(value || "08:00").match(/^(\d{1,2}):(\d{2})$/);
  const hour = match ? Math.min(23, Math.max(0, Number(match[1]))) : 8;
  const minute = match ? Math.min(59, Math.max(0, Number(match[2]))) : 0;
  const scheduled = new Date(date);
  scheduled.setHours(hour, minute, 0, 0);
  return date >= scheduled;
}

function reminderSnoozed(reminder, date = new Date()) {
  const until = new Date(reminder?.snoozedUntil || 0);
  return !Number.isNaN(until.getTime()) && until > date;
}

async function showFinanceNotification(payload = {}, { force = false } = {}) {
  if (financeAuthState !== "signed-in") return false;
  if (typeof Notification !== "undefined" && Notification.permission !== "granted") return false;
  const title = String(payload.title || "Finance reminder");
  const options = {
    body:String(payload.body || "Open Talaan to review your alerts."),
    icon:asset("./icons/icon-192-logo2.png"),
    badge:asset("./icons/icon-192-logo2.png"),
    tag:String(payload.tag || (force ? "finance-alert-manual" : `finance-alert-${localDateKey()}`)),
    renotify:false,
    data:{ url:new URL(payload.url || "./index.html?page=dashboard", scopeUrl).toString(), source:payload.source || "scheduled-alert" }
  };
  await self.registration.showNotification(title, options);
  return true;
}

async function showScheduledFinanceAlert() {
  const reminder = await readReminderIndex().catch(() => null);
  const now = new Date();
  if (!reminder?.enabled || reminderSnoozed(reminder, now)) return false;
  if (reminder.settings?.dailyDigest === false) return false;
  if (!scheduledTimeReached(reminder.settings?.dailyTime, now)) return false;
  const date = localDateKey(now);
  if (String(reminder.lastNotificationDate || "") === date) return false;
  const payload = reminder.notification || {
    title:reminder.title || "Finance alerts",
    body:reminder.body || "Open Talaan to review your alerts.",
    tag:`finance-alert-digest-${date}`,
    url:"./index.html?page=dashboard"
  };
  const delivered = await showFinanceNotification(payload);
  if (!delivered) return false;
  reminder.lastNotificationDate = date;
  reminder.lastNotificationAt = now.toISOString();
  await writeReminderIndex(reminder).catch(() => null);
  return true;
}

self.addEventListener("periodicsync", event => {
  if (["finance-review-reminder", "finance-scheduled-alerts-v1"].includes(event.tag)) event.waitUntil(showScheduledFinanceAlert());
});

self.addEventListener("sync", event => {
  if (["finance-review-now", "finance-scheduled-alerts-now"].includes(event.tag)) event.waitUntil(showScheduledFinanceAlert());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || "./index.html?page=dashboard", scopeUrl).toString();
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clientsList.find(client => client.url.startsWith(scopeUrl));
    if (existing) { await existing.focus(); existing.navigate(target); return; }
    await self.clients.openWindow(target);
  })());
});
