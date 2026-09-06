"use strict";

/* Talaan V13.0.18 · Profiles, encryption, active profile rename, device lock, MFA,
   passkeys, household roles, migration assistance, and cloud restore points. */
(function financeProfileArchitectureBootstrap() {
  const PROFILE_META_KEY = "simple-finance-profiles-v1";
  const PROFILE_DATA_PREFIX = "simple-finance-profile-data-v1:";
  const PROFILE_AUDIT_PREFIX = "simple-finance-profile-audit-v1:";
  const ACTIVE_DATA_KEY = typeof STORAGE_KEY !== "undefined" ? STORAGE_KEY : "simple-finance-project-records-v2";
  const APP_LOCK_KEY = "simple-finance-device-lock-v1";
  const APP_LOCK_SESSION_KEY = "simple-finance-device-lock-session-v1";
  const PROFILE_KEY_SESSION_PREFIX = "simple-finance-profile-key-session-v1:";
  const PROFILE_KEY_LOCAL_PREFIX = "simple-finance-profile-key-local-v1:";
  const KDF_ITERATIONS = 310000;
  const MAX_LOCAL_AUDIT = 500;
  const APP_VERSION_CODE = 130000;
  const CLOUD_SCHEMA_VERSION = 3;
  const ENCRYPTION_VERSION = 1;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const memoryKeys = new Map();
  let inactivityTimer = null;
  let lastActivityAt = Date.now();
  let pendingTotpFactor = null;

  function clone(value) {
    try { return structuredClone(value); } catch (error) {}
    try { return JSON.parse(JSON.stringify(value)); } catch (error) { return value; }
  }

  function uid(prefix = "profile") {
    return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let offset = 0; offset < array.length; offset += 0x8000) binary += String.fromCharCode(...array.subarray(offset, offset + 0x8000));
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function bytesToBase64Url(bytes) {
    return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(value) {
    const normalized = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
    return base64ToBytes(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  }

  function randomBytes(length = 32) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  async function sha256Hex(value) {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function deriveAesKey(passphrase, salt, iterations = KDF_ITERATIONS, extractable = false) {
    const material = await crypto.subtle.importKey("raw", encoder.encode(String(passphrase || "")), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name:"PBKDF2", hash:"SHA-256", salt:typeof salt === "string" ? base64ToBytes(salt) : salt, iterations:Number(iterations || KDF_ITERATIONS) },
      material,
      { name:"AES-GCM", length:256 },
      extractable,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptJsonWithKey(value, key, aadText = "") {
    const iv = randomBytes(12);
    const aad = encoder.encode(String(aadText || ""));
    const ciphertext = await crypto.subtle.encrypt({ name:"AES-GCM", iv, additionalData:aad }, key, encoder.encode(JSON.stringify(value)));
    return {
      __financeEncrypted: true,
      encryptionVersion: ENCRYPTION_VERSION,
      algorithm: "AES-256-GCM",
      iv: bytesToBase64(iv),
      aad: String(aadText || ""),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    };
  }

  async function decryptJsonWithKey(envelope, key, expectedAad = "") {
    if (!envelope?.__financeEncrypted) return clone(envelope);
    const aad = String(expectedAad || envelope.aad || "");
    if (expectedAad && envelope.aad && envelope.aad !== expectedAad) throw new Error("Encrypted record context does not match this profile.");
    const plaintext = await crypto.subtle.decrypt(
      { name:"AES-GCM", iv:base64ToBytes(envelope.iv), additionalData:encoder.encode(aad) },
      key,
      base64ToBytes(envelope.ciphertext)
    );
    return JSON.parse(decoder.decode(plaintext));
  }

  function defaultProfile() {
    const now = new Date().toISOString();
    return {
      id:"profile-personal",
      name:"My Finances",
      type:"personal",
      role:"owner",
      cloudProfileId:"",
      encryption:{ enabled:false, salt:"", iterations:KDF_ITERATIONS, check:null },
      migratedFromSchema12:true,
      createdAt:now,
      updatedAt:now
    };
  }

  function normalizeProfile(profile) {
    const fallback = defaultProfile();
    const role = ["owner", "editor", "viewer"].includes(profile?.role) ? profile.role : "owner";
    const type = ["personal", "household"].includes(profile?.type) ? profile.type : "personal";
    return {
      ...fallback,
      ...profile,
      id:String(profile?.id || uid("profile")),
      name:String(profile?.name || "Finance Profile").trim().slice(0, 80) || "Finance Profile",
      type,
      role,
      cloudProfileId:String(profile?.cloudProfileId || ""),
      encryption:{
        enabled:Boolean(profile?.encryption?.enabled),
        salt:String(profile?.encryption?.salt || ""),
        iterations:Math.max(100000, Number(profile?.encryption?.iterations || KDF_ITERATIONS)),
        check:profile?.encryption?.check || null
      },
      createdAt:profile?.createdAt || new Date().toISOString(),
      updatedAt:profile?.updatedAt || profile?.createdAt || new Date().toISOString()
    };
  }

  function loadMeta() {
    try {
      const raw = localStorage.getItem(PROFILE_META_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const profiles = Array.isArray(parsed?.profiles) && parsed.profiles.length ? parsed.profiles.map(normalizeProfile) : [defaultProfile()];
      const activeProfileId = profiles.some(profile => profile.id === parsed?.activeProfileId) ? parsed.activeProfileId : profiles[0].id;
      return { version:1, activeProfileId, profiles };
    } catch (error) {
      return { version:1, activeProfileId:"profile-personal", profiles:[defaultProfile()] };
    }
  }

  let meta = loadMeta();

  function saveMeta() {
    localStorage.setItem(PROFILE_META_KEY, JSON.stringify(meta));
  }

  function activeProfile() {
    return meta.profiles.find(profile => profile.id === meta.activeProfileId) || meta.profiles[0];
  }

  function activeProfileId() { return activeProfile()?.id || "profile-personal"; }
  function cloudProfileId() { return activeProfile()?.cloudProfileId || ""; }
  function activeRole() { return activeProfile()?.role || "owner"; }
  function canWrite() { return activeRole() !== "viewer"; }

  function integrityReport(source = (typeof data !== "undefined" ? data : profileData() || {}), includeStorage = true) {
    const service = window.FinanceIntegrity;
    if (!service?.scan) throw new Error("Financial integrity protection is unavailable. Reload Talaan.");
    return service.scan(source, { includeStorage });
  }

  function assertReplacementIntegrity(source, label = "Finance data") {
    const report = integrityReport(source, false);
    if (report.counts.critical) throw new Error(`${label} contains ${report.counts.critical} critical financial integrity issue${report.counts.critical === 1 ? "" : "s"}. The current profile was not replaced.`);
    return report;
  }

  function restoreReplacementSnapshot(snapshot, message = "Finance replacement rolled back") {
    if (typeof data !== "undefined") data = typeof normalizeData === "function" ? normalizeData(clone(snapshot)) : clone(snapshot);
    if (typeof persistFinanceDataRaw === "function") {
      const saved = persistFinanceDataRaw(message);
      if (saved === false) throw new Error("The previous finance state could not be restored.");
    } else {
      localStorage.setItem(ACTIVE_DATA_KEY, JSON.stringify(data));
      persistCurrentData(data, message);
    }
    if (typeof renderAll === "function") renderAll(false);
  }

  function applyGuardedFinanceReplacement(source, message) {
    if (!canWrite()) throw new Error("Viewer profiles cannot replace records.");
    assertReplacementIntegrity(source, message);
    const before = clone(typeof data !== "undefined" ? data : profileData() || {});
    try {
      const next = typeof normalizeData === "function" ? normalizeData(clone(source)) : clone(source);
      const normalizedReport = integrityReport(next, false);
      if (normalizedReport.counts.critical) throw new Error(`${message} failed integrity verification before persistence.`);
      if (typeof data !== "undefined") data = next;
      if (typeof persistFinanceDataRaw === "function") {
        const saved = persistFinanceDataRaw(message);
        if (saved === false) throw new Error(`${message} could not be saved on this device.`);
      } else {
        localStorage.setItem(ACTIVE_DATA_KEY, JSON.stringify(next));
        if (!persistCurrentData(next, message)) throw new Error(`${message} could not be stored in the active profile.`);
      }
      const finalReport = integrityReport(typeof data !== "undefined" ? data : next, true);
      if (finalReport.counts.critical) throw new Error(`${message} failed final integrity verification.`);
      if (typeof renderAll === "function") renderAll(false);
      return finalReport;
    } catch (error) {
      restoreReplacementSnapshot(before, `${message} rolled back`);
      throw error;
    }
  }
  function profileDataKey(profileId = activeProfileId()) { return `${PROFILE_DATA_PREFIX}${profileId}`; }
  function profileAuditKey(profileId = activeProfileId()) { return `${PROFILE_AUDIT_PREFIX}${profileId}`; }

  function profileData(profileId = activeProfileId()) {
    try {
      const raw = localStorage.getItem(profileDataKey(profileId));
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }

  function appendLocalAudit(action, details = {}) {
    const key = profileAuditKey();
    let entries = [];
    try { entries = JSON.parse(localStorage.getItem(key) || "[]"); } catch (error) {}
    entries.unshift({
      id:uid("audit"),
      profileId:activeProfileId(),
      action:String(action || "Finance data updated").slice(0, 160),
      details:clone(details || {}),
      deviceId:typeof appMeta !== "undefined" ? appMeta.currentDeviceId || "" : "",
      appVersion:typeof APP_VERSION !== "undefined" ? APP_VERSION : "13.0.0",
      createdAt:new Date().toISOString()
    });
    try { localStorage.setItem(key, JSON.stringify(entries.slice(0, MAX_LOCAL_AUDIT))); } catch (error) {}
  }

  function persistCurrentData(source, action = "Finance data updated") {
    if (!canWrite()) return false;
    const normalized = typeof normalizeData === "function" ? normalizeData(clone(source)) : clone(source);
    localStorage.setItem(profileDataKey(), JSON.stringify(normalized));
    appendLocalAudit(action, { checksumHint:String(JSON.stringify(normalized).length) });
    return true;
  }

  function restoreActiveData({ render = true, notify = false } = {}) {
    const stored = profileData();
    if (!stored) return false;
    if (typeof data !== "undefined") data = typeof normalizeData === "function" ? normalizeData(clone(stored)) : clone(stored);
    localStorage.setItem(ACTIVE_DATA_KEY, JSON.stringify(stored));
    if (render && typeof renderAll === "function") renderAll(false);
    if (notify) toast(`Opened ${activeProfile().name}`, "success");
    return true;
  }

  function emptyProfileData() {
    const blank = {
      accounts:{ Cash:0 }, accountTypes:{ Cash:"Cash" }, accountOrder:["Cash"], accountIcons:{}, iconLibrary:{},
      savingsSettings:{ defaultAccount:"", includeInAvailable:true, trendMonths:6 }, savingsGoals:[], incomeRecords:[],
      expenses:[], expenseRecurrenceSkips:[], projects:[], monthlyReports:{}, monthlyChecklists:{}, monthlyBudgets:{},
      budgetTemplates:[], expenseTemplates:[], accountLedger:[], accountReconciliations:[],
      budgetSettings:{ version:1, defaultLowBalanceThreshold:1000, includeExpectedIncome:true, includeRecurringEstimates:true },
      projectCalendarSettings:{ autoPrepare:true, defaultReminder:"P1D", includeNotes:true, includeFinancialValues:false },
      salaryWorkSettings:{ includedProjectsPerMonth:3, officeDays:["Tuesday","Thursday","Saturday"], homeDays:["Monday","Wednesday","Friday"], compensationModel:"fixed-monthly-salary" },
      ledgerSettings:{ version:1 }, productivitySettings:{ version:1, enabled:true, shortcuts:true }, reminderSettings:{ version:1 }
    };
    return typeof normalizeData === "function" ? normalizeData(blank) : blank;
  }

  function createLocalProfile({ name, type = "personal", duplicateCurrent = false } = {}) {
    if (!String(name || "").trim()) throw new Error("Enter a profile name.");
    persistCurrentData(typeof data !== "undefined" ? data : {}, "Profile saved before creating another profile");
    const profile = normalizeProfile({ id:uid("profile"), name, type, role:"owner", migratedFromSchema12:false });
    meta.profiles.push(profile);
    meta.activeProfileId = profile.id;
    saveMeta();
    const source = duplicateCurrent && typeof data !== "undefined" ? clone(data) : emptyProfileData();
    localStorage.setItem(profileDataKey(profile.id), JSON.stringify(source));
    localStorage.setItem(ACTIVE_DATA_KEY, JSON.stringify(source));
    appendLocalAudit("Profile created", { name:profile.name, type:profile.type, duplicateCurrent });
    return profile;
  }

  function switchProfile(profileId) {
    const target = meta.profiles.find(profile => profile.id === profileId);
    if (!target) throw new Error("Profile not found.");
    persistCurrentData(typeof data !== "undefined" ? data : {}, "Profile saved before switching");
    meta.activeProfileId = target.id;
    saveMeta();
    const stored = profileData(target.id) || (typeof createSampleData === "function" ? createSampleData() : {});
    localStorage.setItem(profileDataKey(target.id), JSON.stringify(stored));
    localStorage.setItem(ACTIVE_DATA_KEY, JSON.stringify(stored));
    sessionStorage.removeItem(APP_LOCK_SESSION_KEY);
    location.reload();
  }

  function deleteLocalProfile(profileId) {
    if (profileId === activeProfileId()) throw new Error("Switch to another profile before deleting this one.");
    const target = meta.profiles.find(profile => profile.id === profileId);
    if (!target) return false;
    if (target.cloudProfileId) throw new Error("Disconnect or leave the cloud profile before deleting this local profile.");
    meta.profiles = meta.profiles.filter(profile => profile.id !== profileId);
    saveMeta();
    localStorage.removeItem(profileDataKey(profileId));
    localStorage.removeItem(profileAuditKey(profileId));
    return true;
  }

  function renameProfile(profileId, newName) {
    const name = String(newName || "").trim();
    if (!name) throw new Error("Enter a valid profile name.");
    const target = meta.profiles.find(profile => profile.id === profileId);
    if (!target) throw new Error("Profile not found.");
    target.name = name;
    saveMeta();
    appendLocalAudit("Profile renamed", { id: profileId, name });
    return target;
  }

  async function configureEncryption(passphrase, rememberOption = "device") {
    if (String(passphrase || "").length < 10) throw new Error("Use at least 10 characters for the profile encryption passphrase.");
    const profile = activeProfile();
    const salt = randomBytes(16);
    const key = await deriveAesKey(passphrase, salt, KDF_ITERATIONS);
    const check = await encryptJsonWithKey({ marker:"my-finance-profile-key", profileId:profile.id }, key, `profile-check|v13`);
    profile.encryption = { enabled:true, salt:bytesToBase64(salt), iterations:KDF_ITERATIONS, check };
    profile.updatedAt = new Date().toISOString();
    saveMeta();
    await unlockProfile(passphrase, rememberOption);
    appendLocalAudit("Profile encryption configured", { algorithm:"AES-256-GCM", kdf:"PBKDF2-SHA-256", iterations:KDF_ITERATIONS });
    return profile.encryption;
  }

  async function unlockProfile(passphrase, rememberOption = "device") {
    const profile = activeProfile();
    if (!profile.encryption?.enabled) throw new Error("Configure profile encryption first.");
    const key = await deriveAesKey(passphrase, profile.encryption.salt, profile.encryption.iterations);
    const check = await decryptJsonWithKey(profile.encryption.check, key, `profile-check|v13`);
    if (check?.marker !== "my-finance-profile-key") throw new Error("Incorrect profile encryption passphrase.");
    memoryKeys.set(profile.id, key);

    const isDevice = rememberOption === "device" || rememberOption === "local";
    const isSession = rememberOption === "session" || rememberOption === true;

    if (isDevice) {
      const raw = await crypto.subtle.exportKey("raw", await deriveAesKey(passphrase, profile.encryption.salt, profile.encryption.iterations, true));
      const b64 = bytesToBase64(new Uint8Array(raw));
      localStorage.setItem(`${PROFILE_KEY_LOCAL_PREFIX}${profile.id}`, b64);
      sessionStorage.setItem(`${PROFILE_KEY_SESSION_PREFIX}${profile.id}`, b64);
    } else if (isSession) {
      const raw = await crypto.subtle.exportKey("raw", await deriveAesKey(passphrase, profile.encryption.salt, profile.encryption.iterations, true));
      const b64 = bytesToBase64(new Uint8Array(raw));
      sessionStorage.setItem(`${PROFILE_KEY_SESSION_PREFIX}${profile.id}`, b64);
      localStorage.removeItem(`${PROFILE_KEY_LOCAL_PREFIX}${profile.id}`);
    } else {
      sessionStorage.removeItem(`${PROFILE_KEY_SESSION_PREFIX}${profile.id}`);
      localStorage.removeItem(`${PROFILE_KEY_LOCAL_PREFIX}${profile.id}`);
    }
    renderPanel();
    window.dispatchEvent(new CustomEvent("finance:profile-unlocked", { detail:{ profileId:profile.id } }));
    appendLocalAudit("Profile encryption unlocked");
    return true;
  }

  async function restoreSessionProfileKey() {
    const profile = activeProfile();
    if (!profile.encryption?.enabled || memoryKeys.has(profile.id)) return;
    const raw = sessionStorage.getItem(`${PROFILE_KEY_SESSION_PREFIX}${profile.id}`) || localStorage.getItem(`${PROFILE_KEY_LOCAL_PREFIX}${profile.id}`);
    if (!raw) return;
    try {
      const key = await crypto.subtle.importKey("raw", base64ToBytes(raw), { name:"AES-GCM" }, false, ["encrypt", "decrypt"]);
      await decryptJsonWithKey(profile.encryption.check, key, `profile-check|v13`);
      memoryKeys.set(profile.id, key);
    } catch (error) {
      sessionStorage.removeItem(`${PROFILE_KEY_SESSION_PREFIX}${profile.id}`);
      localStorage.removeItem(`${PROFILE_KEY_LOCAL_PREFIX}${profile.id}`);
    }
  }

  function lockProfile() {
    memoryKeys.delete(activeProfileId());
    sessionStorage.removeItem(`${PROFILE_KEY_SESSION_PREFIX}${activeProfileId()}`);
    localStorage.removeItem(`${PROFILE_KEY_LOCAL_PREFIX}${activeProfileId()}`);
    renderPanel();
    window.dispatchEvent(new CustomEvent("finance:profile-locked", { detail:{ profileId:activeProfileId() } }));
  }

  function isCloudUnlocked() {
    const profile = activeProfile();
    return Boolean(profile.cloudProfileId && profile.encryption?.enabled && memoryKeys.has(profile.id));
  }

  async function encryptCloudPayload(payload, context = {}) {
    const profile = activeProfile();
    const key = memoryKeys.get(profile.id);
    if (!profile.encryption?.enabled || !key) throw new Error("Unlock this profile’s encryption before cloud synchronization.");
    const aad = `finance-v3|${profile.cloudProfileId}|${context.collection || "record"}|${context.recordId || "root"}`;
    return encryptJsonWithKey(payload, key, aad);
  }

  async function decryptCloudPayload(payload, context = {}) {
    if (!payload?.__financeEncrypted) return clone(payload);
    const profile = activeProfile();
    const key = memoryKeys.get(profile.id);
    if (!key) throw new Error("Unlock this profile’s encryption before reading cloud records.");
    const aad = `finance-v3|${profile.cloudProfileId}|${context.collection || "record"}|${context.recordId || "root"}`;
    return decryptJsonWithKey(payload, key, aad);
  }

  async function encryptedBackup(passphrase, payload, profile = activeProfile()) {
    if (String(passphrase || "").length < 10) throw new Error("Use at least 10 characters for the encrypted backup passphrase.");
    const salt = randomBytes(16);
    const key = await deriveAesKey(passphrase, salt, KDF_ITERATIONS);
    const envelope = await encryptJsonWithKey(payload, key, `finance-backup-v13|${profile.id}`);
    return {
      format:"my-finance-encrypted-backup-v13",
      version:1,
      createdAt:new Date().toISOString(),
      profile:{ id:profile.id, name:profile.name, type:profile.type },
      kdf:{ name:"PBKDF2-SHA-256", iterations:KDF_ITERATIONS, salt:bytesToBase64(salt) },
      encryption:{ name:"AES-256-GCM", envelope }
    };
  }

  async function decryptBackup(bundle, passphrase) {
    if (bundle?.format !== "my-finance-encrypted-backup-v13") throw new Error("This is not a V13 encrypted backup.");
    const key = await deriveAesKey(passphrase, bundle.kdf?.salt, bundle.kdf?.iterations);
    return decryptJsonWithKey(bundle.encryption?.envelope, key, `finance-backup-v13|${bundle.profile?.id}`);
  }

  function download(name, content, type = "application/json") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function exportEncryptedBackup(passphrase) {
    const payload = {
      schemaVersion:12,
      cloudSchemaVersion:CLOUD_SCHEMA_VERSION,
      appVersion:typeof APP_VERSION !== "undefined" ? APP_VERSION : "13.0.0",
      profile:clone(activeProfile()),
      data:clone(typeof data !== "undefined" ? data : profileData() || {}),
      localAudit:loadLocalAudit()
    };
    const bundle = await encryptedBackup(passphrase, payload);
    download(`my-finance-${activeProfile().name.toLowerCase().replace(/[^a-z0-9]+/g,"-") || "profile"}-${new Date().toISOString().slice(0,10)}.mfrx`, JSON.stringify(bundle, null, 2), "application/vnd.my-finance.encrypted+json");
    appendLocalAudit("Encrypted backup exported");
    return bundle;
  }

  async function importEncryptedBackup(file, passphrase) {
    const bundle = JSON.parse(await file.text());
    const payload = await decryptBackup(bundle, passphrase);
    if (!payload?.data) throw new Error("The encrypted backup does not contain finance data.");
    if (!canWrite()) throw new Error("Viewer profiles cannot import or replace records.");
    if (typeof pushUndo === "function") pushUndo("Before encrypted backup restore");
    applyGuardedFinanceReplacement(payload.data, "Encrypted backup restored");
    appendLocalAudit("Encrypted backup imported", { sourceProfile:bundle.profile?.name || "Unknown" });
    return payload;
  }

  function loadLocalAudit() {
    try { return JSON.parse(localStorage.getItem(profileAuditKey()) || "[]"); } catch (error) { return []; }
  }

  async function getCloudClient() {
    const load = window.FinanceCloudSyncInternals?.loadClient;
    if (typeof load !== "function") throw new Error("Cloud Sync 3.0 is not ready yet.");
    return load();
  }

  async function cloudRpc(name, args = {}) {
    const client = await getCloudClient();
    const result = await client.rpc(name, args);
    if (result.error) {
      const message = result.error.message || String(result.error);
      if (/finance_v3_|schema cache|could not find the function/i.test(message)) throw new Error("Cloud Schema V3 is not installed. Run supabase/cloud-profiles-v3.sql first.");
      if (/owner_required/i.test(message)) throw new Error("Only the profile owner can perform this action.");
      if (/authentication_required/i.test(message)) throw new Error("Please sign in to your cloud account first.");
      throw result.error;
    }
    return result.data || {};
  }

  async function listCloudProfiles() {
    return cloudRpc("finance_v3_list_profiles", {});
  }

  async function verifyCloudProfilePassphrase(remoteProfile, passphrase, rememberSession = true) {
    if (!remoteProfile?.profile_id || !remoteProfile?.encryption_salt || !remoteProfile?.encryption_check) throw new Error("The cloud profile encryption metadata is incomplete.");
    if (String(passphrase || "").length < 10) throw new Error("Please enter the profile encryption passphrase (at least 10 characters).");
    const key = await deriveAesKey(passphrase, remoteProfile.encryption_salt, remoteProfile.kdf_iterations || KDF_ITERATIONS, rememberSession);
    let check;
    try { check = await decryptJsonWithKey(remoteProfile.encryption_check, key, `profile-check|v13`); }
    catch (error) { throw new Error("The profile passphrase is incorrect or the encryption metadata was changed."); }
    if (check?.marker !== "my-finance-profile-key") throw new Error("The profile passphrase is incorrect.");
    return key;
  }

  async function connectCloudProfile(profileId, passphrase, rememberSession = true, options = {}) {
    const result = await listCloudProfiles();
    const remote = (result.profiles || []).find(profile => profile.profile_id === profileId);
    if (!remote) throw new Error("This account cannot access that cloud profile.");
    const key = await verifyCloudProfilePassphrase(remote, passphrase, rememberSession);
    persistCurrentData(typeof data !== "undefined" ? data : {}, "Profile saved before connecting an existing cloud profile");
    let local = meta.profiles.find(profile => profile.cloudProfileId === remote.profile_id);
    if (!local) {
      local = normalizeProfile({
        id:uid("profile"), name:remote.name || "Cloud finances", type:remote.profile_type || "personal",
        role:remote.role || "viewer", cloudProfileId:remote.profile_id,
        encryption:{ enabled:true, salt:remote.encryption_salt, iterations:remote.kdf_iterations, check:remote.encryption_check },
        migratedFromSchema12:false
      });
      meta.profiles.push(local);
    } else {
      local.name = remote.name || local.name;
      local.type = remote.profile_type || local.type;
      local.role = remote.role || local.role;
      local.encryption = { enabled:true, salt:remote.encryption_salt, iterations:remote.kdf_iterations || KDF_ITERATIONS, check:remote.encryption_check };
      local.updatedAt = new Date().toISOString();
    }
    meta.activeProfileId = local.id;
    saveMeta();
    const existingData = profileData(local.id) || emptyProfileData();
    localStorage.setItem(profileDataKey(local.id), JSON.stringify(existingData));
    localStorage.setItem(ACTIVE_DATA_KEY, JSON.stringify(existingData));
    memoryKeys.set(local.id, key);
    if (rememberSession) {
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
      sessionStorage.setItem(`${PROFILE_KEY_SESSION_PREFIX}${local.id}`, bytesToBase64(raw));
    }
    appendLocalAudit("Existing Cloud Schema V3 profile connected", { cloudProfileId:local.cloudProfileId, role:local.role });
    window.dispatchEvent(new CustomEvent("finance:cloud-profile-linked", { detail:{ profileId:local.id, cloudProfileId:local.cloudProfileId, auto:Boolean(options?.auto) } }));
    return local;
  }

  async function createCloudProfile({ name, type, passphrase }, options = {}) {
    if (!activeProfile().encryption?.enabled) await configureEncryption(passphrase);
    else if (!memoryKeys.has(activeProfileId())) await unlockProfile(passphrase);
    const profile = activeProfile();
    const result = await cloudRpc("finance_v3_create_profile", {
      p_name:String(name || profile.name).slice(0,80),
      p_profile_type:type === "household" ? "household" : "personal",
      p_encryption_salt:profile.encryption.salt,
      p_encryption_check:profile.encryption.check,
      p_kdf_iterations:Number(profile.encryption.iterations || KDF_ITERATIONS),
      p_min_app_version_code:APP_VERSION_CODE
    });
    if (!result.profile_id) throw new Error("The cloud profile was not created.");
    profile.cloudProfileId = result.profile_id;
    profile.role = result.role || "owner";
    profile.type = result.profile_type || type || profile.type;
    profile.name = result.name || profile.name;
    profile.updatedAt = new Date().toISOString();
    saveMeta();
    await unlockProfile(passphrase, true);
    appendLocalAudit("Encrypted Cloud Schema V3 profile created", { cloudProfileId:profile.cloudProfileId, type:profile.type });
    renderPanel();
    window.dispatchEvent(new CustomEvent("finance:cloud-profile-linked", { detail:{ profileId:profile.id, cloudProfileId:profile.cloudProfileId, auto:Boolean(options?.auto) } }));
    return result;
  }

  async function createInvite(role = "viewer", expiresHours = 72) {
    const profileId = cloudProfileId();
    if (!profileId) throw new Error("Create or connect a cloud profile first.");
    if (activeRole() !== "owner") throw new Error("Only the profile owner can create invitations.");
    const secret = `MFR3-${bytesToBase64Url(randomBytes(24))}`;
    const tokenHash = await sha256Hex(secret);
    const result = await cloudRpc("finance_v3_create_invite", {
      p_profile_id:profileId,
      p_token_hash:tokenHash,
      p_role:role === "editor" ? "editor" : "viewer",
      p_expires_hours:Math.max(1, Math.min(168, Number(expiresHours || 72)))
    });
    return { code:secret, ...result };
  }

  async function acceptInvite(code, passphrase) {
    const cleanCode = String(code || "").trim();
    const tokenHash = await sha256Hex(cleanCode);
    let result;
    try {
      result = await cloudRpc("finance_v3_accept_invite", { p_token_hash:tokenHash });
    } catch (error) {
      const msg = error.message || String(error);
      if (/invite_invalid_or_expired/i.test(msg)) {
        try {
          const listRes = await listCloudProfiles();
          const profiles = listRes.profiles || [];
          for (const remote of profiles) {
            try {
              const connected = await connectCloudProfile(remote.profile_id, passphrase, true);
              return connected;
            } catch (err) {
              // Passphrase didn't unlock this profile, try next
            }
          }
        } catch (err) {}
        throw new Error("This invitation code is invalid, expired, or has already been used. If you have already accepted this invitation, click 'Find existing profiles' to connect using your shared passphrase, or ask the profile owner for a new invitation code.");
      }
      throw error;
    }

    if (!result?.profile_id) throw new Error("The invitation could not be accepted.");
    try {
      return await connectCloudProfile(result.profile_id, passphrase, true);
    } catch (error) {
      throw new Error(`${error.message || error} The invitation was accepted, but profile connection failed. Click 'Find existing profiles' to connect.`);
    }
  }

  async function createCloudRestorePoint(label = "Manual restore point") {
    if (!cloudProfileId()) throw new Error("Connect this profile to Cloud Schema V3 first.");
    if (!isCloudUnlocked()) throw new Error("Unlock profile encryption first.");
    const snapshot = {
      format:"my-finance-cloud-restore-v13",
      appVersion:typeof APP_VERSION !== "undefined" ? APP_VERSION : "13.0.0",
      profileId:cloudProfileId(),
      createdAt:new Date().toISOString(),
      data:clone(typeof data !== "undefined" ? data : profileData() || {})
    };
    const envelope = await encryptCloudPayload(snapshot, { collection:"restore-point", recordId:uid("restore") });
    const result = await cloudRpc("finance_v3_create_restore_point", {
      p_profile_id:cloudProfileId(),
      p_label:String(label || "Manual restore point").slice(0,120),
      p_encrypted_snapshot:envelope,
      p_summary:{ accounts:Object.keys(snapshot.data.accounts || {}).length, expenses:(snapshot.data.expenses || []).length, app_version:snapshot.appVersion }
    });
    appendLocalAudit("Cloud restore point created", { label, restorePointId:result.restore_point_id || "" });
    return result;
  }

  async function listCloudRestorePoints() {
    if (!cloudProfileId()) return { restore_points:[] };
    return cloudRpc("finance_v3_list_restore_points", { p_profile_id:cloudProfileId() });
  }

  async function restoreCloudPoint(id) {
    if (!canWrite()) throw new Error("Viewer profiles cannot restore cloud records.");
    const result = await cloudRpc("finance_v3_get_restore_point", { p_profile_id:cloudProfileId(), p_restore_point_id:id });
    const envelope = result.encrypted_snapshot;
    const snapshot = await decryptCloudPayload(envelope, { collection:"restore-point", recordId:result.encryption_record_id || id });
    if (!snapshot?.data) throw new Error("The restore point is incomplete.");
    if (typeof pushUndo === "function") pushUndo("Before cloud restore point");
    applyGuardedFinanceReplacement(snapshot.data, "Cloud restore point applied");
    appendLocalAudit("Cloud restore point applied", { restorePointId:id });
    return snapshot;
  }

  async function listMembers() {
    if (!cloudProfileId()) return { members:[] };
    return cloudRpc("finance_v3_list_members", { p_profile_id:cloudProfileId() });
  }

  async function setMemberRole(memberUserId, role) {
    if (activeRole() !== "owner") throw new Error("Only the owner can change member roles.");
    return cloudRpc("finance_v3_set_member_role", { p_profile_id:cloudProfileId(), p_member_user_id:memberUserId, p_role:role });
  }

  async function removeMember(memberUserId) {
    if (activeRole() !== "owner") throw new Error("Only the owner can remove members.");
    return cloudRpc("finance_v3_remove_member", { p_profile_id:cloudProfileId(), p_member_user_id:memberUserId });
  }

  async function setupDeviceLock(passphrase, minutes = 15) {
    if (String(passphrase || "").length < 6) throw new Error("Use at least 6 characters for the device lock.");
    const salt = randomBytes(16);
    const key = await deriveAesKey(passphrase, salt, 200000, true);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    const verifier = await sha256Hex(raw);
    localStorage.setItem(APP_LOCK_KEY, JSON.stringify({ enabled:true, salt:bytesToBase64(salt), iterations:200000, verifier, autoLockMinutes:Math.max(1,Math.min(240,Number(minutes||15))) }));
    sessionStorage.setItem(APP_LOCK_SESSION_KEY, "unlocked");
    scheduleAutoLock();
    renderPanel();
    appendLocalAudit("Device app lock enabled", { autoLockMinutes:Number(minutes || 15) });
  }

  function deviceLockConfig() {
    try { return JSON.parse(localStorage.getItem(APP_LOCK_KEY) || "null"); } catch (error) { return null; }
  }

  async function verifyDeviceLock(passphrase) {
    const config = deviceLockConfig();
    if (!config?.enabled) return true;
    const key = await deriveAesKey(passphrase, config.salt, config.iterations, true);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    const verifier = await sha256Hex(raw);
    return verifier === config.verifier;
  }

  async function unlockDevice(passphrase) {
    if (!await verifyDeviceLock(passphrase)) throw new Error("Incorrect device lock passphrase.");
    sessionStorage.setItem(APP_LOCK_SESSION_KEY, "unlocked");
    hideLockOverlay();
    scheduleAutoLock();
    appendLocalAudit("Device app lock unlocked");
  }

  function disableDeviceLock() {
    localStorage.removeItem(APP_LOCK_KEY);
    sessionStorage.removeItem(APP_LOCK_SESSION_KEY);
    hideLockOverlay();
    clearTimeout(inactivityTimer);
    renderPanel();
    appendLocalAudit("Device app lock disabled");
  }

  function lockDevice() {
    const config = deviceLockConfig();
    if (!config?.enabled) return;
    sessionStorage.removeItem(APP_LOCK_SESSION_KEY);
    showLockOverlay();
  }

  function scheduleAutoLock() {
    clearTimeout(inactivityTimer);
    const config = deviceLockConfig();
    if (!config?.enabled || sessionStorage.getItem(APP_LOCK_SESSION_KEY) !== "unlocked") return;
    const delay = Math.max(60000, Number(config.autoLockMinutes || 15) * 60000 - (Date.now() - lastActivityAt));
    inactivityTimer = setTimeout(lockDevice, delay);
  }

  function noteActivity() {
    lastActivityAt = Date.now();
    scheduleAutoLock();
  }

  function ensureLockOverlay() {
    let overlay = document.getElementById("financeDeviceLockOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "financeDeviceLockOverlay";
    overlay.className = "finance-device-lock-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `<div class="finance-device-lock-card"><div class="finance-lock-mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/></svg></div><h2>Talaan is locked</h2><p>This device lock blocks access to the open app. Browser storage encryption is separate from this screen lock.</p><form id="financeDeviceUnlockForm"><label for="financeDeviceUnlockPassphrase">Device lock passphrase</label><input class="input" id="financeDeviceUnlockPassphrase" type="password" autocomplete="current-password" required><button class="button button-primary" type="submit">Unlock</button><small id="financeDeviceUnlockError" role="alert"></small></form></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault();
      const error = overlay.querySelector("#financeDeviceUnlockError");
      try { await unlockDevice(overlay.querySelector("#financeDeviceUnlockPassphrase").value); error.textContent = ""; }
      catch (reason) { error.textContent = reason.message || "Could not unlock this device."; }
    });
    return overlay;
  }

  function showLockOverlay() {
    const overlay = ensureLockOverlay();
    overlay.hidden = false;
    document.documentElement.classList.add("finance-app-locked");
    setTimeout(() => overlay.querySelector("input")?.focus(), 0);
  }

  function hideLockOverlay() {
    const overlay = ensureLockOverlay();
    overlay.hidden = true;
    document.documentElement.classList.remove("finance-app-locked");
    const input = overlay.querySelector("input");
    if (input) input.value = "";
  }

  async function mfaStatus() {
    const client = await getCloudClient();
    const [factors, aal] = await Promise.all([client.auth.mfa.listFactors(), client.auth.mfa.getAuthenticatorAssuranceLevel()]);
    if (factors.error) throw factors.error;
    if (aal.error) throw aal.error;
    return { factors:factors.data || {}, aal:aal.data || {} };
  }

  async function beginTotpEnrollment(friendlyName = "Authenticator app") {
    const client = await getCloudClient();
    const result = await client.auth.mfa.enroll({ factorType:"totp", friendlyName:String(friendlyName || "Authenticator app").slice(0,60) });
    if (result.error) throw result.error;
    pendingTotpFactor = result.data;
    return result.data;
  }

  async function verifyTotp(code) {
    if (!pendingTotpFactor?.id) throw new Error("Start authenticator enrollment first.");
    const client = await getCloudClient();
    const challenge = await client.auth.mfa.challenge({ factorId:pendingTotpFactor.id });
    if (challenge.error) throw challenge.error;
    const verified = await client.auth.mfa.verify({ factorId:pendingTotpFactor.id, challengeId:challenge.data.id, code:String(code || "").trim() });
    if (verified.error) throw verified.error;
    pendingTotpFactor = null;
    return verified.data;
  }

  async function challengeExistingTotp(factorId, code) {
    const client = await getCloudClient();
    const challenge = await client.auth.mfa.challenge({ factorId });
    if (challenge.error) throw challenge.error;
    const verified = await client.auth.mfa.verify({ factorId, challengeId:challenge.data.id, code:String(code || "").trim() });
    if (verified.error) throw verified.error;
    return verified.data;
  }

  async function unenrollTotp(factorId) {
    const client = await getCloudClient();
    const result = await client.auth.mfa.unenroll({ factorId });
    if (result.error) throw result.error;
    return result.data;
  }

  async function registerPasskey() {
    const client = await getCloudClient();
    if (typeof client.auth.registerPasskey !== "function") throw new Error("Passkeys are not available in the loaded Supabase client.");
    const result = await client.auth.registerPasskey();
    if (result?.error) throw result.error;
    return result?.data || result;
  }

  async function signInWithPasskey() {
    const client = await getCloudClient();
    if (typeof client.auth.signInWithPasskey !== "function") throw new Error("Passkeys are not enabled for this Supabase project or client.");
    const result = await client.auth.signInWithPasskey();
    if (result?.error) throw result.error;
    return result?.data || result;
  }

  async function listPasskeys() {
    const client = await getCloudClient();
    if (!client.auth.passkey?.list) return [];
    const result = await client.auth.passkey.list();
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function deletePasskey(passkeyId) {
    const client = await getCloudClient();
    if (!client.auth.passkey?.delete) throw new Error("Passkey management is unavailable.");
    const result = await client.auth.passkey.delete({ passkeyId });
    if (result.error) throw result.error;
    return result.data;
  }

  function toast(message, tone = "info") {
    if (typeof showToast === "function") showToast(message, tone);
    else console.info(message);
  }

  function escape(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
  }

  function roleLabel(role) { return role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer"; }

  function renderPanel() {
    const panel = document.getElementById("settings-panel-profiles");
    if (!panel) return;
    delete panel.dataset.simplePresentation;
    const profile = activeProfile();
    const appLock = deviceLockConfig();
    const unlocked = memoryKeys.has(profile.id);
    const keyMemory = localStorage.getItem(`${PROFILE_KEY_LOCAL_PREFIX}${profile.id}`);
    const isSavedOnDevice = unlocked && Boolean(keyMemory);
    const sessionMemory = sessionStorage.getItem(`${PROFILE_KEY_SESSION_PREFIX}${profile.id}`);
    const isSavedInSession = unlocked && Boolean(sessionMemory) && !isSavedOnDevice;
    const defaultMode = keyMemory ? "device" : sessionMemory ? "session" : "none";
    const profiles = meta.profiles.map(item => `<option value="${escape(item.id)}" ${item.id === profile.id ? "selected" : ""}>${escape(item.name)} · ${escape(roleLabel(item.role))}</option>`).join("");
    const audit = loadLocalAudit().slice(0, 12);
    panel.innerHTML = `
      <article class="card profile-overview-card">
        <div class="card-header"><div><h3>Finance profiles</h3><p>Separate personal or household records without mixing balances</p></div><span class="v13-chip ${profile.type === "household" ? "shared" : "private"}">${escape(profile.type)}</span></div>
        <div class="profile-status-grid">
          <div><span>Active profile</span><strong>${escape(profile.name)}</strong></div>
          <div><span>Your role</span><strong>${escape(roleLabel(profile.role))}</strong></div>
          <div><span>Cloud profile</span><strong>${profile.cloudProfileId ? "Connected · V3" : "Not connected"}</strong></div>
          <div><span>Encryption</span><strong>${profile.encryption.enabled ? (unlocked ? "Unlocked" : "Locked") : "Not configured"}</strong></div>
        </div>
        <div class="profile-switch-row" style="margin-top:12px; display:flex; gap:8px; align-items:flex-end;">
          <div class="field" style="flex:1; margin:0;"><label for="renameProfileInput" style="margin-bottom:4px; display:block; color:var(--text, inherit);">Rename active profile</label><input class="input" id="renameProfileInput" value="${escape(profile.name)}" maxlength="80"></div>
          <button class="button button-secondary button-small" id="renameProfileButton" type="button" style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; font-size:0.8rem; height:auto; min-height:36px;">
            <span class="toolbar-icon" aria-hidden="true" style="display:inline-flex;"><svg viewBox="0 0 24 24" focusable="false" style="width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></span>
            <span>Rename profile</span>
          </button>
        </div>
        <div class="profile-switch-row" style="margin-top:10px;"><select class="select" id="profileSwitcher">${profiles}</select><button class="button button-secondary button-small" id="profileSwitchButton" type="button" style="padding:6px 12px; font-size:0.8rem; height:auto; min-height:36px;">Switch profile</button></div>
        ${profile.role === "viewer" ? `<div class="v13-warning">This is a read-only Viewer profile. Local edits and cloud writes are blocked.</div>` : ""}
      </article>

      <article class="card profile-integrity-card">
        <div class="card-header"><div><h3>Financial integrity</h3><p>Check Account Ledger, payments, income deposits, transfers, reconciliations, and persisted profile state</p></div><span class="v13-chip info" id="financeIntegrityChip">Not checked</span></div>
        <p class="v13-help" id="financeIntegritySummary">Run a read-only integrity check. Talaan will not invent missing transactions or change financial history automatically.</p>
        <div class="profile-actions"><button class="button button-secondary" id="runIntegrityCheckButton" type="button">Run integrity check</button><button class="button button-primary" id="repairIntegrityButton" type="button" hidden ${canWrite() ? "" : "disabled"}>Repair safe issues</button></div>
        <div id="financeIntegrityIssues" class="profile-result"></div>
      </article>

      <div class="profile-two-column">
        <article class="card">
          <div class="card-header"><div><h3>Create local profile</h3><p>Start empty or duplicate the active profile</p></div></div>
          <div class="field"><label for="newProfileName">Profile name</label><input class="input" id="newProfileName" maxlength="80" placeholder="Household finances"></div>
          <div class="profile-inline-fields"><div class="field"><label for="newProfileType">Type</label><select class="select" id="newProfileType"><option value="personal">Personal</option><option value="household">Household</option></select></div><label class="profile-check"><input type="checkbox" id="newProfileDuplicate"> Duplicate current records</label></div>
          <button class="button button-primary" id="createLocalProfileButton" type="button">Create and open</button>
        </article>

        <article class="card profile-encryption-card">
          <div class="card-header"><div><h3>Profile encryption</h3><p>AES-256-GCM cloud records with a passphrase-derived key</p></div><span class="v13-chip ${unlocked ? "success" : "warning"}">${unlocked ? "Unlocked" : "Locked"}</span></div>
          <div id="profileEncryptionStatusBanner" class="v13-encryption-status" style="background:${isSavedOnDevice ? 'rgba(16,185,129,0.15)' : isSavedInSession ? 'rgba(59,130,246,0.15)' : unlocked ? 'rgba(245,158,11,0.15)' : profile.encryption?.enabled ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.15)'}; border:1px solid ${isSavedOnDevice ? 'rgba(16,185,129,0.4)' : isSavedInSession ? 'rgba(59,130,246,0.4)' : unlocked ? 'rgba(245,158,11,0.4)' : profile.encryption?.enabled ? 'rgba(239,68,68,0.4)' : 'rgba(100,116,139,0.4)'}; color:var(--text, inherit); font-size:0.88em; padding:10px 14px; border-radius:var(--talaan-control-radius); margin-bottom:14px; display:flex; align-items:center; gap:8px;">
            ${isSavedOnDevice
              ? `<strong>✓ Saved on device.</strong> Auto-unlocks without entering password on this device.`
              : isSavedInSession
              ? `<strong>✓ Saved for tab session.</strong> Auto-unlocks until browser tab is closed.`
              : unlocked
              ? `<strong>✓ One-time password unlocked.</strong> Password required again when app is reopened or refreshed.`
              : profile.encryption?.enabled
              ? `<strong>Profile locked.</strong> Enter passphrase below to unlock encryption.`
              : `<strong>Encryption not configured.</strong> Enter a passphrase below to enable encryption.`}
          </div>
          <div class="field"><label for="profileEncryptionPassphrase">Encryption passphrase</label><input class="input" id="profileEncryptionPassphrase" type="password" autocomplete="new-password" minlength="10" placeholder="At least 10 characters"></div>
          <div class="field" style="margin-top:12px;">
            <label>Passphrase memory</label>
            <div class="remember-mode-buttons" id="rememberModeButtonGroup" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:6px;">
              <button type="button" class="remember-option-btn ${defaultMode === 'device' ? 'active' : ''}" data-mode="device" style="padding:8px 10px; border-radius:var(--talaan-control-radius); border:1px solid ${defaultMode === 'device' ? 'var(--primary)' : 'var(--line)'}; background:${defaultMode === 'device' ? 'var(--primary)' : 'var(--surface-soft)'}; color:${defaultMode === 'device' ? '#fff' : 'var(--text)'}; font-size:.75rem; text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:2px; transition:all 0.15s ease;">
                <strong style="font-weight:700;">Permanent device</strong>
                <span style="font-size:.65rem; opacity:0.8;">Auto-unlocks on this device</span>
              </button>
              <button type="button" class="remember-option-btn ${defaultMode === 'session' ? 'active' : ''}" data-mode="session" style="padding:8px 10px; border-radius:var(--talaan-control-radius); border:1px solid ${defaultMode === 'session' ? 'var(--primary)' : 'var(--line)'}; background:${defaultMode === 'session' ? 'var(--primary)' : 'var(--surface-soft)'}; color:${defaultMode === 'session' ? '#fff' : 'var(--text)'}; font-size:.75rem; text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:2px; transition:all 0.15s ease;">
                <strong style="font-weight:700;">Tab session</strong>
                <span style="font-size:.65rem; opacity:0.8;">Until browser tab closes</span>
              </button>
              <button type="button" class="remember-option-btn ${defaultMode === 'none' ? 'active' : ''}" data-mode="none" style="padding:8px 10px; border-radius:var(--talaan-control-radius); border:1px solid ${defaultMode === 'none' ? 'var(--primary)' : 'var(--line)'}; background:${defaultMode === 'none' ? 'var(--primary)' : 'var(--surface-soft)'}; color:${defaultMode === 'none' ? '#fff' : 'var(--text)'}; font-size:.75rem; text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:2px; transition:all 0.15s ease;">
                <strong style="font-weight:700;">One-time password</strong>
                <span style="font-size:.65rem; opacity:0.8;">Ask for password every time</span>
              </button>
            </div>
            <input type="hidden" id="rememberProfileKeyMode" value="${defaultMode}">
          </div>
          <div class="profile-actions" style="margin-top:14px;"><button class="button button-primary" id="profileEncryptionButton" type="button">${profile.encryption.enabled ? "Unlock encryption" : "Configure encryption"}</button>${unlocked ? `<button class="button button-secondary" id="lockProfileButton" type="button">Lock now</button>` : ""}</div>
          <p class="v13-help">The passphrase is never uploaded. "Permanent Device" keeps the encryption key saved locally so you enter it once. "One-Time Password" asks every time.</p>
        </article>
      </div>

      <article class="card profile-cloud-card">
        <div class="card-header"><div><h3>Cloud Schema V3 &amp; migration assistant</h3><p>Move the active V12 local dataset into an encrypted V13 profile</p></div><span class="v13-chip info">Non-destructive</span></div>
        <p class="v13-help">To connect an existing cloud profile, click <strong>Find existing profiles</strong> below and enter its passphrase. To join a shared household profile, use <strong>Invitation code</strong> and <strong>Shared profile passphrase</strong> under Household sharing.</p>
        <div class="profile-actions">
          ${profile.cloudProfileId ? `<button class="button button-secondary" id="refreshCloudProfilesButton" type="button">Refresh membership</button><button class="button button-primary" id="createRestorePointButton" type="button">Create encrypted restore point</button>` : `<button class="button button-primary" id="createCloudProfileButton" type="button">Create encrypted V13 cloud profile</button><button class="button button-secondary" id="findCloudProfilesButton" type="button">Find existing profiles</button>`}
          <button class="button button-secondary" id="refreshRestorePointsButton" type="button">View restore points</button>
        </div>
        <div id="cloudProfileResult" class="profile-result"></div>
        <div id="cloudRestorePointList" class="profile-restore-list"></div>
      </article>

      <div class="profile-two-column">
        <article class="card profile-sharing-card">
          <div class="card-header"><div><h3>Household sharing</h3><p>Invite an authenticated member as Editor or Viewer</p></div></div>
          <p class="v13-help" style="margin-bottom:12px;">Invitation codes grant database access. The <strong>Shared profile passphrase</strong> is the profile's <strong>Encryption passphrase</strong> (set during profile creation) needed to decrypt records.</p>
          <div class="profile-inline-fields"><div class="field"><label for="profileInviteRole">Role</label><select class="select" id="profileInviteRole"><option value="viewer">Viewer</option><option value="editor">Editor</option></select></div><div class="field"><label for="profileInviteHours">Expires after</label><select class="select" id="profileInviteHours"><option value="24">24 hours</option><option value="72" selected>72 hours</option><option value="168">7 days</option></select></div></div>
          <button class="button button-secondary" id="createProfileInviteButton" type="button" ${profile.role !== "owner" || !profile.cloudProfileId ? "disabled" : ""}>Create invitation code</button>
          <div id="profileInviteResult" class="profile-result" style="margin-top:8px;"></div>
          <hr style="margin:16px 0; border:0; border-top:1px solid var(--v12-border, rgba(0,0,0,0.1));">
          <div style="font-weight:600; font-size:0.9em; margin-bottom:8px;">Join a shared profile</div>
          <div class="field"><label for="profileAcceptInvite">Invitation code</label><input class="input" id="profileAcceptInvite" autocomplete="off" placeholder="MFR3-..."></div>
          <div class="field"><label for="profileInvitePassphrase">Shared profile passphrase</label><input class="input" id="profileInvitePassphrase" type="password" autocomplete="current-password" placeholder="Profile encryption passphrase"></div>
          <button class="button button-primary" id="acceptProfileInviteButton" type="button" disabled>Accept and open shared profile</button>
        </article>

        <article class="card">
          <div class="card-header"><div><h3>Encrypted backup</h3><p>Portable password-protected recovery file</p></div></div>
          <div class="field"><label for="encryptedBackupPassphrase">Backup passphrase</label><input class="input" id="encryptedBackupPassphrase" type="password" autocomplete="new-password" minlength="10"></div>
          <div class="profile-actions"><button class="button button-primary" id="exportEncryptedBackupButton" type="button">Export encrypted backup</button><label class="button button-secondary profile-file-button">Import encrypted backup<input id="importEncryptedBackupInput" type="file" accept=".mfrx,application/json" hidden></label></div>
          <p class="v13-help">Encrypted backups use PBKDF2-SHA-256 and AES-256-GCM. Keep the passphrase outside this app.</p>
        </article>
      </div>

      <div class="profile-two-column">
        <article class="card">
          <div class="card-header"><div><h3>Device app lock</h3><p>Require a local passphrase after inactivity</p></div><span class="v13-chip ${appLock?.enabled ? "success" : "info"}">${appLock?.enabled ? "Enabled" : "Optional"}</span></div>
          <div class="field"><label for="deviceLockPassphrase">Device lock passphrase</label><input class="input" id="deviceLockPassphrase" type="password" autocomplete="new-password" minlength="6"></div>
          <div class="field"><label for="deviceLockMinutes">Auto-lock</label><select class="select" id="deviceLockMinutes"><option value="5">5 minutes</option><option value="15" selected>15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option></select></div>
          <div class="profile-actions"><button class="button button-primary" id="enableDeviceLockButton" type="button">${appLock?.enabled ? "Update device lock" : "Enable device lock"}</button>${appLock?.enabled ? `<button class="button button-secondary" id="lockDeviceNowButton" type="button">Lock now</button><button class="button button-danger" id="disableDeviceLockButton" type="button">Disable</button>` : ""}</div>
          <p class="v13-help">This screen lock does not encrypt browser local storage. Use encrypted backups and encrypted Cloud Schema V3 for protected copies.</p>
        </article>

        <article class="card">
          <div class="card-header"><div><h3>Account security</h3><p>Authenticator MFA and experimental passkeys</p></div><span class="v13-chip info" id="profileAalChip">Check status</span></div>
          <div class="profile-actions"><button class="button button-secondary" id="refreshMfaButton" type="button">Refresh MFA status</button><button class="button button-secondary" id="beginTotpButton" type="button">Enroll authenticator</button><button class="button button-primary" id="registerPasskeyButton" type="button">Register passkey</button></div>
          <div id="totpEnrollmentBox" class="profile-security-box"></div>
          <div id="mfaFactorList" class="profile-security-box"></div>
          <div id="passkeyList" class="profile-security-box"></div>
          <p class="v13-help">Passkeys are experimental in Supabase and require project-side WebAuthn configuration. Authenticator MFA can raise the current session to AAL2.</p>
        </article>
      </div>

      <article class="card">
        <div class="card-header"><div><h3>Local profile audit</h3><p>Recent profile, security, backup, and migration activity on this device</p></div><span class="v13-chip info">Latest ${audit.length}</span></div>
        <div class="profile-audit-list">${audit.length ? audit.map(item => `<div><strong>${escape(item.action)}</strong><small>${escape(new Date(item.createdAt).toLocaleString())} · ${escape(item.appVersion || "")}</small></div>`).join("") : `<div class="v13-empty">No local profile activity yet.</div>`}</div>
      </article>`;
    window.simplifyProfileSettingsPanel?.(panel);
    bindPanelEvents();
  }

  function bindPanelEvents() {
    const get = id => document.getElementById(id);
    document.querySelectorAll("#rememberModeButtonGroup .remember-option-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        const hiddenInput = get("rememberProfileKeyMode");
        if (hiddenInput) hiddenInput.value = mode;
        document.querySelectorAll("#rememberModeButtonGroup .remember-option-btn").forEach(b => {
          const active = b.dataset.mode === mode;
          b.style.borderColor = active ? "var(--primary)" : "var(--line)";
          b.style.background = active ? "var(--primary)" : "var(--surface-soft)";
          b.style.color = active ? "#fff" : "var(--text)";
          b.classList.toggle("active", active);
        });
      });
    });
    get("renameProfileButton")?.addEventListener("click", () => run(async () => {
      const input = get("renameProfileInput");
      const name = input?.value || "";
      renameProfile(activeProfileId(), name);
      toast("Profile renamed successfully", "success");
      renderPanel();
    }));
    get("runIntegrityCheckButton")?.addEventListener("click", () => run(async () => {
      const report=renderIntegrityStatus(integrityReport());
      if(report && !report.counts.critical && !report.counts.warning && !report.counts.safeRepair) toast("Financial integrity check passed", "success");
    }));
    get("repairIntegrityButton")?.addEventListener("click", () => run(async () => {
      if(!canWrite()) throw new Error("Viewer profiles cannot repair finance records.");
      const service=window.FinanceLedgerTransactions;
      if(!service?.repairSafeIntegrity) throw new Error("Safe integrity repair is unavailable. Reload Talaan.");
      const result=service.repairSafeIntegrity();
      if(!result?.ok) throw new Error(result?.report?.counts?.critical ? "Critical issues require review and were not changed." : "Safe integrity repair could not be completed.");
      renderIntegrityStatus(result.report || integrityReport());
      toast(result.count ? `${result.count} safe integrity repair${result.count===1?"":"s"} applied` : "No safe integrity repairs were needed", "success");
    }));
    get("profileSwitchButton")?.addEventListener("click", () => {
      const id = get("profileSwitcher")?.value;
      if (id && id !== activeProfileId()) switchProfile(id);
    });
    get("createLocalProfileButton")?.addEventListener("click", () => run(async () => {
      createLocalProfile({ name:get("newProfileName").value, type:get("newProfileType").value, duplicateCurrent:get("newProfileDuplicate").checked });
      location.reload();
    }));
    get("profileEncryptionButton")?.addEventListener("click", () => run(async () => {
      const passphrase = get("profileEncryptionPassphrase").value;
      const mode = get("rememberProfileKeyMode")?.value || "device";
      if (activeProfile().encryption.enabled) await unlockProfile(passphrase, mode);
      else await configureEncryption(passphrase, mode);
      get("profileEncryptionPassphrase").value = "";
      toast("Profile encryption unlocked & saved", "success");
      renderPanel();
    }));
    get("lockProfileButton")?.addEventListener("click", lockProfile);
    get("createCloudProfileButton")?.addEventListener("click", () => run(async () => {
      let passphrase = get("profileEncryptionPassphrase")?.value;
      if (!passphrase || passphrase.trim().length < 10) {
        toast("Please enter a passphrase (at least 10 characters) in the Encryption passphrase field above.", "warning");
        get("profileEncryptionPassphrase")?.focus();
        return;
      }
      const result = await createCloudProfile({ name:activeProfile().name, type:activeProfile().type, passphrase });
      get("cloudProfileResult").textContent = `Cloud profile created: ${result.name || activeProfile().name}. Reloading Cloud Sync 3.0…`;
      setTimeout(() => location.reload(), 700);
    }));
    const showCloudProfiles = () => run(renderAccessibleCloudProfiles);
    get("refreshCloudProfilesButton")?.addEventListener("click", showCloudProfiles);
    get("findCloudProfilesButton")?.addEventListener("click", showCloudProfiles);
    const syncInviteAcceptState = () => {
      const button=get("acceptProfileInviteButton"), code=get("profileAcceptInvite"), pass=get("profileInvitePassphrase");
      if (!button || !code || !pass) return;
      button.disabled = !/^MFR3-/i.test(code.value.trim()) || pass.value.trim().length < 10;
    };
    get("profileAcceptInvite")?.addEventListener("input", syncInviteAcceptState);
    get("profileInvitePassphrase")?.addEventListener("input", syncInviteAcceptState);
    syncInviteAcceptState();

    get("createProfileInviteButton")?.addEventListener("click", () => run(async () => {
      const result = await createInvite(get("profileInviteRole").value, get("profileInviteHours").value);
      get("profileInviteResult").innerHTML = `
        <div style="padding:12px; background:var(--v12-surface-subtle, rgba(0,0,0,0.03)); border:1px solid var(--v12-border, rgba(0,0,0,0.1)); border-radius:var(--talaan-card-radius); margin-top:8px;">
          <div style="font-weight:600; color:var(--text); margin-bottom:4px;">Invitation code generated (copied to clipboard)</div>
          <code style="display:inline-block; font-size:1.05em; padding:4px 8px; background:var(--v12-bg, #fff); border:1px dashed var(--v12-border); border-radius:var(--talaan-control-radius, 8px); letter-spacing:0.5px; word-break:break-all;">${escape(result.code)}</code>
          <p style="margin:8px 0 0 0; font-size:0.85em; opacity:0.9; line-height:1.4;">
            <strong>To complete household access:</strong> Give the invited member this <strong>Invitation code</strong> along with your profile's <strong>Encryption passphrase</strong> (the passphrase you set under Profile encryption when creating this profile). They will enter both under <em>Join a shared profile</em>.
          </p>
        </div>
      `;
      navigator.clipboard?.writeText?.(result.code).catch(() => {});
      toast("Invitation code created & copied to clipboard", "success");
    }));
    get("acceptProfileInviteButton")?.addEventListener("click", () => run(async () => {
      await acceptInvite(get("profileAcceptInvite").value, get("profileInvitePassphrase").value);
      location.reload();
    }));
    get("exportEncryptedBackupButton")?.addEventListener("click", () => run(async () => {
      await exportEncryptedBackup(get("encryptedBackupPassphrase").value);
      get("encryptedBackupPassphrase").value = "";
      toast("Encrypted backup exported", "success");
    }));
    get("importEncryptedBackupInput")?.addEventListener("change", event => run(async () => {
      const file = event.target.files?.[0];
      if (!file) return;
      const passphrase = get("encryptedBackupPassphrase").value;
      if (!passphrase || passphrase.trim().length < 10) {
        toast("Please enter the backup passphrase (at least 10 characters) in the Backup passphrase field above.", "warning");
        get("encryptedBackupPassphrase")?.focus();
        event.target.value = "";
        return;
      }
      if (!confirm("Replace the active profile with this decrypted backup after creating an undo snapshot?")) return;
      await importEncryptedBackup(file, passphrase);
      event.target.value = "";
      toast("Encrypted backup restored", "success");
    }));
    get("enableDeviceLockButton")?.addEventListener("click", () => run(async () => {
      await setupDeviceLock(get("deviceLockPassphrase").value, get("deviceLockMinutes").value);
      get("deviceLockPassphrase").value = "";
      toast("Device app lock enabled", "success");
    }));
    get("lockDeviceNowButton")?.addEventListener("click", lockDevice);
    get("disableDeviceLockButton")?.addEventListener("click", () => { if (confirm("Disable the local device app lock?")) disableDeviceLock(); });
    get("createRestorePointButton")?.addEventListener("click", () => run(async () => {
      const label = `Restore point · ${new Date().toLocaleString()}`;
      await createCloudRestorePoint(label);
      toast("Encrypted cloud restore point created", "success");
      await renderRestorePoints();
    }));
    get("refreshRestorePointsButton")?.addEventListener("click", () => run(renderRestorePoints));
    get("refreshMfaButton")?.addEventListener("click", () => run(renderSecurityStatus));
    get("beginTotpButton")?.addEventListener("click", () => run(async () => {
      const factor = await beginTotpEnrollment();
      const box = get("totpEnrollmentBox");
      box.innerHTML = `<strong>Scan with your authenticator app</strong>${factor.totp?.qr_code ? `<img alt="TOTP enrollment QR code" src="${escape(factor.totp.qr_code)}">` : ""}<code>${escape(factor.totp?.secret || "")}</code><div class="profile-inline-fields"><input class="input" id="totpVerifyCode" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code"><button class="button button-primary" id="verifyTotpButton" type="button">Verify</button></div>`;
      get("verifyTotpButton")?.addEventListener("click", () => run(async () => { await verifyTotp(get("totpVerifyCode").value); toast("Authenticator MFA enrolled", "success"); await renderSecurityStatus(); }));
    }));
    get("registerPasskeyButton")?.addEventListener("click", () => run(async () => { await registerPasskey(); toast("Passkey registered", "success"); await renderSecurityStatus(); }));
    setTimeout(() => { renderSecurityStatus().catch(() => {}); renderRestorePoints().catch(() => {}); }, 0);
  }

  function renderIntegrityStatus(report = null) {
    const chip = document.getElementById("financeIntegrityChip");
    const summaryNode = document.getElementById("financeIntegritySummary");
    const issuesNode = document.getElementById("financeIntegrityIssues");
    const repairButton = document.getElementById("repairIntegrityButton");
    if (!chip || !summaryNode || !issuesNode || !repairButton) return report;
    try { report = report || integrityReport(); }
    catch (error) {
      chip.textContent = "Unavailable"; chip.className = "v13-chip warning";
      summaryNode.textContent = error.message || "Financial integrity check is unavailable.";
      repairButton.hidden = true; issuesNode.innerHTML = ""; return null;
    }
    const counts = report.counts || { critical:0, warning:0, safeRepair:0 };
    chip.textContent = counts.critical ? `${counts.critical} critical` : (counts.warning || counts.safeRepair) ? "Review" : "Healthy";
    chip.className = `v13-chip ${counts.critical ? "warning" : (counts.warning || counts.safeRepair) ? "info" : "success"}`;
    summaryNode.textContent = window.FinanceIntegrity?.summary?.(report) || "Integrity check complete";
    repairButton.hidden = !counts.safeRepair;
    repairButton.disabled = !canWrite() || counts.critical > 0;
    issuesNode.innerHTML = report.issues.length ? report.issues.slice(0,12).map(item => `<div class="profile-security-row"><div><strong>${escape(item.severity === "critical" ? "Critical" : item.severity === "safe-repair" ? "Safe repair" : "Review")}</strong><small>${escape(item.message)}</small></div></div>`).join("") : `<div class="v13-empty">No financial integrity issues found.</div>`;
    return report;
  }

  async function renderAccessibleCloudProfiles() {
    const node = document.getElementById("cloudProfileResult");
    if (!node) return;
    const result = await listCloudProfiles();
    const profiles = result.profiles || [];
    if (!profiles.length) {
      node.innerHTML = `<div class="v13-empty">No accessible Cloud Schema V3 profiles were found for this signed-in account.</div>`;
      return;
    }
    node.innerHTML = profiles.map(remote => {
      const connected = meta.profiles.some(local => local.cloudProfileId === remote.profile_id);
      return `<div class="profile-cloud-row" style="flex-direction:column; align-items:stretch; gap:8px; padding:12px 0; border-bottom:1px solid var(--v12-border, rgba(0,0,0,0.1));">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div><strong>${escape(remote.name || "Finance profile")}</strong> <small>${escape(remote.profile_type || "personal")} · ${escape(roleLabel(remote.role || "viewer"))}</small></div>
          ${connected ? `<span class="v13-chip success">Connected</span>` : `<span class="v13-chip warning">Not connected</span>`}
        </div>
        ${connected ? "" : `
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:4px;">
            <input class="input input-small" type="password" id="cloudPass_${escape(remote.profile_id)}" placeholder="Enter profile passphrase (at least 10 chars)" style="flex:1; min-width:200px;">
            <button class="button button-primary button-small" type="button" data-connect-cloud-profile="${escape(remote.profile_id)}">Connect profile</button>
          </div>
        `}
      </div>`;
    }).join("");
    node.querySelectorAll("[data-connect-cloud-profile]").forEach(button => button.addEventListener("click", () => run(async () => {
      const pId = button.dataset.connectCloudProfile;
      const rowInput = document.getElementById(`cloudPass_${pId}`);
      const mainInput = document.getElementById("profileEncryptionPassphrase");
      const passphrase = (rowInput?.value || mainInput?.value || "").trim();
      if (passphrase.length < 10) {
        toast("Please enter the profile encryption passphrase (at least 10 characters).", "warning");
        if (rowInput) rowInput.focus();
        else if (mainInput) mainInput.focus();
        return;
      }
      await connectCloudProfile(pId, passphrase, true);
      toast("Cloud profile connected!", "success");
      location.reload();
    })));
  }

  async function renderRestorePoints() {
    const node = document.getElementById("cloudRestorePointList");
    if (!node) return;
    if (!cloudProfileId()) { node.innerHTML = `<div class="v13-empty">Connect a Cloud Schema V3 profile to create restore points.</div>`; return; }
    const result = await listCloudRestorePoints();
    const points = result.restore_points || [];
    node.innerHTML = points.length ? points.map(point => `<div class="profile-restore-row"><div><strong>${escape(point.label)}</strong><small>${escape(new Date(point.created_at).toLocaleString())} · ${escape(point.created_by_email || "Member")}</small></div><button class="button button-secondary button-small" data-restore-point="${escape(point.id)}" type="button" ${canWrite() ? "" : "disabled"}>Restore</button></div>`).join("") : `<div class="v13-empty">No encrypted cloud restore points.</div>`;
    node.querySelectorAll("[data-restore-point]").forEach(button => button.addEventListener("click", () => run(async () => {
      if (!confirm("Replace the active local profile with this encrypted restore point? The change will then synchronize.")) return;
      await restoreCloudPoint(button.dataset.restorePoint);
      toast("Cloud restore point applied", "success");
    })));
  }

  async function renderSecurityStatus() {
    const factorNode = document.getElementById("mfaFactorList");
    const passkeyNode = document.getElementById("passkeyList");
    const chip = document.getElementById("profileAalChip");
    if (!factorNode || !passkeyNode || !chip) return;
    try {
      const status = await mfaStatus();
      const verified = status.factors?.totp || [];
      chip.textContent = String(status.aal?.currentLevel || "aal1").toUpperCase();
      factorNode.innerHTML = verified.length ? verified.map(factor => `<div class="profile-security-row"><div><strong>${escape(factor.friendly_name || "Authenticator")}</strong><small>${escape(factor.status || "verified")}</small></div><div><button class="button button-secondary button-small" data-mfa-verify="${escape(factor.id)}" type="button">Verify session</button><button class="button button-danger button-small" data-mfa-remove="${escape(factor.id)}" type="button">Remove</button></div></div>`).join("") : `<div class="v13-empty">No authenticator factor enrolled.</div>`;
      factorNode.querySelectorAll("[data-mfa-verify]").forEach(button => button.addEventListener("click", () => run(async () => {
        const code = prompt("Enter the current authenticator code") || "";
        await challengeExistingTotp(button.dataset.mfaVerify, code);
        toast("Session upgraded to AAL2", "success");
        await renderSecurityStatus();
      })));
      factorNode.querySelectorAll("[data-mfa-remove]").forEach(button => button.addEventListener("click", () => run(async () => {
        if (!confirm("Remove this authenticator factor?")) return;
        await unenrollTotp(button.dataset.mfaRemove);
        await renderSecurityStatus();
      })));
      const passkeys = await listPasskeys();
      passkeyNode.innerHTML = passkeys.length ? passkeys.map(passkey => `<div class="profile-security-row"><div><strong>${escape(passkey.friendly_name || "Passkey")}</strong><small>${escape(passkey.last_used_at ? `Last used ${new Date(passkey.last_used_at).toLocaleString()}` : "Not used yet")}</small></div><button class="button button-danger button-small" data-passkey-remove="${escape(passkey.id)}" type="button">Remove</button></div>`).join("") : `<div class="v13-empty">No passkeys registered or passkey support is unavailable.</div>`;
      passkeyNode.querySelectorAll("[data-passkey-remove]").forEach(button => button.addEventListener("click", () => run(async () => { await deletePasskey(button.dataset.passkeyRemove); await renderSecurityStatus(); })));
    } catch (error) {
      chip.textContent = "Sign in";
      factorNode.innerHTML = `<div class="v13-empty">Sign in to manage MFA.</div>`;
      passkeyNode.innerHTML = `<div class="v13-empty">Sign in to manage passkeys.</div>`;
    }
  }

  async function run(work) {
    try { return await work(); }
    catch (error) { toast(error.message || String(error), "warning"); return undefined; }
  }

  function injectPasskeySignIn() {
    const actions = document.querySelector("#cloudDisconnectedSection .system-actions");
    if (!actions || document.getElementById("cloudPasskeySignIn")) return;
    const button = document.createElement("button");
    button.className = "button button-secondary";
    button.id = "cloudPasskeySignIn";
    button.type = "button";
    button.textContent = "Sign in with passkey";
    button.addEventListener("click", () => run(async () => { await signInWithPasskey(); toast("Signed in with passkey", "success"); }));
    actions.appendChild(button);
  }

  function installProfilePersistenceBridge() {
    window.addEventListener("finance:data-persisted", event => persistCurrentData(event.detail?.data || (typeof data !== "undefined" ? data : {}), event.detail?.action || "Finance data updated"));
  }

  function installActivityWatch() {
    ["pointerdown", "keydown", "touchstart"].forEach(type => document.addEventListener(type, noteActivity, { passive:true }));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        const config = deviceLockConfig();
        if (config?.enabled && Number(config.autoLockMinutes || 15) <= 5) lockDevice();
      } else scheduleAutoLock();
    });
  }

  async function init() {
    saveMeta();
    const currentRaw = localStorage.getItem(ACTIVE_DATA_KEY);
    if (currentRaw && !localStorage.getItem(profileDataKey())) localStorage.setItem(profileDataKey(), currentRaw);
    await restoreSessionProfileKey();
    installProfilePersistenceBridge();
    installActivityWatch();
    renderPanel();
    injectPasskeySignIn();
    ensureLockOverlay();
    const lock = deviceLockConfig();
    if (lock?.enabled && sessionStorage.getItem(APP_LOCK_SESSION_KEY) !== "unlocked") showLockOverlay();
    else scheduleAutoLock();
  }

  window.FinanceProfileArchitecture = {
    activeProfile, activeProfileId, cloudProfileId, activeRole, canWrite,
    persistCurrentData, restoreActiveData, createLocalProfile, switchProfile, deleteLocalProfile, renameProfile,
    configureEncryption, unlockProfile, lockProfile, isCloudUnlocked,
    encryptCloudPayload, decryptCloudPayload,
    exportEncryptedBackup, importEncryptedBackup, decryptBackup,
    listCloudProfiles, connectCloudProfile, createCloudProfile, createInvite, acceptInvite,
    createCloudRestorePoint, listCloudRestorePoints, restoreCloudPoint,
    listMembers, setMemberRole, removeMember,
    setupDeviceLock, unlockDevice, disableDeviceLock, lockDevice,
    mfaStatus, beginTotpEnrollment, verifyTotp, challengeExistingTotp, unenrollTotp,
    registerPasskey, signInWithPasskey, listPasskeys, deletePasskey,
    getCloudClient, cloudRpc, renderPanel,
    constants:{ PROFILE_META_KEY, PROFILE_DATA_PREFIX, KDF_ITERATIONS, CLOUD_SCHEMA_VERSION, APP_VERSION_CODE }
  };

  window.FinanceProfileArchitectureInternals = {
    bytesToBase64, base64ToBytes, bytesToBase64Url, base64UrlToBytes, sha256Hex,
    deriveAesKey, encryptJsonWithKey, decryptJsonWithKey, encryptedBackup, decryptBackup, verifyCloudProfilePassphrase,
    normalizeProfile, loadMeta, roleLabel
  };

  if (typeof document !== "undefined" && !window.__FINANCE_PROFILE_TEST__) setTimeout(() => init().catch(error => console.error("Profile architecture initialization failed", error)), 0);
})();
