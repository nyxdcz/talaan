"use strict";
/* Visible-device polling and Realtime recovery for encrypted Cloud Sync. */
(function financeCloudSyncLifecycleBootstrap() {
  const FOREGROUND_POLL_MS = 5 * 60 * 1000;
  const REALTIME_RETRY_MAX_MS = 30 * 1000;

  function create({ canPoll, canRetry, pull, reconnect }) {
    let foregroundPollTimer = null;
    let realtimeRetryTimer = null;
    let realtimeRetryAttempts = 0;

    function clearForegroundPoll() {
      clearTimeout(foregroundPollTimer);
      foregroundPollTimer = null;
    }

    function scheduleForegroundPoll(delay = FOREGROUND_POLL_MS) {
      clearForegroundPoll();
      if (!canPoll()) return;
      foregroundPollTimer = setTimeout(() => {
        Promise.resolve(pull("foreground-poll")).catch(() => {}).finally(() => scheduleForegroundPoll());
      }, Math.max(1000, Number(delay || FOREGROUND_POLL_MS)));
    }

    function clearRealtimeRetry({ resetAttempts = false } = {}) {
      clearTimeout(realtimeRetryTimer);
      realtimeRetryTimer = null;
      if (resetAttempts) realtimeRetryAttempts = 0;
    }

    function scheduleRealtimeRecovery(status = "Disconnected") {
      if (!canRetry()) return;
      clearRealtimeRetry();
      realtimeRetryAttempts += 1;
      const delay = Math.min(REALTIME_RETRY_MAX_MS, 1000 * (2 ** Math.min(realtimeRetryAttempts - 1, 5)));
      realtimeRetryTimer = setTimeout(async () => {
        if (!canRetry()) return;
        if (!canPoll()) {
          scheduleRealtimeRecovery(status);
          return;
        }
        try {
          await reconnect();
          await pull("realtime-recovery");
        } catch (error) {
          scheduleRealtimeRecovery(status);
        }
      }, delay);
    }

    function noteRealtimeSubscribed() {
      clearRealtimeRetry({ resetAttempts:true });
    }

    return {
      clearForegroundPoll,
      scheduleForegroundPoll,
      clearRealtimeRetry,
      scheduleRealtimeRecovery,
      noteRealtimeSubscribed
    };
  }

  window.FinanceCloudSyncLifecycle = { create, FOREGROUND_POLL_MS };
})();

/* V15.2.2: require deliberate profile identity selection and safely manage duplicate cloud datasets. */
(function financeCloudProfileSelectionGuard() {
  const APPROVED_KEY = "simple-finance-cloud-profile-approved-v1";
  const LAST_SELECTED_KEY = "simple-finance-cloud-profile-last-selected-v1";
  const PROFILE_META_KEY = "simple-finance-profiles-v1";
  const CHOOSER_ID = "cloudProfileSelectionCard";
  const MANAGEMENT_ID = "cloudProfileManagementDialog";
  let pendingProfiles = [];
  let knownProfiles = [];
  let originals = null;
  const statsByProfileId = new Map();

  const architecture = () => window.FinanceProfileArchitecture || null;
  const profileId = profile => String(profile?.profile_id || profile?.cloudProfileId || "");
  const shortId = value => {
    const text = String(value || "");
    return text.length > 10 ? `…${text.slice(-8)}` : text || "N/A";
  };
  const roleLabel = value => String(value || "viewer").toLowerCase() === "owner" ? "Owner" : String(value || "viewer").toLowerCase() === "editor" ? "Editor" : "Viewer";
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
  const normalizedName = profile => String(profile?.name || "Cloud finances").trim().toLowerCase();
  const updatedMs = profile => {
    const value = Date.parse(String(profile?.updated_at || profile?.created_at || ""));
    return Number.isFinite(value) ? value : 0;
  };

  function formatDate(value) {
    const date = new Date(String(value || ""));
    if (Number.isNaN(date.getTime())) return "Unknown";
    try {
      return new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" }).format(date);
    } catch (error) {
      return date.toLocaleString();
    }
  }

  function lastSelectedId() {
    try { return String(localStorage.getItem(LAST_SELECTED_KEY) || ""); }
    catch (error) { return ""; }
  }

  function rememberSelectedId(id) {
    try { if (id) localStorage.setItem(LAST_SELECTED_KEY, String(id)); }
    catch (error) {}
  }

  function toast(message, tone = "info") {
    if (typeof window.showToast === "function") window.showToast(message, tone);
    else console.info(message);
  }

  function chooserAnchor() {
    return document.getElementById("cloudFirstSyncCard") || document.getElementById("cloudConnectedSection") || document.getElementById("cloudDisconnectedSection");
  }

  function duplicateInfo(list) {
    const counts = new Map();
    list.forEach(profile => counts.set(normalizedName(profile), (counts.get(normalizedName(profile)) || 0) + 1));
    const duplicateGroups = [...counts.values()].filter(count => count > 1);
    return { counts, duplicateProfiles:duplicateGroups.reduce((total, count) => total + count, 0) };
  }

  function profileById(id) {
    const key = String(id || "");
    return pendingProfiles.find(profile => profileId(profile) === key) || knownProfiles.find(profile => profileId(profile) === key) || null;
  }

  function updateProfileStats(id, stats = {}) {
    const normalized = {
      accounts:Number.isFinite(stats.accounts) ? stats.accounts : null,
      devices:Number.isFinite(stats.devices) ? stats.devices : null
    };
    statsByProfileId.set(String(id || ""), normalized);
    document.querySelectorAll("[data-cloud-profile-id]").forEach(row => {
      if (String(row.dataset.cloudProfileId || "") !== String(id || "")) return;
      const value = row.querySelector("[data-cloud-profile-stats]");
      if (!value) return;
      const accounts = Number.isFinite(normalized.accounts) ? normalized.accounts : "N/A";
      const devices = Number.isFinite(normalized.devices) ? normalized.devices : "N/A";
      value.textContent = `Accounts ${accounts} · Devices ${devices}`;
    });
  }

  async function hydrateProfileStats(list) {
    const loadClient = window.FinanceCloudSyncInternals?.loadClient;
    if (typeof loadClient !== "function") return;
    let client;
    try { client = await loadClient(); }
    catch (error) { return; }
    if (!client?.from) return;
    await Promise.all(list.map(async profile => {
      const id = profileId(profile);
      if (!id) return;
      let accounts = null;
      let devices = null;
      try {
        const result = await client.from("finance_v3_records").select("record_id", { count:"exact", head:true }).eq("profile_id", id).eq("collection", "accounts").is("deleted_at", null);
        if (!result?.error && Number.isFinite(Number(result?.count))) accounts = Number(result.count);
      } catch (error) {}
      try {
        const result = await client.from("finance_v3_devices").select("device_id", { count:"exact", head:true }).eq("profile_id", id).is("revoked_at", null);
        if (!result?.error && Number.isFinite(Number(result?.count))) devices = Number(result.count);
      } catch (error) {}
      updateProfileStats(id, { accounts, devices });
    }));
  }

  function ownerActions(profile) {
    if (String(profile?.role || "").toLowerCase() !== "owner") return "";
    const id = profileId(profile);
    const name = String(profile?.name || "Cloud finances");
    return `<div data-cloud-profile-actions style="display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;">
      <button class="button button-secondary button-small" type="button" data-cloud-profile-rename="${escapeHtml(id)}" aria-label="Rename ${escapeHtml(name)}">Rename</button>
      <button class="button button-secondary button-small" type="button" data-cloud-profile-delete="${escapeHtml(id)}" aria-label="Delete ${escapeHtml(name)}" style="color:var(--red);border-color:var(--red);">Delete</button>
    </div>`;
  }

  function renderChooser(profiles = pendingProfiles, switching = false) {
    const list = (Array.isArray(profiles) ? profiles : []).filter(profile => profileId(profile)).slice().sort((a,b) => updatedMs(b) - updatedMs(a));
    if (!list.length) return null;
    pendingProfiles = list;
    knownProfiles = list;
    let card = document.getElementById(CHOOSER_ID);
    if (!card) {
      const anchor = chooserAnchor();
      if (!anchor?.parentNode) return null;
      card = document.createElement("article");
      card.id = CHOOSER_ID;
      card.className = "card";
      anchor.parentNode.insertBefore(card, anchor);
    }
    const current = String(architecture()?.cloudProfileId?.() || "");
    const prior = lastSelectedId();
    const { counts, duplicateProfiles } = duplicateInfo(list);
    const newestId = profileId(list[0]);
    const duplicateWarning = duplicateProfiles > 1
      ? `<div class="v12-callout warning" data-cloud-profile-duplicate-warning style="margin:10px 0;"><strong>${duplicateProfiles} profiles share a duplicate name.</strong><p style="margin:4px 0 0;">They are separate finance datasets. Compare the Profile ID, last updated time, account count, and device count before choosing. Nothing is deleted until you explicitly use the Delete action and confirm it.</p></div>`
      : "";
    card.hidden = false;
    card.innerHTML = `<div class="card-header"><div><h3>${switching ? "Switch Cloud Profile" : "Choose Cloud Profile"}</h3><p>${switching ? "Choose or manage the exact cloud dataset this device should use." : "This account has more than one finance profile. Confirm one before any finance records are downloaded."}</p></div><span class="status-chip warning">Selection required</span></div>
      ${duplicateWarning}<div style="display:flex;justify-content:flex-end;margin:0 0 8px;"><button class="button button-secondary button-small" type="button" data-cloud-profile-refresh>Refresh profiles</button></div>
      <div role="radiogroup" aria-label="Available cloud profiles" style="display:grid;gap:8px;margin:0 0 12px;">${list.map((profile,index) => {
        const id = profileId(profile);
        const checked = Boolean(current && id === current);
        const sameNameCount = counts.get(normalizedName(profile)) || 0;
        const chips = [
          checked ? `<span class="status-chip success">Current on this device</span>` : "",
          id === newestId ? `<span class="status-chip">Most recently updated</span>` : "",
          !checked && prior && id === prior ? `<span class="status-chip">Previously used here</span>` : "",
          sameNameCount > 1 ? `<span class="status-chip warning">Duplicate name</span>` : ""
        ].filter(Boolean).join(" ");
        const radioId = `cloudProfileSelectionRadio${index}`;
        return `<div data-cloud-profile-id="${escapeHtml(id)}" title="Cloud Profile ${escapeHtml(id)}" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:var(--talaan-control-radius);background:var(--surface-soft);">
          <label for="${radioId}" style="display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:start;flex:1 1 320px;min-width:0;cursor:pointer;"><input id="${radioId}" type="radio" name="cloudProfileSelection" value="${escapeHtml(id)}" ${checked ? "checked" : ""}><span><span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;"><strong>${escapeHtml(profile.name || "Cloud finances")}</strong>${chips}</span><small style="display:block;color:var(--muted);margin-top:3px;">${escapeHtml(roleLabel(profile.role))} · Profile ${escapeHtml(shortId(id))}</small><small style="display:block;color:var(--muted);margin-top:2px;">Updated ${escapeHtml(formatDate(profile.updated_at))} · Created ${escapeHtml(formatDate(profile.created_at))}</small><small data-cloud-profile-stats style="display:block;color:var(--muted);margin-top:2px;">Accounts N/A · Devices N/A</small></span></label>
          ${ownerActions(profile)}
        </div>`;
      }).join("")}</div>
      <div class="field" style="margin-bottom:10px;"><label for="cloudProfileSelectionPassphrase">Profile encryption passphrase</label><input class="input" id="cloudProfileSelectionPassphrase" type="password" autocomplete="current-password" placeholder="Leave blank for an automatically created profile"><small style="display:block;color:var(--muted);margin-top:4px;">Enter a passphrase only when this profile was created with a custom encryption passphrase.</small></div>
      <div class="card-actions" style="display:flex;gap:8px;flex-wrap:wrap;"><button class="button button-primary" id="cloudProfileSelectionConfirm" type="button" ${current ? "" : "disabled"}>Use selected profile</button>${switching ? `<button class="button button-secondary" id="cloudProfileSelectionCancel" type="button">Cancel</button>` : ""}</div><p class="system-help" id="cloudProfileSelectionMessage">${current ? "Choose carefully before switching datasets." : "No profile is preselected. No finance records will be downloaded until you deliberately choose and confirm one."}</p>`;
    hydrateProfileStats(list).catch(() => {});
    return card;
  }

  async function defaultPassphrase() {
    const loadClient = window.FinanceCloudSyncInternals?.loadClient;
    if (typeof loadClient !== "function") return "";
    const client = await loadClient();
    const response = await client.auth.getSession();
    const user = response?.data?.session?.user;
    return user?.id ? `${user.id}:my-finance-v13:${String(user.email || "").toLowerCase()}` : "";
  }

  async function managementRpc(name, args = {}) {
    const loadClient = window.FinanceCloudSyncInternals?.loadClient;
    if (typeof loadClient !== "function") throw new Error("Cloud Sync 3.0 is not ready yet.");
    const client = await loadClient();
    if (typeof client?.rpc !== "function") throw new Error("Cloud Profile management is unavailable on this device.");
    const result = await client.rpc(name, args);
    if (result?.error) {
      const message = String(result.error.message || result.error || "Cloud Profile management failed.");
      if (/could not find the function|schema cache|finance_v3_(rename|delete)_profile/i.test(message)) {
        throw new Error("Cloud Profile Rename/Delete is not installed in Supabase yet. Run supabase/cloud-profile-management.sql, then refresh profiles.");
      }
      if (/owner_required|profile_not_found_or_owner/i.test(message)) throw new Error("Only the Cloud Profile owner can rename or delete this profile.");
      if (/profile_name_confirmation_mismatch/i.test(message)) throw new Error("The typed profile name does not match. Delete was cancelled.");
      if (/profile_name_required|profile_name_too_long/i.test(message)) throw new Error("Use a Cloud Profile name from 1 to 80 characters.");
      throw new Error(message);
    }
    return result?.data || {};
  }

  function syncLocalCloudProfileName(id, name) {
    const cloudId = String(id || "");
    const nextName = String(name || "").trim();
    if (!cloudId || !nextName) return;
    try {
      const parsed = JSON.parse(localStorage.getItem(PROFILE_META_KEY) || "null");
      if (Array.isArray(parsed?.profiles)) {
        let changed = false;
        parsed.profiles.forEach(profile => {
          if (String(profile?.cloudProfileId || "") !== cloudId) return;
          profile.name = nextName;
          profile.updatedAt = new Date().toISOString();
          changed = true;
        });
        if (changed) localStorage.setItem(PROFILE_META_KEY, JSON.stringify(parsed));
      }
    } catch (error) {}
    try {
      const active = architecture()?.activeProfile?.();
      if (String(active?.cloudProfileId || "") === cloudId) {
        active.name = nextName;
        active.updatedAt = new Date().toISOString();
      }
    } catch (error) {}
  }

  function clearSyncStateForLocalProfile(localProfileId) {
    const id = String(localProfileId || "");
    if (!id) return;
    [
      `simple-finance-cloud-sync-v3:${id}`,
      `simple-finance-cloud-record-base-v3:${id}`,
      `simple-finance-cloud-record-queue-v3:${id}`,
      `simple-finance-cloud-record-conflicts-v3:${id}`
    ].forEach(key => {
      try { localStorage.removeItem(key); } catch (error) {}
    });
  }

  function detachCloudProfileLocally(id) {
    const cloudId = String(id || "");
    const affectedLocalIds = [];
    let activeDetached = false;
    try {
      const parsed = JSON.parse(localStorage.getItem(PROFILE_META_KEY) || "null");
      if (Array.isArray(parsed?.profiles)) {
        parsed.profiles.forEach(profile => {
          if (String(profile?.cloudProfileId || "") !== cloudId) return;
          affectedLocalIds.push(String(profile.id || ""));
          if (String(parsed.activeProfileId || "") === String(profile.id || "")) activeDetached = true;
          profile.cloudProfileId = "";
          profile.role = "owner";
          profile.updatedAt = new Date().toISOString();
        });
        localStorage.setItem(PROFILE_META_KEY, JSON.stringify(parsed));
      }
    } catch (error) {}
    affectedLocalIds.forEach(clearSyncStateForLocalProfile);
    try {
      const active = architecture()?.activeProfile?.();
      if (String(active?.cloudProfileId || "") === cloudId) {
        active.cloudProfileId = "";
        active.role = "owner";
        active.updatedAt = new Date().toISOString();
        activeDetached = true;
      }
    } catch (error) {}
    try {
      if (localStorage.getItem(LAST_SELECTED_KEY) === cloudId) localStorage.removeItem(LAST_SELECTED_KEY);
      sessionStorage.removeItem(APPROVED_KEY);
    } catch (error) {}
    return { activeDetached, affectedLocalIds };
  }

  async function preserveActiveLocalDataBeforeDelete(profile) {
    const id = profileId(profile);
    if (String(architecture()?.cloudProfileId?.() || "") !== id) return;
    try {
      if (typeof data !== "undefined") architecture()?.persistCurrentData?.(data, "Local data preserved before Cloud Profile deletion");
    } catch (error) {}
    if (typeof data === "undefined") return;
    const backup = {
      format:"my-finance-cloud-profile-delete-recovery-v1",
      profileId:id,
      profileName:String(profile?.name || "Cloud finances"),
      createdAt:new Date().toISOString(),
      schemaVersion:12,
      cloudSchemaVersion:3,
      data:JSON.parse(JSON.stringify(data))
    };
    const recoveryStorage = window.FinancePrivacyLock?.recoveryStorage;
    try {
      if (typeof recoveryStorage?.saveAuxiliary === "function") {
        await recoveryStorage.saveAuxiliary(backup, "cloud-profile-delete-recovery");
        return;
      }
    } catch (error) { console.warn("Could not save the Cloud Profile deletion recovery point in IndexedDB", error); }
    try {
      localStorage.setItem(`simple-finance-cloud-recovery-${Date.now()}`, JSON.stringify(backup));
    } catch (error) {
      throw new Error("The local Cloud Profile recovery copy could not be saved. Free browser storage or export a recovery bundle before deleting this profile.");
    }
  }

  function managementDialog() {
    let overlay = document.getElementById(MANAGEMENT_ID);
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = MANAGEMENT_ID;
    overlay.hidden = true;
    overlay.setAttribute("role", "presentation");
    overlay.style.cssText = "position:fixed;inset:0;z-index:420;display:none;place-items:center;padding:20px;background:rgba(0,0,0,.64);";
    document.body.appendChild(overlay);
    return overlay;
  }

  function closeManagementDialog() {
    const overlay = document.getElementById(MANAGEMENT_ID);
    if (!overlay) return;
    overlay.hidden = true;
    overlay.style.display = "none";
    overlay.innerHTML = "";
  }

  async function openManagement(id, mode) {
    let profile = profileById(id);
    if (!profile && originals?.list) {
      try {
        const result = await originals.list();
        knownProfiles = (Array.isArray(result?.profiles) ? result.profiles : []).filter(item => profileId(item));
        profile = profileById(id);
      } catch (error) {
        return toast(error?.message || "Could not load this Cloud Profile.", "warning");
      }
    }
    if (!profile) return toast("Cloud Profile not found. Refresh the list and try again.", "warning");
    if (String(profile.role || "").toLowerCase() !== "owner") return toast("Only the Cloud Profile owner can rename or delete this profile.", "warning");
    const overlay = managementDialog();
    const stats = statsByProfileId.get(profileId(profile)) || {};
    const accounts = Number.isFinite(stats.accounts) ? stats.accounts : "N/A";
    const devices = Number.isFinite(stats.devices) ? stats.devices : "N/A";
    const current = String(architecture()?.cloudProfileId?.() || "") === profileId(profile);
    const deleting = mode === "delete";
    overlay.dataset.mode = deleting ? "delete" : "rename";
    overlay.dataset.profileId = profileId(profile);
    overlay.dataset.profileName = String(profile.name || "Cloud finances");
    overlay.hidden = false;
    overlay.style.display = "grid";
    overlay.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="cloudProfileManagementTitle" style="width:min(520px,100%);max-height:min(760px,calc(100vh - 40px));overflow:auto;padding:18px;border:1px solid var(--line);border-radius:var(--talaan-dialog-radius);background:var(--surface);box-shadow:0 24px 70px rgba(0,0,0,.45);">
      <div class="card-header" style="margin-bottom:12px;"><div><h3 id="cloudProfileManagementTitle">${deleting ? "Delete Cloud Profile" : "Rename Cloud Profile"}</h3><p>${deleting ? "Permanently remove this cloud dataset." : "Change the name shown on every connected device."}</p></div><button class="button button-secondary button-small" type="button" data-cloud-profile-management-close aria-label="Close">Close</button></div>
      <div style="padding:10px 12px;border:1px solid var(--line);border-radius:var(--talaan-card-radius);background:var(--surface-soft);margin-bottom:12px;"><strong>${escapeHtml(profile.name || "Cloud finances")}</strong><small style="display:block;color:var(--muted);margin-top:3px;">${escapeHtml(roleLabel(profile.role))} · Profile ${escapeHtml(shortId(profileId(profile)))}</small><small style="display:block;color:var(--muted);margin-top:2px;">Updated ${escapeHtml(formatDate(profile.updated_at))} · Accounts ${accounts} · Devices ${devices}</small></div>
      ${deleting ? `<div class="v12-callout warning" style="margin-bottom:12px;"><strong>This cannot be undone.</strong><p style="margin:4px 0 0;">This permanently deletes this Cloud Profile and its synced finance data, devices, members, audit history, invites, and restore points from the cloud.${current ? " The finance data already stored on this device will be preserved locally and disconnected from this deleted cloud profile." : ""}</p></div>
        <form id="cloudProfileManagementForm"><div class="field"><label for="cloudProfileDeleteConfirm">Type <strong>${escapeHtml(profile.name || "Cloud finances")}</strong> to confirm</label><input class="input" id="cloudProfileDeleteConfirm" autocomplete="off" data-cloud-profile-delete-confirm></div><p class="system-help" id="cloudProfileManagementMessage">Delete stays disabled until the profile name matches exactly.</p><div class="card-actions" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;"><button class="button button-secondary" type="button" data-cloud-profile-management-close>Cancel</button><button class="button button-primary" id="cloudProfileManagementSubmit" type="submit" disabled style="background:var(--red);border-color:var(--red);">Delete profile</button></div></form>`
        : `<form id="cloudProfileManagementForm"><div class="field"><label for="cloudProfileRenameInput">Cloud Profile name</label><input class="input" id="cloudProfileRenameInput" maxlength="80" autocomplete="off" value="${escapeHtml(profile.name || "Cloud finances")}"></div><p class="system-help" id="cloudProfileManagementMessage">Use 1–80 characters. Finance records are not changed by renaming.</p><div class="card-actions" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;"><button class="button button-secondary" type="button" data-cloud-profile-management-close>Cancel</button><button class="button button-primary" id="cloudProfileManagementSubmit" type="submit">Save name</button></div></form>`}
    </section>`;
    queueMicrotask(() => document.getElementById(deleting ? "cloudProfileDeleteConfirm" : "cloudProfileRenameInput")?.focus());
  }

  async function reloadKnownProfiles({ render = true } = {}) {
    if (!originals?.list) return [];
    const result = await originals.list();
    const profiles = (Array.isArray(result?.profiles) ? result.profiles : []).filter(profile => profileId(profile));
    knownProfiles = profiles.slice();
    pendingProfiles = profiles.slice();
    if (render) {
      if (profiles.length) renderChooser(profiles, Boolean(architecture()?.cloudProfileId?.()));
      else document.getElementById(CHOOSER_ID)?.remove();
    }
    return profiles;
  }

  async function submitManagement(event) {
    event?.preventDefault?.();
    const overlay = document.getElementById(MANAGEMENT_ID);
    const mode = String(overlay?.dataset.mode || "");
    const id = String(overlay?.dataset.profileId || "");
    const profile = profileById(id);
    const button = document.getElementById("cloudProfileManagementSubmit");
    const message = document.getElementById("cloudProfileManagementMessage");
    if (!overlay || !profile || !button) return;
    const prior = button.textContent;
    button.disabled = true;
    button.textContent = mode === "delete" ? "Deleting…" : "Saving…";
    try {
      if (mode === "rename") {
        const name = String(document.getElementById("cloudProfileRenameInput")?.value || "").trim();
        if (!name || name.length > 80) throw new Error("Use a Cloud Profile name from 1 to 80 characters.");
        const result = await managementRpc("finance_v3_rename_profile", { p_profile_id:id, p_name:name });
        syncLocalCloudProfileName(id, result?.name || name);
        [knownProfiles, pendingProfiles].forEach(list => list.forEach(item => {
          if (profileId(item) !== id) return;
          item.name = result?.name || name;
          item.updated_at = result?.updated_at || new Date().toISOString();
        }));
        closeManagementDialog();
        toast(`Cloud Profile renamed to ${result?.name || name}.`, "success");
        await reloadKnownProfiles({ render:Boolean(document.getElementById(CHOOSER_ID)) });
        renderIdentity();
        window.dispatchEvent(new CustomEvent("finance:cloud-profile-renamed", { detail:{ profileId:id, name:result?.name || name } }));
        return;
      }

      if (mode === "delete") {
        const confirmation = String(document.getElementById("cloudProfileDeleteConfirm")?.value || "");
        if (confirmation !== String(profile.name || "Cloud finances")) throw new Error("Type the Cloud Profile name exactly to delete it.");
        await preserveActiveLocalDataBeforeDelete(profile);
        await managementRpc("finance_v3_delete_profile", { p_profile_id:id, p_confirm_name:confirmation });
        const detach = detachCloudProfileLocally(id);
        knownProfiles = knownProfiles.filter(item => profileId(item) !== id);
        pendingProfiles = pendingProfiles.filter(item => profileId(item) !== id);
        statsByProfileId.delete(id);
        closeManagementDialog();
        toast(`Deleted Cloud Profile ${profile.name || shortId(id)}.`, "success");
        window.dispatchEvent(new CustomEvent("finance:cloud-profile-deleted", { detail:{ profileId:id, activeDetached:detach.activeDetached, localProfiles:detach.affectedLocalIds } }));
        if (detach.activeDetached) {
          setTimeout(() => location.reload(), 450);
        } else {
          if (document.getElementById(CHOOSER_ID)) {
            if (knownProfiles.length) renderChooser(knownProfiles, Boolean(architecture()?.cloudProfileId?.()));
            else document.getElementById(CHOOSER_ID)?.remove();
          }
          renderIdentity();
        }
        return;
      }
    } catch (error) {
      const text = String(error?.message || error || "Cloud Profile management failed.");
      if (message) message.textContent = text;
      toast(text, "warning");
      button.disabled = false;
      button.textContent = prior;
    }
  }

  async function confirmSelection() {
    const selected = document.querySelector(`#${CHOOSER_ID} input[name="cloudProfileSelection"]:checked`)?.value || "";
    const typed = String(document.getElementById("cloudProfileSelectionPassphrase")?.value || "");
    const button = document.getElementById("cloudProfileSelectionConfirm");
    const message = document.getElementById("cloudProfileSelectionMessage");
    const profile = pendingProfiles.find(item => profileId(item) === selected);
    if (!selected || !profile || !originals?.connect) {
      if (message) message.textContent = "Choose a Cloud Profile first. Nothing has been downloaded.";
      return;
    }
    const prior = button?.textContent || "Use selected profile";
    if (button) { button.disabled = true; button.textContent = "Connecting…"; }
    try {
      const passphrase = typed || await defaultPassphrase();
      if (!passphrase) throw new Error("Enter the encryption passphrase for this Cloud Profile.");
      sessionStorage.setItem(APPROVED_KEY, selected);
      await originals.connect(selected, passphrase, true, { auto:false, selectedByUser:true });
      rememberSelectedId(selected);
      sessionStorage.removeItem(APPROVED_KEY);
      pendingProfiles = [];
      knownProfiles = [];
      if (message) message.textContent = "Cloud Profile selected. Reloading this finance dataset…";
      toast(`Cloud Profile selected: ${profile.name || shortId(selected)}`, "success");
    } catch (error) {
      sessionStorage.removeItem(APPROVED_KEY);
      const text = String(error?.message || error || "Could not connect this Cloud Profile.");
      if (message) message.textContent = !typed && /passphrase|decrypt|encryption/i.test(text) ? "This profile needs its custom encryption passphrase. Enter it above, then try again." : text;
      toast(text, "warning");
    } finally {
      if (button) { button.disabled = false; button.textContent = prior; }
    }
  }

  async function openSwitcher() {
    if (!originals?.list) return;
    try {
      const result = await originals.list();
      const profiles = Array.isArray(result?.profiles) ? result.profiles : [];
      if (!profiles.length) return toast("No Cloud Profiles are available for this account.", "warning");
      renderChooser(profiles, true);
      document.getElementById(CHOOSER_ID)?.scrollIntoView?.({ behavior:"smooth", block:"center" });
    } catch (error) { toast(error?.message || "Could not list Cloud Profiles.", "warning"); }
  }

  async function refreshChooser() {
    if (!originals?.list) return;
    const message = document.getElementById("cloudProfileSelectionMessage");
    if (message) message.textContent = "Refreshing Cloud Profiles…";
    try {
      const profiles = await reloadKnownProfiles({ render:true });
      if (!profiles.length) return toast("No Cloud Profiles are available for this account.", "warning");
    } catch (error) { toast(error?.message || "Could not refresh Cloud Profiles.", "warning"); }
  }

  function identity() {
    const arch = architecture();
    const profile = arch?.activeProfile?.() || {};
    const id = String(arch?.cloudProfileId?.() || profile.cloudProfileId || "");
    return id ? { id, name:String(profile.name || "Cloud finances"), role:roleLabel(profile.role) } : null;
  }

  function renderIdentity() {
    const current = identity();
    if (!current) {
      document.getElementById("cloudProfileIdentityCard")?.remove();
      document.querySelector("#settings-panel-profiles [data-cloud-profile-identity]")?.remove();
      const value = document.getElementById("cloudHealthProfile");
      if (value) value.textContent = "Not connected";
      return;
    }
    rememberSelectedId(current.id);
    const grid = document.querySelector("#cloudSyncHealthCard .cloud-v3-health-grid");
    if (grid) {
      let item = document.getElementById("cloudHealthProfileItem");
      if (!item) {
        item = document.createElement("div");
        item.id = "cloudHealthProfileItem";
        item.innerHTML = `<span>Active Cloud Profile</span><strong id="cloudHealthProfile">N/A</strong>`;
        grid.appendChild(item);
      }
      const next = `${current.name} · ${current.role} · ${shortId(current.id)}`;
      const value = document.getElementById("cloudHealthProfile");
      if (value && value.textContent !== next) value.textContent = next;
    }
    const ownerButtons = current.role === "Owner"
      ? `<button class="button button-secondary button-small" type="button" data-cloud-profile-rename="${escapeHtml(current.id)}">Rename</button><button class="button button-secondary button-small" type="button" data-cloud-profile-delete="${escapeHtml(current.id)}" style="color:var(--red);border-color:var(--red);">Delete</button>`
      : "";
    const health = document.getElementById("cloudSyncHealthCard");
    if (health) {
      let card = document.getElementById("cloudProfileIdentityCard");
      if (!card) {
        card = document.createElement("article");
        card.id = "cloudProfileIdentityCard";
        card.className = "card";
        health.insertAdjacentElement("afterend", card);
      }
      card.innerHTML = `<div class="card-header"><div><h3>Cloud profile identity</h3><p>Verify this same profile on every device.</p></div><span class="status-chip success">Connected</span></div><div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center;"><div><strong>${escapeHtml(current.name)}</strong><small style="display:block;color:var(--muted);margin-top:3px;">${escapeHtml(current.role)} · Profile ${escapeHtml(shortId(current.id))}</small></div><div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="button button-secondary" type="button" data-cloud-profile-switch>Switch cloud profile</button>${ownerButtons}</div></div>`;
    }
    const profileCard = document.querySelector("#settings-panel-profiles .profile-cloud-card");
    if (profileCard) {
      let row = profileCard.querySelector("[data-cloud-profile-identity]");
      if (!row) {
        row = document.createElement("div");
        row.dataset.cloudProfileIdentity = "true";
        row.className = "profile-result";
        profileCard.querySelector(".profile-actions")?.after(row);
      }
      row.innerHTML = `<strong>Active Cloud Profile:</strong> ${escapeHtml(current.name)} · ${escapeHtml(current.role)} · ${escapeHtml(shortId(current.id))} <span style="display:inline-flex;gap:6px;flex-wrap:wrap;margin-left:8px;"><button class="button button-secondary button-small" type="button" data-cloud-profile-switch>Switch cloud profile</button>${ownerButtons}</span>`;
    }
  }

  function patch(arch) {
    if (!arch || arch.__financeCloudProfileSelectionGuard) return false;
    if (![arch.listCloudProfiles, arch.connectCloudProfile, arch.createCloudProfile].every(fn => typeof fn === "function")) return false;
    originals = { list:arch.listCloudProfiles.bind(arch), connect:arch.connectCloudProfile.bind(arch), create:arch.createCloudProfile.bind(arch) };
    arch.listCloudProfiles = async (...args) => {
      const result = await originals.list(...args);
      const profiles = (Array.isArray(result?.profiles) ? result.profiles : []).filter(profile => profileId(profile));
      knownProfiles = profiles.slice();
      if (arch.cloudProfileId?.()) return result;
      const approved = String(sessionStorage.getItem(APPROVED_KEY) || "");
      if (approved && profiles.some(profile => profileId(profile) === approved)) return { ...result, profiles:profiles.filter(profile => profileId(profile) === approved) };
      if (profiles.length > 1) {
        pendingProfiles = profiles;
        renderChooser(profiles, false);
        window.dispatchEvent(new CustomEvent("finance:cloud-profile-selection-required", { detail:{ count:profiles.length } }));
        return { ...result, profiles:[] };
      }
      return result;
    };
    arch.createCloudProfile = async (...args) => {
      if (!arch.cloudProfileId?.() && knownProfiles.length && !sessionStorage.getItem(APPROVED_KEY)) {
        if (knownProfiles.length > 1) renderChooser(knownProfiles, false);
        throw new Error(knownProfiles.length > 1
          ? "Choose which existing Cloud Profile this device should use before creating another cloud profile."
          : "An existing Cloud Profile is already available. Connect it instead of creating another duplicate profile.");
      }
      return originals.create(...args);
    };
    arch.connectCloudProfile = async (...args) => {
      const result = await originals.connect(...args);
      const connectedId = String(args[0] || arch.cloudProfileId?.() || "");
      if (connectedId) rememberSelectedId(connectedId);
      sessionStorage.removeItem(APPROVED_KEY);
      pendingProfiles = [];
      knownProfiles = [];
      setTimeout(renderIdentity, 0);
      return result;
    };
    Object.defineProperty(arch, "__financeCloudProfileSelectionGuard", { value:true, configurable:true });
    arch.listCloudProfilesForSelection = (...args) => originals.list(...args);
    arch.openCloudProfileChooser = openSwitcher;
    return true;
  }

  function install() {
    if (!patch(architecture())) return setTimeout(install, 0);
    [0,250,1000,2500].forEach(delay => setTimeout(renderIdentity, delay));
  }

  document.addEventListener("change", event => {
    if (!event.target.matches?.(`#${CHOOSER_ID} input[name="cloudProfileSelection"]`)) return;
    const button = document.getElementById("cloudProfileSelectionConfirm");
    if (button) button.disabled = false;
    const message = document.getElementById("cloudProfileSelectionMessage");
    if (message) message.textContent = `Selected Profile ${shortId(event.target.value)}. Confirm only if its details match the dataset you want.`;
  });

  document.addEventListener("input", event => {
    if (!event.target.matches?.("[data-cloud-profile-delete-confirm]")) return;
    const overlay = document.getElementById(MANAGEMENT_ID);
    const button = document.getElementById("cloudProfileManagementSubmit");
    if (!overlay || !button) return;
    button.disabled = String(event.target.value || "") !== String(overlay.dataset.profileName || "");
  });

  document.addEventListener("submit", event => {
    if (event.target?.id !== "cloudProfileManagementForm") return;
    submitManagement(event);
  });

  document.addEventListener("click", event => {
    const rename = event.target.closest?.("[data-cloud-profile-rename]");
    if (rename) { event.preventDefault(); event.stopPropagation(); openManagement(rename.dataset.cloudProfileRename, "rename").catch(error => toast(error?.message || "Could not open Cloud Profile editor.", "warning")); return; }
    const remove = event.target.closest?.("[data-cloud-profile-delete]");
    if (remove) { event.preventDefault(); event.stopPropagation(); openManagement(remove.dataset.cloudProfileDelete, "delete").catch(error => toast(error?.message || "Could not open Cloud Profile deletion.", "warning")); return; }
    if (event.target.closest?.("[data-cloud-profile-management-close]")) { event.preventDefault(); closeManagementDialog(); return; }
    if (event.target.id === MANAGEMENT_ID) { closeManagementDialog(); return; }
    if (event.target.closest?.("#cloudProfileSelectionConfirm")) { event.preventDefault(); confirmSelection(); return; }
    if (event.target.closest?.("#cloudProfileSelectionCancel")) { event.preventDefault(); document.getElementById(CHOOSER_ID)?.remove(); return; }
    if (event.target.closest?.("[data-cloud-profile-refresh]")) { event.preventDefault(); refreshChooser(); return; }
    if (event.target.closest?.("[data-cloud-profile-switch]")) { event.preventDefault(); openSwitcher(); }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !document.getElementById(MANAGEMENT_ID)?.hidden) closeManagementDialog();
  });

  window.addEventListener("finance:cloud-profile-linked", () => setTimeout(renderIdentity, 50));
  window.addEventListener("finance:page-changed", () => setTimeout(renderIdentity, 0));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true }); else install();

  window.FinanceCloudProfileSelection = {
    open:openSwitcher,
    render:renderIdentity,
    refresh:refreshChooser,
    rename:id => openManagement(id, "rename"),
    remove:id => openManagement(id, "delete"),
    get pendingProfiles(){ return pendingProfiles.slice(); }
  };
})();
