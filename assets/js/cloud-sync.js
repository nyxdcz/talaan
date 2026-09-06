"use strict";
/* My Finance Records · Encrypted profile-scoped Cloud Sync 3.0.
   Safe multi-device sync refreshes cloud revisions before upload, preserves concurrent device edits,
   merges non-overlapping changes, and pauses overlapping changes for explicit review. */
(function financeCloudSyncV3Bootstrap() {
  const APP_VERSION_FALLBACK = "2.5.0";
  const APP_VERSION_CODE = 130000;
  const CLOUD_SCHEMA_VERSION = 3;
  const CORE_SCHEMA_VERSION = 12;
  const PROFILE_ARCH = () => window.FinanceProfileArchitecture || null;
  const LOCAL_PROFILE_ID = PROFILE_ARCH()?.activeProfileId?.() || "profile-personal";
  const META_KEY = `simple-finance-cloud-sync-v3:${LOCAL_PROFILE_ID}`;
  const BASE_KEY = `simple-finance-cloud-record-base-v3:${LOCAL_PROFILE_ID}`;
  const QUEUE_KEY = `simple-finance-cloud-record-queue-v3:${LOCAL_PROFILE_ID}`;
  const CONFLICT_KEY = `simple-finance-cloud-record-conflicts-v3:${LOCAL_PROFILE_ID}`;
  const CONFIG_KEY = "simple-finance-cloud-config-v1";
  const LEGACY_META_KEY = "simple-finance-cloud-sync-v1";
  const LEGACY_CLOUD_TABLE = "finance_cloud_state";
  const DEVICE_TABLE = "finance_v3_devices";
  const AUDIT_TABLE = "finance_v3_audit";
  const SYNC_DELAY = 5 * 60 * 1000;
  const MAX_PULL_PAGES = 12;
  const MAX_BATCH_RECORDS = 350;
  const MAX_CONFLICTS = 60;
  const RETRY_BASE_MS = 2000;
  const RETRY_MAX_MS = 5 * 60 * 1000;
  const AUTH_RESTORE_ATTEMPTS = 3;
  const AUTH_RESTORE_RETRY_MS = 350;
  const ICON_ONLY_SYNC_QUERY = "(max-width: 850px)";
  const ARRAY_COLLECTIONS = ["expenses", "projects", "incomeRecords", "savingsGoals",
    "accountLedger", "accountReconciliations", "budgetTemplates", "expenseTemplates"
  ];
  const MAP_COLLECTIONS = ["monthlyReports", "monthlyChecklists", "monthlyBudgets", "iconLibrary"];
  const FINANCIAL_COLLECTIONS = new Set(["expenses", "incomeRecords", "accounts", "accountLedger", "accountReconciliations", "monthlyBudgets", "budgetTemplates"]);
  const KNOWN_TOP_LEVEL = new Set([
    ...ARRAY_COLLECTIONS, ...MAP_COLLECTIONS,
    "accounts", "accountTypes", "accountOrder", "accountIcons",
    "expenseRecurrenceSkips", "savingsSettings", "projectCalendarSettings",
    "salaryWorkSettings", "ledgerSettings", "budgetSettings", "productivitySettings", "reminderSettings"
  ]);

  let client = null;
  let clientPromise = null;
  let authHydrationComplete = false;
  let session = null;
  let cloudUser = null;
  let signedInInitialization = null;
  let signedInInitializationScope = "";
  let signedInReadyUserId = "";
  let profileSetupPromise = null;
  let profileSetupScope = "";
  let profileSetupState = "idle";
  let profileSetupDetail = "";
  let realtimeChannel = null;
  let syncTimer = null;
  let retryTimer = null;
  let syncing = false;
  let topSyncRequestPending = false;
  let mobileSyncFeedbackTimer = null;
  let passwordRecoveryActive = false;
  let passwordRecoveryRouteActive = false;
  let passwordRecoveryError = null;
  let suppressQueue = false;
  let saveWrapped = false;
  let initialized = false;
  let lastObservedData = clone(typeof data !== "undefined" ? data : {});

  const defaultState = () => ({
    enabled:true,
    autoSync:true,
    initializedUserId:"",
    initializedProfileId:"",
    profileRole:"owner",
    lastAuditId:0,
    lastSyncAt:"",
    lastPullAt:"",
    lastPushAt:"",
    lastError:"",
    status:"Not connected",
    currentDeviceId:"",
    currentDeviceName:"",
    requiredAppVersionCode:APP_VERSION_CODE,
    cloudSchemaVersion:CLOUD_SCHEMA_VERSION,
    migratedFromV1:false,
    realtimeStatus:"Disconnected",
    lastHealthAt:""
  });

  let state = { ...defaultState(), ...loadJson(META_KEY, {}) };
  let baseRecords = normalizeRecordStore(loadJson(BASE_KEY, {}));
  let pending = normalizeQueue(loadJson(QUEUE_KEY, {}));
  let conflicts = normalizeConflicts(loadJson(CONFLICT_KEY, []));
  const lifecycle = window.FinanceCloudSyncLifecycle?.create?.({canPoll:()=>Boolean(cloudReadiness().ready&&state.autoSync!==false&&navigator.onLine&&!document.hidden),canRetry:()=>Boolean(cloudReadiness().ready&&state.autoSync!==false),pull:reason=>syncNow({reason}),reconnect:()=>setupRealtime()});
  if(!lifecycle)throw new Error("Cloud Sync lifecycle support is unavailable. Reload the latest app version."); const {clearForegroundPoll,scheduleForegroundPoll,clearRealtimeRetry,scheduleRealtimeRecovery,noteRealtimeSubscribed}=lifecycle;
  function appVersion() {
    return typeof APP_VERSION !== "undefined" ? APP_VERSION : APP_VERSION_FALLBACK;
  }

  function cloudProfileId() { return String(PROFILE_ARCH()?.cloudProfileId?.() || ""); }
  function profileRole() { return String(PROFILE_ARCH()?.activeRole?.() || "owner"); }
  function profileCanWrite() { return PROFILE_ARCH()?.canWrite?.() !== false; }
  function initializedScope() { return cloudUser && cloudProfileId() ? `${cloudUser.id}:${cloudProfileId()}` : ""; }
  function requireCloudProfile({ write = false } = {}) {
    const architecture = PROFILE_ARCH();
    if (!architecture) throw new Error("Profile architecture is unavailable. Reload V13.0.0.");
    if (!cloudProfileId()) throw new Error("Open Settings → Profiles & Security and create or join an encrypted cloud profile first.");
    if (!architecture.isCloudUnlocked?.()) throw new Error("Unlock this finance profile’s encryption passphrase before cloud sync.");
    if (write && !profileCanWrite()) throw new Error("This Viewer profile is read-only. It can download cloud changes but cannot upload records.");
    return cloudProfileId();
  }

  async function encryptRecordPayload(payload, collection, recordId) {
    const architecture = PROFILE_ARCH();
    if (!architecture?.encryptCloudPayload) throw new Error("Client-side cloud encryption is unavailable.");
    return architecture.encryptCloudPayload(payload || {}, { collection, recordId });
  }

  async function decryptRecordPayload(payload, collection, recordId) {
    const architecture = PROFILE_ARCH();
    if (!payload?.__financeEncrypted) throw new Error(`Cloud record ${collection}/${recordId} is not encrypted.`);
    if (!architecture?.decryptCloudPayload) throw new Error("Client-side cloud decryption is unavailable.");
    return architecture.decryptCloudPayload(payload, { collection, recordId });
  }

  async function decryptRow(raw) {
    const collection = String(raw?.collection || "");
    const recordId = String(raw?.record_id ?? raw?.recordId ?? "");
    return { ...raw, payload:await decryptRecordPayload(raw?.payload, collection, recordId) };
  }

  async function decryptRows(rows = []) {
    return Promise.all((rows || []).map(decryptRow));
  }

  function clone(value) {
    try { if (typeof structuredClone === "function") return structuredClone(value); } catch (error) {}
    try { return JSON.parse(JSON.stringify(value)); } catch (error) { return value; }
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) { return fallback; }
  }

  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { return false; }
  }

  function persist({ reclaimFirst = false } = {}) {
    const stores = reclaimFirst
      ? [[QUEUE_KEY, pending], [CONFLICT_KEY, conflicts.slice(0, MAX_CONFLICTS)], [BASE_KEY, baseRecords], [META_KEY, state]]
      : [[META_KEY, state], [BASE_KEY, baseRecords], [QUEUE_KEY, pending], [CONFLICT_KEY, conflicts.slice(0, MAX_CONFLICTS)]];
    const write = () => stores.map(([key, value]) => saveJson(key, value)).every(Boolean);
    return write() || (reclaimFirst && write());
  }

  function stable(value) {
    if (value === undefined) return "__undefined__";
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }

  function checksum(value) {
    const text = stable(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function same(a, b) { return checksum(a) === checksum(b); }
  function nowIso() { return new Date().toISOString(); }
  function uid(prefix = "sync") { return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function recordKey(collection, recordId) { return `${collection}\u001f${recordId}`; }
  function splitKey(key) { const at = key.indexOf("\u001f"); return [key.slice(0, at), key.slice(at + 1)]; }
  function keyToken(key) { return encodeURIComponent(String(key || "")); }
  function keyFromToken(token) { try { return decodeURIComponent(String(token || "")); } catch (error) { return String(token || ""); } }
  function isObject(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
  function isSettingsPreferences(collection, recordId) { return collection === "settings" && recordId === "preferences"; }
  function sanitizeRecordPayload(collection, recordId, payload) {
    const output = clone(isObject(payload) ? payload : {});
    if (!isSettingsPreferences(collection, recordId) || !isObject(output.ledgerSettings)) return output;
    output.ledgerSettings = clone(output.ledgerSettings); delete output.ledgerSettings.lastRecalculatedAt; return output;
  }
  function deepMerge(original, incoming) {
    if (!isObject(original) || !isObject(incoming)) return clone(incoming === undefined ? original : incoming);
    const result = clone(original);
    Object.keys(incoming).forEach(key => {
      result[key] = isObject(result[key]) && isObject(incoming[key]) ? deepMerge(result[key], incoming[key]) : clone(incoming[key]);
    });
    return result;
  }
  function threeWayMerge(baseValue, localValue, remoteValue, path = "", overlap = []) {
    if (same(localValue, remoteValue)) return clone(localValue);
    if (same(localValue, baseValue)) return clone(remoteValue);
    if (same(remoteValue, baseValue)) return clone(localValue);
    if (isObject(localValue) && isObject(remoteValue) && (baseValue === undefined || isObject(baseValue))) {
      const result = {};
      const keys = new Set([...Object.keys(baseValue || {}), ...Object.keys(localValue), ...Object.keys(remoteValue)]);
      keys.forEach(key => {
        result[key] = threeWayMerge(baseValue?.[key], localValue?.[key], remoteValue?.[key], path ? `${path}.${key}` : key, overlap);
      });
      return result;
    }
    overlap.push(path || "record");
    return clone(localValue);
  }
  function normalizeRecordStore(value) {
    const output = {};
    if (!isObject(value)) return output;
    Object.entries(value).forEach(([key, row]) => {
      if (!row || !row.collection || !row.recordId) return;
      output[key] = {
        collection:String(row.collection), recordId:String(row.recordId), payload:sanitizeRecordPayload(String(row.collection),String(row.recordId),row.payload),
        sortIndex:Number(row.sortIndex || 0), revision:Number(row.revision || 0), deletedAt:row.deletedAt || "", updatedAt:row.updatedAt || "",
        updatedByDevice:row.updatedByDevice || "", appVersion:row.appVersion || "",
        appVersionCode:Number(row.appVersionCode || 0), minWriterVersionCode:Number(row.minWriterVersionCode || APP_VERSION_CODE)
      };
    });
    return output;
  }
  function normalizeQueue(value) {
    const output = {};
    if (!isObject(value)) return output;
    Object.entries(value).forEach(([key, item]) => {
      if (!item || !item.collection || !item.recordId) return;
      output[key] = {
        ...item, payload:sanitizeRecordPayload(String(item.collection),String(item.recordId),item.payload),
        basePayload:item.basePayload == null ? null : sanitizeRecordPayload(String(item.collection),String(item.recordId),item.basePayload),
        baseRevision:Number(item.baseRevision || 0), sortIndex:Number(item.sortIndex || 0), baseSortIndex:Number(item.baseSortIndex || 0), deleted:Boolean(item.deleted),
        attempts:Number(item.attempts || 0), nextAttemptAt:Number(item.nextAttemptAt || 0),
        status:["pending","retrying","error","conflict"].includes(item.status) ? item.status : "pending"
      };
    });
    return output;
  }
  function normalizeConflicts(value) {
    return (Array.isArray(value) ? value : []).filter(item => item?.id && item?.key).slice(0, MAX_CONFLICTS).map(item => ({ ...item,
      localPayload:sanitizeRecordPayload(String(item.collection || ""),String(item.recordId || ""),item.localPayload),
      remotePayload:sanitizeRecordPayload(String(item.collection || ""),String(item.recordId || ""),item.remotePayload),
      basePayload:item.basePayload == null ? null : sanitizeRecordPayload(String(item.collection || ""),String(item.recordId || ""),item.basePayload),
      localSortIndex:item.localSortIndex == null ? null : Number(item.localSortIndex || 0), localDeleted:Boolean(item.localDeleted),
      remoteRevision:Number(item.remoteRevision || 0), remoteSortIndex:item.remoteSortIndex == null ? null : Number(item.remoteSortIndex || 0), remoteMissing:Boolean(item.remoteMissing)
    }));
  }
  function reconcileDerivedSettingsState() {
    const key = recordKey("settings","preferences"), local = pending[key], base = baseRecords[key], conflict = conflicts.find(item => item.key === key && !item.resolved);
    if (!local) return false;
    if (!conflict) {
      if (!local.deleted && base && !base.deletedAt && same(local.payload,base.payload) && Number(local.sortIndex || 0) === Number(base.sortIndex || 0)) {
        delete pending[key]; conflicts = conflicts.filter(item => item.key !== key); return true;
      }
      return false;
    }
    if (local.deleted || conflict.remoteDeletedAt) return false;
    const remotePayload = sanitizeRecordPayload("settings","preferences",conflict.remotePayload || base?.payload || {});
    const overlaps = [], merged = threeWayMerge(local.basePayload,local.payload,remotePayload,"",overlaps);
    if (overlaps.length) return false;
    const remoteRevision = Math.max(Number(conflict.remoteRevision || 0),Number(base?.revision || 0)), remoteSortIndex = Number(base?.sortIndex || 0);
    baseRecords[key] = { ...(base || {}), collection:"settings", recordId:"preferences", payload:remotePayload, sortIndex:remoteSortIndex, revision:remoteRevision, deletedAt:"" };
    if (same(merged,remotePayload) && Number(local.sortIndex || 0) === remoteSortIndex) delete pending[key];
    else {
      local.payload = merged; local.basePayload = clone(remotePayload);
      local.baseRevision = remoteRevision; local.baseSortIndex = remoteSortIndex;
      local.status = "pending"; local.attempts = 0; local.nextAttemptAt = 0;
      local.lastError = "Removed device-local ledger metadata and safely merged cloud settings.";
    }
    conflicts = conflicts.filter(item => item.key !== key); return true;
  }
  function currentDeviceId() {
    try {
      if (typeof ensureCurrentDevice === "function") ensureCurrentDevice();
      const id = typeof appMeta !== "undefined" ? appMeta.currentDeviceId : "";
      if (id) return String(id);
    } catch (error) {}
    if (!state.currentDeviceId) state.currentDeviceId = uid("device");
    persist();
    return state.currentDeviceId;
  }

  function currentDeviceName() {
    try {
      const id = currentDeviceId();
      const saved = typeof appMeta !== "undefined" ? appMeta.devices?.[id]?.name : "";
      if (saved) return saved;
    } catch (error) {}
    if (state.currentDeviceName) return state.currentDeviceName;
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "Nyco’s iPhone" : /Mac/i.test(navigator.platform || navigator.userAgent) ? "Nyco’s MacBook" : "My device";
  }

  function getStoredConfig() {
    const fileConfig = window.FINANCE_SYNC_CONFIG || {};
    const localConfig = loadJson(CONFIG_KEY, {});
    return {
      supabaseUrl:String(localConfig.supabaseUrl || fileConfig.supabaseUrl || "").trim().replace(/\/+$/, ""),
      supabasePublishableKey:String(localConfig.supabasePublishableKey || fileConfig.supabasePublishableKey || "").trim()
    };
  }

  function configStatus(config = getStoredConfig()) {
    if (!config.supabaseUrl || !config.supabasePublishableKey) return { ok:false, message:"Add your Supabase project URL and publishable key." };
    if (!/^https:\/\//i.test(config.supabaseUrl)) return { ok:false, message:"Enter a valid HTTPS Supabase project URL." };
    if (/^sb_secret_/i.test(config.supabasePublishableKey) || /service[_-]?role/i.test(config.supabasePublishableKey)) return { ok:false, message:"Secret and service-role keys are blocked. Use a publishable or legacy anon key." };
    if (config.supabasePublishableKey.length < 20) return { ok:false, message:"The publishable key appears incomplete." };
    return { ok:true, message:"Cloud project configured." };
  }

  function recordLabel(collection, payload, recordId) {
    const labels = {
      expenses:"Expense", projects:"Project", incomeRecords:"Income", savingsGoals:"Savings goal",
      accountLedger:"Ledger entry", accountReconciliations:"Reconciliation", accounts:"Account",
      monthlyReports:"Monthly report", monthlyChecklists:"Monthly checklist", monthlyBudgets:"Monthly budget", budgetTemplates:"Budget template", iconLibrary:"Icon",
      expenseRecurrenceSkips:"Recurring skip", settings:"Settings", extra:"App data"
    };
    const name = payload?.name || payload?.description || payload?.account || payload?.month || recordId;
    return `${labels[collection] || collection}: ${String(name || recordId).slice(0, 90)}`;
  }

  function recordFromRow(row) {
    const collection = String(row.collection || "");
    const recordId = String(row.record_id ?? row.recordId ?? "");
    return {
      collection, recordId, payload:sanitizeRecordPayload(collection,recordId,row.payload), sortIndex:Number(row.sort_index ?? row.sortIndex ?? 0),
      revision:Number(row.revision || 0), deletedAt:row.deleted_at ?? row.deletedAt ?? "",
      updatedAt:row.updated_at ?? row.updatedAt ?? "", updatedByDevice:row.updated_by_device ?? row.updatedByDevice ?? row.device_id ?? "",
      appVersion:row.app_version ?? row.appVersion ?? "", appVersionCode:Number(row.app_version_code ?? row.appVersionCode ?? 0),
      minWriterVersionCode:Number(row.min_writer_version_code ?? row.minWriterVersionCode ?? APP_VERSION_CODE)
    };
  }

  function toRecordMap(source) {
    const records = {};
    const add = (collection, recordId, payload, sortIndex = 0) => {
      if (!recordId) return;
      const key = recordKey(collection, String(recordId));
      records[key] = { collection, recordId:String(recordId), payload:clone(payload || {}), sortIndex:Number(sortIndex || 0), deleted:false };
    };

    ARRAY_COLLECTIONS.forEach(collection => {
      (Array.isArray(source?.[collection]) ? source[collection] : []).forEach((item, index) => {
        if (item?.id) add(collection, item.id, item, index);
      });
    });

    const accountOrder = Array.isArray(source?.accountOrder) ? source.accountOrder : Object.keys(source?.accounts || {});
    accountOrder.forEach((name, index) => {
      if (!Object.prototype.hasOwnProperty.call(source?.accounts || {}, name)) return;
      add("accounts", name, {
        name,
        balance:Number(source.accounts[name] || 0),
        type:source.accountTypes?.[name] || "Other",
        icon:source.accountIcons?.[name] || null
      }, index);
    });
    Object.keys(source?.accounts || {}).filter(name => !accountOrder.includes(name)).forEach((name, index) => {
      add("accounts", name, { name, balance:Number(source.accounts[name] || 0), type:source.accountTypes?.[name] || "Other", icon:source.accountIcons?.[name] || null }, accountOrder.length + index);
    });

    MAP_COLLECTIONS.forEach(collection => {
      Object.entries(isObject(source?.[collection]) ? source[collection] : {}).forEach(([id, payload], index) => add(collection, id, payload, index));
    });

    (Array.isArray(source?.expenseRecurrenceSkips) ? source.expenseRecurrenceSkips : []).forEach((item, index) => {
      const id = `${String(item?.seriesId || "")}::${String(item?.month || "")}`;
      if (item?.seriesId && item?.month) add("expenseRecurrenceSkips", id, item, index);
    });

    add("settings", "preferences", {
      savingsSettings:clone(source?.savingsSettings || {}),
      projectCalendarSettings:clone(source?.projectCalendarSettings || {}),
      salaryWorkSettings:clone(source?.salaryWorkSettings || {}),
      ledgerSettings:sanitizeRecordPayload("settings","preferences",{ ledgerSettings:source?.ledgerSettings || {} }).ledgerSettings,
      budgetSettings:clone(source?.budgetSettings || {}),
      productivitySettings:clone(source?.productivitySettings || {}),
      reminderSettings:clone(source?.reminderSettings || {})
    }, 0);

    const extra = {};
    Object.keys(source || {}).forEach(key => { if (!KNOWN_TOP_LEVEL.has(key)) extra[key] = clone(source[key]); });
    if (Object.keys(extra).length) add("extra", "root", extra, 0);
    return records;
  }

  function fromRecordStore(store, fallback = {}) {
    const active = Object.values(store || {}).filter(row => row && !row.deletedAt).sort((a,b) => Number(a.sortIndex || 0) - Number(b.sortIndex || 0) || String(a.recordId).localeCompare(String(b.recordId)));
    const output = {};
    ARRAY_COLLECTIONS.forEach(collection => { output[collection] = active.filter(row => row.collection === collection).map(row => clone(row.payload)); });

    output.accounts = {};
    output.accountTypes = {};
    output.accountIcons = {};
    output.accountOrder = [];
    active.filter(row => row.collection === "accounts").forEach(row => {
      const name = String(row.payload?.name || row.recordId);
      output.accounts[name] = Number(row.payload?.balance || 0);
      output.accountTypes[name] = row.payload?.type || "Other";
      if (row.payload?.icon) output.accountIcons[name] = clone(row.payload.icon);
      output.accountOrder.push(name);
    });

    MAP_COLLECTIONS.forEach(collection => {
      output[collection] = {};
      active.filter(row => row.collection === collection).forEach(row => { output[collection][row.recordId] = clone(row.payload); });
    });
    output.expenseRecurrenceSkips = active.filter(row => row.collection === "expenseRecurrenceSkips").map(row => clone(row.payload));

    const settings = active.find(row => row.collection === "settings" && row.recordId === "preferences")?.payload || {};
    output.savingsSettings = clone(settings.savingsSettings || fallback?.savingsSettings || {});
    output.projectCalendarSettings = clone(settings.projectCalendarSettings || fallback?.projectCalendarSettings || {});
    output.salaryWorkSettings = clone(settings.salaryWorkSettings || fallback?.salaryWorkSettings || {});
    const localLedgerSettings = clone(fallback?.ledgerSettings || {});
    output.ledgerSettings = clone(settings.ledgerSettings || localLedgerSettings);
    if (localLedgerSettings.lastRecalculatedAt) output.ledgerSettings.lastRecalculatedAt = localLedgerSettings.lastRecalculatedAt;
    else delete output.ledgerSettings.lastRecalculatedAt;
    output.budgetSettings = clone(settings.budgetSettings || fallback?.budgetSettings || {});
    output.productivitySettings = clone(settings.productivitySettings || fallback?.productivitySettings || {});
    output.reminderSettings = clone(settings.reminderSettings || fallback?.reminderSettings || {});
    const extra = active.find(row => row.collection === "extra" && row.recordId === "root")?.payload;
    if (isObject(extra)) Object.assign(output, clone(extra));
    return output;
  }

  function effectiveRecordStore() {
    const store = normalizeRecordStore(baseRecords);
    Object.entries(pending).forEach(([key, item]) => {
      store[key] = {
        collection:item.collection, recordId:item.recordId, payload:clone(item.payload || {}),
        sortIndex:Number(item.sortIndex || 0), revision:Number(item.baseRevision || 0),
        deletedAt:item.deleted ? (item.updatedAt || nowIso()) : "", updatedAt:item.updatedAt || "",
        updatedByDevice:currentDeviceId(), appVersion:appVersion(), appVersionCode:APP_VERSION_CODE,
        minWriterVersionCode:Number(item.minWriterVersionCode || APP_VERSION_CODE)
      };
    });
    return store;
  }

  function applyEffectiveRecords(message = "Cloud records applied") {
    suppressQueue = true;
    const previous = clone(typeof data !== "undefined" ? data : {});
    let replaced = false;
    try {
      const integrity = window.FinanceIntegrity;
      if (!integrity?.scan) throw new Error("Financial integrity protection is unavailable. Reload Talaan before applying cloud records.");
      const next = fromRecordStore(effectiveRecordStore(), typeof data !== "undefined" ? data : {});
      const proposedReport = integrity.scan(next, { includeStorage:false });
      if (proposedReport.counts.critical) {
        setStatus("Integrity review required", `${proposedReport.counts.critical} critical issue${proposedReport.counts.critical === 1 ? "" : "s"} found in the proposed cloud finance state. Local records were kept.`, "danger");
        throw new Error("Cloud finance state failed integrity verification before local replacement.");
      }
      const normalized = normalizeData(clone(next));
      const normalizedReport = integrity.scan(normalized, { includeStorage:false });
      if (normalizedReport.counts.critical) {
        setStatus("Integrity review required", `${normalizedReport.counts.critical} critical issue${normalizedReport.counts.critical === 1 ? "" : "s"} remained after safe normalization. Local records were kept.`, "danger");
        throw new Error("Cloud finance state failed integrity verification after normalization.");
      }
      data = normalized;
      replaced = true;
      if (typeof persistFinanceDataRaw === "function") {
        const saved = persistFinanceDataRaw(message);
        if (saved === false) throw new Error("Cloud records could not be persisted locally.");
      } else localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      const persistedReport = integrity.scan(data, { includeStorage:true });
      if (persistedReport.counts.critical) throw new Error("Persisted cloud finance state failed integrity verification.");
      lastObservedData = clone(data);
      if (typeof renderAll === "function") renderAll(false);
      if (typeof renderV12Settings === "function") renderV12Settings();
      try { if (typeof addSyncHistory === "function") addSyncHistory(message, "success", { cloudSchemaVersion:3, profileId:cloudProfileId(), auditId:state.lastAuditId }); } catch (error) {}
    } catch (error) {
      if (replaced) {
        data = normalizeData(clone(previous));
        try {
          if (typeof persistFinanceDataRaw === "function") persistFinanceDataRaw("Cloud integrity rollback restored local records");
          else localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          lastObservedData = clone(data);
          if (typeof renderAll === "function") renderAll(false);
        } catch (rollbackError) { console.error("Cloud integrity rollback failed.", rollbackError); }
      }
      throw error;
    } finally { suppressQueue = false; }
  }

  function seedBaseFromSnapshot(records) {
    baseRecords = {};
    (records || []).forEach(raw => {
      const row = recordFromRow(raw);
      if (!row.collection || !row.recordId) return;
      baseRecords[recordKey(row.collection,row.recordId)] = row;
    });
    persist();
  }

  function queueDiff(beforeData, afterData, reason = "Local save") {
    if (suppressQueue || state.initializedUserId !== initializedScope()) return;
    const before = toRecordMap(beforeData);
    const after = toRecordMap(afterData);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    let changed = 0;
    keys.forEach(key => {
      const prior = before[key];
      const next = after[key];
      if (prior && next && same(prior.payload,next.payload) && prior.sortIndex === next.sortIndex) return;
      const base = baseRecords[key];
      const deleted = !next;
      const currentPayload = clone(next?.payload || prior?.payload || base?.payload || {});
      const currentSort = Number(next?.sortIndex || 0);
      const matchesBase = base && Boolean(base.deletedAt) === deleted && same(base.payload,currentPayload) && Number(base.sortIndex || 0) === currentSort;
      if (matchesBase || (!base && deleted)) {
        delete pending[key];
        conflicts = conflicts.filter(item => item.key !== key);
        return;
      }
      const existing = pending[key];
      pending[key] = {
        key,
        collection:next?.collection || prior?.collection || base?.collection || splitKey(key)[0],
        recordId:next?.recordId || prior?.recordId || base?.recordId || splitKey(key)[1],
        payload:currentPayload,
        sortIndex:currentSort,
        deleted,
        baseRevision:existing ? Number(existing.baseRevision || 0) : Number(base?.revision || 0),
        basePayload:existing ? clone(existing.basePayload) : clone(base?.payload ?? null),
        baseSortIndex:existing ? Number(existing.baseSortIndex || 0) : Number(base?.sortIndex || 0),
        minWriterVersionCode:APP_VERSION_CODE,
        status:existing?.status === "conflict" ? "conflict" : "pending",
        attempts:existing?.status === "conflict" ? Number(existing.attempts || 0) : 0,
        nextAttemptAt:0,
        updatedAt:nowIso(),
        reason:String(reason || "Local save").slice(0,160),
        lastError:existing?.status === "conflict" ? existing.lastError || "Record changed on another device." : ""
      };
      changed += 1;
    });
    persist();
    if (changed) {
      setStatus(navigator.onLine ? "Changes pending" : "Offline changes pending", `${pendingCount()} record${pendingCount() === 1 ? "" : "s"} waiting to synchronize.`, navigator.onLine ? "warning" : "info");
      if (state.autoSync !== false && navigator.onLine) scheduleSync();
    }
    renderSyncHealth();
  }

  function wrapSaveData() {
    if (saveWrapped || typeof saveData !== "function") return;
    const original = saveData;
    saveData = function recordAwareSaveData(message = "Saved") {
      const result = original(message);
      if (result === false) return result;
      const after = clone(data);
      if(!same(lastObservedData,after)){queueDiff(lastObservedData,after,message);lastObservedData=after;}
      return result;
    };
    saveWrapped = true;
  }
  function handlePersistedData(event) { const next=normalizeData(clone(event?.detail?.data??(typeof data!=="undefined"?data:{}))); if(!suppressQueue)queueDiff(lastObservedData,next,String(event?.detail?.action||"Finance data updated")); lastObservedData=clone(next); }
  function reconcileUnqueuedLocalChanges(reason="Recovered unqueued local Finance changes") { if(suppressQueue||!profileCanWrite()||state.initializedUserId!==initializedScope()||!Object.keys(baseRecords).length||typeof data==="undefined")return[]; const tracked=fromRecordStore(effectiveRecordStore(),data),before=toRecordMap(tracked),after=toRecordMap(data),keys=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>{const prior=before[key],next=after[key];return!prior||!next||!same(prior.payload,next.payload)||Number(prior.sortIndex||0)!==Number(next.sortIndex||0);}); if(keys.length)queueDiff(tracked,data,reason); return keys; }
  function pendingCount() { return Object.keys(pending).length; }
  function conflictCount() { return conflicts.filter(item => !item.resolved).length; }

  function cloudReadiness() {
    if (!configStatus().ok) return { key:"cloud-off", label:"Cloud off", detail:"Cloud sync is not configured on this device.", ready:false };
    if (!cloudUser) return { key:"signed-out", label:"Sign in", detail:"Sign in to connect encrypted Cloud Sync.", ready:false };
    if (profileSetupState === "checking") return { key:"connecting", label:"Connecting…", detail:"Checking the encrypted cloud profile for this account.", ready:false };
    if (profileSetupState === "profile-error") return { key:"profile-error", label:"Profile issue", detail:profileSetupDetail || "The cloud profile could not be checked. Open Profile & Security to try again.", ready:false };
    if (!cloudProfileId()) {
      if (profileSetupState === "profile-locked") return { key:"profile-locked", label:"Unlock profile", detail:profileSetupDetail || "An existing encrypted cloud profile was found. Unlock it in Profile & Security to continue.", ready:false };
      return { key:"profile-required", label:"Set up profile", detail:"Create or join an encrypted cloud profile in Profile & Security to continue.", ready:false };
    }
    if (!PROFILE_ARCH()?.isCloudUnlocked?.()) return { key:"profile-locked", label:"Unlock profile", detail:"Unlock this profile’s passphrase in Profile & Security before synchronizing.", ready:false };
    if (state.initializedUserId !== initializedScope()) return { key:"connecting", label:"Connecting…", detail:"Preparing this device to use the current encrypted cloud profile.", ready:false };
    return { key:"ready", label:"Ready", detail:"This device is connected to the current encrypted cloud profile.", ready:true };
  }

  function recoverStoredConflicts() {
    let recovered = 0;
    conflicts.filter(item => !item.resolved).forEach(conflict => {
      const key = conflict.key, base = baseRecords[key];
      if (!base) return;
      let item = pending[key];
      if (!item) {
        const [collection,recordId] = splitKey(key);
        item = pending[key] = {
          key,
          collection:String(conflict.collection || collection),
          recordId:String(conflict.recordId || recordId),
          payload:clone(conflict.localPayload || {}),
          sortIndex:Number(conflict.localSortIndex ?? base.sortIndex ?? 0),
          deleted:Boolean(conflict.localDeleted),
          baseRevision:Number(conflict.remoteRevision || base.revision || 0),
          basePayload:clone(conflict.remotePayload || base.payload || {}),
          baseSortIndex:Number(conflict.remoteSortIndex ?? base.sortIndex ?? 0),
          minWriterVersionCode:APP_VERSION_CODE,
          status:"conflict",
          attempts:0,
          nextAttemptAt:0,
          updatedAt:conflict.createdAt || nowIso(),
          reason:"Recovered unresolved multi-device conflict",
          lastError:"Both cloud and this device changed this record. Review both versions before choosing."
        };
        recovered += 1;
      } else {
        item.status = "conflict";
        item.lastError = "Both cloud and this device changed this record. Review both versions before choosing.";
      }
    });
    if (!recovered) return 0;
    persist({ reclaimFirst:true });
    applyEffectiveRecords("Recovered unresolved device edits without discarding them");
    return recovered;
  }

  function topStatusLabel() {
    if (!configStatus().ok) return "Cloud off";
    if (!navigator.onLine) return pendingCount() ? `${pendingCount()} pending` : "Offline";
    if (syncing) return "Syncing…";
    if (passwordRecoveryActive || passwordRecoveryRouteActive) return "Reset password";
    if (!cloudUser) return "Sign in";
    const readiness = cloudReadiness();
    if (!readiness.ready) return readiness.label;
    if (conflictCount()) return "Sync issue";
    if (pendingCount()) return "Needs sync";
    if (state.lastError) return "Sync issue";
    return state.lastSyncAt ? "Synced" : "Needs sync";
  }

  function topSyncStateKey(label = topStatusLabel()) {
    if (label === "Synced") return "synced";
    if (label === "Syncing…") return "syncing";
    if (label === "Needs sync") return "needs-sync";
    if (label === "Sync issue") return "sync-issue";
    if (label === "Offline" || /^\d+ pending$/.test(label)) return "offline";
    return "setup";
  }

  function isIconOnlyTopSyncButton() {
    return Boolean(window.matchMedia?.(ICON_ONLY_SYNC_QUERY).matches);
  }

  function clearMobileSyncFeedback() {
    if (mobileSyncFeedbackTimer) clearTimeout(mobileSyncFeedbackTimer);
    mobileSyncFeedbackTimer = null;
    const top = document.getElementById("cloudSyncStatusButton");
    if (top) {
      delete top.dataset.mobileSyncFeedback;
      delete top.dataset.mobileSyncTone;
    }
  }

  function showMobileSyncFeedback(message, tone = "info", hideAfter = 0) {
    if (!isIconOnlyTopSyncButton()) return;
    clearMobileSyncFeedback();
    const top = document.getElementById("cloudSyncStatusButton");
    const live = document.getElementById("cloudSyncMobileLive");
    if (top) {
      top.dataset.mobileSyncFeedback = message;
      top.dataset.mobileSyncTone = tone;
    }
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = message; });
    }
    if (hideAfter > 0) mobileSyncFeedbackTimer = setTimeout(clearMobileSyncFeedback, hideAfter);
  }

  function mobileSyncOutcome() {
    const label = topStatusLabel();
    if (label === "Synced") return { message:"Synced.", tone:"success" };
    if (label === "Offline" || /^\d+ pending$/.test(label)) return { message:"Offline: sync paused.", tone:"danger" };
    if (label === "Sign in") return { message:"Sign in to sync.", tone:"warning" };
    if (label === "Sync issue") return { message:"Sync needs attention.", tone:"danger" };
    if (label === "Needs sync") return { message:"Changes still pending.", tone:"warning" };
    return { message:label, tone:"warning" };
  }

  function updateTopSyncUi(detail = "") {
    const top=document.getElementById("cloudSyncStatusButton"), label=topStatusLabel(), readiness=cloudReadiness();
    if (top) {
      const topLabel = topSyncRequestPending ? "Syncing…" : label;
      top.dataset.syncState=topSyncStateKey(topLabel);
      const text=top.querySelector(".cloud-sync-label") || top.querySelector("span:last-child");
      if (text) text.textContent=topLabel;
      const iconOnly = isIconOnlyTopSyncButton();
      top.setAttribute("aria-label",iconOnly ? `Sync now. ${topLabel}` : `Cloud sync: ${topLabel}`);
      top.title=iconOnly ? `Sync now · ${topLabel}` : `Cloud sync: ${topLabel}`;
      top.setAttribute("aria-busy", syncing || topSyncRequestPending ? "true" : "false");
      if (iconOnly) {
        top.removeAttribute("aria-haspopup");
        top.removeAttribute("aria-controls");
        top.removeAttribute("aria-expanded");
      } else {
        const pop=document.getElementById("cloudSyncToolbarPopover");
        top.setAttribute("aria-haspopup","dialog");
        top.setAttribute("aria-controls","cloudSyncToolbarPopover");
        top.setAttribute("aria-expanded",String(Boolean(pop && !pop.hidden)));
      }
    }
    const stateNode=document.getElementById("cloudToolbarState"), detailNode=document.getElementById("cloudToolbarDetail"), lastNode=document.getElementById("cloudToolbarLastSync"), syncButton=document.getElementById("cloudToolbarSyncNow"), fixButton=document.getElementById("cloudToolbarFixIssue");
    if (stateNode) stateNode.textContent=label;
    const conflictsNow = conflictCount();
    const pendingErrors = Object.values(pending).filter(item => item.status === "error" || item.status === "conflict").length;
    let activeDetail = detail;
    if (!activeDetail) {
      if (conflictsNow > 0) activeDetail = `${conflictsNow} record conflict${conflictsNow === 1 ? "" : "s"} preserved for review. Neither version will be silently discarded.`;
      else if (pendingErrors > 0) activeDetail = `${pendingErrors} pending record change${pendingErrors === 1 ? "" : "s"} failed to sync.`;
      else if (!readiness.ready && cloudUser && !passwordRecoveryActive && !passwordRecoveryRouteActive) activeDetail = readiness.detail;
      else if (state.lastError) activeDetail = "Cloud Sync could not finish. Your local changes are safe. Check your connection, then try Sync now or review the issue.";
      else activeDetail = state.status || (label === "Synced" ? "This device matches the latest cloud state." : label === "Cloud off" ? "Cloud sync is not configured on this device." : "Cloud is checked before this device can upload changes.");
    }
    if (detailNode) detailNode.textContent=activeDetail;
    const technicalDetails=document.getElementById("cloudToolbarTechnicalDetails"),technicalError=document.getElementById("cloudToolbarTechnicalError"); if(technicalDetails){technicalDetails.hidden=!state.lastError;if(technicalError)technicalError.textContent=state.lastError||"";}
    if (lastNode) lastNode.textContent=formatDateTime(state.lastSyncAt);
    if (syncButton) syncButton.disabled=syncing || !navigator.onLine || !readiness.ready;
    if (fixButton) {
      if (!readiness.ready && cloudUser && !passwordRecoveryActive && !passwordRecoveryRouteActive) {
        fixButton.hidden = false;
        fixButton.textContent = readiness.key === "profile-locked" ? "Unlock profile" : readiness.key === "profile-required" ? "Set up profile" : "Review profile";
      } else if (conflictsNow > 0 || pendingErrors > 0 || label === "Sync issue" || Boolean(state.lastError)) {
        fixButton.hidden = false;
        fixButton.textContent = conflictsNow > 0 ? "Review conflicts" : pendingErrors > 0 ? `Fix ${pendingErrors} sync issue${pendingErrors === 1 ? "" : "s"}` : "Review & fix issue";
      } else fixButton.hidden = true;
    }
  }

  function closeTopSyncPopover() { const pop=document.getElementById("cloudSyncToolbarPopover"), button=document.getElementById("cloudSyncStatusButton"); if(pop)pop.hidden=true; if(button&&!isIconOnlyTopSyncButton())button.setAttribute("aria-expanded","false"); }
  function toggleTopSyncPopover() { const pop=document.getElementById("cloudSyncToolbarPopover"), button=document.getElementById("cloudSyncStatusButton"); if(!pop||!button)return; const opening=pop.hidden; pop.hidden=!opening; button.setAttribute("aria-expanded",String(opening)); updateTopSyncUi(); if(opening && typeof positionCloudToolbarPopover === "function") requestAnimationFrame(positionCloudToolbarPopover); }
  async function runTopSyncAction() {
    if (syncing || topSyncRequestPending) {
      showMobileSyncFeedback("Syncing…");
      return;
    }
    const readiness = cloudReadiness();
    if (!cloudUser || !readiness.ready) {
      showMobileSyncFeedback(!cloudUser ? "Sign in to sync." : readiness.label, "warning", 2400);
      toggleTopSyncPopover();
      return;
    }
    if (!navigator.onLine) {
      setStatus("Offline", `${pendingCount()} device change${pendingCount()===1?"":"s"} waiting for cloud.`, "info");
      showMobileSyncFeedback("Offline: sync paused.", "danger", 2400);
      return;
    }
    topSyncRequestPending = true;
    showMobileSyncFeedback("Syncing…");
    updateTopSyncUi();
    try {
      await syncNow({reason:"mobile-toolbar"});
      const outcome = mobileSyncOutcome();
      showMobileSyncFeedback(outcome.message, outcome.tone, 1800);
    } catch (error) {
      showMobileSyncFeedback("Sync failed.", "danger", 2400);
      showToast(error.message,"warning");
    } finally {
      topSyncRequestPending = false;
      updateTopSyncUi();
    }
  }
  function openCloudRecoveryTarget() {
    closeTopSyncPopover();
    if (typeof goToPage === "function") goToPage("settings", { smooth:false });
    if (typeof activateSettingsPanel === "function") activateSettingsPanel(cloudReadiness().ready ? "sync" : "profiles", true);
  }

  function setStatus(status, detail = "", tone = "info") {
    state.status = status;
    if (tone === "danger") state.lastError = detail || status;
    else if (!["warning"].includes(tone)) state.lastError = "";
    persist();
    const chip = document.getElementById("cloudStatusChip");
    if (chip) { chip.textContent = status; chip.className = `status-chip ${tone}`; }
    const detailNode = document.getElementById("cloudStatusDetail"); if (detailNode) detailNode.textContent = detail || status;
    updateTopSyncUi(detail); renderCloudStats();
  }

  function formatDateTime(value) { if (!value) return "Never"; try { return new Intl.DateTimeFormat("en-PH", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value)); } catch (error) { return String(value); } }

  function injectV2Ui() {
    window.FinanceCloudConflictReview?.ensure?.();
    if (document.getElementById("cloudSyncHealthCard")) return;
    const connected = document.getElementById("cloudConnectedSection");
    if (!connected) return;
    const style = document.createElement("style");
    style.textContent = `.cloud-v3-health-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cloud-v3-health-grid>div{padding:9px 10px;border:1px solid var(--line);border-radius:var(--talaan-card-radius);background:var(--surface-soft);min-width:0}.cloud-v3-health-grid span,.cloud-v3-health-grid strong{display:block;overflow-wrap:anywhere}.cloud-v3-health-grid span{color:var(--muted);font-size:.61rem}.cloud-v3-health-grid strong{margin-top:3px;font-size:.72rem}.cloud-pending-list{display:grid;gap:7px}.cloud-pending-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border:1px solid var(--line);border-radius:var(--talaan-card-radius);background:var(--surface-soft)}.cloud-pending-item[data-status="conflict"]{border-color:color-mix(in srgb,var(--orange) 42%,var(--line));background:var(--orange-soft)}.cloud-pending-item[data-status="error"]{border-color:color-mix(in srgb,var(--red) 35%,var(--line));background:var(--red-soft)}.cloud-pending-item strong,.cloud-pending-item small{display:block;overflow-wrap:anywhere}.cloud-pending-item strong{font-size:.69rem}.cloud-pending-item small{margin-top:2px;color:var(--muted);font-size:.59rem}.cloud-pending-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px}.cloud-audit-list{display:grid;gap:5px;max-height:250px;overflow:auto}.cloud-audit-row{display:grid;grid-template-columns:90px minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 8px;border-bottom:1px solid var(--line);font-size:.62rem}.cloud-audit-row small{color:var(--muted)}@media(max-width:900px){.cloud-v3-health-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.cloud-v3-health-grid{grid-template-columns:1fr}.cloud-pending-item{grid-template-columns:1fr}.cloud-pending-actions{justify-content:flex-start}.cloud-pending-actions .button{min-height:42px}.cloud-audit-row{grid-template-columns:1fr}.cloud-device-table th:nth-child(3),.cloud-device-table td:nth-child(3){display:table-cell}}`;
    document.head.appendChild(style);
    const controls = connected.firstElementChild;
    controls?.insertAdjacentHTML("afterend", `<article class="card" id="cloudSyncHealthCard"><div class="card-header"><div><h3>Sync Health</h3><p>Encrypted Cloud Sync 3.0 status and compatibility</p></div><span class="status-chip info" id="cloudProtocolChip">Cloud Schema V3</span></div><div class="cloud-v3-health-grid"><div><span>Protocol</span><strong>Encrypted record-level V3</strong></div><div><span>Last cloud audit</span><strong id="cloudAuditCursor">0</strong></div><div><span>Last pull</span><strong id="cloudLastPull">Never</strong></div><div><span>Last push</span><strong id="cloudLastPush">Never</strong></div><div><span>Pending records</span><strong id="cloudHealthPending">0</strong></div><div><span>Conflicts</span><strong id="cloudHealthConflicts">0</strong></div><div><span>This app</span><strong id="cloudHealthAppVersion">V${appVersion()}</strong></div><div><span>Minimum writer</span><strong id="cloudHealthRequiredVersion">V13.0.0</strong></div></div><p class="system-help" id="cloudHealthMessage">Cloud revisions are checked first; pending device edits are preserved, safely merged, or held for review.</p></article><article class="card" id="cloudPendingCard"><div class="card-header"><div><h3>Queued device changes</h3><p>Local edits waiting for cloud confirmation</p></div><span class="status-chip success" id="cloudPendingChip">Nothing pending</span></div><div class="cloud-pending-list" id="cloudPendingList"><div class="system-empty">No records are waiting to synchronize.</div></div></article><article class="card" id="cloudAuditCard"><div class="card-header"><div><h3>Recent cloud audit</h3><p>Immutable record activity received by this device</p></div><span class="status-chip info">Latest 30</span></div><div class="cloud-audit-list" id="cloudAuditList"><div class="system-empty">No Cloud Schema V3 activity has been received yet.</div></div></article>`);
    const healthCard=document.getElementById("cloudSyncHealthCard");
    if (healthCard && !document.getElementById("cloudReplaceFromDeviceCard")) healthCard.insertAdjacentHTML("afterend", `<article class="card" id="cloudReplaceFromDeviceCard"><div class="card-header"><div><h3>Cloud recovery</h3><p>Use only when this device contains the finance copy you want every device to use.</p></div><span class="status-chip warning">Protected action</span></div><p class="system-help">A local recovery point is created first. The app then compares current cloud revisions before replacing them with this device’s current records.</p><div class="card-actions"><button class="button button-danger" id="cloudReplaceFromDevice" type="button">Make this device the current cloud copy</button></div></article>`);
  }

  function renderCloudStats() {
    injectV2Ui();
    const configured = configStatus().ok;
    const readiness = cloudReadiness();
    const ready = readiness.ready;
    const disconnected = document.getElementById("cloudDisconnectedSection");
    const connected = document.getElementById("cloudConnectedSection");
    const recovery = document.getElementById("cloudPasswordRecoveryCard");
    const recoveryHelp = document.getElementById("cloudRecoveryHelpCard");
    if (recovery) recovery.hidden = !passwordRecoveryActive;
    if (recoveryHelp) recoveryHelp.hidden = !(passwordRecoveryRouteActive && !passwordRecoveryActive);
    const recoveryUiActive = passwordRecoveryActive || passwordRecoveryRouteActive;
    if (disconnected) disconnected.hidden = recoveryUiActive || !configured || Boolean(cloudUser);
    if (connected) connected.hidden = recoveryUiActive || !configured || !ready;
    const configChip = document.getElementById("cloudConfigStatusChip"); if (configChip) { configChip.textContent = configured ? "Configured" : "Setup required"; configChip.className = `status-chip ${configured ? "success" : "warning"}`; }
    const overviewStatusChip = document.getElementById("cloudStatusChip"), overviewStatusDetail = document.getElementById("cloudStatusDetail");
    if (cloudUser && !ready && !recoveryUiActive) { if (overviewStatusChip) { overviewStatusChip.textContent = readiness.label; overviewStatusChip.className = "status-chip warning"; } if (overviewStatusDetail) overviewStatusDetail.textContent = readiness.detail; }
    const connectionChip = document.getElementById("cloudConnectionChip"); if (connectionChip) { connectionChip.textContent = ready ? "Connected" : readiness.label; connectionChip.className = `status-chip ${ready ? "success" : "warning"}`; }
    const user = document.getElementById("cloudUserEmail"); if (user) user.textContent = cloudUser?.email || "Not signed in";
    const pendingNode = document.getElementById("cloudPendingCount"); if (pendingNode) pendingNode.textContent = String(pendingCount());
    const pendingLabel = pendingNode?.parentElement?.querySelector("span"); if (pendingLabel) pendingLabel.textContent = "Queued device changes";
    const overviewHelp = document.querySelector(".cloud-sync-overview-card .system-help");
    if (overviewHelp) overviewHelp.textContent = cloudUser && !ready ? readiness.detail : cloudUser ? "Cloud revisions are checked before upload. Device edits stay pending until safely merged or explicitly resolved. Keep a downloaded backup for recovery." : "Connect Cloud Sync to keep encrypted finance records coordinated across your devices.";
    const lastSync = document.getElementById("cloudLastSync"); if (lastSync) lastSync.textContent = formatDateTime(state.lastSyncAt);
    const device = document.getElementById("cloudCurrentDevice"); if (device) device.textContent = currentDeviceName();
    const deviceInput = document.getElementById("cloudDeviceName"); if (deviceInput && document.activeElement !== deviceInput) deviceInput.value = currentDeviceName();
    const auto = document.getElementById("cloudAutoSync"); if (auto) auto.checked = state.autoSync !== false;
    const first = document.getElementById("cloudFirstSyncCard"); if (first) first.hidden = !cloudUser || ready || !cloudProfileId() || !PROFILE_ARCH()?.isCloudUnlocked?.();
    const config = getStoredConfig();
    const urlInput = document.getElementById("cloudConfigUrl"); if (urlInput && !urlInput.value) urlInput.value = config.supabaseUrl;
    const keyInput = document.getElementById("cloudConfigKey"); if (keyInput && !keyInput.value) keyInput.value = config.supabasePublishableKey;
    const conflictsNow = conflictCount();
    const pendingErrors = Object.values(pending).filter(item => item.status === "error" || item.status === "conflict").length;
    const overviewFix = document.getElementById("cloudOverviewFixButton");
    const overviewSync = document.getElementById("cloudOverviewSyncNow");
    if (overviewFix) {
      if (!ready && cloudUser && !recoveryUiActive) { overviewFix.hidden = false; overviewFix.textContent = readiness.key === "profile-locked" ? "Unlock profile" : readiness.key === "profile-required" ? "Set up profile" : "Review profile"; }
      else if (conflictsNow > 0 || pendingErrors > 0 || state.lastError) { overviewFix.hidden = false; overviewFix.textContent = conflictsNow > 0 ? "Review conflicts" : pendingErrors > 0 ? `Fix ${pendingErrors} sync issue${pendingErrors === 1 ? "" : "s"}` : "Review & fix issue"; }
      else overviewFix.hidden = true;
    }
    if (overviewSync) overviewSync.disabled = syncing || !navigator.onLine || !ready;
    renderSyncHealth(); renderConflicts();
  }

  function renderSyncHealth() {
    const set = (id,value) => { const node=document.getElementById(id); if(node) node.textContent=String(value); };
    set("cloudAuditCursor", Number(state.lastAuditId || 0)); set("cloudLastPull", formatDateTime(state.lastPullAt)); set("cloudLastPush", formatDateTime(state.lastPushAt)); set("cloudHealthPending", pendingCount()); set("cloudHealthConflicts", conflictCount()); set("cloudHealthAppVersion", `V${appVersion()}`); set("cloudHealthRequiredVersion", versionFromCode(state.requiredAppVersionCode || APP_VERSION_CODE));
    const protocol = document.getElementById("cloudProtocolChip"); if (protocol) { protocol.textContent = `Cloud Schema V${state.cloudSchemaVersion || 2}`; protocol.className = `status-chip ${(state.requiredAppVersionCode || 0) > APP_VERSION_CODE ? "danger" : "success"}`; }
    const health = document.getElementById("cloudHealthMessage"); if (health) health.textContent = (state.requiredAppVersionCode || 0) > APP_VERSION_CODE ? `This cloud account requires ${versionFromCode(state.requiredAppVersionCode)} or newer. Update this device before writing records.` : state.lastError || "Cloud revisions are checked first. Pending device edits are preserved, merged when safe, and never silently replaced on conflict.";
    const chip = document.getElementById("cloudPendingChip"); if (chip) { chip.textContent = pendingCount() ? `${pendingCount()} waiting` : "Nothing pending"; chip.className = `status-chip ${conflictCount() ? "warning" : pendingCount() ? "info" : "success"}`; }
    const list = document.getElementById("cloudPendingList");
    if (list) {
      const items = Object.values(pending).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      list.innerHTML = items.length ? items.map(item => {
        const next = item.nextAttemptAt && item.nextAttemptAt > Date.now() ? ` · retry ${formatDateTime(new Date(item.nextAttemptAt).toISOString())}` : "";
        const actions = item.status === "conflict"
          ? `<button class="button button-primary button-small" type="button" data-sync-review="${escape(keyToken(item.key))}">Review versions</button>`
          : `<button class="button button-secondary button-small" type="button" data-sync-retry="${escape(keyToken(item.key))}">Retry</button><button class="button button-secondary button-small" type="button" data-sync-discard="${escape(keyToken(item.key))}">Use cloud</button>`;
        return `<article class="cloud-pending-item" data-status="${escape(item.status)}"><div><strong>${escape(recordLabel(item.collection,item.payload,item.recordId))}</strong><small>${escape(item.status)} · revision ${Number(item.baseRevision || 0)} · ${Number(item.attempts || 0)} attempt${Number(item.attempts || 0) === 1 ? "" : "s"}${escape(next)}</small>${item.lastError ? `<small>${escape(item.lastError)}</small>` : ""}</div><div class="cloud-pending-actions">${actions}</div></article>`;
      }).join("") : `<div class="system-empty">No records are waiting to synchronize.</div>`;
    }
  }

  function versionFromCode(code) { const value = Number(code || 0); if (!value) return "Unknown"; const major = Math.floor(value / 10000); const minor = Math.floor((value % 10000) / 10); const patch = value % 10; return `V${major}.${minor}.${patch}`; }
  function escape(value) { if (typeof escapeHtml === "function") return escapeHtml(value); return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]); }
  function scheduleSync(delay = SYNC_DELAY) { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow({ reason:"automatic" }).catch(() => {}), delay); }
  function requestLifecycleSync(reason) { if(!cloudReadiness().ready||state.autoSync===false||!navigator.onLine||document.hidden)return; scheduleSync(); scheduleForegroundPoll(); }
  function scheduleRetry() { clearTimeout(retryTimer); const times = Object.values(pending).filter(item => item.status === "error" && item.nextAttemptAt > Date.now()).map(item => item.nextAttemptAt); if (!times.length || state.autoSync === false) return; const delay = Math.max(250, Math.min(...times) - Date.now()); retryTimer = setTimeout(() => syncNow({ reason:"retry" }).catch(() => {}), delay); }
  function retryDelay(attempts) { const exponential = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.min(Number(attempts || 0), 8))); return Math.min(RETRY_MAX_MS, exponential + Math.floor(Math.random() * Math.min(1500, exponential * .2))); }
  function setPrivacyAuthentication(authenticated, detail = {}) { try { window.FinancePrivacyLock?.setAuthenticated?.(Boolean(authenticated), { email:String(detail.email || cloudUser?.email || "") }); } catch (error) {} }
  function transientAuthError(error) { return /failed to fetch|network|load failed|networkerror|timeout|timed out|abort|cdn|supabase loader/i.test(String(error?.message || error || "")); }
  function waitForAuthRetry(attempt) { return new Promise(resolve => setTimeout(resolve, AUTH_RESTORE_RETRY_MS * (attempt + 1))); }
  function applyAuthSession(nextSession) {
    session = nextSession || null;
    cloudUser = nextSession?.user || null;
  }
  function activeAuthSession() { return Boolean(session?.user?.id || cloudUser?.id || session?.access_token); }
  async function confirmEmptyAuthEvent(event) {
    try {
      const sdk = await loadClient();
      const result = await sdk.auth.getSession();
      if (result.error) throw result.error;
      const nextSession = result.data?.session || null;
      if (nextSession?.user) {
        applyAuthSession(nextSession);
        ensureSignedInReady().catch(error => setStatus("Sync needs attention", friendlyAuthError(error, "sync"), "warning"));
        return;
      }
    } catch (error) {
      if (transientAuthError(error)) return;
      setStatus("Sync needs attention", friendlyAuthError(error, "sync"), "warning");
      return;
    }
    if (event === "INITIAL_SESSION" || !authHydrationComplete) return;
    onSignedOut();
  }
  function handleAuthStateChange(event, nextSession) {
    if (nextSession?.user) {
      applyAuthSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        setPrivacyAuthentication(false, { email:nextSession.user.email || "" });
        passwordRecoveryRouteActive = true;
        passwordRecoveryError = null;
        passwordRecoveryActive = true;
        cleanPasswordRecoveryUrl({ keepRoute:true });
        focusPasswordRecoverySettings();
        renderCloudStats();
        setAuthMessage("Choose a new password to finish account recovery.", "warning", "recovery");
        setStatus("Reset password", "Choose a new password before continuing cloud sync.", "warning");
        return;
      }
      ensureSignedInReady().catch(error => setStatus("Sync needs attention", friendlyAuthError(error, "sync"), "danger"));
      return;
    }
    if (!authHydrationComplete) return;
    if (event === "INITIAL_SESSION" && activeAuthSession()) return;
    setTimeout(() => confirmEmptyAuthEvent(event), 0);
  }
  async function confirmSignedInSession(sdk) {
    const result = await sdk.auth.getSession();
    if (result.error) throw result.error;
    const nextSession = result.data?.session || null;
    if (!nextSession?.user) throw new Error("Cloud sign-in completed, but the session could not be restored. Try signing in again.");
    applyAuthSession(nextSession);
    return nextSession;
  }

  async function loadClient() {
    if (client) return client;
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      const config = getStoredConfig(); const status = configStatus(config); if (!status.ok) throw new Error(status.message); if (typeof window.financeLoadSupabase !== "function") throw new Error("Supabase loader is missing.");
      const library = await window.financeLoadSupabase(); const createClient = library?.createClient || library?.default?.createClient || window.supabase?.createClient; if (typeof createClient !== "function") throw new Error("Supabase client could not be loaded.");
      const nextClient = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, experimental:{ passkey:true } }, realtime:{ params:{ eventsPerSecond:8 } }, global:{ headers:{ "x-client-info":`my-finance-records/${appVersion()}` } } });
       nextClient.auth.onAuthStateChange(handleAuthStateChange);
      client = nextClient;
      return client;
    })();
    try { return await clientPromise; }
    catch (error) { clientPromise = null; throw error; }
  }
  async function rpc(name,args = {}) { const sdk = await loadClient(); const result = await sdk.rpc(name,args); if (result.error) { const message = result.error.message || String(result.error); if (/finance_v3_|schema cache|could not find the function/i.test(message)) throw new Error("Cloud Schema V3 is not installed. Run supabase/cloud-profiles-v3.sql in the Supabase SQL Editor."); throw result.error; } return result.data || {}; }
  function friendlyAuthError(error, context = "sign-in") { const message = String(error?.message || error || "").trim(); if (/invalid login credentials|invalid credentials|email or password/i.test(message)) return "Wrong email or password. If you have not created a cloud account with this email yet, click 'Create account' first."; if (/email not confirmed|confirm.*email/i.test(message)) return "Your email is not confirmed yet. Open the confirmation email sent to your inbox, click the confirmation link, then sign in again."; if (/user already registered|already been registered|already exists/i.test(message)) return "An account with this email already exists. Click 'Sign in' or use 'Forgot password?'."; if (/password.*(?:short|weak|least)|should be at least/i.test(message)) return "Use a stronger password with at least 6 characters."; if (/rate limit|too many requests/i.test(message)) return "Too many authentication attempts. Wait a moment, then try again."; if (/failed to fetch|network|load failed|networkerror|timeout|timed out/i.test(message)) return "Could not reach the cloud service. Check your internet connection and cloud configuration."; if (/redirect.*not.*allow|redirect.*not.*permitted|redirect_to/i.test(message)) return "Password-reset redirect is not allowed by the cloud project. Add this app URL to Supabase Auth redirect URLs."; if (/session.*missing|auth session missing/i.test(message)) return "The password-reset session has expired. Request a new password reset email."; if (context === "reset-request" && !message) return "Could not request a password reset email."; return message || (context === "sign-in" ? "Could not sign in. Check your email, password, and internet connection." : "The cloud request could not be completed."); }
  function setAuthMessage(message, tone = "info", area = "sign-in") { const id = area === "recovery" ? "cloudPasswordRecoveryMessage" : "cloudAuthMessage"; const node = document.getElementById(id); if (!node) return; node.textContent = String(message || ""); node.dataset.tone = tone; }
  function setCloudConnectionStatus(label, tone = "info") { const node = document.getElementById("cloudConnectionStatus"); if (!node) return; node.textContent = String(label || "Not tested"); node.dataset.tone = tone; }
  function passwordRecoveryRedirect() { try { const url = new URL(location.href); if (!/^https?:$/.test(url.protocol)) return ""; url.search = ""; url.hash = ""; url.searchParams.set("auth", "recovery"); return url.href; } catch (error) { return ""; } }
  function parsePasswordRecoveryUrl() { try { const url = new URL(location.href); const hash = new URLSearchParams(String(url.hash || "").replace(/^#/, "")); const requested = url.searchParams.get("auth") === "recovery" || hash.get("type") === "recovery" || hash.has("error") || hash.has("error_code"); return { requested, error:hash.get("error") || "", errorCode:hash.get("error_code") || "", description:hash.get("error_description") || "" }; } catch (error) { return { requested:false, error:"", errorCode:"", description:"" }; } }
  function recoveryErrorMessage(info = {}) { const code = String(info.errorCode || "").toLowerCase(); const text = decodeURIComponent(String(info.description || info.error || "").replace(/\+/g, " ")); if (/otp_expired|expired|invalid.*link|access_denied/.test(`${code} ${text}`.toLowerCase())) return "This reset link is invalid, expired, or already used. Request a new reset email or use a recovery code."; if (/redirect/.test(`${code} ${text}`.toLowerCase())) return "The password-reset redirect is not allowed by the cloud project. Check Supabase Auth redirect URLs."; return text || "Password recovery could not be completed. Request a new reset email or use a recovery code."; }
  function focusPasswordRecoverySettings() { try { if (typeof goToPage === "function") goToPage("settings", { historyMode:"none", smooth:false }); if (typeof activateSettingsPanel === "function") activateSettingsPanel("sync", false); } catch (error) {} }
  function cleanPasswordRecoveryUrl({ keepRoute = true } = {}) { try { const url = new URL(location.href); url.hash = ""; if (keepRoute) url.searchParams.set("auth", "recovery"); else url.searchParams.delete("auth"); history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`); } catch (error) {} }
  function setRecoveryHelpMessage(message, tone = "warning") { const node = document.getElementById("cloudRecoveryHelpMessage"); if (!node) return; node.textContent = String(message || ""); node.dataset.tone = tone; }
  function setRecoveryRouteState({ active = false, error = null } = {}) { passwordRecoveryRouteActive = Boolean(active); passwordRecoveryError = error || null; if (passwordRecoveryRouteActive) focusPasswordRecoverySettings(); renderCloudStats(); if (passwordRecoveryError) setRecoveryHelpMessage(recoveryErrorMessage(passwordRecoveryError), "danger"); }
  async function verifyRecoveryCode(email, token) { const value = String(email || "").trim(); const code = String(token || "").trim(); if (!/^\S+@\S+\.\S+$/.test(value)) throw new Error("Enter the email address used for your cloud account."); if (!code) throw new Error("Enter the recovery code from your reset email."); const sdk = await loadClient(); if (typeof sdk.auth.verifyOtp !== "function") throw new Error("This app build cannot verify recovery codes. Update the app and try again."); const result = await sdk.auth.verifyOtp({ email:value, token:code, type:"recovery" }); if (result.error) throw result.error; session = result.data?.session || session; cloudUser = result.data?.user || session?.user || cloudUser; passwordRecoveryRouteActive = true; passwordRecoveryError = null; passwordRecoveryActive = true; cleanPasswordRecoveryUrl({ keepRoute:true }); focusPasswordRecoverySettings(); renderCloudStats(); setAuthMessage("Recovery code accepted. Choose a new password.", "success", "recovery"); return result.data || {}; }
  function setPasswordVisibility(input, button, visible) { if (!input || !button) return; input.type = visible ? "text" : "password"; button.textContent = visible ? "Hide" : "Show"; button.setAttribute("aria-pressed", String(Boolean(visible))); button.setAttribute("aria-label", `${visible ? "Hide" : "Show"} password`); }
  async function withAuthButtonBusy(button, busyText, action) { if (!button || button.dataset.busy === "true") return; const priorText = button.textContent; button.dataset.busy = "true"; button.disabled = true; button.textContent = busyText; try { return await action(); } finally { button.dataset.busy = "false"; button.disabled = false; button.textContent = priorText; } }
  async function testCloudConnection() { const config = getStoredConfig(); const status = configStatus(config); if (!status.ok) throw new Error(status.message); const controller = typeof AbortController !== "undefined" ? new AbortController() : null; const timer = controller ? setTimeout(() => controller.abort(), 8000) : null; try { const endpoint = `${String(config.supabaseUrl).replace(/\/$/,"")}/auth/v1/health`; const response = await fetch(endpoint, { method:"GET", cache:"no-store", headers:{ apikey:config.supabasePublishableKey }, signal:controller?.signal }); if (!response.ok) throw new Error(`Cloud service responded with HTTP ${response.status}.`); return { ok:true, status:response.status, endpoint }; } finally { if (timer) clearTimeout(timer); } }
  async function requestPasswordReset(email) { const value = String(email || "").trim(); if (!value || !/^\S+@\S+\.\S+$/.test(value)) throw new Error("Enter the email address used for your cloud account."); const sdk = await loadClient(); const redirectTo = passwordRecoveryRedirect(); if (!redirectTo) throw new Error("Open the hosted HTTPS app to reset a cloud password. Local file copies cannot receive the secure reset link."); const result = await sdk.auth.resetPasswordForEmail(value, { redirectTo }); if (result.error) throw result.error; return true; }
  async function completePasswordReset(password, confirmPassword) { const next = String(password || ""); if (next.length < 6) throw new Error("Use a password with at least 6 characters."); if (next !== String(confirmPassword || "")) throw new Error("The new passwords do not match."); const sdk = await loadClient(); const result = await sdk.auth.updateUser({ password:next }); if (result.error) throw result.error; passwordRecoveryActive = false; passwordRecoveryRouteActive = false; passwordRecoveryError = null; cleanPasswordRecoveryUrl({ keepRoute:false }); session = result.data?.session || session; cloudUser = result.data?.user || session?.user || cloudUser; return result.data?.user || cloudUser; }
  async function restoreSession() {
    authHydrationComplete = false;
    if (!configStatus().ok) { authHydrationComplete = true; return; }
    let lastError = null;
    for (let attempt = 0; attempt < AUTH_RESTORE_ATTEMPTS; attempt += 1) {
      try {
        const sdk = await loadClient();
        const result = await sdk.auth.getSession();
        if (result.error) throw result.error;
        session = result.data?.session || null;
        cloudUser = session?.user || null;
        if (cloudUser) await ensureSignedInReady();
        else onSignedOut();
        authHydrationComplete = true;
        return;
      } catch (error) {
        lastError = error;
        if (!transientAuthError(error) || attempt === AUTH_RESTORE_ATTEMPTS - 1) break;
        setStatus("Restoring cloud session", "Checking your saved cloud session…", "info");
        await waitForAuthRetry(attempt);
      }
    }
    authHydrationComplete = true;
    setStatus("Cloud sync unavailable", lastError?.message || "Could not load cloud sync.", "danger");
  }
  function continueSignedInInBackground(){
    if(!cloudUser) return;
    Promise.resolve().then(()=>ensureSignedInReady()).catch(error=>{
      const message=friendlyAuthError(error,"sync");
      setStatus("Sync needs attention",message,"warning");
      setAuthMessage(message,"warning");
      if(typeof showToast==="function") showToast(message,"warning");
    });
  }

  async function signIn(email,password){
    const normalizedEmail=String(email||"").trim().toLowerCase();
    const sdk=await loadClient();
    setStatus("Signing in","Checking your cloud account…","info");
    setAuthMessage("Checking your email and password…","info");
    const result=await sdk.auth.signInWithPassword({email:normalizedEmail,password});
    if(result.error) throw result.error;
    const verifiedSession=await confirmSignedInSession(sdk);
    setCloudConnectionStatus("Cloud reached","success");
    setPrivacyAuthentication(true, { email:cloudUser?.email || normalizedEmail });
    setAuthMessage("Signed in. Unlocking Talaan while sync continues in the background…","success");
    if(typeof showToast==="function") showToast("Signed in successfully!","success");
    continueSignedInInBackground();
    return {session:verifiedSession,user:cloudUser};
  }

  async function createAccount(email,password){
    const normalizedEmail=String(email||"").trim().toLowerCase();
    const sdk=await loadClient();
    setStatus("Creating account","Creating your private cloud account…","info");
    setAuthMessage("Creating your private cloud account…","info");
    const result=await sdk.auth.signUp({email:normalizedEmail,password});
    if(result.error) throw result.error;
    setCloudConnectionStatus("Cloud reached","success");
    if(!result.data?.session){
      setAuthMessage("Account created. Check your email and confirm it, then sign in here.","warning");
      if(typeof showToast==="function") showToast("Account created! Check your email to confirm.","info");
      setStatus("Check your email","Confirm the sign-up email, then return and sign in.","warning");
      return {confirmed:false,user:result.data?.user||null};
    }
    applyAuthSession(result.data.session);
    const verifiedSession=await confirmSignedInSession(sdk);
    setPrivacyAuthentication(true, { email:cloudUser?.email || normalizedEmail });
    setAuthMessage("Account created. Unlocking Talaan while sync continues in the background…","success");
    if(typeof showToast==="function") showToast("Account created and signed in!","success");
    continueSignedInInBackground();
    return {confirmed:true,session:verifiedSession,user:cloudUser};
  }
  async function signOut() { if (client) { const result = await client.auth.signOut({ scope:"local" }); if (result?.error) throw result.error; } onSignedOut(); }
  function onSignedOut() { session = null; cloudUser = null; signedInInitialization = null; signedInInitializationScope = ""; signedInReadyUserId = ""; profileSetupPromise = null; profileSetupScope = ""; profileSetupState = "idle"; profileSetupDetail = ""; setPrivacyAuthentication(false); passwordRecoveryActive = false; clearForegroundPoll(); clearRealtimeRetry({resetAttempts:true}); if (realtimeChannel && client) client.removeChannel(realtimeChannel).catch(() => {}); realtimeChannel = null; setStatus("Not connected", "Local finance records remain on this device until Cloud Sync is connected again.", "info"); }

  async function registerDevice() { const profileId = requireCloudProfile(); const result = await rpc("finance_v3_register_device", { p_profile_id:profileId, p_device_id:currentDeviceId(), p_device_name:currentDeviceName(), p_platform:navigator.userAgent || navigator.platform || "Browser", p_app_version:appVersion(), p_app_version_code:APP_VERSION_CODE, p_last_pull_audit_id:Number(state.lastAuditId || 0) }); if (result.status === "revoked") { await handleRevoked(result); return false; } state.profileRole = result.role || profileRole(); return true; }
  async function handleRevoked(result = {}) { state.enabled = false; state.lastError = "This device was signed out remotely."; persist(); try { await client?.auth?.signOut?.({ scope:"local" }); } catch (error) {} session = null; cloudUser = null; setPrivacyAuthentication(false); setStatus("Signed out remotely", `This installation was revoked${result.revoked_at ? ` on ${formatDateTime(result.revoked_at)}` : ""}. Local records remain available.`, "danger"); }
  async function getProfileArchWithRetry(maxWaitMs = 2000) { const start = Date.now(); while (Date.now() - start < maxWaitMs) { const arch = PROFILE_ARCH(); if (arch && typeof arch.listCloudProfiles === "function") return arch; await new Promise(res => setTimeout(res, 50)); } return PROFILE_ARCH(); }
  async function autoEnsureCloudProfile() {
    if (!cloudUser) return false;
    const userId = String(cloudUser.id || "");
    if (profileSetupPromise && profileSetupScope === userId) return profileSetupPromise;
    profileSetupScope = userId;
    profileSetupState = "checking";
    profileSetupDetail = "";
    profileSetupPromise = (async () => {
      const arch = await getProfileArchWithRetry();
      if (!arch || typeof arch.cloudProfileId !== "function") {
        profileSetupState = "profile-error";
        profileSetupDetail = "Profile & Security is unavailable. Reload the app and try again.";
        return false;
      }
      const accountPassphrase = `${cloudUser.id}:my-finance-v13:${(cloudUser.email || "").toLowerCase()}`;
      if (arch.cloudProfileId()) {
        if (!arch.isCloudUnlocked?.()) {
          try { await arch.unlockProfile(accountPassphrase, true); }
          catch (error) {
            profileSetupState = "profile-locked";
            profileSetupDetail = "This encrypted cloud profile uses a different passphrase. Unlock it in Profile & Security to continue.";
            return false;
          }
        }
        profileSetupState = arch.isCloudUnlocked?.() ? "ready" : "profile-locked";
        return profileSetupState === "ready";
      }
      let profiles;
      try { profiles = (await arch.listCloudProfiles())?.profiles || []; }
      catch (error) {
        profileSetupState = "profile-error";
        profileSetupDetail = "Existing cloud profiles could not be checked. Try again from Profile & Security.";
        return false;
      }
      if (profiles.length > 0) {
        try { await arch.connectCloudProfile(profiles[0].profile_id, accountPassphrase, true, { auto:true }); profileSetupState = "ready"; return true; }
        catch (error) {
          profileSetupState = "profile-locked";
          profileSetupDetail = "An existing encrypted cloud profile was found, but its passphrase is required. Unlock it in Profile & Security; no duplicate profile was created.";
          return false;
        }
      }
      try {
        const active = arch.activeProfile?.() || {};
        if (!active.encryption?.enabled) await arch.configureEncryption(accountPassphrase);
        else if (!arch.isCloudUnlocked?.()) await arch.unlockProfile(accountPassphrase, true);
        await arch.createCloudProfile({ name:active.name || "My Cloud Finances", type:active.type || "personal", passphrase:accountPassphrase }, { auto:true });
        profileSetupState = "ready";
        return true;
      } catch (error) {
        profileSetupState = "profile-error";
        profileSetupDetail = error?.message || "The encrypted cloud profile could not be created.";
        return false;
      }
    })();
    try { return await profileSetupPromise; }
    finally { if (profileSetupScope === userId) profileSetupPromise = null; }
  }

  function ensureSignedInReady({ force = false } = {}) {
    const userId = String(cloudUser?.id || "");
    if (!userId) return Promise.resolve();
    if (!force && signedInReadyUserId === userId) return Promise.resolve();
    if (signedInInitialization && signedInInitializationScope === userId) return signedInInitialization;
    signedInInitializationScope = userId;
    signedInInitialization = onSignedIn().then(result => { if (cloudUser?.id === userId) signedInReadyUserId = userId; return result; });
    return signedInInitialization.finally(() => {
      if (signedInInitializationScope === userId) { signedInInitialization = null; signedInInitializationScope = ""; }
    });
  }

  async function onSignedIn() {
    if (!cloudUser) return; setPrivacyAuthentication(true, { email:cloudUser.email || "" }); state.enabled = true; state.currentDeviceId = currentDeviceId(); state.currentDeviceName = currentDeviceName(); await autoEnsureCloudProfile();
    const readiness = cloudReadiness();
    if (!cloudProfileId()) { state.lastError = ""; persist(); setStatus(readiness.key === "profile-locked" ? "Profile unlock required" : readiness.key === "profile-error" ? "Cloud profile unavailable" : "Cloud profile required", readiness.detail, "warning"); renderCloudStats(); return; }
    if (!PROFILE_ARCH()?.isCloudUnlocked?.()) { state.lastError = ""; persist(); setStatus("Profile unlock required", readiness.detail, "warning"); renderCloudStats(); return; }
    persist(); if (!await registerDevice()) return; await setupRealtime();
    const first = state.initializedUserId !== initializedScope();
    if (first) {
      try {
        const snap = await snapshot(); const v3Exists = Array.isArray(snap.records) && snap.records.length > 0;
        await initializeFirstSync(v3Exists ? "download" : "upload"); return;
      } catch (err) {
        console.warn("Auto first sync failed", err); const msg = err.message || String(err); if (/Cloud Schema V3 is not installed/i.test(msg) || /function.*does not exist/i.test(msg)) setStatus("Database setup required", "Run supabase/cloud-profiles-v3.sql in your Supabase SQL Editor to enable Cloud Sync.", "warning"); else setStatus("Sync needs attention", msg, "danger"); await prepareFirstSyncChoices().catch(() => {}); renderCloudStats(); return;
      }
    }
    await syncNow({ reason:"sign-in" });
  }

  async function snapshot() { const profileId = requireCloudProfile(); const result = await rpc("finance_v3_snapshot", { p_profile_id:profileId, p_device_id:currentDeviceId() }); if (result.status === "revoked") await handleRevoked(result); if (result.status === "ok") result.records = await decryptRows(result.records || []); state.requiredAppVersionCode = Number(result.min_app_version_code || APP_VERSION_CODE); state.cloudSchemaVersion = Number(result.cloud_schema_version || CLOUD_SCHEMA_VERSION); state.profileRole = result.role || profileRole(); persist(); return result; }
  async function fetchLegacyPayload() { if (!client || !cloudUser) return null; const result = await client.from(LEGACY_CLOUD_TABLE).select("payload,revision,updated_at,updated_by_device,app_version").eq("user_id",cloudUser.id).maybeSingle(); if (result.error) { if (/does not exist|schema cache/i.test(result.error.message || "")) return null; throw result.error; } return result.data?.payload || null; }
  function legacyPayloadData(payload) { return payload?.data && isObject(payload.data) ? payload.data : null; }

  async function prepareFirstSyncChoices() {
    const snap = await snapshot(); if (snap.status === "revoked") return; const cloudExists = Array.isArray(snap.records) && snap.records.length > 0;
    const download = document.getElementById("cloudInitialDownload"), merge = document.getElementById("cloudInitialMerge"), upload = document.getElementById("cloudInitialUpload"), message = document.getElementById("cloudFirstSyncMessage");
    if (download) { download.disabled = !cloudExists; download.checked = cloudExists; }
    if (merge) { merge.disabled = true; merge.checked = false; }
    if (upload) { upload.disabled = cloudExists; upload.checked = !cloudExists; }
    if (message) message.textContent = cloudExists ? "Cloud records already exist. Cloud is the source of truth, so this device will download the current cloud records before any device changes can upload." : "Cloud Schema V3 is empty. This device can create the first cloud copy.";
    renderCloudStats();
  }

  function recoveryPoint(label) { const backup = { format:"my-finance-cloud-recovery-v3", label, createdAt:nowIso(), appVersion:appVersion(), schemaVersion:12, cloudSchemaVersion:3, data:clone(data), pending:clone(pending) }; try { localStorage.setItem(`simple-finance-cloud-recovery-${Date.now()}`,JSON.stringify(backup)); } catch (error) {} return backup; }
  function changesBetween(remoteStore, desiredMap) { const changes = []; const keys = new Set([...Object.keys(remoteStore || {}), ...Object.keys(desiredMap || {})]); keys.forEach(key => { const remote = remoteStore[key], desired = desiredMap[key], desiredDeleted = !desired; if (remote && Boolean(remote.deletedAt) === desiredDeleted && same(remote.payload,desired?.payload || remote.payload) && Number(remote.sortIndex || 0) === Number(desired?.sortIndex || 0)) return; if (!remote && desiredDeleted) return; const [collection,recordId] = remote ? [remote.collection,remote.recordId] : [desired.collection,desired.recordId]; changes.push({ collection, recordId, payload:clone(desired?.payload || remote?.payload || {}), sortIndex:Number(desired?.sortIndex || 0), deleted:desiredDeleted, baseRevision:Number(remote?.revision || 0), minWriterVersionCode:APP_VERSION_CODE }); }); return changes; }

  async function commitRawChanges(changes,{ migratedFromV2=false, operations=[] } = {}) {
    const profileId = requireCloudProfile({ write:true }); let latest = Number(state.lastAuditId || 0);
    for (let offset=0; offset<changes.length; offset += MAX_BATCH_RECORDS) {
      const chunk = changes.slice(offset,offset+MAX_BATCH_RECORDS), encryptedChanges = await Promise.all(chunk.map(toRpcChange)), batchId = uid("batch"); let result;
      if (Array.isArray(operations) && operations.length && changes.length <= MAX_BATCH_RECORDS) result = await rpc("finance_v3_commit_financial_operations", { p_profile_id:profileId, p_batch_id:`financial-set:${operations.map(item => item.operationId).sort().join("+").slice(0,100)}:${checksum(encryptedChanges)}`, p_operations:operations.map(item => ({ operation_id:item.operationId, operation_type:item.operationType, expense_id:item.expenseId, account_name:item.accountName, amount:Number(item.amount || 0) })), p_device_id:currentDeviceId(), p_app_version:appVersion(), p_app_version_code:APP_VERSION_CODE, p_changes:encryptedChanges });
      else result = await rpc("finance_v3_commit_batch", { p_profile_id:profileId, p_batch_id:batchId, p_device_id:currentDeviceId(), p_app_version:appVersion(), p_app_version_code:APP_VERSION_CODE, p_changes:encryptedChanges, p_migrated_from_v2:Boolean(migratedFromV2) });
      if (result.status !== "committed") { if (result.status === "conflict") result.conflicts = await decryptConflictRows(result.conflicts || []); return result; }
      await applyCommitResult(result); latest = Math.max(latest,Number(result.latest_audit_id || 0));
    }
    state.lastAuditId = latest; return { status:"committed",latest_audit_id:latest };
  }
  async function toRpcChange(item) { return { collection:item.collection, record_id:item.recordId, payload:await encryptRecordPayload(sanitizeRecordPayload(item.collection,item.recordId,item.payload), item.collection, item.recordId), sort_index:Number(item.sortIndex || 0), deleted:Boolean(item.deleted), base_revision:Number(item.baseRevision || 0), min_writer_version_code:Number(item.minWriterVersionCode || APP_VERSION_CODE) }; }
  async function decryptConflictRows(rows = []) { return Promise.all((rows || []).map(async remote => { if (!remote?.remote_payload?.__financeEncrypted) return remote; return { ...remote, remote_payload:await decryptRecordPayload(remote.remote_payload, remote.collection, remote.record_id) }; })); }
  async function applyCommitResult(result) { const records = await decryptRows(result.records || []); records.forEach(raw => { const row = recordFromRow(raw), key = recordKey(row.collection,row.recordId); baseRecords[key] = row; delete pending[key]; conflicts = conflicts.filter(item => item.key !== key); }); state.lastAuditId = Math.max(Number(state.lastAuditId || 0),Number(result.latest_audit_id || 0)); state.lastPushAt = nowIso(); persist(); }
  function storeFromSnapshotRows(rows) { const store = {}; (rows || []).forEach(raw => { const row=recordFromRow(raw); if(row.collection&&row.recordId) store[recordKey(row.collection,row.recordId)]=row; }); return store; }
  function mergeFirstSync(localMap,remoteStore) { const desired = {}; const keys = new Set([...Object.keys(localMap),...Object.keys(remoteStore)]); keys.forEach(key => { const local=localMap[key], remote=remoteStore[key]; if (remote && !remote.deletedAt) desired[key]={collection:remote.collection,recordId:remote.recordId,payload:clone(remote.payload),sortIndex:remote.sortIndex}; else if (local) desired[key]=local; }); return desired; }

  async function initializeFirstSync(mode) {
    if (!cloudUser) throw new Error("Sign in first."); if (!navigator.onLine) throw new Error("Connect to the internet for the first cloud synchronization.");
    setStatus("Preparing Cloud Sync 3.0", "Creating a recovery point before cloud-first synchronization…", "info"); recoveryPoint("Before cloud-first synchronization");
    const snap = await snapshot(); if (snap.status === "revoked") return; const remoteStore = storeFromSnapshotRows(snap.records || []), localMap = toRecordMap(data), cloudExists = Object.keys(remoteStore).length > 0;
    mode = cloudExists ? "download" : "upload";
    if (mode === "download") { seedBaseFromSnapshot(Object.values(remoteStore)); pending = {}; conflicts = []; applyEffectiveRecords("Current cloud records downloaded to this device"); }
    else {
      const changes = changesBetween({},localMap), result = await commitRawChanges(changes,{ migratedFromV2:true });
      if (result.status === "conflict") throw new Error("Cloud records changed while creating the first cloud copy. Sync again to download the current cloud records.");
      if (result.status === "upgrade_required") throw new Error(`Cloud requires ${versionFromCode(result.min_app_version_code)} or newer.`);
      if (result.status !== "committed") throw new Error(`Cloud initialization returned ${result.status || "an unknown status"}.`);
      const refreshed = await snapshot(); seedBaseFromSnapshot(refreshed.records || []); state.lastAuditId = Number(refreshed.latest_audit_id || state.lastAuditId || 0); pending = {}; conflicts = []; applyEffectiveRecords("Device records created the first cloud copy");
    }
    state.initializedUserId = initializedScope(); state.initializedProfileId = cloudProfileId(); state.migratedFromV1 = false; state.lastSyncAt = nowIso(); state.lastPullAt = nowIso(); persist(); await registerDevice(); await loadDevices(); await loadRecentAudit(); setStatus("Synced", "Cloud is authoritative and this device now matches it.", "success");
  }

  async function replaceCloudWithThisDevice() {
    if (syncing) throw new Error("Wait for the current sync to finish first.");
    if (!cloudUser) throw new Error("Sign in before replacing the cloud copy.");
    if (!navigator.onLine) throw new Error("Connect to the internet before replacing the cloud copy.");
    requireCloudProfile({ write:true });
    const desiredData = clone(data);
    recoveryPoint("Before replacing cloud from this device");
    syncing = true;
    setStatus("Updating cloud copy", "A recovery point was saved. Writing this device’s current records with cloud revision checks…", "warning");
    try {
      let committed = false;
      for (let attempt=0; attempt<2 && !committed; attempt += 1) {
        const snap = await snapshot();
        if (snap.status === "revoked") return false;
        if (snap.status !== "ok") throw new Error(`Cloud snapshot returned ${snap.status || "an unknown status"}.`);
        const remoteStore = storeFromSnapshotRows(snap.records || []), desiredMap = toRecordMap(desiredData), changes = changesBetween(remoteStore,desiredMap);
        if (!changes.length) { seedBaseFromSnapshot(snap.records || []); state.lastAuditId = Number(snap.latest_audit_id || state.lastAuditId || 0); committed = true; break; }
        const result = await commitRawChanges(changes);
        if (result.status === "committed") { committed = true; break; }
        if (result.status === "conflict" && attempt === 0) continue;
        if (result.status === "upgrade_required") throw new Error(`Cloud requires ${versionFromCode(result.min_app_version_code)} or newer.`);
        if (result.status === "revoked") { await handleRevoked(result); return false; }
        throw new Error(`Cloud replacement returned ${result.status || "an unknown status"}.`);
      }
      if (!committed) throw new Error("Cloud changed again while replacing it. Sync once, then retry the recovery action.");
      const refreshed = await snapshot();
      if (refreshed.status !== "ok") throw new Error(`Cloud refresh returned ${refreshed.status || "an unknown status"}.`);
      seedBaseFromSnapshot(refreshed.records || []);
      state.lastAuditId = Number(refreshed.latest_audit_id || state.lastAuditId || 0);
      pending = {}; conflicts = [];
      state.lastSyncAt = nowIso(); state.lastPullAt = nowIso(); state.lastError = "";
      persist({ reclaimFirst:true });
      applyEffectiveRecords("This device is now the current cloud copy");
      await registerDevice(); await loadDevices(); await loadRecentAudit();
      setStatus("Synced", "This device’s current records are now the cloud copy. Other devices will read this revision before uploading changes.", "success");
      return true;
    } finally {
      syncing = false; updateTopSyncUi(); renderCloudStats(); scheduleRetry(); scheduleForegroundPoll();
    }
  }

  async function pullChanges() {
    let pages=0, changed=false, hasMore=true;
    while (hasMore && pages < MAX_PULL_PAGES) {
      const result = await rpc("finance_v3_pull", { p_profile_id:requireCloudProfile(), p_after_audit_id:Number(state.lastAuditId || 0), p_limit:250, p_device_id:currentDeviceId() });
      if (result.status === "revoked") { await handleRevoked(result); return false; }
      if (result.status === "device_missing") { if (!await registerDevice()) return false; pages += 1; continue; }
      if (result.status !== "ok") throw new Error(`Cloud pull returned ${result.status || "an unknown status"}.`);
      for (const encryptedEvent of result.events || []) { const event = await decryptRow(encryptedEvent); applyRemoteEvent(event); changed = true; state.lastAuditId = Math.max(Number(state.lastAuditId || 0),Number(event.id || 0)); }
      state.lastAuditId = Math.max(Number(state.lastAuditId || 0),Number(result.latest_audit_id || 0)); hasMore = Boolean(result.has_more); pages += 1;
    }
    state.lastPullAt = nowIso(); persist(); if (changed) applyEffectiveRecords("Current cloud records written to this device"); return changed;
  }

  function reconcilePendingWithRemote(local, row, reason = "Cloud and this device both changed this record") {
    const key = recordKey(row.collection,row.recordId);
    const basePayload = clone(local.basePayload);
    const baseSortIndex = Number(local.baseSortIndex || 0);
    const localSortIndex = Number(local.sortIndex || 0);
    const remoteSortIndex = Number(row.sortIndex || 0);
    const overlaps = [];

    baseRecords[key] = row;

    if ((local.deleted && row.deletedAt) || (!local.deleted && !row.deletedAt && same(local.payload,row.payload) && localSortIndex === remoteSortIndex)) {
      delete pending[key];
      conflicts = conflicts.filter(item => item.key !== key);
      persist({ reclaimFirst:true });
      return "confirmed";
    }

    if (local.deleted || row.deletedAt) {
      local.status = "conflict";
      local.attempts = 0;
      local.nextAttemptAt = 0;
      local.lastError = "Deletion and edit changes overlap. Review the cloud and device versions.";
      addConflict({
        key,
        collection:local.collection,
        recordId:local.recordId,
        reason,
        localPayload:local.payload,
        localSortIndex,
        localDeleted:local.deleted,
        remotePayload:row.payload,
        remoteRevision:row.revision,
        remoteDeletedAt:row.deletedAt,
        remoteSortIndex,
        remoteMissing:Boolean(row.deletedAt),
        basePayload,
        paths:["record"]
      });
      persist({ reclaimFirst:true });
      return "conflict";
    }

    const merged = threeWayMerge(basePayload, local.payload, row.payload, "", overlaps);
    let mergedSortIndex = localSortIndex;
    const localSortChanged = localSortIndex !== baseSortIndex;
    const remoteSortChanged = remoteSortIndex !== baseSortIndex;
    if (!localSortChanged) mergedSortIndex = remoteSortIndex;
    else if (remoteSortChanged && localSortIndex !== remoteSortIndex) overlaps.push("sortIndex");

    if (overlaps.length) {
      local.status = "conflict";
      local.attempts = 0;
      local.nextAttemptAt = 0;
      local.lastError = "Cloud and this device changed the same fields. Review both versions before choosing.";
      addConflict({
        key,
        collection:local.collection,
        recordId:local.recordId,
        reason,
        localPayload:local.payload,
        localSortIndex,
        localDeleted:false,
        remotePayload:row.payload,
        remoteRevision:row.revision,
        remoteDeletedAt:row.deletedAt,
        remoteSortIndex,
        remoteMissing:false,
        basePayload,
        paths:overlaps
      });
      persist({ reclaimFirst:true });
      return "conflict";
    }

    conflicts = conflicts.filter(item => item.key !== key);
    if (same(merged,row.payload) && mergedSortIndex === remoteSortIndex) {
      delete pending[key];
      persist({ reclaimFirst:true });
      return "remote";
    }

    local.payload = merged;
    local.sortIndex = mergedSortIndex;
    local.basePayload = clone(row.payload);
    local.baseRevision = Number(row.revision || 0);
    local.baseSortIndex = remoteSortIndex;
    local.status = "pending";
    local.attempts = 0;
    local.nextAttemptAt = 0;
    local.lastError = "Safely merged non-overlapping changes from another device.";
    persist({ reclaimFirst:true });
    return "merged";
  }

  function applyRemoteEvent(event) {
    const row = recordFromRow(event), key = recordKey(row.collection,row.recordId), local = pending[key];
    if (!local) { baseRecords[key] = row; conflicts = conflicts.filter(item => item.key !== key); return; }
    const localConfirmed = row.updatedByDevice === currentDeviceId() && ((!local.deleted && !row.deletedAt && same(local.payload,row.payload) && Number(local.sortIndex || 0) === Number(row.sortIndex || 0)) || (local.deleted && row.deletedAt));
    if (localConfirmed) { baseRecords[key] = row; delete pending[key]; conflicts = conflicts.filter(item => item.key !== key); return; }
    if (Number(row.revision || 0) <= Number(local.baseRevision || 0)) return;
    reconcilePendingWithRemote(local,row,"Cloud changed after this device began editing the record.");
  }

  function addConflict(input) { conflicts = conflicts.filter(item => item.key !== input.key); conflicts.unshift({ id:uid("conflict"), key:input.key, collection:input.collection, recordId:input.recordId, reason:input.reason || "Record conflict", createdAt:nowIso(), resolved:false, localPayload:sanitizeRecordPayload(input.collection,input.recordId,input.localPayload), localSortIndex:input.localSortIndex == null ? null : Number(input.localSortIndex || 0), localDeleted:Boolean(input.localDeleted), remotePayload:sanitizeRecordPayload(input.collection,input.recordId,input.remotePayload), remoteRevision:Number(input.remoteRevision || 0), remoteDeletedAt:input.remoteDeletedAt || "", remoteSortIndex:input.remoteSortIndex == null ? null : Number(input.remoteSortIndex || 0), remoteMissing:Boolean(input.remoteMissing), basePayload:input.basePayload == null ? null : sanitizeRecordPayload(input.collection,input.recordId,input.basePayload), paths:(input.paths || []).slice(0,80) }); conflicts=conflicts.slice(0,MAX_CONFLICTS); persist(); }
  function detectFinancialOperations(items) { const operations=[]; items.forEach(item => { if (item.collection !== "accountLedger" || item.deleted) return; const entry=item.payload || {}, type=entry.type; if (!["expense-payment","gym-auto-payment","expense-payment-reversal"].includes(type)) return; operations.push({ operationId:String(entry.operationId || entry.transactionId || entry.id || ""), operationType:type === "gym-auto-payment" ? "gym_auto_payment" : type === "expense-payment-reversal" ? "expense_payment_restore" : "expense_payment", expenseId:String(entry.expenseId || ""), accountName:String(entry.account || ""), amount:Math.abs(Number(entry.amount || 0)) }); }); const unique=new Map(operations.filter(item=>item.operationId&&item.expenseId).map(item=>[`${item.operationId}|${item.expenseId}|${item.operationType}`,item])); return [...unique.values()]; }

  async function pushPending() {
    if (!profileCanWrite()) return false; const due = Object.values(pending).filter(item => item.status !== "conflict" && Number(item.nextAttemptAt || 0) <= Date.now()).slice(0,MAX_BATCH_RECORDS); if (!due.length) return false;
    due.forEach(item => { item.status="retrying"; }); persist(); renderSyncHealth(); const operations=detectFinancialOperations(due);
    try {
      const result=await commitRawChanges(due,{ operations });
      if (result.status === "committed") { state.lastPushAt=nowIso(); persist(); return true; }
      if (result.status === "conflict") { handleCommitConflicts(result.conflicts || [], due); return false; }
      if (result.status === "upgrade_required") { state.requiredAppVersionCode=Number(result.min_app_version_code || APP_VERSION_CODE); due.forEach(item => { item.status="error"; item.lastError=`Update required: ${versionFromCode(state.requiredAppVersionCode)} or newer.`; item.nextAttemptAt=Date.now()+RETRY_MAX_MS; }); persist(); throw new Error(`Cloud requires ${versionFromCode(state.requiredAppVersionCode)} or newer.`); }
      if (result.status === "revoked") { await handleRevoked(result); return false; }
      throw new Error(`Cloud commit returned ${result.status || "an unknown status"}.`);
    } catch (error) { due.forEach(item => { if (!pending[item.key]) return; item.status="error"; item.attempts=Number(item.attempts || 0)+1; item.lastError=String(error.message || error).slice(0,240); item.nextAttemptAt=Date.now()+retryDelay(item.attempts); }); persist(); scheduleRetry(); throw error; }
  }

  function handleCommitConflicts(remoteConflicts, batchItems = []) {
    const remoteByKey = new Map((remoteConflicts || []).map(remote => [recordKey(remote.collection,remote.record_id),remote]));
    let reconciled = false;
    (batchItems || []).forEach(local => {
      const key = recordKey(local.collection,local.recordId), remote = remoteByKey.get(key), base = baseRecords[key];
      if (!remote) {
        local.status = "pending";
        local.attempts = 0;
        local.nextAttemptAt = 0;
        local.lastError = "A related cloud record changed. Retrying after the latest cloud revision is read.";
        return;
      }
      const row = {
        ...(base || {}),
        collection:local.collection,
        recordId:local.recordId,
        payload:sanitizeRecordPayload(local.collection,local.recordId,remote.remote_payload ?? base?.payload ?? {}),
        sortIndex:Number(remote.remote_sort_index ?? base?.sortIndex ?? 0),
        revision:Number(remote.remote_revision ?? base?.revision ?? local.baseRevision ?? 0),
        deletedAt:remote.remote_missing ? (remote.remote_deleted_at || nowIso()) : (remote.remote_deleted_at || ""),
        updatedAt:base?.updatedAt || nowIso(),
        updatedByDevice:base?.updatedByDevice || "cloud",
        appVersion:base?.appVersion || "",
        appVersionCode:Number(base?.appVersionCode || 0),
        minWriterVersionCode:Number(base?.minWriterVersionCode || APP_VERSION_CODE)
      };
      reconcilePendingWithRemote(local,row,"Cloud changed while this device was uploading the record.");
      reconciled = true;
    });
    persist({ reclaimFirst:true });
    if (reconciled) applyEffectiveRecords("Concurrent cloud changes reviewed without discarding this device edits");
  }

  async function syncNow({ reason="manual" } = {}) {
    if (syncing) return; if (!cloudUser) { renderCloudStats(); return; }
    if (state.initializedUserId !== initializedScope()) { setStatus("Initializing sync", "Setting up encrypted cloud synchronization...", "info"); await ensureSignedInReady({force:true}); if (state.initializedUserId !== initializedScope()) { renderCloudStats(); return; } }
    if (!navigator.onLine) { setStatus("Offline", `${pendingCount()} device change${pendingCount()===1?"":"s"} waiting for cloud.`, "info"); return; }
    requireCloudProfile(); syncing=true; setStatus("Syncing", `Reading current cloud revisions first (${reason})…`, "info");
    try {
      if (!await registerDevice()) return;
      const recovered = reconcileUnqueuedLocalChanges();
      if (recovered.length) setStatus("Queued device changes", `${recovered.length} previously missed Finance record${recovered.length===1?"":"s"} will be checked against the current cloud revision.`, "warning");
      recoverStoredConflicts();
      await pullChanges();
      let guard=0;
      while (Object.values(pending).some(item=>item.status!=="conflict"&&Number(item.nextAttemptAt||0)<=Date.now()) && guard<6) { await pushPending(); guard += 1; await pullChanges(); }
      await pullChanges(); await loadDevices(); await loadRecentAudit(); state.lastSyncAt=nowIso(); state.lastError=""; persist();
      if (conflictCount()) setStatus("Sync needs review", `${conflictCount()} record conflict${conflictCount()===1?" is":"s are"} preserved. Choose the cloud version or this device before either edit is discarded.`, "warning");
      else if (pendingCount()) setStatus("Changes pending", `${pendingCount()} device change${pendingCount()===1?"":"s"} will upload after the current cloud revision is checked.`, "warning");
      else setStatus("Synced", "This device and cloud match. Concurrent edits were preserved or safely merged.", "success");
    } catch (error) { setStatus("Sync needs attention", error.message || "Cloud synchronization failed.", "danger"); throw error; }
    finally { syncing=false; updateTopSyncUi(); renderCloudStats(); scheduleRetry(); scheduleForegroundPoll(); }
  }

  async function setupRealtime() {
    if(!client||!cloudUser)return; if(realtimeChannel){const previous=realtimeChannel;realtimeChannel=null;await client.removeChannel(previous);} const channel=client.channel(`finance-sync-v3-${cloudProfileId()}-${cloudUser.id}`); realtimeChannel=channel
      .on("postgres_changes", { event:"INSERT", schema:"public", table:AUDIT_TABLE, filter:`profile_id=eq.${cloudProfileId()}` }, payload => { const source=payload?.new?.device_id,auditId=Number(payload?.new?.id||0);if(source===currentDeviceId()||auditId<=Number(state.lastAuditId||0))return; state.realtimeStatus="Change received";persist();setStatus("Cloud change received","Writing the latest cloud records to this device…","info");scheduleSync(220); })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:DEVICE_TABLE,filter:`profile_id=eq.${cloudProfileId()}`},payload=>{if(payload?.new?.device_id===currentDeviceId()&&payload?.new?.revoked_at)handleRevoked(payload.new).catch(()=>{});})
      .subscribe(status=>{if(realtimeChannel!==channel)return;const normalized=String(status||"Connecting");state.realtimeStatus=normalized;persist();renderSyncHealth();if(normalized==="SUBSCRIBED"){noteRealtimeSubscribed();requestLifecycleSync("realtime-subscribed",0);}else if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(normalized)){scheduleRealtimeRecovery(normalized);scheduleForegroundPoll(1000);}});
  }
  async function ensureRealtime(){if(realtimeChannel&&state.realtimeStatus==="SUBSCRIBED")return;await setupRealtime();}
  async function loadDevices() { if (!client || !cloudUser) return renderDevices([]); const result=await client.from(DEVICE_TABLE).select("user_id,device_id,device_name,platform,app_version,app_version_code,cloud_schema_version,last_seen_at,last_sync_at,last_push_at,last_pull_audit_id,revoked_at").eq("profile_id",requireCloudProfile()).order("last_seen_at",{ascending:false}); if (result.error) throw result.error; renderDevices(result.data || []); }
  function renderDevices(devices) { const body=document.getElementById("cloudDevicesBody"); if (!body) return; const table=body.closest("table"); if (table?.tHead?.rows?.[0]) table.tHead.rows[0].innerHTML="<th>Device</th><th>Status</th><th>App</th><th>Last seen</th><th>Action</th>"; body.innerHTML=devices.length?devices.map(device=>{ const current=device.device_id===currentDeviceId() && device.user_id===cloudUser?.id, revoked=Boolean(device.revoked_at), status=revoked?"Revoked":current?"Current":"Connected", tone=revoked?"danger":current?"success":"info"; return `<tr><td data-label="Device"><strong>${escape(device.device_name||"Device")}</strong><details class="device-platform-details"><summary>Browser details</summary><small>${escape(device.platform||"Browser")}</small></details></td><td data-label="Status"><span class="status-chip ${tone}">${status}</span></td><td data-label="App">V${escape(device.app_version||"Unknown")}<br><small>Cloud V${Number(device.cloud_schema_version||1)}</small></td><td data-label="Last seen">${escape(formatDateTime(device.last_seen_at))}</td><td data-label="Action">${current||revoked?"N/A":`<button class="button button-secondary button-small" type="button" data-revoke-cloud-device="${escape(device.device_id)}" data-revoke-cloud-user="${escape(device.user_id || cloudUser?.id || "")}">Sign out remotely</button>`}</td></tr>`; }).join(""):`<tr><td colspan="5"><div class="system-empty">No cloud devices are listed yet.</div></td></tr>`; }
  async function revokeDevice(deviceId,userId = cloudUser?.id) { if (!deviceId || (deviceId===currentDeviceId() && userId===cloudUser?.id)) return; const result=await rpc("finance_v3_revoke_device",{p_profile_id:requireCloudProfile(),p_user_id:userId,p_device_id:deviceId,p_revoked_by_device:currentDeviceId()}); if (result.status!=="revoked") throw new Error("The device could not be revoked."); await loadDevices(); showToast("The device will sign out the next time it connects.","success"); }
  async function loadRecentAudit() { if (!client || !cloudUser) return; const result=await client.from(AUDIT_TABLE).select("id,collection,record_id,action,revision,device_id,app_version,created_at").eq("profile_id",requireCloudProfile()).order("id",{ascending:false}).limit(30); if (result.error) throw result.error; const node=document.getElementById("cloudAuditList"); if (!node) return; node.innerHTML=(result.data||[]).length?(result.data||[]).map(item=>`<div class="cloud-audit-row"><small>#${Number(item.id||0)} · ${escape(item.action)}</small><span>${escape(item.collection)} · ${escape(item.record_id)}</span><small>r${Number(item.revision||0)} · V${escape(item.app_version||"?")}</small></div>`).join(""):`<div class="system-empty">No encrypted Cloud Schema V3 activity has been recorded yet.</div>`; }
  function renderConflicts() {
    const node=document.getElementById("cloudConflictList"), chip=document.getElementById("cloudConflictCount");
    if (!node || !chip) return;
    const unresolved=conflicts.filter(item=>!item.resolved);
    chip.textContent=unresolved.length?`${unresolved.length} needs review`:"No conflicts";
    chip.className=`status-chip ${unresolved.length?"warning":"success"}`;
    node.innerHTML=unresolved.length ? unresolved.map(item => `<article class="cloud-pending-item" data-status="conflict"><div><strong>${escape(recordLabel(item.collection,item.localPayload,item.recordId))}</strong><small>${escape(item.reason || "Both cloud and this device changed this record.")}</small>${item.paths?.length ? `<small>Changed fields: ${escape(item.paths.join(", "))}</small>` : ""}</div><div class="cloud-pending-actions"><button class="button button-primary button-small" type="button" data-review-cloud-conflict="${escape(keyToken(item.key))}">Review versions</button></div></article>`).join("") : `<div class="system-empty">No unresolved record conflicts.</div>`;
  }
  function conflictForKey(key) { return conflicts.find(item=>item.key===key&&!item.resolved) || null; }
  function openConflictReview(key) {
    const item=conflictForKey(key), review=window.FinanceCloudConflictReview;
    if (!item) return false;
    if (!review?.open) throw new Error("Conflict review is unavailable. Reload the latest app version and try again.");
    review.open({ item, keyToken:keyToken(key), title:recordLabel(item.collection,item.localPayload,item.recordId) });
    return true;
  }
  function retryRecord(key) { const item=pending[key]; if (!item) return; item.status="pending"; item.attempts=0; item.nextAttemptAt=0; item.lastError="Cloud will be checked before retrying this device change."; persist(); renderCloudStats(); scheduleSync(80); }
  function refreshAfterConflictChoice(message) { try { applyEffectiveRecords(message); } catch (error) { console.error("Conflict choice was saved but the interface could not refresh.",error); try { showToast("Choice saved. Reload the app to refresh the interface.","warning"); } catch (toastError) {} } try { renderCloudStats(); } catch (error) { console.error("Could not refresh Cloud Sync status.",error); } }
  function resolveConflict(key, choice) {
    if (!["cloud","device"].includes(choice)) throw new Error("Choose either the cloud version or this device’s version.");
    const item=pending[key], conflict=conflictForKey(key), resolver=window.FinanceCloudConflictResolution;
    if (!resolver?.apply) throw new Error("Conflict resolution is unavailable. Reload the latest app version and try again.");
    const result=resolver.apply({key,choice,item,conflict,baseRecords,pending,conflicts,setConflicts:value=>{conflicts=value;},persist:()=>persist({reclaimFirst:true}),clone,splitKey,nowIso,appVersion:appVersion(),appVersionCode:APP_VERSION_CODE});
    const usingDevice = choice === "device";
    refreshAfterConflictChoice(usingDevice ? "This device version rebased onto the latest cloud revision" : "Current cloud version applied on this device");
    showToast(usingDevice ? "This device version is queued to become the cloud version." : "Current cloud version applied on this device.","success");
    if (usingDevice) scheduleSync(80);
    return result;
  }
  function discardLocal(key) { return resolveConflict(key,"cloud"); }
  function keepLocal(key) { return resolveConflict(key,"device"); }
  function downloadConflict(id) { const item=conflicts.find(entry=>entry.id===id); if (!item) return; downloadJson(`finance-record-conflict-${id}.json`,item); }
  function downloadJson(filename,value) { const blob=new Blob([JSON.stringify(value,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob), link=document.createElement("a"); link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),0); }

  function bindEvents() {
    document.getElementById("cloudSyncStatusButton")?.addEventListener("click",event=>{event.stopPropagation();if(isIconOnlyTopSyncButton())runTopSyncAction();else toggleTopSyncPopover();});
    document.getElementById("cloudToolbarClose")?.addEventListener("click",closeTopSyncPopover);
    document.getElementById("cloudToolbarSyncNow")?.addEventListener("click",()=>syncNow({reason:"toolbar"}).catch(error=>showToast(error.message,"warning")));
    document.getElementById("cloudToolbarOpenSettings")?.addEventListener("click",()=>{closeTopSyncPopover();goToPage("settings",{smooth:false});activateSettingsPanel("cloud",true);});
    document.getElementById("cloudToolbarFixIssue")?.addEventListener("click",()=>{if(!cloudReadiness().ready)return openCloudRecoveryTarget();closeTopSyncPopover();syncNow({reason:"fix-cloud-authority"}).catch(error=>showToast(error.message,"warning"));});
    document.getElementById("cloudOverviewSyncNow")?.addEventListener("click", () => syncNow({reason:"overview"}).catch(error => showToast(error.message, "warning")));
    document.getElementById("cloudOverviewFixButton")?.addEventListener("click", openCloudRecoveryTarget);
    document.getElementById("cloudReplaceFromDevice")?.addEventListener("click",async()=>{if(!confirm("Make this device the current cloud copy? A local recovery point will be saved first. Other connected devices will download this copy before uploading their own changes."))return;try{await replaceCloudWithThisDevice();}catch(error){setStatus("Cloud replacement needs attention",error.message,"danger");showToast(error.message,"warning");}});
    document.addEventListener("click",event=>{if(!event.target.closest("#cloudSyncToolbarPopover")&&!event.target.closest("#cloudSyncStatusButton"))closeTopSyncPopover();});
    window.addEventListener("resize",()=>{if(!isIconOnlyTopSyncButton())clearMobileSyncFeedback();updateTopSyncUi();if(!document.getElementById("cloudSyncToolbarPopover")?.hidden&&typeof positionCloudToolbarPopover==="function")positionCloudToolbarPopover();});
    document.getElementById("saveCloudConfig")?.addEventListener("click",()=>{const config={supabaseUrl:document.getElementById("cloudConfigUrl").value.trim(),supabasePublishableKey:document.getElementById("cloudConfigKey").value.trim()};const status=configStatus(config); if(!status.ok)return showToast(status.message,"warning");saveJson(CONFIG_KEY,config); showToast("Cloud configuration saved. Reloading…","success"); setTimeout(()=>location.reload(),350);});
    document.getElementById("clearCloudConfig")?.addEventListener("click",()=>{ if(!confirm("Remove cloud configuration from this device? Local records remain."))return; localStorage.removeItem(CONFIG_KEY); setTimeout(()=>location.reload(),250); });
    document.getElementById("cloudPasswordToggle")?.addEventListener("click",event=>{const input=document.getElementById("cloudAuthPassword");setPasswordVisibility(input,event.currentTarget,input?.type === "password");});
    document.querySelectorAll("[data-cloud-password-target]").forEach(button=>button.addEventListener("click",()=>{const input=document.getElementById(button.dataset.cloudPasswordTarget);setPasswordVisibility(input,button,input?.type === "password");}));
    document.getElementById("cloudSignIn")?.addEventListener("click",event=>withAuthButtonBusy(event.currentTarget,"Signing in…",async()=>{const email=document.getElementById("cloudAuthEmail").value.trim().toLowerCase(),password=document.getElementById("cloudAuthPassword").value;if(!email||password.length<6){const msg="Enter your email and password. Passwords must have at least 6 characters.";setAuthMessage(msg,"warning");if(typeof showToast==="function")showToast(msg,"warning");return;}try{await signIn(email,password);}catch(error){const message=friendlyAuthError(error,"sign-in");if(/wrong email or password/i.test(message))setCloudConnectionStatus("Cloud reached","success");setAuthMessage(`${message} Your local finance records stay stored on this device and remain hidden until you sign in.`,"danger");setStatus("Sign-in failed",message,"danger");if(typeof showToast==="function")showToast(message,"danger");}}));
    document.getElementById("cloudCreateAccount")?.addEventListener("click",event=>withAuthButtonBusy(event.currentTarget,"Creating…",async()=>{const email=document.getElementById("cloudAuthEmail").value.trim().toLowerCase(),password=document.getElementById("cloudAuthPassword").value;if(!email||password.length<6){const msg="Use a valid email and a password with at least 6 characters.";setAuthMessage(msg,"warning");if(typeof showToast==="function")showToast(msg,"warning");return;}try{await createAccount(email,password);}catch(error){const message=friendlyAuthError(error,"create-account");setAuthMessage(`${message} Your local finance records stay stored on this device and remain hidden until you sign in.`,"danger");setStatus("Account creation failed",message,"danger");if(typeof showToast==="function")showToast(message,"danger");}}));
    document.getElementById("cloudAuthEmail")?.addEventListener("keydown",event=>{if(event.key === "Enter"){event.preventDefault();document.getElementById("cloudSignIn")?.click();}});
    document.getElementById("cloudAuthPassword")?.addEventListener("keydown",event=>{if(event.key === "Enter"){event.preventDefault();document.getElementById("cloudSignIn")?.click();}});
    document.getElementById("cloudForgotPassword")?.addEventListener("click",event=>withAuthButtonBusy(event.currentTarget,"Sending…",async()=>{const email=document.getElementById("cloudAuthEmail")?.value?.trim()||"";try{await requestPasswordReset(email);setCloudConnectionStatus("Cloud reached","success");setAuthMessage("If a cloud account exists for this email, a password-reset link has been sent. Check your inbox and spam folder.","success");setStatus("Password reset sent","Check your email for the secure reset link.","success");}catch(error){const message=friendlyAuthError(error,"reset-request");setAuthMessage(`${message} Your local finance records stay stored on this device and remain hidden until you sign in.`,"danger");setStatus("Password reset failed",message,"danger");}}));
    document.getElementById("cloudTestConnection")?.addEventListener("click",event=>withAuthButtonBusy(event.currentTarget,"Testing…",async()=>{setCloudConnectionStatus("Testing…","info");try{await testCloudConnection();setCloudConnectionStatus("Connected","success");setAuthMessage("Cloud service is reachable. If sign-in still fails, check the email/password or use Forgot password.","success");}catch(error){const message=friendlyAuthError(error,"connection");setCloudConnectionStatus("Connection failed","danger");setAuthMessage(message,"danger");}}));
    document.getElementById("cloudRecoveryResend")?.addEventListener("click",event=>withAuthButtonBusy(event.currentTarget,"Sending…",async()=>{const email=document.getElementById("cloudRecoveryEmail")?.value?.trim()||document.getElementById("cloudAuthEmail")?.value?.trim()||"";try{await requestPasswordReset(email);passwordRecoveryRouteActive=true;passwordRecoveryError=null;setRecoveryHelpMessage("A new reset email was requested. If the account exists, check your inbox and spam folder.","success");setStatus("Password reset sent","Use the newest reset email only.","success");}catch(error){setRecoveryHelpMessage(friendlyAuthError(error,"reset-request"),"danger");}}));
    document.getElementById("cloudVerifyRecoveryCode")?.addEventListener("click",event=>withAuthButtonBusy(event.currentTarget,"Verifying…",async()=>{const email=document.getElementById("cloudRecoveryEmail")?.value?.trim()||"",token=document.getElementById("cloudRecoveryCode")?.value||"";try{await verifyRecoveryCode(email,token);}catch(error){setRecoveryHelpMessage(friendlyAuthError(error,"recovery-code"),"danger");}}));
    document.getElementById("cloudRecoveryBackToSignIn")?.addEventListener("click",()=>{passwordRecoveryRouteActive=false;passwordRecoveryError=null;passwordRecoveryActive=false;cleanPasswordRecoveryUrl({keepRoute:false});renderCloudStats();});
    document.getElementById("cloudCompletePasswordReset")?.addEventListener("click",event=>withAuthButtonBusy(event.currentTarget,"Saving…",async()=>{const next=document.getElementById("cloudNewPassword")?.value||"",confirmPassword=document.getElementById("cloudConfirmPassword")?.value||"";try{await completePasswordReset(next,confirmPassword);document.getElementById("cloudNewPassword").value="";document.getElementById("cloudConfirmPassword").value="";setAuthMessage("Password updated successfully. Continuing cloud sign-in…","success","recovery");setStatus("Password updated","Your new cloud password is active.","success");renderCloudStats();if(cloudUser)await ensureSignedInReady({force:true});}catch(error){const message=friendlyAuthError(error,"password-reset");setAuthMessage(message,"danger","recovery");}}));
    document.getElementById("cloudCancelPasswordReset")?.addEventListener("click",async()=>{passwordRecoveryActive=false;passwordRecoveryRouteActive=false;passwordRecoveryError=null;cleanPasswordRecoveryUrl({keepRoute:false});try{const sdk=await loadClient();await sdk.auth.signOut({scope:"local"});}catch(error){}onSignedOut();renderCloudStats();});
    document.getElementById("cloudSyncNow")?.addEventListener("click",()=>syncNow({reason:"manual"}).catch(error=>showToast(error.message,"warning")));
    document.getElementById("cloudSignOut")?.addEventListener("click",()=>signOut().catch(error=>showToast(error.message,"warning")));
    document.getElementById("cloudAutoSync")?.addEventListener("change",event=>{state.autoSync=Boolean(event.target.checked);persist();if(state.autoSync){requestLifecycleSync("auto-sync-enabled",100);ensureRealtime().catch(()=>scheduleRealtimeRecovery("CHANNEL_ERROR"));}else{clearForegroundPoll();clearRealtimeRetry();}renderCloudStats();});
    document.getElementById("cloudInitialConfirm")?.addEventListener("click",async()=>{const mode=document.querySelector('input[name="cloudInitialMode"]:checked')?.value||"upload";try{await initializeFirstSync(mode);}catch(error){setStatus("Cloud initialization failed",error.message,"danger");}});
    document.getElementById("cloudExportBeforeFirst")?.addEventListener("click",()=>downloadJson(`my-finance-before-cloud-v3-${new Date().toISOString().slice(0,10)}.json`,recoveryPoint("Manual pre-cloud-v3 export")));
    document.getElementById("cloudSaveDeviceName")?.addEventListener("click",async()=>{const value=document.getElementById("cloudDeviceName").value.trim().slice(0,60);if(!value)return showToast("Enter a device name.","warning");state.currentDeviceName=value;persist();try{const id=currentDeviceId();if(typeof appMeta!=="undefined"&&appMeta.devices?.[id]){appMeta.devices[id].name=value;if(typeof writeMeta==="function")writeMeta();}}catch(error){}try{await registerDevice();await loadDevices();setStatus("Device renamed",value,"success");}catch(error){setStatus("Rename needs sync",error.message,"warning");}});
    document.getElementById("cloudDevicesBody")?.addEventListener("click",event=>{const button=event.target.closest("[data-revoke-cloud-device]");if(!button)return;if(!confirm("Sign out this device remotely? It will be blocked from future Cloud Sync 3.0 commits and will clear its cloud session the next time it connects."))return;revokeDevice(button.dataset.revokeCloudDevice,button.dataset.revokeCloudUser).catch(error=>showToast(error.message,"warning"));});
    document.getElementById("cloudPendingList")?.addEventListener("click",handlePendingClick);
    document.getElementById("cloudConflictList")?.addEventListener("click",event=>{const button=event.target.closest("[data-review-cloud-conflict]");if(button)openConflictReview(keyFromToken(button.dataset.reviewCloudConflict));});
    window.FinanceCloudConflictReview?.bind?.({onDownload:downloadConflict,onUseCloud:token=>discardLocal(keyFromToken(token)),onUseDevice:token=>keepLocal(keyFromToken(token))});
    window.addEventListener("finance:data-persisted",handlePersistedData); window.addEventListener("online",()=>{setStatus("Back online","Checking the current cloud records first…","info");if(state.autoSync!==false){ensureRealtime().catch(()=>scheduleRealtimeRecovery("CHANNEL_ERROR"));requestLifecycleSync("online",120);}});
    window.addEventListener("offline",()=>{clearForegroundPoll();setStatus("Offline",`${pendingCount()} device change${pendingCount()===1?"":"s"} waiting for cloud.`,"info");}); window.addEventListener("focus",()=>requestLifecycleSync("focus",220));
    window.addEventListener("pageshow",()=>{if(state.autoSync!==false&&cloudUser){ensureRealtime().catch(()=>scheduleRealtimeRecovery("CHANNEL_ERROR"));requestLifecycleSync("pageshow",80);}});
    window.addEventListener("pagehide",clearForegroundPoll); document.addEventListener("visibilitychange",()=>{if(document.hidden)clearForegroundPoll();else if(state.autoSync!==false&&cloudUser){ensureRealtime().catch(()=>scheduleRealtimeRecovery("CHANNEL_ERROR"));requestLifecycleSync("visible",80);}});
    window.addEventListener("storage",event=>{if(event.key===STORAGE_KEY&&!suppressQueue){try{const next=normalizeData(JSON.parse(event.newValue||"{}"));queueDiff(lastObservedData,next,"Another tab changed finance records");lastObservedData=clone(next);}catch(error){}}});
    window.addEventListener("finance:cloud-profile-linked",event=>{if(event?.detail?.auto)return;state={...defaultState()};baseRecords={};pending={};conflicts=[];persist();setStatus("Cloud profile linked","Reloading encrypted Cloud Sync 3.0…","success");setTimeout(()=>location.reload(),400);});
    window.addEventListener("finance:profile-unlocked",()=>{if(cloudUser)ensureSignedInReady({force:true}).catch(error=>setStatus("Sync needs attention",friendlyAuthError(error,"sync"),"danger"));});
  }

  function handlePendingClick(event) { const retry=event.target.closest("[data-sync-retry]"),discard=event.target.closest("[data-sync-discard]"),review=event.target.closest("[data-sync-review]"); if(review)return openConflictReview(keyFromToken(review.dataset.syncReview)); if(retry)retryRecord(keyFromToken(retry.dataset.syncRetry)); if(discard&&confirm("Replace this device’s pending version with the current cloud-confirmed record?"))discardLocal(keyFromToken(discard.dataset.syncDiscard)); }

  async function initialize() {
    if(initialized)return; initialized=true; setPrivacyAuthentication(false); persist(); injectV2Ui(); wrapSaveData(); bindEvents();
    const recoveryRoute = parsePasswordRecoveryUrl(); if (recoveryRoute.requested) { passwordRecoveryRouteActive = true; passwordRecoveryError = recoveryRoute.error || recoveryRoute.errorCode ? recoveryRoute : null; focusPasswordRecoverySettings(); if (passwordRecoveryError) { cleanPasswordRecoveryUrl({ keepRoute:true }); setStatus("Password reset needs attention", recoveryErrorMessage(passwordRecoveryError), "danger"); } }
    renderCloudStats(); if (passwordRecoveryError) setRecoveryHelpMessage(recoveryErrorMessage(passwordRecoveryError), "danger"); const status=configStatus(); if(!status.ok){setStatus("Cloud sync not configured",status.message,"warning");return;} await restoreSession(); setInterval(()=>{if(cloudReadiness().ready&&state.autoSync!==false&&navigator.onLine&&!document.hidden)syncNow({reason:"periodic"}).catch(()=>{});},5*60*1000); scheduleForegroundPoll(); scheduleRetry();
  }

  window.FinanceCloudSync={ initialize,signIn,createAccount,syncNow,replaceCloudWithThisDevice, buildRecordMap:()=>toRecordMap(data), get status(){const readiness=cloudReadiness();return{...state,pendingCount:pendingCount(),conflictCount:conflictCount(),signedIn:Boolean(cloudUser),email:cloudUser?.email||"",readiness:readiness.key,ready:readiness.ready};} };
  window.FinanceCloudSyncInternals={loadClient,restoreSession,ensureSignedInReady,autoEnsureCloudProfile,cloudReadiness,stable,checksum,deepMerge,threeWayMerge,toRecordMap,fromRecordStore,changesBetween,recordKey,keyToken,keyFromToken,retryDelay,detectFinancialOperations,encryptRecordPayload,decryptRecordPayload,toRpcChange,decryptRow,sanitizeRecordPayload,reconcileDerivedSettingsState,reconcileUnqueuedLocalChanges,seedBaseFromSnapshot,applyRemoteEvent,resolveConflict,persist,handlePersistedData,requestLifecycleSync,scheduleForegroundPoll,scheduleRealtimeRecovery,ensureRealtime,friendlyAuthError,passwordRecoveryRedirect,parsePasswordRecoveryUrl,recoveryErrorMessage,cleanPasswordRecoveryUrl,testCloudConnection,requestPasswordReset,verifyRecoveryCode,completePasswordReset,setPasswordVisibility,recoverStoredConflicts,reconcilePendingWithRemote,replaceCloudWithThisDevice};

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>initialize().catch(error=>setStatus("Cloud sync unavailable",error.message,"danger")),{once:true});
  else initialize().catch(error=>setStatus("Cloud sync unavailable",error.message,"danger"));
})();
