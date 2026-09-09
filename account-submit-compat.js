"use strict";

/*
 * Account correction submit compatibility and ledger-ownership guard.
 *
 * iOS Safari / installed PWAs can be unreliable when a button changes between
 * type="button" and type="submit" while the account dialog switches between
 * Record spending and Correct account balance. Intercept the correction-mode
 * tap and dispatch the form submit event explicitly so the ledger-aware
 * account handler always runs. Ledger-backed profiles are also blocked from
 * falling through to the legacy direct-balance handler if the ledger owner is
 * stale or unavailable.
 *
 * Payment compatibility also reconciles a narrow legacy case: FinanceIntegrity
 * can classify a stale reconciliation ledgerEntryId as safe-repairable when one
 * unambiguous matching ledger entry exists. The account transaction invariant is
 * intentionally strict and otherwise blocks every later money mutation. Before a
 * manual payment, repair that deterministic history link through the ledger-owned
 * safe-repair transaction, then retry the payment against the verified state.
 *
 * Storage-pressure compatibility protects large real-world datasets from browser
 * localStorage quota failures. Only disposable local history is released during a
 * quota retry: Redo, profile audit logs, and Productivity undo history first, then
 * core Undo only as a final fallback. Finance records, account ledger history,
 * balances, profiles, and Cloud data are never removed by this recovery path.
 */
(function installAccountSubmitCompat(root) {
  if (!root?.document || root.FinanceAccountSubmitCompat?.installed) return;

  const ACTIVE_DATA_KEY = "simple-finance-project-records-v2";
  const REDO_KEY = `${ACTIVE_DATA_KEY}-redo`;
  const UNDO_KEY = `${ACTIVE_DATA_KEY}-undo`;
  const PRODUCTIVITY_UNDO_KEY = "simple-finance-productivity-undo-history-v1";
  const PROFILE_AUDIT_PREFIX = "simple-finance-profile-audit-v1:";
  const STORAGE_FULL_MESSAGE = "This browser's Talaan storage is full. Talaan kept the previous finance state. Export a recovery bundle, then remove unused profiles or optional offline files and try again.";
  let lastPaymentFailure = null;

  function activeLedgerVersion() {
    try {
      const stored = JSON.parse(root.localStorage?.getItem(ACTIVE_DATA_KEY) || "{}");
      return Number(stored?.ledgerSettings?.version || 0);
    } catch (error) { return 0; }
  }

  function ledgerOwnerReady() {
    return Boolean(root.FinanceAccountLedger?.capabilities?.accountReconciliationOwner);
  }

  function guardLedgerBackedAccountSubmit(event) {
    if (!["accountForm", "accountsForm"].includes(event.target?.id)) return;
    if (!activeLedgerVersion() || ledgerOwnerReady()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (typeof root.showToast === "function") root.showToast("Account ledger is updating. Reload Talaan before changing account balances.", "warning");
    else console.warn("Account ledger owner is unavailable; balance edit blocked.");
  }

  function submitCorrectionFromPrimaryAction(event) {
    const primary = event.target?.closest?.("#accountPrimaryAction");
    if (!primary) return;
    const dialog = root.document.getElementById("accountDialog");
    if (!dialog || dialog.dataset.accountMode === "spend") return;
    const form = root.document.getElementById("accountForm");
    if (!form || !form.contains(primary)) return;
    event.preventDefault();
    form.dispatchEvent(new root.Event("submit", { bubbles:true, cancelable:true }));
  }

  function currentFinanceData() {
    try { return typeof data !== "undefined" ? data : null; } catch (error) { return null; }
  }

  function isStorageQuotaError(error) {
    const name = String(error?.name || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    const code = Number(error?.code || 0);
    return name === "quotaexceedederror"
      || name === "ns_error_dom_quota_reached"
      || code === 22
      || code === 1014
      || message.includes("quota")
      || message.includes("storage is full")
      || message.includes("storage full");
  }

  function removeStorageKey(key) {
    try {
      if (root.localStorage?.getItem(key) == null) return false;
      root.localStorage.removeItem(key);
      return true;
    } catch (error) { return false; }
  }

  function removeProfileAuditLogs() {
    const keys = [];
    try {
      for (let index = 0; index < root.localStorage.length; index += 1) {
        const key = root.localStorage.key(index);
        if (key?.startsWith(PROFILE_AUDIT_PREFIX)) keys.push(key);
      }
    } catch (error) { return 0; }
    return keys.reduce((count, key) => count + (removeStorageKey(key) ? 1 : 0), 0);
  }

  function releaseTransientStorage({ includeUndo = false } = {}) {
    const removed = [];
    if (removeStorageKey(REDO_KEY)) removed.push("redo");
    const auditCount = removeProfileAuditLogs();
    if (auditCount) removed.push(`audit:${auditCount}`);
    if (removeStorageKey(PRODUCTIVITY_UNDO_KEY)) removed.push("productivity-undo");
    if (includeUndo && removeStorageKey(UNDO_KEY)) removed.push("undo");
    return removed;
  }

  function startRecoveryStorageCompaction() {
    try {
      const compact = root.FinancePrivacyLock?.recoveryStorage?.compact;
      if (typeof compact !== "function") return;
      Promise.resolve(compact()).catch(error => console.warn("Could not compact browser recovery storage after a quota failure", error));
    } catch (error) {}
  }

  function storageFullError(error) {
    const next = error instanceof Error ? error : new Error(String(error || "Browser storage quota exceeded."));
    try { next.userMessage = STORAGE_FULL_MESSAGE; } catch (assignmentError) {}
    return next;
  }

  function runWithStoragePressureRecovery(operation) {
    try { return operation(); }
    catch (error) {
      if (!isStorageQuotaError(error)) throw error;
      startRecoveryStorageCompaction();
      releaseTransientStorage({ includeUndo:false });
      try { return operation(); }
      catch (retryError) {
        if (!isStorageQuotaError(retryError)) throw retryError;
        releaseTransientStorage({ includeUndo:true });
        try { return operation(); }
        catch (finalError) {
          if (isStorageQuotaError(finalError)) throw storageFullError(finalError);
          throw finalError;
        }
      }
    }
  }

  function installPersistenceCompatibility() {
    let activeReady = false;
    let profileReady = false;

    if (typeof root.persistFinanceDataRaw === "function") {
      if (root.persistFinanceDataRaw.__storagePressureCompat === true) activeReady = true;
      else {
        const originalPersist = root.persistFinanceDataRaw;
        const wrappedPersist = function storagePressurePersistFinanceDataRaw(...args) {
          return runWithStoragePressureRecovery(() => originalPersist.apply(this, args));
        };
        Object.defineProperty(wrappedPersist, "__storagePressureCompat", { value:true });
        root.persistFinanceDataRaw = wrappedPersist;
        activeReady = true;
      }
    }

    const architecture = root.FinanceProfileArchitecture;
    if (architecture?.persistCurrentData) {
      if (architecture.persistCurrentData.__storagePressureCompat === true) profileReady = true;
      else {
        const originalProfilePersist = architecture.persistCurrentData;
        const wrappedProfilePersist = function storagePressurePersistCurrentData(...args) {
          return runWithStoragePressureRecovery(() => originalProfilePersist.apply(architecture, args));
        };
        Object.defineProperty(wrappedProfilePersist, "__storagePressureCompat", { value:true });
        architecture.persistCurrentData = wrappedProfilePersist;
        profileReady = true;
      }
    }

    return activeReady && profileReady;
  }

  function safelyRepairPaymentHistory(transactions) {
    const source = currentFinanceData();
    const integrity = root.FinanceIntegrity;
    if (!source || !integrity?.scan || typeof transactions?.repairSafeIntegrity !== "function") return { attempted:false, ok:true };

    let report = null;
    try { report = integrity.scan(source, { includeStorage:false }); }
    catch (error) { return { attempted:false, ok:true }; }

    if (Number(report?.counts?.critical || 0) > 0) return { attempted:false, ok:true, report };
    const needsReconciliationLinkRepair = (report?.issues || []).some(item => item?.severity === "safe-repair" && item?.code === "reconciliation-link-missing");
    if (!needsReconciliationLinkRepair) return { attempted:false, ok:true, report };

    const result = transactions.repairSafeIntegrity({ message:"Finance history repaired safely" });
    return { attempted:true, ok:Boolean(result?.ok), result, report:result?.report || report };
  }

  function friendlyPaymentFailure(result) {
    const reason = String(result?.reason || "").trim();
    if (reason && reason.includes(" ")) return reason;
    if (reason === "read-only") return "This Viewer profile is read-only. The payment was not recorded.";
    if (reason === "insufficient") return "The selected payment account does not have enough balance. Nothing was changed.";
    if (reason === "missing-account") return "The selected payment account no longer exists. Choose another account.";
    if (reason === "empty") return "This expense is no longer available to mark as paid.";
    if (reason === "critical-issues") return "Finance history has a critical integrity issue. The payment was not recorded.";
    if (reason === "integrity-service-unavailable") return "Finance integrity protection is still loading. Reload Talaan before recording this payment.";
    return "The payment was rolled back by finance safety checks. No balances were changed.";
  }

  function installPaymentCompatibility() {
    const transactions = root.FinanceLedgerTransactions;
    if (!transactions?.payExpenses) return false;
    if (transactions.capabilities?.paymentCompatibilityRepair) return true;

    const wrapped = Object.freeze({
      ...transactions,
      capabilities:Object.freeze({
        ...(transactions.capabilities || {}),
        paymentCompatibilityRepair:true,
        paymentFailureReason:true,
        storagePressureRecovery:true
      }),
      payExpenses(items, account, options = {}) {
        const repair = safelyRepairPaymentHistory(transactions);
        if (repair.attempted && !repair.ok) {
          lastPaymentFailure = { ok:false, reason:repair.result?.reason || "critical-issues" };
          return lastPaymentFailure;
        }
        const result = transactions.payExpenses(items, account, options);
        lastPaymentFailure = result?.ok ? null : result;
        return result;
      }
    });
    root.FinanceLedgerTransactions = wrapped;
    return true;
  }

  function installToastCompatibility() {
    if (root.showToast?.__accountPaymentFailureCompat === true) return true;
    if (typeof root.showToast !== "function") return false;
    const originalShowToast = root.showToast;
    const wrappedShowToast = function accountCompatToast(message, tone, ...args) {
      let nextMessage = message;
      if (String(message || "") === "Payment could not be completed" && lastPaymentFailure) {
        nextMessage = friendlyPaymentFailure(lastPaymentFailure);
        lastPaymentFailure = null;
      }
      return originalShowToast.call(this, nextMessage, tone, ...args);
    };
    Object.defineProperty(wrappedShowToast, "__accountPaymentFailureCompat", { value:true });
    root.showToast = wrappedShowToast;
    return true;
  }

  function ensureCompatibilityReady() {
    const paymentReady = installPaymentCompatibility();
    const toastReady = installToastCompatibility();
    const persistenceReady = installPersistenceCompatibility();
    if (paymentReady && toastReady && persistenceReady) return;

    let attempts = 0;
    const retry = () => {
      attempts += 1;
      const paymentInstalled = installPaymentCompatibility();
      const toastInstalled = installToastCompatibility();
      const persistenceInstalled = installPersistenceCompatibility();
      if (paymentInstalled && toastInstalled && persistenceInstalled) return;
      if (attempts < 100) root.setTimeout(retry, 50);
    };
    root.setTimeout(retry, 0);
  }

  root.document.addEventListener("submit", guardLedgerBackedAccountSubmit, true);
  root.document.addEventListener("click", submitCorrectionFromPrimaryAction, true);
  root.addEventListener?.("load", ensureCompatibilityReady, { once:true });
  ensureCompatibilityReady();
  root.FinanceAccountSubmitCompat = Object.freeze({
    installed:true,
    ledgerGuard:true,
    paymentCompatibilityRepair:true,
    paymentFailureReason:true,
    storagePressureRecovery:true,
    transientOnlyCleanup:true,
    deferredInitialization:true
  });
})(typeof window !== "undefined" ? window : globalThis);
