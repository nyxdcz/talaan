"use strict";

/* My Finance Records V12.25.0 · Reminders & Scheduled Alerts.
   Alerts are local-first, never perform financial actions, and use best-effort browser delivery. */
(function financeReminderAlertsBootstrap() {
  const ALERTS_VERSION = 1;
  const LOCAL_STATE_KEY = `${typeof STORAGE_KEY !== "undefined" ? STORAGE_KEY : "simple-finance-project-records-v2"}-scheduled-alert-state-v1`;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const PERIODIC_TAG = "finance-scheduled-alerts-v1";
  const LEGACY_PERIODIC_TAG = "finance-review-reminder";
  const RULE_KEYS = [
    "dueExpenses", "overdueExpenses", "lowBalance", "expectedIncome", "savingsContribution",
    "utilityEntry", "gymSchedule", "gymAutoPayFailure", "unsyncedChanges", "backupReminder"
  ];
  const DEFAULT_RULES = Object.freeze({
    dueExpenses:true,
    overdueExpenses:true,
    lowBalance:true,
    expectedIncome:true,
    savingsContribution:false,
    utilityEntry:true,
    gymSchedule:true,
    gymAutoPayFailure:true,
    unsyncedChanges:true,
    backupReminder:true
  });
  const DEFAULT_SETTINGS = Object.freeze({
    version:ALERTS_VERSION,
    enabled:false,
    dailyDigest:true,
    dailyTime:"08:00",
    leadDays:3,
    lowBalanceThreshold:1000,
    backupDays:14,
    utilityReminderDay:20,
    savingsMonthlyTarget:0,
    savingsReminderDay:20,
    rules:DEFAULT_RULES
  });

  function clone(value) {
    try { if (typeof structuredClone === "function") return structuredClone(value); } catch (error) {}
    try { return JSON.parse(JSON.stringify(value)); } catch (error) { return value; }
  }

  function clamp(value, min, max, fallback = min) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function normalizeTime(value) {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return DEFAULT_SETTINGS.dailyTime;
    const hour = clamp(match[1], 0, 23, 8);
    const minute = clamp(match[2], 0, 59, 0);
    return `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
  }

  function normalizeReminderSettings(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const rulesSource = source.rules && typeof source.rules === "object" && !Array.isArray(source.rules) ? source.rules : {};
    const rules = {};
    RULE_KEYS.forEach(key => { rules[key] = rulesSource[key] === undefined ? DEFAULT_RULES[key] : Boolean(rulesSource[key]); });
    return {
      version:ALERTS_VERSION,
      enabled:Boolean(source.enabled),
      dailyDigest:source.dailyDigest !== false,
      dailyTime:normalizeTime(source.dailyTime),
      leadDays:clamp(source.leadDays, 0, 30, DEFAULT_SETTINGS.leadDays),
      lowBalanceThreshold:clamp(source.lowBalanceThreshold, 0, 1000000000, DEFAULT_SETTINGS.lowBalanceThreshold),
      backupDays:clamp(source.backupDays, 1, 365, DEFAULT_SETTINGS.backupDays),
      utilityReminderDay:clamp(source.utilityReminderDay, 1, 28, DEFAULT_SETTINGS.utilityReminderDay),
      savingsMonthlyTarget:clamp(source.savingsMonthlyTarget, 0, 1000000000, DEFAULT_SETTINGS.savingsMonthlyTarget),
      savingsReminderDay:clamp(source.savingsReminderDay, 1, 28, DEFAULT_SETTINGS.savingsReminderDay),
      rules
    };
  }

  function ensureReminderShape(target, source = target) {
    const result = target && typeof target === "object" ? target : {};
    result.reminderSettings = normalizeReminderSettings(source?.reminderSettings || result.reminderSettings);
    return result;
  }

  const baseNormalizeData = typeof normalizeData === "function" ? normalizeData : value => value || {};
  normalizeData = function reminderAwareNormalizeData(value) {
    return ensureReminderShape(baseNormalizeData(value), value);
  };
  if (typeof data !== "undefined") data = ensureReminderShape(data, data);

  function loadLocalState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_STATE_KEY) || "{}");
      return {
        lastDigestDate:String(parsed.lastDigestDate || ""),
        snoozedUntil:String(parsed.snoozedUntil || ""),
        sent:parsed.sent && typeof parsed.sent === "object" && !Array.isArray(parsed.sent) ? parsed.sent : {},
        history:Array.isArray(parsed.history) ? parsed.history.slice(0, 80) : [],
        lastCheckAt:String(parsed.lastCheckAt || ""),
        lastNotificationAt:String(parsed.lastNotificationAt || "")
      };
    } catch (error) {
      return { lastDigestDate:"", snoozedUntil:"", sent:{}, history:[], lastCheckAt:"", lastNotificationAt:"" };
    }
  }

  let localState = loadLocalState();
  let checkTimer = 0;
  let nextScheduleTimer = 0;
  let latestAlerts = [];

  function persistLocalState() {
    const cutoff = Date.now() - 45 * DAY_MS;
    Object.entries(localState.sent || {}).forEach(([key, value]) => {
      if (!value || Number(new Date(value)) < cutoff) delete localState.sent[key];
    });
    localState.history = (localState.history || []).slice(0, 80);
    try { localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(localState)); } catch (error) {}
  }

  function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2,"0");
    const day = String(date.getDate()).padStart(2,"0");
    return `${year}-${month}-${day}`;
  }

  function monthKeyLocal(date = new Date()) {
    return todayKey(date).slice(0,7);
  }

  function startOfDay(date) {
    const result = new Date(date);
    result.setHours(0,0,0,0);
    return result;
  }

  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysBetween(from, to) {
    return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
  }

  function dueDateForExpense(expense, now = new Date()) {
    const direct = parseDate(expense?.date);
    if (direct) return direct;
    const dueDay = Number(expense?.dueDay || 0);
    if (!dueDay) return null;
    const month = String(expense?.month || expense?.expenseMonth || monthKeyLocal(now));
    if (!/^\d{4}-\d{2}$/.test(month)) return null;
    const [year, monthNumber] = month.split("-").map(Number);
    const safeDay = Math.min(dueDay, new Date(year, monthNumber, 0).getDate());
    return new Date(year, monthNumber - 1, safeDay);
  }

  function currency(value) {
    try {
      return new Intl.NumberFormat("en-PH", { style:"currency", currency:"PHP", maximumFractionDigits:2 }).format(Number(value || 0));
    } catch (error) { return `₱${Number(value || 0).toFixed(2)}`; }
  }

  function escape(value) {
    if (typeof escapeHtml === "function") return escapeHtml(String(value ?? ""));
    return String(value ?? "").replace(/[&<>'"]/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[character]));
  }

  function cloudStatus() {
    try {
      const status = window.FinanceCloudSync?.status;
      return status && typeof status === "object" ? status : {};
    } catch (error) { return {}; }
  }

  function gymScheduledToday(expense, date = new Date()) {
    const month = monthKeyLocal(date);
    if (String(expense?.date || "").slice(0,7) !== month) return false;
    const dateKey = todayKey(date);
    const overrides = expense?.gymDateOverrides && typeof expense.gymDateOverrides === "object" ? expense.gymDateOverrides : {};
    const removed = new Set(Array.isArray(overrides.removed) ? overrides.removed.map(String) : []);
    const added = new Set(Array.isArray(overrides.added) ? overrides.added.map(String) : []);
    if (removed.has(dateKey)) return false;
    if (added.has(dateKey)) return true;
    const days = new Set((Array.isArray(expense?.gymDays) ? expense.gymDays : []).map(Number));
    return days.has(date.getDay());
  }

  function savingsContributedThisMonth(source, settings, now = new Date()) {
    const month = monthKeyLocal(now);
    const savingsAccounts = new Set(Object.keys(source?.accounts || {}).filter(name => {
      const type = source?.accountTypes?.[name];
      return type === "Savings";
    }));
    return (Array.isArray(source?.accountLedger) ? source.accountLedger : []).reduce((sum, entry) => {
      if (!savingsAccounts.has(entry?.account)) return sum;
      const date = String(entry?.date || entry?.occurredAt || "").slice(0,7);
      const amount = Number(entry?.amount || 0);
      if (date !== month || amount <= 0 || entry?.type === "opening-balance" || entry?.type === "reconciliation-adjustment") return sum;
      return sum + amount;
    }, 0);
  }

  function addAlert(target, input, now = new Date()) {
    const date = todayKey(now);
    const id = String(input.id || `${input.type}-${target.length + 1}`);
    target.push({
      id,
      type:String(input.type || "review"),
      title:String(input.title || "Finance reminder"),
      text:String(input.text || "Finance review needed."),
      severity:["danger","warning","info","success"].includes(input.severity) ? input.severity : "info",
      page:String(input.page || "dashboard"),
      recordId:String(input.recordId || ""),
      amount:Number(input.amount || 0),
      dueDate:String(input.dueDate || ""),
      fingerprint:String(input.fingerprint || `${input.type}:${id}:${date}`)
    });
  }

  function buildAlerts(source = data, settingsInput = source?.reminderSettings, environment = {}, nowInput = new Date()) {
    const now = new Date(nowInput);
    const today = startOfDay(now);
    const settings = normalizeReminderSettings(settingsInput);
    const alerts = [];
    const expenses = Array.isArray(source?.expenses) ? source.expenses : [];
    const income = Array.isArray(source?.incomeRecords) ? source.incomeRecords : [];
    const rules = settings.rules;

    expenses.filter(item => !item?.paid && item?.expenseType !== "gym").forEach(expense => {
      const due = dueDateForExpense(expense, now);
      if (!due) return;
      const days = daysBetween(today, due);
      const label = expense.name || "Expense";
      const amount = Number(expense.amount || 0);
      if (rules.overdueExpenses && days < 0) {
        addAlert(alerts, {
          id:`overdue-${expense.id}`, type:"overdue-expense", title:"Overdue expense",
          text:`${label} is ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue · ${currency(amount)}`,
          severity:"danger", page:"money", recordId:expense.id, amount, dueDate:todayKey(due),
          fingerprint:`overdue:${expense.id}:${todayKey(now)}`
        }, now);
      } else if (rules.dueExpenses && days >= 0 && days <= settings.leadDays) {
        addAlert(alerts, {
          id:`due-${expense.id}`, type:"due-expense", title:days === 0 ? "Expense due today" : "Expense due soon",
          text:`${label} ${days === 0 ? "is due today" : `is due in ${days} day${days === 1 ? "" : "s"}`} · ${currency(amount)}`,
          severity:days === 0 ? "danger" : "warning", page:"money", recordId:expense.id, amount, dueDate:todayKey(due),
          fingerprint:`due:${expense.id}:${todayKey(now)}`
        }, now);
      }
    });

    if (rules.lowBalance && settings.lowBalanceThreshold > 0) {
      Object.entries(source?.accounts || {}).forEach(([name, rawBalance]) => {
        const balance = Number(rawBalance || 0);
        const hasActivity = (Array.isArray(source?.accountLedger) ? source.accountLedger : []).some(entry => entry?.account === name);
        if (!(balance < 0 || (balance > 0 && balance < settings.lowBalanceThreshold) || (balance === 0 && hasActivity))) return;
        addAlert(alerts, {
          id:`low-${name}`, type:"low-balance", title:"Low account balance",
          text:`${name} has ${currency(balance)} available`, severity:balance < 0 ? "danger" : "warning",
          page:"settings", amount:balance, fingerprint:`low:${name}:${todayKey(now)}`
        }, now);
      });
    }

    if (rules.expectedIncome) {
      income.forEach(item => {
        if (item?.ledgerTransactionId || item?.postToLedger === true || item?.category === "Transfer from savings") return;
        const date = parseDate(item?.date);
        if (!date) return;
        const days = daysBetween(today, date);
        if (days < 0 || days > settings.leadDays) return;
        addAlert(alerts, {
          id:`income-${item.id}`, type:"expected-income", title:days === 0 ? "Income expected today" : "Expected income",
          text:`${item.name || "Income"} ${days === 0 ? "is expected today" : `is expected in ${days} day${days === 1 ? "" : "s"}`} · ${currency(item.amount)}`,
          severity:"info", page:"income", recordId:item.id, amount:Number(item.amount || 0), dueDate:todayKey(date),
          fingerprint:`income:${item.id}:${todayKey(now)}`
        }, now);
      });
    }

    if (rules.savingsContribution && settings.savingsMonthlyTarget > 0 && now.getDate() >= settings.savingsReminderDay) {
      const contributed = savingsContributedThisMonth(source, settings, now);
      if (contributed < settings.savingsMonthlyTarget) {
        const remaining = settings.savingsMonthlyTarget - contributed;
        addAlert(alerts, {
          id:`savings-${monthKeyLocal(now)}`, type:"savings-contribution", title:"Savings contribution reminder",
          text:`${currency(remaining)} remains toward this month’s ${currency(settings.savingsMonthlyTarget)} target`,
          severity:"info", page:"settings", amount:remaining, fingerprint:`savings:${monthKeyLocal(now)}:${todayKey(now)}`
        }, now);
      }
    }

    if (rules.utilityEntry && now.getDate() >= settings.utilityReminderDay) {
      const month = monthKeyLocal(now);
      const hasUtility = expenses.some(item => item?.expenseType === "utility" && String(item?.date || "").slice(0,7) === month);
      if (!hasUtility) {
        addAlert(alerts, {
          id:`utility-${month}`, type:"utility-entry", title:"Utility bill entry needed",
          text:`No Electric & Water Bill has been entered for ${month}`,
          severity:"warning", page:"money", fingerprint:`utility:${month}:${todayKey(now)}`
        }, now);
      }
    }

    if (rules.gymSchedule) {
      expenses.filter(item => item?.expenseType === "gym" && gymScheduledToday(item, now)).forEach(item => {
        addAlert(alerts, {
          id:`gym-${item.id}-${todayKey(now)}`, type:"gym-schedule", title:"Gym scheduled today",
          text:`${item.name || "Gym"} is scheduled today · ${currency(item.gymPricePerVisit || 0)} per visit`,
          severity:"info", page:"money", recordId:item.id, amount:Number(item.gymPricePerVisit || 0),
          fingerprint:`gym:${item.id}:${todayKey(now)}`
        }, now);
      });
    }

    if (rules.gymAutoPayFailure) {
      const currentMonth = monthKeyLocal(now);
      expenses.filter(item => item?.expenseType === "gym" && item?.gymAutoPay && !item?.paid && (item?.gymAutoPaySuppressed || String(item?.date || "").slice(0,7) < currentMonth)).forEach(item => {
        addAlert(alerts, {
          id:`gym-autopay-${item.id}`, type:"gym-auto-pay-failure", title:"Gym auto-payment needs attention",
          text:`${item.name || "Gym"} was not auto-paid${item.gymAutoPayAccount ? ` from ${item.gymAutoPayAccount}` : ""} · ${currency(item.amount)}`,
          severity:"danger", page:"money", recordId:item.id, amount:Number(item.amount || 0),
          fingerprint:`gym-autopay:${item.id}:${todayKey(now)}`
        }, now);
      });
    }

    if (rules.unsyncedChanges) {
      const status = environment.cloudStatus || cloudStatus();
      const pending = Number(status.pendingCount || 0);
      const conflicts = Number(status.conflictCount || 0);
      if (conflicts > 0 || pending > 0) {
        addAlert(alerts, {
          id:"cloud-sync", type:"unsynced-changes", title:conflicts ? "Cloud conflict needs review" : "Changes waiting to sync",
          text:conflicts ? `${conflicts} conflict${conflicts === 1 ? "" : "s"} and ${pending} pending record${pending === 1 ? "" : "s"}` : `${pending} record${pending === 1 ? " is" : "s are"} waiting to sync`,
          severity:conflicts ? "danger" : "warning", page:"settings",
          fingerprint:`sync:${pending}:${conflicts}:${todayKey(now)}`
        }, now);
      }
    }

    if (rules.backupReminder) {
      const lastBackupAt = environment.lastBackupAt ?? (typeof appMeta !== "undefined" ? appMeta.lastBackupAt : "");
      const lastBackup = lastBackupAt ? new Date(lastBackupAt) : null;
      const age = lastBackup && !Number.isNaN(lastBackup.getTime()) ? Math.floor((now.getTime() - lastBackup.getTime()) / DAY_MS) : Infinity;
      if (age >= settings.backupDays) {
        addAlert(alerts, {
          id:"backup", type:"backup-reminder", title:"Recovery backup reminder",
          text:Number.isFinite(age) ? `Your last external recovery backup was ${age} days ago` : "No external recovery backup has been recorded",
          severity:"warning", page:"settings", fingerprint:`backup:${todayKey(now)}`
        }, now);
      }
    }

    const rank = { danger:0, warning:1, info:2, success:3 };
    return alerts.sort((a,b) => rank[a.severity] - rank[b.severity] || String(a.dueDate || "").localeCompare(String(b.dueDate || "")) || a.title.localeCompare(b.title));
  }

  function notificationPermission() {
    return "Notification" in window ? Notification.permission : "unsupported";
  }

  function isStandalone() {
    return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true);
  }

  function isSnoozed(now = new Date()) {
    const until = new Date(localState.snoozedUntil || 0);
    return !Number.isNaN(until.getTime()) && until > now;
  }

  function scheduleReached(settings, now = new Date()) {
    const [hour, minute] = normalizeTime(settings.dailyTime).split(":").map(Number);
    const scheduled = new Date(now);
    scheduled.setHours(hour, minute, 0, 0);
    return now >= scheduled;
  }

  function nextScheduledAt(settings, now = new Date()) {
    const [hour, minute] = normalizeTime(settings.dailyTime).split(":").map(Number);
    const scheduled = new Date(now);
    scheduled.setHours(hour, minute, 0, 0);
    if (scheduled <= now) scheduled.setDate(scheduled.getDate() + 1);
    return scheduled;
  }

  function digestPayload(alerts, settings, now = new Date()) {
    const top = alerts.slice(0,4);
    const body = alerts.length
      ? `${top.map(item => item.title).join(" · ")}${alerts.length > top.length ? ` · +${alerts.length - top.length} more` : ""}`
      : "No finance alerts need attention.";
    return {
      title:alerts.length ? `Finance alerts · ${alerts.length}` : "Finance check complete",
      body,
      tag:`finance-alert-digest-${todayKey(now)}`,
      url:"./index.html?page=dashboard",
      count:alerts.length,
      date:todayKey(now),
      scheduledTime:settings.dailyTime
    };
  }

  async function updateBadge(count) {
    try {
      if (count > 0 && typeof navigator.setAppBadge === "function") await navigator.setAppBadge(count);
      else if (count === 0 && typeof navigator.clearAppBadge === "function") await navigator.clearAppBadge();
    } catch (error) {}
  }

  async function writeScheduledIndex(alerts, settings, payload = digestPayload(alerts, settings)) {
    const entry = {
      id:"current",
      updatedAt:new Date().toISOString(),
      enabled:Boolean(settings.enabled),
      snoozedUntil:localState.snoozedUntil || "",
      lastNotificationDate:localState.lastDigestDate || "",
      lastNotificationAt:localState.lastNotificationAt || "",
      settings:{ dailyTime:settings.dailyTime, dailyDigest:settings.dailyDigest },
      issues:alerts,
      alerts,
      title:payload.title,
      body:payload.body,
      notification:payload
    };
    try {
      if (typeof idbPut === "function") await idbPut("reminderIndex", entry);
    } catch (error) {}
    return entry;
  }

  async function showSystemNotification(payload, { test = false } = {}) {
    if (notificationPermission() !== "granted") return false;
    let registration = typeof serviceWorkerRegistration !== "undefined" ? serviceWorkerRegistration : null;
    if (!registration && navigator.serviceWorker?.ready) {
      try { registration = await navigator.serviceWorker.ready; } catch (error) {}
    }
    if (!registration?.showNotification) return false;
    const options = {
      body:payload.body,
      icon:"./icons/icon-192.png",
      badge:"./icons/icon-192.png",
      tag:test ? "finance-alert-test" : payload.tag,
      renotify:false,
      data:{ url:payload.url || "./index.html?page=dashboard", source:test ? "test" : "scheduled-alert" }
    };
    await registration.showNotification(payload.title, options);
    return true;
  }

  function markDigestSent(payload, alerts, reason = "scheduled") {
    localState.lastDigestDate = payload.date || todayKey();
    localState.lastNotificationAt = new Date().toISOString();
    alerts.forEach(item => { localState.sent[item.fingerprint] = localState.lastNotificationAt; });
    localState.history.unshift({
      id:`history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp:localState.lastNotificationAt,
      title:payload.title,
      body:payload.body,
      count:alerts.length,
      reason
    });
    persistLocalState();
  }

  async function deliverDigest(alerts, settings, { force = false, reason = "scheduled" } = {}) {
    const now = new Date();
    if (!settings.enabled || isSnoozed(now)) return false;
    if (!force && (!settings.dailyDigest || !scheduleReached(settings, now) || localState.lastDigestDate === todayKey(now))) return false;
    const payload = digestPayload(alerts, settings, now);
    const delivered = await showSystemNotification(payload);
    if (delivered) {
      markDigestSent(payload, alerts, reason);
      await writeScheduledIndex(alerts, settings, payload);
    }
    return delivered;
  }

  async function deliverIndividualAlerts(alerts, settings, { force = false, reason = "foreground" } = {}) {
    const now = new Date();
    if (!settings.enabled || settings.dailyDigest || isSnoozed(now)) return false;
    const candidates = force ? alerts.slice(0, 5) : alerts.filter(item => !localState.sent[item.fingerprint]).slice(0, 5);
    let deliveredCount = 0;
    for (const item of candidates) {
      const payload = {
        title:item.title,
        body:item.text,
        tag:`finance-alert-${String(item.fingerprint || item.id).replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 90)}`,
        url:`./index.html?page=${encodeURIComponent(item.page || "dashboard")}`,
        date:todayKey(now)
      };
      const delivered = await showSystemNotification(payload);
      if (!delivered) continue;
      const timestamp = new Date().toISOString();
      localState.sent[item.fingerprint] = timestamp;
      localState.lastNotificationAt = timestamp;
      localState.history.unshift({
        id:`history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp, title:item.title, body:item.text, count:1, reason
      });
      deliveredCount += 1;
    }
    if (deliveredCount) {
      persistLocalState();
      await writeScheduledIndex(alerts, settings);
    }
    return deliveredCount > 0;
  }

  function statusLabel(permission = notificationPermission()) {
    if (permission === "granted") return "Allowed";
    if (permission === "denied") return "Blocked";
    if (permission === "default") return "Not requested";
    return "Unsupported";
  }

  function ruleLabel(type) {
    return ({
      "overdue-expense":"Overdue", "due-expense":"Due soon", "low-balance":"Low balance", "expected-income":"Expected income",
      "savings-contribution":"Savings", "utility-entry":"Utility entry", "gym-schedule":"Gym", "gym-auto-pay-failure":"Gym auto-pay",
      "unsynced-changes":"Cloud sync", "backup-reminder":"Backup"
    })[type] || "Review";
  }

  function renderAlertList(alerts = latestAlerts) {
    const list = document.getElementById("reviewIssueList");
    if (!list) return;
    list.innerHTML = alerts.length ? alerts.map(item => `
      <button class="finance-alert-row" type="button" data-open-finance-alert="${escape(item.page)}" data-alert-record="${escape(item.recordId)}">
        <span class="status-chip ${escape(item.severity)}">${escape(ruleLabel(item.type))}</span>
        <span><strong>${escape(item.title)}</strong><small>${escape(item.text)}</small></span>
      </button>`).join("") : `<div class="success-box">No scheduled finance alerts.</div>`;
  }

  function renderHistory() {
    const node = document.getElementById("financeAlertHistory");
    if (!node) return;
    const history = localState.history || [];
    node.innerHTML = history.length ? history.slice(0,8).map(item => `<div class="finance-alert-history-row"><span>${escape(typeof formatDateTime === "function" ? formatDateTime(item.timestamp) : item.timestamp)}</span><strong>${escape(item.title)}</strong><small>${escape(item.reason || "scheduled")}</small></div>`).join("") : `<div class="system-empty">No notification history on this device.</div>`;
  }

  function fillSettingsForm(settings = data.reminderSettings) {
    const values = {
      financeAlertTime:settings.dailyTime,
      financeAlertLeadDays:String(settings.leadDays),
      financeAlertLowBalance:String(settings.lowBalanceThreshold),
      financeAlertBackupDays:String(settings.backupDays),
      financeAlertUtilityDay:String(settings.utilityReminderDay),
      financeAlertSavingsTarget:String(settings.savingsMonthlyTarget),
      financeAlertSavingsDay:String(settings.savingsReminderDay)
    };
    Object.entries(values).forEach(([id,value]) => { const node=document.getElementById(id); if(node && node.value !== value) node.value=value; });
    const digest = document.getElementById("financeAlertDailyDigest"); if (digest) digest.checked = settings.dailyDigest;
    RULE_KEYS.forEach(key => { const node=document.getElementById(`financeAlertRule-${key}`); if(node) node.checked=Boolean(settings.rules[key]); });
  }

  function renderReminderStatus(alerts = latestAlerts.length ? latestAlerts : buildAlerts()) {
    latestAlerts = alerts;
    const settings = normalizeReminderSettings(data.reminderSettings);
    const enabled = settings.enabled && (typeof appMeta === "undefined" || appMeta.reminders?.enabled !== false);
    const chip = document.getElementById("reminderStatusChip");
    if (chip) {
      chip.textContent = enabled ? (isSnoozed() ? "Paused" : "On") : "Off";
      chip.className = `status-chip ${enabled ? (isSnoozed() ? "warning" : "success") : ""}`;
    }
    const foreground = document.getElementById("foregroundReminderStatus");
    if (foreground) foreground.textContent = `${alerts.length} active alert${alerts.length === 1 ? "" : "s"}`;
    const periodic = document.getElementById("periodicSyncStatus");
    if (periodic) periodic.textContent = typeof serviceWorkerRegistration !== "undefined" && serviceWorkerRegistration?.periodicSync
      ? ((typeof appMeta !== "undefined" && appMeta?.reminders?.periodicRegistered) ? "Registered · best effort" : "Supported · not registered")
      : "Foreground schedule only";
    const lastReview = document.getElementById("lastReviewStatus");
    if (lastReview) lastReview.textContent = localState.lastCheckAt ? (typeof formatDateTime === "function" ? formatDateTime(localState.lastCheckAt) : localState.lastCheckAt) : "Never";
    const permission = document.getElementById("financeAlertPermissionStatus"); if(permission) permission.textContent=statusLabel();
    const schedule = document.getElementById("financeAlertScheduleStatus"); if(schedule) schedule.textContent=`Daily · ${settings.dailyTime}`;
    const next = document.getElementById("financeAlertNextStatus"); if(next) next.textContent=enabled ? (typeof formatDateTime === "function" ? formatDateTime(nextScheduledAt(settings).toISOString()) : nextScheduledAt(settings).toLocaleString()) : "Off";
    const pause = document.getElementById("financeAlertPauseStatus"); if(pause) pause.textContent=isSnoozed() ? `Paused until ${typeof formatDateTime === "function" ? formatDateTime(localState.snoozedUntil) : localState.snoozedUntil}` : "Active";
    fillSettingsForm(settings);
    renderAlertList(alerts);
    renderHistory();
  }

  function settingsFromForm() {
    const rules = {};
    const grid = document.querySelector(".finance-alert-rule-grid");
    if (grid) {
      const inputs = grid.getElementsByTagName("input");
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        if (input.id.startsWith("financeAlertRule-")) {
          rules[input.id.slice(17)] = Boolean(input.checked);
        }
      }
    }
    RULE_KEYS.forEach(key => {
      if (rules[key] === undefined) {
        rules[key] = Boolean(document.getElementById(`financeAlertRule-${key}`)?.checked);
      }
    });
    return normalizeReminderSettings({
      enabled:data.reminderSettings?.enabled,
      dailyDigest:document.getElementById("financeAlertDailyDigest")?.checked !== false,
      dailyTime:document.getElementById("financeAlertTime")?.value,
      leadDays:document.getElementById("financeAlertLeadDays")?.value,
      lowBalanceThreshold:document.getElementById("financeAlertLowBalance")?.value,
      backupDays:document.getElementById("financeAlertBackupDays")?.value,
      utilityReminderDay:document.getElementById("financeAlertUtilityDay")?.value,
      savingsMonthlyTarget:document.getElementById("financeAlertSavingsTarget")?.value,
      savingsReminderDay:document.getElementById("financeAlertSavingsDay")?.value,
      rules
    });
  }

  async function saveAlertSettings() {
    const next = settingsFromForm();
    next.enabled = Boolean(data.reminderSettings?.enabled);
    data.reminderSettings = next;
    if (typeof saveData === "function") saveData("Reminder schedule saved");
    latestAlerts = buildAlerts();
    localState.lastCheckAt = new Date().toISOString();
    persistLocalState();
    await writeScheduledIndex(latestAlerts, next);
    scheduleNextCheck();
    renderReminderStatus(latestAlerts);
  }

  async function registerPeriodicSync() {
    let registered = false;
    if (typeof serviceWorkerRegistration !== "undefined" && serviceWorkerRegistration?.periodicSync) {
      try {
        await serviceWorkerRegistration.periodicSync.unregister(LEGACY_PERIODIC_TAG);
      } catch (error) {}
      try {
        await serviceWorkerRegistration.periodicSync.register(PERIODIC_TAG, { minInterval:12 * 60 * 60 * 1000 });
        registered = true;
      } catch (error) {}
    }
    if (typeof appMeta !== "undefined") {
      appMeta.reminders = { ...(appMeta.reminders || {}), periodicRegistered:registered };
      if (typeof writeMeta === "function") writeMeta();
    }
    return registered;
  }

  async function enableReminders() {
    data.reminderSettings = normalizeReminderSettings({ ...data.reminderSettings, enabled:true });
    if (typeof appMeta !== "undefined") appMeta.reminders = { ...(appMeta.reminders || {}), enabled:true };
    let permission = notificationPermission();
    if (permission === "default") {
      try { permission = await Notification.requestPermission(); } catch (error) {}
    }
    await registerPeriodicSync();
    if (typeof writeMeta === "function") writeMeta();
    if (typeof saveData === "function") saveData("Reminders enabled");
    await runReviewCheck(true, { deliver:false });
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent) && !isStandalone()) {
      if (typeof showToast === "function") showToast("Add the app to the iPhone Home Screen before enabling system notifications", "warning");
    } else if (permission === "denied") {
      if (typeof showToast === "function") showToast("Foreground alerts are on, but system notifications are blocked", "warning");
    } else if (typeof showToast === "function") showToast("Scheduled finance alerts enabled", "success");
    renderReminderStatus(latestAlerts);
  }

  async function disableReminders() {
    data.reminderSettings = normalizeReminderSettings({ ...data.reminderSettings, enabled:false });
    if (typeof appMeta !== "undefined") appMeta.reminders = { ...(appMeta.reminders || {}), enabled:false, periodicRegistered:false };
    if (typeof serviceWorkerRegistration !== "undefined" && serviceWorkerRegistration?.periodicSync) {
      try { await serviceWorkerRegistration.periodicSync.unregister(PERIODIC_TAG); } catch (error) {}
      try { await serviceWorkerRegistration.periodicSync.unregister(LEGACY_PERIODIC_TAG); } catch (error) {}
    }
    if (typeof writeMeta === "function") writeMeta();
    if (typeof saveData === "function") saveData("Reminders turned off");
    await writeScheduledIndex([], data.reminderSettings);
    await updateBadge(0);
    if (typeof showToast === "function") showToast("Scheduled finance alerts turned off", "info");
    renderReminderStatus([]);
  }

  async function runReviewCheck(notify = false, options = {}) {
    const settings = normalizeReminderSettings(data.reminderSettings);
    latestAlerts = buildAlerts(data, settings, { cloudStatus:cloudStatus(), lastBackupAt:typeof appMeta !== "undefined" ? appMeta.lastBackupAt : "" });
    localState.lastCheckAt = new Date().toISOString();
    if (typeof appMeta !== "undefined") {
      appMeta.reminders = { ...(appMeta.reminders || {}), enabled:settings.enabled, lastReviewAt:localState.lastCheckAt };
      if (typeof writeMeta === "function") writeMeta();
    }
    persistLocalState();
    await writeScheduledIndex(latestAlerts, settings);
    await updateBadge(latestAlerts.length);
    renderReminderStatus(latestAlerts);
    if (options.deliver !== false) {
      const deliveryOptions = { force:Boolean(options.force), reason:options.reason || (notify ? "manual" : "scheduled") };
      if (settings.dailyDigest) await deliverDigest(latestAlerts, settings, deliveryOptions);
      else await deliverIndividualAlerts(latestAlerts, settings, deliveryOptions);
    }
    if (notify && typeof showToast === "function") {
      showToast(latestAlerts.length ? `${latestAlerts.length} finance alert${latestAlerts.length === 1 ? "" : "s"} found` : "Finance alert check complete · no active alerts", latestAlerts.length ? "warning" : "success");
    }
    return latestAlerts;
  }

  async function sendTestNotification() {
    let permission = notificationPermission();
    if (permission === "default") {
      try { permission = await Notification.requestPermission(); } catch (error) {}
    }
    if (permission !== "granted") {
      if (typeof showToast === "function") showToast("System notification permission is not allowed", "warning");
      return;
    }
    const delivered = await showSystemNotification({ title:"Finance alert test", body:"Scheduled alerts are ready on this device.", tag:"finance-alert-test", url:"./index.html?page=settings&settings=offline" }, { test:true });
    if (typeof showToast === "function") showToast(delivered ? "Test notification sent" : "Could not send the test notification", delivered ? "success" : "warning");
  }

  async function pauseAlerts() {
    const until = new Date(Date.now() + DAY_MS);
    localState.snoozedUntil = until.toISOString();
    if (typeof appMeta !== "undefined") appMeta.reminders = { ...(appMeta.reminders || {}), snoozedUntil:localState.snoozedUntil };
    persistLocalState();
    if (typeof writeMeta === "function") writeMeta();
    await writeScheduledIndex(latestAlerts, data.reminderSettings);
    renderReminderStatus(latestAlerts);
    if (typeof showToast === "function") showToast("Scheduled alerts paused for 24 hours", "info");
  }

  function clearAlertHistory() {
    localState.history = [];
    persistLocalState();
    renderHistory();
    if (typeof showToast === "function") showToast("Notification history cleared", "info");
  }

  function scheduleNextCheck() {
    clearTimeout(nextScheduleTimer);
    const settings = normalizeReminderSettings(data.reminderSettings);
    if (!settings.enabled) return;
    const wait = Math.max(1000, nextScheduledAt(settings).getTime() - Date.now());
    nextScheduleTimer = setTimeout(() => {
      runReviewCheck(false, { deliver:true, reason:"daily schedule" }).catch(() => {});
      scheduleNextCheck();
    }, Math.min(wait, 2147483647));
  }

  function replaceReminderCard() {
    const chip = document.getElementById("reminderStatusChip");
    const card = chip?.closest("article");
    if (!card) return;
    card.classList.add("finance-alert-card");
    card.innerHTML = `
      <div class="card-header"><div><h3>Reminders &amp; scheduled alerts</h3><p>Daily finance digest with due-date, balance, income, Savings, Gym, sync, and backup checks</p></div><span class="status-chip" id="reminderStatusChip">Off</span></div>
      <div class="finance-alert-status-grid">
        <div><span>Active alerts</span><strong id="foregroundReminderStatus">0</strong></div>
        <div><span>Notification permission</span><strong id="financeAlertPermissionStatus">Checking</strong></div>
        <div><span>Schedule</span><strong id="financeAlertScheduleStatus">Daily</strong></div>
        <div><span>Next scheduled check</span><strong id="financeAlertNextStatus">Off</strong></div>
        <div><span>Background delivery</span><strong id="periodicSyncStatus">Checking</strong></div>
        <div><span>Last checked</span><strong id="lastReviewStatus">Never</strong></div>
      </div>
      <form id="financeAlertSettingsForm" class="finance-alert-settings-grid">
        <label class="finance-alert-toggle"><input id="financeAlertDailyDigest" type="checkbox"><span><strong>Daily notification digest</strong><small>One grouped alert at the scheduled time</small></span></label>
        <div class="field"><label for="financeAlertTime">Daily time</label><input class="input" id="financeAlertTime" type="time"></div>
        <div class="field"><label for="financeAlertLeadDays">Due and income lead days</label><input class="input" id="financeAlertLeadDays" type="number" min="0" max="30" step="1"></div>
        <div class="field"><label for="financeAlertLowBalance">Low-balance threshold</label><input class="input" id="financeAlertLowBalance" type="number" min="0" step="100"></div>
        <div class="field"><label for="financeAlertBackupDays">Backup reminder after</label><div class="finance-alert-unit-field"><input class="input" id="financeAlertBackupDays" type="number" min="1" max="365" step="1"><span>days</span></div></div>
        <div class="field"><label for="financeAlertUtilityDay">Utility entry reminder day</label><input class="input" id="financeAlertUtilityDay" type="number" min="1" max="28" step="1"></div>
        <div class="field"><label for="financeAlertSavingsTarget">Monthly Savings target</label><input class="input" id="financeAlertSavingsTarget" type="number" min="0" step="100"></div>
        <div class="field"><label for="financeAlertSavingsDay">Savings reminder day</label><input class="input" id="financeAlertSavingsDay" type="number" min="1" max="28" step="1"></div>
      </form>
      <div class="finance-alert-rule-grid" aria-label="Alert types">
        ${[
          ["dueExpenses","Expense due dates"],["overdueExpenses","Overdue bills"],["lowBalance","Low account balances"],["expectedIncome","Expected income"],
          ["savingsContribution","Savings contributions"],["utilityEntry","Utility Bill entry"],["gymSchedule","Gym schedule"],["gymAutoPayFailure","Failed Gym auto-payment"],
          ["unsyncedChanges","Unsynchronized changes"],["backupReminder","Recovery backup"]
        ].map(([key,label]) => `<label><input id="financeAlertRule-${key}" type="checkbox"><span>${label}</span></label>`).join("")}
      </div>
      <div class="system-actions finance-alert-actions">
        <button class="button button-primary" id="enableRemindersButton" type="button">Enable notifications</button>
        <button class="button button-secondary" id="saveFinanceAlertSettings" type="button">Save schedule</button>
        <button class="button button-secondary" id="runReviewButton" type="button">Run alert check</button>
        <button class="button button-secondary" id="testFinanceAlertButton" type="button">Send test</button>
        <button class="button button-secondary" id="pauseFinanceAlertsButton" type="button">Pause 24 hours</button>
        <button class="button button-secondary" id="disableRemindersButton" type="button">Turn off</button>
      </div>
      <div class="system-status-row"><span>Delivery status</span><span class="system-status-value" id="financeAlertPauseStatus">Active</span></div>
      <div class="finance-alert-section-title"><strong>Current alerts</strong><small>Opening an item only navigates to its record area; no payment or balance change occurs.</small></div>
      <div class="system-check-list finance-alert-list" id="reviewIssueList"></div>
      <details class="finance-alert-history"><summary>Notification history on this device</summary><div id="financeAlertHistory"></div><button class="button button-secondary button-small" id="clearFinanceAlertHistory" type="button">Clear history</button></details>
      <p class="system-help">Exact closed-app delivery is not guaranteed. Periodic Background Sync is browser-controlled and has limited support. On iPhone and iPad, install this website to the Home Screen and allow notifications. Alerts never mark expenses paid, transfer money, reconcile balances, or change financial records automatically.</p>`;
    window.simplifyReminderSettingsCard?.(card);
  }

  function bindEvents() {
    document.getElementById("enableRemindersButton")?.addEventListener("click", () => enableReminders().catch(() => typeof showToast === "function" && showToast("Could not enable scheduled alerts", "warning")));
    document.getElementById("disableRemindersButton")?.addEventListener("click", () => disableReminders().catch(() => typeof showToast === "function" && showToast("Could not disable scheduled alerts", "warning")));
    document.getElementById("runReviewButton")?.addEventListener("click", () => runReviewCheck(true, { deliver:false }).catch(() => typeof showToast === "function" && showToast("Could not run the alert check", "warning")));
    document.getElementById("saveFinanceAlertSettings")?.addEventListener("click", () => saveAlertSettings().catch(() => typeof showToast === "function" && showToast("Could not save reminder settings", "warning")));
    document.getElementById("testFinanceAlertButton")?.addEventListener("click", () => sendTestNotification().catch(() => typeof showToast === "function" && showToast("Could not send the test notification", "warning")));
    document.getElementById("pauseFinanceAlertsButton")?.addEventListener("click", () => pauseAlerts().catch(() => {}));
    document.getElementById("clearFinanceAlertHistory")?.addEventListener("click", clearAlertHistory);
    document.getElementById("reviewIssueList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-open-finance-alert]");
      if (!button) return;
      const page = button.dataset.openFinanceAlert || "dashboard";
      if (typeof goToPage === "function") goToPage(page, { smooth:false });
      if (page === "settings" && typeof activateSettingsPanel === "function") {
        activateSettingsPanel("cloud", true);
        setTimeout(() => {
          const conflicts = document.getElementById("cloudConflictList");
          const healthCard = document.getElementById("cloudSyncHealthCard");
          if (conflicts && conflicts.querySelector(".cloud-conflict-item")) {
            conflicts.scrollIntoView({ behavior: "smooth", block: "center" });
          } else if (healthCard) {
            healthCard.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 100);
      }
    });
    window.addEventListener("focus", () => runReviewCheck(false, { deliver:true, reason:"window focus" }).catch(() => {}));
    window.addEventListener("online", () => runReviewCheck(false, { deliver:true, reason:"online" }).catch(() => {}));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) runReviewCheck(false, { deliver:true, reason:"visible" }).catch(() => {}); });
    window.addEventListener("storage", event => {
      if (event.key === STORAGE_KEY) setTimeout(() => runReviewCheck(false, { deliver:false, reason:"cross-tab" }).catch(() => {}), 50);
    });
  }

  window.FinanceReminderAlertsInternals = {
    normalizeReminderSettings, ensureReminderShape, buildAlerts, dueDateForExpense, gymScheduledToday,
    savingsContributedThisMonth, scheduleReached, nextScheduledAt, digestPayload, deliverIndividualAlerts, todayKey
  };

  if (globalThis.__FINANCE_REMINDER_TEST__) return;

  // Replace the legacy V12 review-reminder hooks used by Settings, focus, visibility,
  // reconnect, and service-worker setup with the V12.25 scheduled-alert implementation.
  globalThis.reviewIssues = () => buildAlerts();
  globalThis.writeReminderIndex = (alerts = latestAlerts) => writeScheduledIndex(alerts, normalizeReminderSettings(data.reminderSettings));
  globalThis.runReviewCheck = runReviewCheck;
  globalThis.renderReminderStatus = renderReminderStatus;
  globalThis.enableReminders = enableReminders;
  globalThis.disableReminders = disableReminders;

  replaceReminderCard();
  bindEvents();
  fillSettingsForm(data.reminderSettings);
  runReviewCheck(false, { deliver:true, reason:"app open" }).catch(() => {});
  scheduleNextCheck();
  clearInterval(checkTimer);
  checkTimer = setInterval(() => runReviewCheck(false, { deliver:true, reason:"foreground interval" }).catch(() => {}), CHECK_INTERVAL_MS);

  window.FinanceReminderAlerts = {
    version:ALERTS_VERSION,
    check:runReviewCheck,
    build:buildAlerts,
    enable:enableReminders,
    disable:disableReminders,
    test:sendTestNotification,
    get alerts() { return clone(latestAlerts); },
    get settings() { return clone(data.reminderSettings); }
  };
})();
