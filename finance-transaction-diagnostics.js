"use strict";

/*
 * Account Integrity Phase 3 · verified persistence barrier and technical diagnostics.
 *
 * Money mutations already persist through the Account Ledger transaction owner. This
 * runtime sits before profile/cloud listeners so a finance:data-persisted notification
 * cannot reach Cloud Sync until the local copy, active-profile copy, and integrity
 * state have been verified. Notifications are coalesced to the latest state in the
 * current turn, so a transaction that rolls back never exposes its failed intermediate
 * balance to Cloud Sync.
 *
 * Diagnostics intentionally contain no account names, amounts, descriptions, notes,
 * payees, categories, or other personal financial details.
 */
(function installFinanceTransactionDiagnostics(root) {
  if (!root?.document || root.FinanceTransactionDiagnostics?.installed) return;

  const ACTIVE_DATA_KEY = "simple-finance-project-records-v2";
  const PROFILE_DATA_PREFIX = "simple-finance-profile-data-v1:";
  const DIAGNOSTIC_KEY = "simple-finance-transaction-diagnostics-v1";
  const MAX_DIAGNOSTICS = 120;
  const originalDispatchEvent = root.dispatchEvent.bind(root);
  const originalPersistFinanceDataRaw = typeof root.persistFinanceDataRaw === "function" ? root.persistFinanceDataRaw : null;
  const originalRenderAll = typeof root.renderAll === "function" ? root.renderAll : null;

  let memoryDiagnostics = [];
  let activePersistDiagnosticId = "";
  let latestDiagnosticId = "";
  let pendingVerifiedPersistence = null;
  let persistenceFlushScheduled = false;
  let lastVerifiedSource = readStored(ACTIVE_DATA_KEY) || clone(typeof root.data !== "undefined" ? root.data : {});

  function clone(value) {
    try { return structuredClone(value); } catch (error) {}
    try { return JSON.parse(JSON.stringify(value)); } catch (error) { return value; }
  }

  function uid(prefix = "finance-diag") {
    return root.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function readStored(key) {
    try {
      const raw = root.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }

  function stable(value) {
    if (value === undefined) return "__undefined__";
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }

  function financialProjection(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      accounts:source.accounts && typeof source.accounts === "object" ? source.accounts : {},
      accountLedger:Array.isArray(source.accountLedger) ? source.accountLedger : [],
      accountReconciliations:Array.isArray(source.accountReconciliations) ? source.accountReconciliations : [],
      expenses:(Array.isArray(source.expenses) ? source.expenses : []).map(item => ({
        id:item?.id || "",
        paid:Boolean(item?.paid),
        paidDate:item?.paidDate || "",
        paidFromAccount:item?.paidFromAccount || "",
        paidAmount:Number(item?.paidAmount || 0),
        accountDeducted:Boolean(item?.accountDeducted),
        paymentTransactionId:item?.paymentTransactionId || "",
        autoPaidAtMonthEnd:Boolean(item?.autoPaidAtMonthEnd)
      })),
      incomeRecords:(Array.isArray(source.incomeRecords) ? source.incomeRecords : []).map(item => ({
        id:item?.id || "",
        account:item?.account || "",
        amount:Number(item?.amount || 0),
        postToLedger:Boolean(item?.postToLedger),
        ledgerTransactionId:item?.ledgerTransactionId || ""
      }))
    };
  }

  function financialStateMatches(left, right) {
    if (!left || !right) return false;
    return stable(financialProjection(left)) === stable(financialProjection(right));
  }

  function loadDiagnostics() {
    try {
      const parsed = JSON.parse(root.localStorage?.getItem(DIAGNOSTIC_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, MAX_DIAGNOSTICS) : [];
    } catch (error) { return memoryDiagnostics.slice(); }
  }

  function persistDiagnostics(entries) {
    memoryDiagnostics = entries.slice(0, MAX_DIAGNOSTICS);
    try { root.localStorage?.setItem(DIAGNOSTIC_KEY, JSON.stringify(memoryDiagnostics)); }
    catch (error) {}
  }

  function beginDiagnostic(action = "") {
    const id = uid();
    const entry = {
      id,
      transactionId:id,
      operationType:inferActionType(action),
      localPersistence:"started",
      profilePersistence:"not-run",
      integrityResult:"not-run",
      syncQueueResult:"not-run",
      renderResult:"not-run",
      createdAt:new Date().toISOString(),
      completedAt:""
    };
    const entries = loadDiagnostics();
    entries.unshift(entry);
    persistDiagnostics(entries);
    latestDiagnosticId = id;
    return id;
  }

  function updateDiagnostic(id, patch = {}) {
    if (!id) return null;
    const entries = loadDiagnostics();
    const index = entries.findIndex(item => item?.id === id);
    if (index < 0) return null;
    entries[index] = { ...entries[index], ...patch };
    persistDiagnostics(entries);
    return entries[index];
  }

  function latestDiagnostic() {
    return loadDiagnostics()[0] || null;
  }

  function inferActionType(action = "") {
    const text = String(action || "").toLowerCase();
    if (text.includes("roll back") || text.includes("rolled back")) return "rollback";
    if (text.includes("transfer")) return "transfer";
    if (text.includes("reconcil")) return "reconciliation";
    if (text.includes("income")) return "income";
    if (text.includes("gym")) return "gym-auto-payment";
    if (text.includes("payment") || text.includes("paid")) return "expense-payment";
    if (text.includes("spend") || text.includes("purchase") || text.includes("expense")) return "expense";
    if (text.includes("account")) return "account-maintenance";
    if (text.includes("integrity")) return "integrity-repair";
    return "finance-persist";
  }

  function deriveOperation(previous, next, fallbackType, diagnosticId) {
    const priorLedger = Array.isArray(previous?.accountLedger) ? previous.accountLedger : [];
    const nextLedger = Array.isArray(next?.accountLedger) ? next.accountLedger : [];
    const priorIds = new Set(priorLedger.map(entry => String(entry?.id || "")).filter(Boolean));
    const added = nextLedger.filter(entry => entry?.id && !priorIds.has(String(entry.id)));
    if (!added.length) return { operationType:fallbackType, transactionId:diagnosticId };

    const types = new Set(added.map(entry => String(entry?.type || "")).filter(Boolean));
    let operationType = fallbackType;
    if (types.has("transfer-out") || types.has("transfer-in")) operationType = "transfer";
    else if (types.has("reconciliation-adjustment")) operationType = "reconciliation";
    else if (types.has("income-deposit") || types.has("income-deposit-reversal")) operationType = "income";
    else if (types.has("gym-auto-payment")) operationType = "gym-auto-payment";
    else if (types.has("expense-payment-reversal")) operationType = "expense-payment-reversal";
    else if (types.has("expense-payment")) operationType = "expense-payment";
    else if (types.has("opening-balance")) operationType = "opening-balance";
    else if (added[0]?.type) operationType = String(added[0].type).slice(0, 80);

    const transactionIds = [...new Set(added.map(entry => String(entry?.transactionId || "")).filter(Boolean))];
    const operationIds = [...new Set(added.map(entry => String(entry?.operationId || "")).filter(Boolean))];
    const transactionId = transactionIds.length === 1 ? transactionIds[0]
      : operationIds.length === 1 ? operationIds[0]
      : diagnosticId;
    return { operationType, transactionId };
  }

  function profileKey() {
    try {
      const id = String(root.FinanceProfileArchitecture?.activeProfileId?.() || "");
      return id ? `${PROFILE_DATA_PREFIX}${id}` : "";
    } catch (error) { return ""; }
  }

  function verifyIntegrity(source) {
    const service = root.FinanceIntegrity;
    if (!service?.scan) return { ok:true, status:"unavailable" };
    try {
      const report = service.scan(source, { includeStorage:false });
      const critical = Number(report?.counts?.critical || 0);
      return { ok:critical === 0, status:critical ? "failed" : "passed" };
    } catch (error) {
      return { ok:false, status:"failed" };
    }
  }

  function persistAndVerifyProfile(source, action) {
    const architecture = root.FinanceProfileArchitecture;
    if (!architecture?.activeProfileId) return { ok:true, status:"unavailable" };
    if (architecture.canWrite?.() === false) return { ok:false, status:"read-only" };
    try {
      const persisted = architecture.persistCurrentData?.(source, action) !== false;
      const key = profileKey();
      const stored = key ? readStored(key) : null;
      const matches = Boolean(persisted && stored && financialStateMatches(stored, source));
      return { ok:matches, status:matches ? "verified" : "failed" };
    } catch (error) {
      return { ok:false, status:"failed" };
    }
  }

  function emitVerifiedPersistence(detail, diagnosticId) {
    const event = new root.CustomEvent("finance:verified-data-persisted", { detail:{ ...detail, diagnosticId } });
    try { originalDispatchEvent(event); } catch (error) {}
  }

  function flushVerifiedPersistence() {
    persistenceFlushScheduled = false;
    const pending = pendingVerifiedPersistence;
    pendingVerifiedPersistence = null;
    if (!pending) return;

    const { detail, source, diagnosticId } = pending;
    const cloud = root.FinanceCloudSyncInternals;
    const beforePending = Number(root.FinanceCloudSync?.status?.pendingCount || 0);
    let queueResult = "unavailable";
    try {
      if (typeof cloud?.handlePersistedData === "function") {
        cloud.handlePersistedData({ detail:{ ...detail, data:clone(source), diagnosticId, verified:true } });
        const afterPending = Number(root.FinanceCloudSync?.status?.pendingCount || 0);
        queueResult = afterPending > beforePending ? "queued" : "no-diff";
      }
    } catch (error) {
      queueResult = "failed";
    }

    updateDiagnostic(diagnosticId, {
      syncQueueResult:queueResult,
      completedAt:new Date().toISOString()
    });
    lastVerifiedSource = clone(source);
    emitVerifiedPersistence(detail, diagnosticId);
  }

  function queueVerifiedPersistence(detail, source, diagnosticId) {
    if (pendingVerifiedPersistence?.diagnosticId && pendingVerifiedPersistence.diagnosticId !== diagnosticId) {
      const replacementType = inferActionType(detail?.action || "");
      updateDiagnostic(pendingVerifiedPersistence.diagnosticId, {
        syncQueueResult:replacementType === "rollback" ? "blocked-by-rollback" : "coalesced",
        completedAt:new Date().toISOString()
      });
    }
    pendingVerifiedPersistence = { detail:clone(detail || {}), source:clone(source), diagnosticId };
    if (persistenceFlushScheduled) return;
    persistenceFlushScheduled = true;
    queueMicrotask(flushVerifiedPersistence);
  }

  function interceptPersistedEvent(event) {
    const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
    const source = clone(detail.data ?? (typeof root.data !== "undefined" ? root.data : {}));
    const diagnosticId = activePersistDiagnosticId || beginDiagnostic(detail.action || "");
    const existing = loadDiagnostics().find(item => item.id === diagnosticId) || {};
    const operation = deriveOperation(lastVerifiedSource, source, existing.operationType || inferActionType(detail.action || ""), diagnosticId);

    const localState = readStored(ACTIVE_DATA_KEY);
    const localOk = Boolean(localState && financialStateMatches(localState, source));
    const profile = persistAndVerifyProfile(source, detail.action || "Finance data updated");
    const integrity = verifyIntegrity(source);

    updateDiagnostic(diagnosticId, {
      transactionId:operation.transactionId,
      operationType:operation.operationType,
      localPersistence:localOk ? "verified" : "failed",
      profilePersistence:profile.status,
      integrityResult:integrity.status,
      syncQueueResult:localOk && profile.ok && integrity.ok ? "awaiting-verification-turn" : "blocked"
    });

    if (localOk && profile.ok && integrity.ok) queueVerifiedPersistence(detail, source, diagnosticId);
    else updateDiagnostic(diagnosticId, { completedAt:new Date().toISOString() });

    // finance:data-persisted is intentionally consumed here. Profile persistence has
    // already been verified, and Cloud Sync receives only the coalesced verified state.
    return true;
  }

  root.dispatchEvent = function verifiedFinanceDispatch(event) {
    if (event?.type === "finance:data-persisted") return interceptPersistedEvent(event);
    return originalDispatchEvent(event);
  };

  if (originalPersistFinanceDataRaw) {
    root.persistFinanceDataRaw = function diagnosticFinancePersistence(action = "Finance data updated", ...args) {
      const diagnosticId = beginDiagnostic(action);
      activePersistDiagnosticId = diagnosticId;
      try {
        const result = originalPersistFinanceDataRaw.call(this, action, ...args);
        if (result === false) {
          updateDiagnostic(diagnosticId, {
            localPersistence:"rejected",
            syncQueueResult:"blocked",
            completedAt:new Date().toISOString()
          });
        } else {
          const current = loadDiagnostics().find(item => item.id === diagnosticId);
          if (current?.localPersistence === "started") updateDiagnostic(diagnosticId, { localPersistence:"saved" });
        }
        return result;
      } catch (error) {
        updateDiagnostic(diagnosticId, {
          localPersistence:"failed",
          syncQueueResult:"blocked",
          completedAt:new Date().toISOString()
        });
        throw error;
      } finally {
        activePersistDiagnosticId = "";
      }
    };
  }

  if (originalRenderAll) {
    root.renderAll = function diagnosticRenderAll(...args) {
      try {
        const result = originalRenderAll.apply(this, args);
        if (latestDiagnosticId) updateDiagnostic(latestDiagnosticId, { renderResult:"success" });
        return result;
      } catch (error) {
        if (latestDiagnosticId) updateDiagnostic(latestDiagnosticId, { renderResult:"failed" });
        throw error;
      }
    };
  }

  root.FinanceTransactionDiagnostics = Object.freeze({
    installed:true,
    version:1,
    storageKey:DIAGNOSTIC_KEY,
    capabilities:Object.freeze({
      verifiedPersistenceBarrier:true,
      rollbackCoalescing:true,
      localVerification:true,
      profileVerification:true,
      integrityGate:true,
      cloudQueueAfterVerification:true,
      technicalOnlyDiagnostics:true
    }),
    list:() => clone(loadDiagnostics()),
    latest:() => clone(latestDiagnostic()),
    clear() {
      memoryDiagnostics = [];
      try { root.localStorage?.removeItem(DIAGNOSTIC_KEY); } catch (error) {}
      return true;
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
