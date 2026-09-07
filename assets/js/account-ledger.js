"use strict";

/* My Finance Records V13.0.13 · account ledger, transfers, reconciliation, and transactional direct account spending.
   The ledger is append-only. Account balances are recalculated from signed entries.
   Existing V12.19.1 balances migrate once as opening-balance entries without changing totals. */
(function accountLedgerBootstrap() {
  const LEDGER_VERSION = 1;
  const LEDGER_TYPES = new Set([
    "opening-balance",
    "expense-payment",
    "gym-auto-payment",
    "expense-payment-reversal",
    "income-deposit",
    "income-deposit-reversal",
    "transfer-out",
    "transfer-in",
    "reconciliation-adjustment",
    "manual-adjustment"
  ]);
  const LEDGER_LABELS = {
    "opening-balance":"Opening balance",
    "expense-payment":"Expense payment",
    "gym-auto-payment":"Gym auto-payment",
    "expense-payment-reversal":"Payment reversal",
    "income-deposit":"Income deposit",
    "income-deposit-reversal":"Income reversal",
    "transfer-out":"Transfer sent",
    "transfer-in":"Transfer received",
    "reconciliation-adjustment":"Reconciliation",
    "manual-adjustment":"Manual adjustment"
  };
  const originalNormalizeData = normalizeData;
  const originalSaveData = saveData;
  const originalRenderAll = renderAll;
  const originalOpenAccountDialog = openAccountDialog;
  const originalOpenIncomeDialog = openIncomeDialog;
  const originalSyncIncomeCategoryFields = syncIncomeCategoryFields;
  const originalCloneRecurringIncomeForMonth = cloneRecurringIncomeForMonth;
  const originalProcessGymMonthEndAutoPayments = typeof processGymMonthEndAutoPayments === "function" ? processGymMonthEndAutoPayments : null;
  function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function safeText(value, limit = 160) {
    return String(value || "").trim().slice(0, limit);
  }
  function deterministicOpeningId(account) {
    const slug = encodeURIComponent(String(account || "account")).replace(/%/g, "").slice(0, 80);
    return `ledger-opening-v1-${slug}`;
  }
  function normalizeLedgerEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const account = safeText(entry.account, 100);
    const amount = roundMoney(Number(entry.amount || 0));
    const type = LEDGER_TYPES.has(entry.type) ? entry.type : "manual-adjustment";
    if (!account || !Number.isFinite(amount)) return null;
    const id = safeText(entry.id || uid(), 120);
    return {
      ...entry,
      id,
      transactionId:safeText(entry.transactionId || id, 120),
      operationId:safeText(entry.operationId || id, 180),
      requestId:safeText(entry.requestId || "", 160),
      account,
      type,
      amount,
      date:/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || "")) ? String(entry.date) : localDateKey(),
      description:safeText(entry.description || LEDGER_LABELS[type] || "Account activity", 180),
      createdAt:entry.createdAt || new Date().toISOString(),
      createdByDevice:safeText(entry.createdByDevice || "", 120),
      expenseId:safeText(entry.expenseId || "", 120),
      incomeId:safeText(entry.incomeId || "", 120),
      projectId:safeText(entry.projectId || "", 120),
      transferId:safeText(entry.transferId || "", 120),
      reconciliationId:safeText(entry.reconciliationId || "", 120),
      reversesEntryId:safeText(entry.reversesEntryId || "", 120),
      counterpartAccount:safeText(entry.counterpartAccount || "", 100),
      source:safeText(entry.source || "app", 40),
      notes:safeText(entry.notes || "", 240)
    };
  }
  function openingEntriesFromAccounts(accounts, initializedAt = new Date().toISOString()) {
    return Object.entries(accounts || {}).map(([account, balance]) => {
      const id = deterministicOpeningId(account);
      return normalizeLedgerEntry({
        id,
        transactionId:id,
        operationId:id,
        account,
        type:"opening-balance",
        amount:roundMoney(balance),
        date:String(initializedAt).slice(0, 10),
        description:"Opening balance migrated from V12.19.1",
        createdAt:initializedAt,
        source:"migration"
      });
    }).filter(Boolean);
  }
  function normalizeReconciliation(item) {
    if (!item || typeof item !== "object") return null;
    const account = safeText(item.account, 100);
    if (!account) return null;
    const id = safeText(item.id || uid(), 120);
    return {
      ...item,
      id,
      account,
      date:/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")) ? String(item.date) : localDateKey(),
      previousBalance:roundMoney(item.previousBalance),
      statementBalance:roundMoney(item.statementBalance),
      difference:roundMoney(item.difference),
      note:safeText(item.note || "", 240),
      ledgerEntryId:safeText(item.ledgerEntryId || "", 120),
      createdAt:item.createdAt || new Date().toISOString(),
      createdByDevice:safeText(item.createdByDevice || "", 120)
    };
  }
  function prepareLegacyImport(bundle) {
    try {
      const raw = bundle?.data || bundle || {};
      const cloned = JSON.parse(JSON.stringify(raw));
      const initialSettings = cloned.ledgerSettings && typeof cloned.ledgerSettings === "object" ? cloned.ledgerSettings : {};
      const ledger = (Array.isArray(cloned.accountLedger) ? cloned.accountLedger : []).map(normalizeLedgerEntry).filter(Boolean);
      if (!ledger.length) ledger.push(...openingEntriesFromAccounts(cloned.accounts && typeof cloned.accounts === "object" ? cloned.accounts : {}, initialSettings.initializedAt || new Date().toISOString()));
      window.FinanceIntegrity?.archiveLegacyAccountReferences?.(cloned, ledger);
      const settings = cloned.ledgerSettings && typeof cloned.ledgerSettings === "object" ? cloned.ledgerSettings : {};
      migrateLegacyExpensePayments(cloned, ledger, settings);
      cloned.accountLedger = ledger;
      return cloned;
    } catch (e) {
      const raw = bundle?.data || bundle || {};
      try { return JSON.parse(JSON.stringify(raw)); } catch { return raw; }
    }
  }
  function migrateLegacyExpensePayments(normalized, ledger, settingsSource) {
    const openingByAccount = new Map();
    ledger.forEach(entry => { if (entry?.type === "opening-balance" && entry.account && !openingByAccount.has(entry.account)) openingByAccount.set(entry.account, entry); });
    const operationIds = new Set(ledger.map(entry => String(entry?.operationId || entry?.id || "")).filter(Boolean));
    const migratedTotals = new Map();
    let migrated = 0;
    for (const item of Array.isArray(normalized.expenses) ? normalized.expenses : []) {
      if (!item?.paid || !item.accountDeducted || !item.paidFromAccount) continue;
      const account = safeText(item.paidFromAccount, 100);
      const amount = roundMoney(Number(item.paidAmount || (typeof expensePaymentAmount === "function" ? expensePaymentAmount(item) : item.amount) || 0));
      const archived = Boolean(window.FinanceIntegrity?.isArchivedAccount?.(normalized, account));
      if (!account || (!Object.prototype.hasOwnProperty.call(normalized.accounts || {}, account) && !archived) || !Number.isFinite(amount) || amount <= 0) continue;
      const existing = ledger.filter(entry => entry?.expenseId === item.id && ["expense-payment", "gym-auto-payment"].includes(entry.type));
      if (existing.length) continue;
      const type = item.autoPaidAtMonthEnd ? "gym-auto-payment" : "expense-payment";
      const declaredTransactionId = safeText(item.paymentTransactionId, 120);
      const transactionId = declaredTransactionId || safeText(`legacy-expense-payment:${item.id}`, 120);
      const operationId = safeText(`${type}:${declaredTransactionId ? "repair" : "legacy"}:${item.id}`, 180);
      if (!transactionId || !operationId || operationIds.has(operationId) || ledger.some(entry => entry?.transactionId === transactionId) || (!archived && !openingByAccount.has(account))) continue;
      const encodedId = encodeURIComponent(String(item.id || "expense")).replace(/%/g, "").slice(0, 80);
      const entry = normalizeLedgerEntry({
        id:`ledger-legacy-expense-payment-v1-${encodedId}`, transactionId, operationId, account, type,
        amount:roundMoney(-amount),
        date:/^\d{4}-\d{2}-\d{2}$/.test(String(item.paidDate || "")) ? item.paidDate : String(item.date || settingsSource?.initializedAt || "").slice(0, 10),
        description:`${type === "gym-auto-payment" ? "Gym auto-payment" : "Expense payment"}: ${item.name || item.id}`,
        expenseId:item.id, source:declaredTransactionId ? "legacy-repair" : "legacy-migration", notes:item.notes || ""
      });
      if (!entry || ledger.some(candidate => candidate.id === entry.id)) continue;
      ledger.push(entry);
      operationIds.add(operationId);
      if (!item.paymentTransactionId) item.paymentTransactionId = transactionId;
      migratedTotals.set(account, roundMoney((migratedTotals.get(account) || 0) + amount));
      migrated += 1;
    }
    migratedTotals.forEach((amount, account) => {
      const opening = openingByAccount.get(account);
      if (opening) opening.amount = roundMoney(Number(opening.amount || 0) + amount);
    });
    return migrated;
  }
  function ensureLedgerShape(value) {
    const normalized = value && typeof value === "object" ? value : {};
    const activeAccounts = normalized.accounts && typeof normalized.accounts === "object" ? normalized.accounts : {};
    let ledger = (Array.isArray(normalized.accountLedger) ? normalized.accountLedger : []).map(normalizeLedgerEntry).filter(Boolean);
    const initialSettings = normalized.ledgerSettings && typeof normalized.ledgerSettings === "object" ? normalized.ledgerSettings : {};
    const initializedAt = initialSettings.initializedAt || new Date().toISOString();
    if (!ledger.length) ledger = openingEntriesFromAccounts(activeAccounts, initializedAt);
    window.FinanceIntegrity?.archiveLegacyAccountReferences?.(normalized, ledger);
    const settingsSource = normalized.ledgerSettings && typeof normalized.ledgerSettings === "object" ? normalized.ledgerSettings : {};
    migrateLegacyExpensePayments(normalized, ledger, settingsSource);
    const seenOperations = new Set();
    ledger = ledger.filter(entry => {
      const key = entry.operationId || entry.id;
      if (seenOperations.has(key)) return false;
      seenOperations.add(key);
      return true;
    });
    normalized.accountLedger = ledger;
    normalized.accountReconciliations = (Array.isArray(normalized.accountReconciliations) ? normalized.accountReconciliations : []).map(normalizeReconciliation).filter(Boolean);
    normalized.ledgerSettings = {
      ...settingsSource,
      version:LEDGER_VERSION,
      initializedAt,
      migratedFrom:settingsSource.migratedFrom || (settingsSource.version ? "" : "12.19.1"),
      lastRecalculatedAt:settingsSource.lastRecalculatedAt || initializedAt
    };
    (normalized.incomeRecords || []).forEach(item => {
      item.ledgerTransactionId = safeText(item.ledgerTransactionId || "", 120);
      item.postToLedger = Boolean(item.ledgerTransactionId || item.postToLedger === true);
    });
    recalculateBalances(normalized);
    return normalized;
  }
  function recalculateBalances(target = data, { stamp = false } = {}) {
    if (!target?.accounts || typeof target.accounts !== "object") target.accounts = {};
    const balances = Object.fromEntries(Object.keys(target.accounts).map(name => [name, 0]));
    (target.accountLedger || []).forEach(entry => {
      if (!entry || !Object.prototype.hasOwnProperty.call(balances, entry.account)) return;
      balances[entry.account] = roundMoney(balances[entry.account] + Number(entry.amount || 0));
    });
    Object.keys(target.accounts).forEach(name => { target.accounts[name] = roundMoney(balances[name] || 0); });
    if (stamp && target.ledgerSettings) target.ledgerSettings.lastRecalculatedAt = new Date().toISOString();
    return target.accounts;
  }

  function currentDeviceIdSafe() {
    try {
      if (typeof ensureCurrentDevice === "function") ensureCurrentDevice();
      return typeof appMeta !== "undefined" ? String(appMeta.currentDeviceId || "") : "";
    } catch (error) { return ""; }
  }

  function ledgerOperationExists(operationId) {
    return Boolean(operationId && (data.accountLedger || []).some(entry => entry.operationId === operationId));
  }

  function appendLedgerEntries(entries, { recalculate = true } = {}) {
    ensureLedgerShape(data);
    const added = [];
    for (const candidate of entries || []) {
      const entry = normalizeLedgerEntry({ ...candidate, createdByDevice:candidate?.createdByDevice || currentDeviceIdSafe() });
      if (!entry || ledgerOperationExists(entry.operationId)) continue;
      data.accountLedger.push(entry);
      added.push(entry);
    }
    if (recalculate) recalculateBalances(data, { stamp:added.length > 0 });
    return added;
  }

  function ledgerEntryForOperation(operationId) {
    return (data.accountLedger || []).find(entry => entry.operationId === operationId) || null;
  }

  function appendReconciliation(account, statementBalance, { date = localDateKey(), note = "" } = {}) {
    ensureLedgerShape(data);
    if (!Object.prototype.hasOwnProperty.call(data.accounts || {}, account)) return null;
    const previousBalance = roundMoney(data.accounts[account]);
    const target = roundMoney(statementBalance);
    const difference = roundMoney(target - previousBalance);
    if (difference === 0) return null;
    const reconciliationId = uid();
    const operationId = `reconciliation:${reconciliationId}`;
    const [entry] = appendLedgerEntries([{
      id:uid(), transactionId:reconciliationId, operationId,
      account, type:"reconciliation-adjustment", amount:difference, date,
      description:`Reconciled ${account} to ${money(target)}`,
      reconciliationId, source:"reconciliation", notes:note
    }]);
    if (!entry) return null;
    const reconciliation = normalizeReconciliation({
      id:reconciliationId, account, date,
      previousBalance, statementBalance:target, difference,
      note, ledgerEntryId:entry.id, createdByDevice:currentDeviceIdSafe()
    });
    data.accountReconciliations.push(reconciliation);
    return reconciliation;
  }

  function refreshReconciledAccountState(account, targetBalance = null) {
    recalculateBalances(data);
    const actual = roundMoney(data.accounts?.[account] || 0);
    if (targetBalance != null && Number.isFinite(Number(targetBalance)) && actual !== roundMoney(targetBalance)) {
      console.warn(`Account ledger refresh mismatch for ${account}: expected ${roundMoney(targetBalance)}, calculated ${actual}`);
    }
    try {
      renderAll(false);
    } catch (error) {
      console.error("Finance data was saved but the full interface refresh failed.", error);
      try { renderMoneyPage(); } catch (refreshError) { console.error("Money workspace refresh also failed.", refreshError); }
    }
    try { window.dispatchEvent(new CustomEvent("finance:account-balance-refreshed", { detail:{ account, balance:actual } })); } catch (error) {}
    return actual;
  }

  function reverseIncomeLedger(existing, reason = "Income record changed") {
    if (!existing?.ledgerTransactionId) return null;
    const original = (data.accountLedger || []).find(entry => entry.transactionId === existing.ledgerTransactionId && entry.type === "income-deposit" && entry.incomeId === existing.id);
    if (!original) return null;
    const operationId = `income-reversal:${existing.id}:${existing.ledgerTransactionId}`;
    const [entry] = appendLedgerEntries([{
      id:uid(), transactionId:uid(), operationId,
      account:original.account, type:"income-deposit-reversal", amount:roundMoney(-original.amount), date:localDateKey(),
      description:`Reversed income: ${existing.name}`, incomeId:existing.id,
      reversesEntryId:original.id, source:"income", notes:reason
    }]);
    return entry || ledgerEntryForOperation(operationId);
  }

  function postIncomeLedger(record) {
    const transactionId = uid();
    const [entry] = appendLedgerEntries([{
      id:uid(), transactionId, operationId:`income-deposit:${record.id}:${transactionId}`,
      account:record.account, type:"income-deposit", amount:record.amount, date:record.date,
      description:`Income received: ${record.name}`, incomeId:record.id,
      source:"income", notes:record.notes
    }]);
    if (entry) {
      record.ledgerTransactionId = transactionId;
      record.postToLedger = true;
    }
    return entry;
  }

  normalizeData = function ledgerAwareNormalizeData(value) {
    return ensureLedgerShape(originalNormalizeData(value));
  };

  const ledgerMigrationSnapshot = JSON.stringify(data);
  data = ensureLedgerShape(data);
  const ledgerMigrationChanged = JSON.stringify(data) !== ledgerMigrationSnapshot;

  saveData = function ledgerAwareSaveData(message = "Saved") {
    ensureLedgerShape(data);
    return originalSaveData(message);
  };

  renderAll = function ledgerAwareRenderAll(...args) {
    recalculateBalances(data);
    const result = originalRenderAll(...args);
    renderLedgerWorkspace();
    if (document.getElementById("accountDialog")?.open && document.getElementById("accountDialog")?.dataset.accountMode === "spend") updateAccountSpendPreview();
    return result;
  };

  function mutateExpensePayment(items, account, { auto = false, paidDate = localDateKey(), requestId = "" } = {}) {
    ensureLedgerShape(data);
    const eligible = (items || []).filter(item => item && !item.paid);
    const total = expensePaymentTotal(eligible);
    if (!eligible.length || total <= 0) return { ok:false, reason:"empty", total:0 };
    if (!Object.prototype.hasOwnProperty.call(data.accounts || {}, account)) return { ok:false, reason:"missing-account", total };
    const balance = roundMoney(data.accounts[account]);
    if (balance < total) return { ok:false, reason:"insufficient", total, balance };
    const transactionId = uid();
    const ledgerEntries = eligible.map(item => ({
      id:uid(), transactionId,
      operationId:`expense-payment:${transactionId}:${item.id}`,
      account,
      type:auto ? "gym-auto-payment" : "expense-payment",
      amount:roundMoney(-expensePaymentAmount(item)),
      date:paidDate,
      description:`${auto ? "Gym auto-payment" : "Expense payment"}: ${item.name}`,
      expenseId:item.id,
      source:auto ? "gym-auto-pay" : "expense",
      requestId:safeText(requestId, 160),
      notes:item.notes || ""
    }));
    const added = appendLedgerEntries(ledgerEntries);
    if (added.length !== eligible.length) return { ok:false, reason:"duplicate-operation", total, balance };
    eligible.forEach(item => {
      const amount = expensePaymentAmount(item);
      if (isDailyBudget(item)) item.amount = amount;
      item.paid = true;
      item.paidDate = paidDate;
      item.paidFromAccount = account;
      item.paidAmount = amount;
      item.accountDeducted = true;
      item.paymentTransactionId = transactionId;
      item.autoPaidAtMonthEnd = Boolean(auto);
      if (isGymExpense(item)) item.gymAutoPaySuppressed = false;
    });
    return { ok:true, total, transactionId, count:eligible.length, account, ledgerEntries:added };
  }

  function mutateExpensePaymentReversal(item) {
    if (!item?.paid) return { ok:true, restored:0 };
    const restored = item.accountDeducted && item.paidFromAccount && Number(item.paidAmount || 0) > 0;
    const amount = restored ? roundMoney(item.paidAmount) : 0;
    let reversalEntry = null;
    if (restored) {
      if (!Object.prototype.hasOwnProperty.call(data.accounts || {}, item.paidFromAccount)) return { ok:false, restored:0, missingAccount:item.paidFromAccount, reason:"missing-account" };
      const original = (data.accountLedger || []).find(entry => entry.transactionId === item.paymentTransactionId && entry.expenseId === item.id && ["expense-payment", "gym-auto-payment"].includes(entry.type));
      const operationId = `expense-payment-reversal:${item.paymentTransactionId || item.id}`;
      const [entry] = appendLedgerEntries([{
        id:uid(), transactionId:uid(), operationId,
        account:item.paidFromAccount, type:"expense-payment-reversal", amount,
        date:localDateKey(), description:`Payment reversal: ${item.name}`,
        expenseId:item.id, reversesEntryId:original?.id || "",
        source:original ? "expense-reversal" : "expense-reversal-legacy"
      }]);
      reversalEntry = entry || ledgerEntryForOperation(operationId);
      if (!reversalEntry) return { ok:false, restored:0, reason:"duplicate-operation" };
    }
    item.paid = false;
    item.paidDate = "";
    item.paidFromAccount = "";
    item.paidAmount = 0;
    item.accountDeducted = false;
    item.paymentTransactionId = "";
    item.autoPaidAtMonthEnd = false;
    if (isGymExpense(item) && expenseMonth(item) < currentMonth) item.gymAutoPaySuppressed = true;
    return { ok:true, restored:amount, reversalEntry };
  }

  applyExpensePayment = function ledgerExpensePayment(items, account, options = {}) {
    if (globalThis.__financeLedgerMutationInternal === true) return mutateExpensePayment(items, account, options);
    return commitExpensePayment(items, account, options);
  };

  restoreExpensePayment = function ledgerExpensePaymentRestore(item, options = {}) {
    if (globalThis.__financeLedgerMutationInternal === true) return mutateExpensePaymentReversal(item);
    return commitExpensePaymentReversal(item, options);
  };

  cloneRecurringIncomeForMonth = function ledgerRecurringIncomeClone(source, month) {
    const copy = originalCloneRecurringIncomeForMonth(source, month);
    copy.ledgerTransactionId = "";
    copy.postToLedger = false;
    return copy;
  };

  function renameAccountReferences(originalName, newName) {
    if (!originalName || originalName === newName) return;
    (data.accountLedger || []).forEach(entry => {
      if (entry.account === originalName) entry.account = newName;
      if (entry.counterpartAccount === originalName) entry.counterpartAccount = newName;
    });
    (data.accountReconciliations || []).forEach(item => { if (item.account === originalName) item.account = newName; });
    (data.expenses || []).forEach(item => {
      if (item.account === originalName) item.account = newName;
      if (item.paidFromAccount === originalName) item.paidFromAccount = newName;
      if (item.gymAutoPayAccount === originalName) item.gymAutoPayAccount = newName;
    });
    (data.incomeRecords || []).forEach(item => { if (item.account === originalName) item.account = newName; });
    (data.savingsGoals || []).forEach(goal => { if (goal.linkedAccount === originalName) goal.linkedAccount = newName; });
  }

  const SPEND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16v11H4zM4 10h16M8 15h3"/></svg>';
  const CORRECT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 6h14v12H5zM8 10h8M8 14h5"/></svg>';

  let accountSpendSubmitPending = false;

  function moneyMutationCanWrite() {
    const architecture = window.FinanceProfileArchitecture;
    if (!architecture || architecture.canWrite?.() !== false) return true;
    showToast("This Viewer profile is read-only", "warning");
    return false;
  }

  function expectedBalancesMatch(expectedBalances = [], target = data) {
    return expectedBalances.every(item => Object.prototype.hasOwnProperty.call(target.accounts || {}, item.account)
      && roundMoney(target.accounts[item.account]) === roundMoney(item.target));
  }

  function accountStateMatchesRuntime(accounts) {
    const runtimeAccounts = data.accounts && typeof data.accounts === "object" ? data.accounts : {};
    const storedAccounts = accounts && typeof accounts === "object" ? accounts : {};
    const runtimeNames = Object.keys(runtimeAccounts).sort();
    const storedNames = Object.keys(storedAccounts).sort();
    if (runtimeNames.length !== storedNames.length || runtimeNames.some((name, index) => name !== storedNames[index])) return false;
    return runtimeNames.every(name => Number.isFinite(Number(storedAccounts[name]))
      && roundMoney(storedAccounts[name]) === roundMoney(runtimeAccounts[name]));
  }

  function readStoredFinanceState(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error(`Could not read finance state from ${storageKey}.`, error);
      return null;
    }
  }

  function restoreUndoSnapshot(undoSnapshot, undoRaw) {
    try { if (typeof undoState !== "undefined") undoState = undoSnapshot ? cloneData(undoSnapshot) : null; } catch (error) {}
    try {
      if (undoRaw == null) localStorage.removeItem(UNDO_KEY);
      else localStorage.setItem(UNDO_KEY, undoRaw);
    } catch (error) {}
  }

  function restoreLedgerTransaction(snapshot, undoSnapshot, undoRaw, message = "Money changes were not saved") {
    data = normalizeData(cloneData(snapshot));
    restoreUndoSnapshot(undoSnapshot, undoRaw);
    try {
      if (typeof persistFinanceDataRaw === "function") persistFinanceDataRaw("Money transaction rolled back");
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Could not persist the money-transaction rollback; the prior stored copy remains authoritative.", error);
    }
    try { renderAll(false); } catch (error) { console.error("Could not refresh finance state after rollback.", error); }
    showToast(message, "warning");
    return { ok:false, reason:message };
  }

  function accountMutationInvariantReport(expectedBalances = [], target = data) {
    const errors = [];
    const activeAccounts = target?.accounts && typeof target.accounts === "object" ? target.accounts : {};
    const ledgerEntries = Array.isArray(target?.accountLedger) ? target.accountLedger : [];
    const calculated = Object.fromEntries(Object.keys(activeAccounts).map(name => [name, 0]));
    const operationIds = new Set();
    const ledgerById = new Map();

    for (const entry of ledgerEntries) {
      if (!entry || typeof entry !== "object") { errors.push("invalid-ledger-entry"); continue; }
      if (entry.id) ledgerById.set(entry.id, entry);
      if (entry.operationId) {
        if (operationIds.has(entry.operationId)) errors.push(`duplicate-operation:${entry.operationId}`);
        operationIds.add(entry.operationId);
      }
      if (Object.prototype.hasOwnProperty.call(calculated, entry.account)) {
        const amount = Number(entry.amount);
        if (!Number.isFinite(amount)) errors.push(`invalid-ledger-amount:${entry.id || entry.account}`);
        else calculated[entry.account] = roundMoney(calculated[entry.account] + amount);
      }
    }

    for (const [account, balance] of Object.entries(activeAccounts)) {
      if (!Number.isFinite(Number(balance))) errors.push(`invalid-account-balance:${account}`);
      else if (roundMoney(balance) !== roundMoney(calculated[account] || 0)) errors.push(`ledger-balance-mismatch:${account}`);
    }

    for (const item of target?.accountReconciliations || []) {
      if (!item?.ledgerEntryId) continue;
      const entry = ledgerById.get(item.ledgerEntryId);
      if (!entry || entry.account !== item.account || entry.reconciliationId !== item.id) errors.push(`broken-reconciliation:${item.id || item.account}`);
    }

    for (const expected of expectedBalances) {
      if (!Object.prototype.hasOwnProperty.call(activeAccounts, expected.account)
        || roundMoney(activeAccounts[expected.account]) !== roundMoney(expected.target)) errors.push(`expected-balance-mismatch:${expected.account}`);
    }
    return { ok:errors.length === 0, errors };
  }

  function verificationErrors(result, label = "domain") {
    if (result == null || result === true) return [];
    if (result === false) return [`${label}-verification-failed`];
    if (typeof result === "string") return [result];
    if (Array.isArray(result)) return result.filter(Boolean).map(String);
    if (typeof result === "object") {
      if (result.ok === true) return [];
      if (Array.isArray(result.errors)) return result.errors.filter(Boolean).map(String);
    }
    return [`${label}-verification-failed`];
  }

  function moneyMutationInvariantReport(target = data, expectedBalances = [], verify = null, context = null) {
    const base = accountMutationInvariantReport(expectedBalances, target);
    const errors = [...base.errors];
    if (typeof verify === "function") {
      try { errors.push(...verificationErrors(verify(target, context), "money-domain")); }
      catch (error) { errors.push(`money-domain-exception:${error?.message || "unknown"}`); }
    }
    return { ok:errors.length === 0, errors };
  }

  function persistedMoneyStateMatches(target, expectedBalances, verify, context) {
    if (!target || !accountStateMatchesRuntime(target.accounts)) return false;
    return moneyMutationInvariantReport(target, expectedBalances, verify, context).ok;
  }

  function runLedgerTransaction({ undoLabel, message = "Money transaction saved", expectedBalances = [], mutate, verify = null, recordUndo = true, notify = true }) {
    if (!moneyMutationCanWrite()) return { ok:false, reason:"read-only" };
    if (typeof mutate !== "function") return { ok:false, reason:"missing-mutation" };
    const snapshot = cloneData(data);
    const undoSnapshot = typeof undoState !== "undefined" && undoState ? cloneData(undoState) : null;
    const undoRaw = (() => { try { return localStorage.getItem(UNDO_KEY); } catch (error) { return null; } })();
    try {
      if (recordUndo) pushUndo(undoLabel || message || "Money transaction");
      const context = mutate() || {};
      recalculateBalances(data, { stamp:true });
      const beforePersist = moneyMutationInvariantReport(data, expectedBalances, verify, context);
      if (!beforePersist.ok || !expectedBalancesMatch(expectedBalances)) {
        console.error("Money mutation invariants failed before persistence.", beforePersist.errors);
        throw Object.assign(new Error("The money update failed its safety checks."), { userMessage:"The money update failed its safety checks. Nothing was saved." });
      }
      if (context?.changed === false) {
        if (recordUndo) restoreUndoSnapshot(undoSnapshot, undoRaw);
        return { ok:true, skipped:true, context };
      }
      if (typeof persistFinanceDataRaw !== "function") throw new Error("Finance persistence is unavailable.");
      const saved = persistFinanceDataRaw(message);
      if (saved === false) throw Object.assign(new Error("Finance persistence rejected the transaction."), { userMessage:"Money changes were not saved. Check profile permissions and try again." });

      const afterPersist = moneyMutationInvariantReport(data, expectedBalances, verify, context);
      if (!afterPersist.ok || !expectedBalancesMatch(expectedBalances)) {
        console.error("Money mutation invariants failed after persistence.", afterPersist.errors);
        throw Object.assign(new Error("Money state changed during persistence."), { userMessage:"The money state changed during save. The previous value was restored." });
      }

      const localState = readStoredFinanceState(STORAGE_KEY);
      if (!persistedMoneyStateMatches(localState, expectedBalances, verify, context)) {
        throw Object.assign(new Error("Local persistence verification failed."), { userMessage:"The money update could not be verified in local storage." });
      }

      const architecture = window.FinanceProfileArchitecture;
      const profileId = architecture?.activeProfileId?.();
      if (profileId) {
        const profileKey = `simple-finance-profile-data-v1:${profileId}`;
        let profileState = readStoredFinanceState(profileKey);
        if (!persistedMoneyStateMatches(profileState, expectedBalances, verify, context)) {
          let repaired = false;
          try { repaired = architecture?.persistCurrentData?.(data, message) !== false; } catch (error) { console.error("Could not repair profile-scoped money persistence.", error); }
          profileState = readStoredFinanceState(profileKey);
          if (!repaired || !persistedMoneyStateMatches(profileState, expectedBalances, verify, context)) {
            throw Object.assign(new Error("Profile persistence verification failed."), { userMessage:"The money update could not be stored in the active profile." });
          }
        }
      }

      if (notify) showToast(message);
      return { ok:true, context };
    } catch (error) {
      console.error("Money transaction failed.", error);
      return restoreLedgerTransaction(snapshot, undoSnapshot, undoRaw, error?.userMessage || "The money update could not be completed. The previous state was restored.");
    }
  }

  function runAccountMutation({ undoLabel, message, expectedBalances = [], mutate }) {
    return runLedgerTransaction({ undoLabel, message:message || "Account updated", expectedBalances, mutate }).ok;
  }

  function expensePaymentStateErrors(target, context) {
    const errors = [];
    const expenses = Array.isArray(target?.expenses) ? target.expenses : [];
    const ledger = Array.isArray(target?.accountLedger) ? target.accountLedger : [];
    const expectedType = context.auto ? "gym-auto-payment" : "expense-payment";
    const entries = ledger.filter(entry => entry.transactionId === context.transactionId && entry.type === expectedType);
    if (entries.length !== context.itemIds.length) errors.push("expense-payment-entry-count");
    for (const id of context.itemIds) {
      const item = expenses.find(expense => expense.id === id);
      const entry = entries.find(candidate => candidate.expenseId === id);
      const amount = roundMoney(context.itemAmounts[id] || 0);
      if (!item || !item.paid || !item.accountDeducted || item.paymentTransactionId !== context.transactionId || item.paidFromAccount !== context.account || roundMoney(item.paidAmount) !== amount) errors.push(`expense-payment-state:${id}`);
      if (!entry || entry.account !== context.account || roundMoney(entry.amount) !== roundMoney(-amount)) errors.push(`expense-payment-ledger:${id}`);
    }
    if (roundMoney(target?.accounts?.[context.account] || 0) !== roundMoney(context.expectedAfter)) errors.push(`expense-payment-balance:${context.account}`);
    return errors;
  }

  function commitExpensePayment(items, account, { auto = false, paidDate = localDateKey(), undoLabel = "", message = "" } = {}) {
    const ids = (items || []).map(item => item?.id).filter(Boolean);
    const eligible = ids.map(id => (data.expenses || []).find(item => item.id === id)).filter(item => item && !item.paid);
    const total = expensePaymentTotal(eligible);
    if (!eligible.length || total <= 0) return { ok:false, reason:"empty", total:0 };
    if (!Object.prototype.hasOwnProperty.call(data.accounts || {}, account)) return { ok:false, reason:"missing-account", total };
    const before = roundMoney(data.accounts[account]);
    if (before < total) return { ok:false, reason:"insufficient", total, balance:before };
    const expectedAfter = roundMoney(before - total);
    const itemAmounts = Object.fromEntries(eligible.map(item => [item.id, roundMoney(expensePaymentAmount(item))]));
    let mutationResult = null;
    const transaction = runLedgerTransaction({
      undoLabel:undoLabel || (eligible.length === 1 ? `Pay ${eligible[0].name} from ${account}` : `Pay ${eligible.length} expenses from ${account}`),
      message:message || `${money(total)} deducted from ${account}`,
      expectedBalances:[{ account, target:expectedAfter }],
      mutate:() => {
        mutationResult = mutateExpensePayment(eligible, account, { auto, paidDate });
        if (!mutationResult.ok) throw Object.assign(new Error(`Expense payment failed: ${mutationResult.reason || "unknown"}`), { userMessage:"Payment could not be completed. Nothing was changed." });
        return { kind:"expense-payment", auto, account, expectedAfter, itemIds:eligible.map(item => item.id), itemAmounts, transactionId:mutationResult.transactionId };
      },
      verify:expensePaymentStateErrors
    });
    return transaction.ok ? { ...mutationResult, ok:true, before, after:expectedAfter } : { ok:false, reason:transaction.reason || mutationResult?.reason || "transaction-failed", total, balance:before };
  }

  function expenseReversalStateErrors(target, context) {
    const errors = [];
    const item = (target?.expenses || []).find(expense => expense.id === context.itemId);
    if (!item || item.paid || item.accountDeducted || item.paymentTransactionId || item.paidFromAccount || roundMoney(item.paidAmount || 0) !== 0) errors.push(`expense-reversal-state:${context.itemId}`);
    if (context.restored > 0) {
      const reversal = (target?.accountLedger || []).find(entry => entry.operationId === context.operationId && entry.type === "expense-payment-reversal" && entry.expenseId === context.itemId);
      if (!reversal || reversal.account !== context.account || roundMoney(reversal.amount) !== roundMoney(context.restored)) errors.push(`expense-reversal-ledger:${context.itemId}`);
      if (context.originalEntryId && reversal?.reversesEntryId !== context.originalEntryId) errors.push(`expense-reversal-reference:${context.itemId}`);
      if (roundMoney(target?.accounts?.[context.account] || 0) !== roundMoney(context.expectedAfter)) errors.push(`expense-reversal-balance:${context.account}`);
    }
    return errors;
  }

  function commitExpensePaymentReversal(item, { undoLabel = "", message = "" } = {}) {
    const actual = item?.id ? (data.expenses || []).find(expense => expense.id === item.id) : item;
    if (!actual?.paid) return { ok:false, reason:"not-paid", restored:0 };
    const account = actual.paidFromAccount || "";
    const restored = actual.accountDeducted && account ? roundMoney(actual.paidAmount || 0) : 0;
    if (restored > 0 && !Object.prototype.hasOwnProperty.call(data.accounts || {}, account)) return { ok:false, reason:"missing-account", missingAccount:account, restored:0 };
    const before = restored > 0 ? roundMoney(data.accounts[account]) : 0;
    const expectedAfter = roundMoney(before + restored);
    const originalTransactionId = actual.paymentTransactionId || "";
    const originalEntry = (data.accountLedger || []).find(entry => entry.transactionId === originalTransactionId && entry.expenseId === actual.id && ["expense-payment", "gym-auto-payment"].includes(entry.type));
    const operationId = `expense-payment-reversal:${originalTransactionId || actual.id}`;
    let mutationResult = null;
    const transaction = runLedgerTransaction({
      undoLabel:undoLabel || `Move ${actual.name} back to unpaid`,
      message:message || (restored ? `${money(restored)} restored to ${account}` : "Expense moved back to unpaid"),
      expectedBalances:restored > 0 ? [{ account, target:expectedAfter }] : [],
      mutate:() => {
        mutationResult = mutateExpensePaymentReversal(actual);
        if (!mutationResult.ok) throw Object.assign(new Error(`Expense reversal failed: ${mutationResult.reason || "unknown"}`), { userMessage:"The payment reversal could not be completed. Nothing was changed." });
        return { kind:"expense-reversal", itemId:actual.id, account, restored, expectedAfter, originalTransactionId, originalEntryId:originalEntry?.id || "", operationId };
      },
      verify:expenseReversalStateErrors
    });
    return transaction.ok ? { ...mutationResult, ok:true, before, after:expectedAfter } : { ok:false, reason:transaction.reason || mutationResult?.reason || "transaction-failed", restored:0 };
  }

  function externalExpensePaymentStateErrors(target, context) {
    const errors = [];
    const expenses = Array.isArray(target?.expenses) ? target.expenses : [];
    for (const id of context.itemIds || []) {
      const item = expenses.find(expense => expense.id === id);
      if (!item || !item.paid || item.accountDeducted || item.paidFromAccount || roundMoney(item.paidAmount || 0) !== 0 || item.paymentTransactionId || item.autoPaidAtMonthEnd) errors.push(`external-payment-state:${id}`);
      if (typeof context.verifyItem === "function") {
        try { if (context.verifyItem(item, target) === false) errors.push(`external-payment-metadata:${id}`); }
        catch (error) { errors.push(`external-payment-metadata:${id}`); }
      }
    }
    return errors;
  }

  function commitExternalExpensePayment(items, { paidDate = localDateKey(), undoLabel = "", message = "Expense marked paid without an account deduction", decorateItem = null, verifyItem = null } = {}) {
    const ids = (items || []).map(item => item?.id).filter(Boolean);
    const eligible = ids.map(id => (data.expenses || []).find(item => item.id === id)).filter(item => item && !item.paid);
    if (!eligible.length) {
      const existing = ids.map(id => (data.expenses || []).find(item => item.id === id)).filter(Boolean);
      const alreadyApplied = existing.length === ids.length && existing.every(item => item.paid && !item.accountDeducted && !item.paidFromAccount && !item.paymentTransactionId);
      return alreadyApplied ? { ok:true, idempotent:true, count:existing.length } : { ok:false, reason:"empty", count:0 };
    }
    const transaction = runLedgerTransaction({
      undoLabel:undoLabel || (eligible.length === 1 ? `Mark ${eligible[0].name} paid externally` : `Mark ${eligible.length} expenses paid externally`),
      message,
      mutate:() => {
        eligible.forEach(item => {
          item.paid = true;
          item.paidDate = paidDate;
          item.paidFromAccount = "";
          item.paidAmount = 0;
          item.accountDeducted = false;
          item.paymentTransactionId = "";
          item.autoPaidAtMonthEnd = false;
          if (typeof decorateItem === "function") decorateItem(item);
        });
        return { kind:"external-expense-payment", itemIds:eligible.map(item => item.id), verifyItem };
      },
      verify:externalExpensePaymentStateErrors
    });
    return transaction.ok ? { ok:true, count:eligible.length } : { ok:false, reason:transaction.reason || "transaction-failed", count:0 };
  }

  function paidExpenseAccountCorrectionStateErrors(target, context) {
    const errors = [];
    const expenses = Array.isArray(target?.expenses) ? target.expenses : [];
    const ledger = Array.isArray(target?.accountLedger) ? target.accountLedger : [];
    for (const plan of context.plans || []) {
      const item = expenses.find(expense => expense.id === plan.itemId);
      if (!item || !item.paid || item.paidFromAccount !== context.newAccount) errors.push(`payment-account-state:${plan.itemId}`);
      if (!plan.deducted) continue;
      if (item?.paymentTransactionId !== plan.correctionId || !item.accountDeducted) errors.push(`payment-account-transaction:${plan.itemId}`);
      const pair = ledger.filter(entry => entry.transactionId === plan.correctionId && entry.expenseId === plan.itemId);
      const reversal = pair.find(entry => entry.type === "expense-payment-reversal");
      const debit = pair.find(entry => ["expense-payment", "gym-auto-payment"].includes(entry.type) && entry.account === context.newAccount);
      if (pair.length !== 2 || !reversal || !debit) errors.push(`payment-account-ledger-pair:${plan.itemId}`);
      if (reversal && (reversal.account !== plan.oldAccount || roundMoney(reversal.amount) !== roundMoney(plan.amount) || (plan.originalEntryId && reversal.reversesEntryId !== plan.originalEntryId))) errors.push(`payment-account-reversal:${plan.itemId}`);
      if (debit && roundMoney(debit.amount) !== roundMoney(-plan.amount)) errors.push(`payment-account-debit:${plan.itemId}`);
    }
    return errors;
  }

  function commitPaidExpenseAccountCorrection(items, newAccount, { message = "", undoLabel = "" } = {}) {
    if (!Object.prototype.hasOwnProperty.call(data.accounts || {}, newAccount)) return { ok:false, reason:"missing-account", count:0 };
    const ids = (items || []).map(item => typeof item === "string" ? item : item?.id).filter(Boolean);
    const changed = ids.map(id => (data.expenses || []).find(item => item.id === id)).filter(item => item?.paid && (item.paidFromAccount || item.account || "") !== newAccount);
    if (!changed.length) return { ok:true, skipped:true, count:0 };
    const plans = changed.map(item => {
      const oldAccount = item.paidFromAccount || item.account || "";
      const amount = roundMoney(Number(item.paidAmount || expensePaymentAmount(item) || 0));
      if (item.accountDeducted && (!oldAccount || !Object.prototype.hasOwnProperty.call(data.accounts || {}, oldAccount))) throw Object.assign(new Error(`Original payment account missing for ${item.name}.`), { userMessage:`The original payment account for ${item.name} is missing.` });
      if (item.accountDeducted && amount <= 0) throw Object.assign(new Error(`Invalid paid amount for ${item.name}.`), { userMessage:`The paid amount for ${item.name} is invalid.` });
      const correctionId = uid();
      const original = (data.accountLedger || []).find(entry => entry.transactionId === item.paymentTransactionId && entry.expenseId === item.id && ["expense-payment", "gym-auto-payment"].includes(entry.type));
      return { item, itemId:item.id, oldAccount, amount, correctionId, deducted:Boolean(item.accountDeducted), originalEntryId:original?.id || "" };
    });
    const amountRequired = plans.filter(plan => plan.deducted).reduce((total, plan) => roundMoney(total + plan.amount), 0);
    if (roundMoney(data.accounts[newAccount]) < amountRequired) return { ok:false, reason:"insufficient", count:0, balance:roundMoney(data.accounts[newAccount]), required:amountRequired };
    const deltas = new Map();
    for (const plan of plans.filter(candidate => candidate.deducted)) {
      deltas.set(plan.oldAccount, roundMoney((deltas.get(plan.oldAccount) || 0) + plan.amount));
      deltas.set(newAccount, roundMoney((deltas.get(newAccount) || 0) - plan.amount));
    }
    const expectedBalances = [...deltas.entries()].map(([account, delta]) => ({ account, target:roundMoney(data.accounts[account] + delta) }));
    const transaction = runLedgerTransaction({
      undoLabel:undoLabel || `Correct payment account for ${plans.length} paid expense${plans.length === 1 ? "" : "s"}`,
      message:message || `${plans.length} payment account${plans.length === 1 ? "" : "s"} corrected with ledger entries`,
      expectedBalances,
      mutate:() => {
        const entries = [];
        for (const plan of plans) {
          if (plan.deducted) {
            entries.push(
              { id:uid(), transactionId:plan.correctionId, operationId:`payment-account-correction-reversal:${plan.correctionId}:${plan.itemId}`, account:plan.oldAccount, type:"expense-payment-reversal", amount:plan.amount, date:localDateKey(), description:`Payment-account correction reversal: ${plan.item.name}`, expenseId:plan.itemId, reversesEntryId:plan.originalEntryId, source:"payment-account-correction", notes:`Moved payment from ${plan.oldAccount} to ${newAccount}` },
              { id:uid(), transactionId:plan.correctionId, operationId:`payment-account-correction-debit:${plan.correctionId}:${plan.itemId}`, account:newAccount, type:plan.item.autoPaidAtMonthEnd ? "gym-auto-payment" : "expense-payment", amount:-plan.amount, date:localDateKey(), description:`Payment-account correction: ${plan.item.name}`, expenseId:plan.itemId, source:"payment-account-correction", notes:`Corrected from ${plan.oldAccount} to ${newAccount}` }
            );
          }
        }
        if (entries.length) {
          const added = appendLedgerEntries(entries);
          if (added.length !== entries.length) throw Object.assign(new Error("Payment-account correction ledger pair was not created."), { userMessage:"The payment account correction could not be completed. Nothing was changed." });
        }
        plans.forEach(plan => {
          if (plan.deducted) plan.item.paymentTransactionId = plan.correctionId;
          plan.item.paidFromAccount = newAccount;
          plan.item.paymentAccountCorrectedAt = new Date().toISOString();
        });
        return { kind:"payment-account-correction", newAccount, plans:plans.map(plan => ({ itemId:plan.itemId, oldAccount:plan.oldAccount, amount:plan.amount, correctionId:plan.correctionId, deducted:plan.deducted, originalEntryId:plan.originalEntryId })) };
      },
      verify:paidExpenseAccountCorrectionStateErrors
    });
    return transaction.ok ? { ok:true, count:plans.length } : { ok:false, reason:transaction.reason || "transaction-failed", count:0 };
  }

  function reconciliationBatchStateErrors(target, context) {
    const errors = [];
    const reconciliations = Array.isArray(target?.accountReconciliations) ? target.accountReconciliations : [];
    const ledger = Array.isArray(target?.accountLedger) ? target.accountLedger : [];
    for (const item of context.applied || []) {
      const reconciliation = reconciliations.find(candidate => candidate.id === item.reconciliationId);
      const entry = reconciliation ? ledger.find(candidate => candidate.id === reconciliation.ledgerEntryId) : null;
      if (!reconciliation || reconciliation.account !== item.account || roundMoney(reconciliation.statementBalance) !== roundMoney(item.target)) errors.push(`reconciliation-batch-record:${item.account}`);
      if (!entry || entry.reconciliationId !== reconciliation?.id || entry.account !== item.account) errors.push(`reconciliation-batch-ledger:${item.account}`);
    }
    return errors;
  }

  function commitReconciliationBatch(changes, { note = "", message = "Account balances reconciled", undoLabel = "", recordUndo = true } = {}) {
    const normalized = (changes || []).map(item => ({ account:safeText(item?.account, 100), target:roundMoney(Number(item?.target)) })).filter(item => item.account && Number.isFinite(item.target) && Object.prototype.hasOwnProperty.call(data.accounts || {}, item.account));
    const effective = normalized.filter(item => roundMoney(data.accounts[item.account]) !== item.target);
    if (!effective.length) return { ok:true, skipped:true, count:0 };
    const transaction = runLedgerTransaction({
      undoLabel:undoLabel || `Reconcile ${effective.length} account balance${effective.length === 1 ? "" : "s"}`,
      message,
      recordUndo,
      expectedBalances:effective,
      mutate:() => {
        const applied = effective.map(item => {
          const reconciliation = appendReconciliation(item.account, item.target, { note });
          if (!reconciliation) throw Object.assign(new Error(`Could not reconcile ${item.account}.`), { userMessage:`The balance for ${item.account} could not be reconciled. Nothing was changed.` });
          return { account:item.account, target:item.target, reconciliationId:reconciliation.id };
        });
        return { kind:"reconciliation-batch", applied };
      },
      verify:reconciliationBatchStateErrors
    });
    return transaction.ok ? { ok:true, count:effective.length } : { ok:false, reason:transaction.reason || "transaction-failed", count:0 };
  }

  function commitSafeIntegrityRepair({ message = "Safe financial integrity repairs applied" } = {}) {
    const architecture = window.FinanceProfileArchitecture;
    if (architecture?.canWrite?.() === false) return { ok:false, reason:"read-only", count:0 };
    const service = window.FinanceIntegrity;
    if (!service?.repairSafe || !service?.scan) return { ok:false, reason:"integrity-service-unavailable" };
    const planned = service.repairSafe(data);
    if (!planned.ok) return { ok:false, reason:planned.reason || "critical-integrity", report:planned.report };
    if (!planned.changes.length) return { ok:true, skipped:true, count:0, report:planned.report };
    const expectedBalances = Object.entries(planned.data.accounts || {}).map(([account, target]) => ({ account, target:roundMoney(target) }));
    const repairedReconciliations = cloneData(planned.data.accountReconciliations || []);
    const transaction = runLedgerTransaction({
      undoLabel:"Repair safe financial integrity issues",
      message,
      expectedBalances,
      mutate:() => {
        data.accounts = cloneData(planned.data.accounts || {});
        data.accountReconciliations = repairedReconciliations;
        return { kind:"integrity-safe-repair", changed:true, changes:cloneData(planned.changes) };
      },
      verify:target => {
        const report = service.scan(target, { includeStorage:false });
        return report.counts.critical ? report.issues.filter(item => item.severity === "critical").map(item => `integrity:${item.code}`) : [];
      }
    });
    const report = service.scan(data, { includeStorage:true });
    return transaction.ok ? { ok:true, count:planned.changes.length, changes:planned.changes, report } : { ok:false, reason:transaction.reason || "transaction-failed", report };
  }

  function requestLedgerEntries(requestId, types = []) {
    const normalized = safeText(requestId, 160);
    if (!normalized) return [];
    return (data.accountLedger || []).filter(entry => entry.requestId === normalized && (!types.length || types.includes(entry.type)));
  }

  function transferStateErrors(target, context) {
    const entries = (target?.accountLedger || []).filter(entry => entry.transferId === context.transferId);
    const out = entries.find(entry => entry.type === "transfer-out");
    const incoming = entries.find(entry => entry.type === "transfer-in");
    const errors = [];
    if (entries.length !== 2 || !out || !incoming) errors.push("transfer-entry-count");
    if (!out || out.account !== context.from || out.counterpartAccount !== context.to || roundMoney(out.amount) !== roundMoney(-context.amount)) errors.push("transfer-out-invalid");
    if (!incoming || incoming.account !== context.to || incoming.counterpartAccount !== context.from || roundMoney(incoming.amount) !== roundMoney(context.amount)) errors.push("transfer-in-invalid");
    if (out && incoming && out.transactionId !== incoming.transactionId) errors.push("transfer-transaction-mismatch");
    return errors;
  }

  function commitTransfer({ from, to, amount, date = localDateKey(), note = "", idempotencyKey = "" }) {
    amount = roundMoney(Number(amount || 0));
    if (!from || !to || !date || amount <= 0) return { ok:false, reason:"invalid-transfer" };
    if (from === to) return { ok:false, reason:"same-account" };
    if (!Object.prototype.hasOwnProperty.call(data.accounts || {}, from) || !Object.prototype.hasOwnProperty.call(data.accounts || {}, to)) return { ok:false, reason:"missing-account" };
    const requestId = safeText(idempotencyKey, 160);
    if (requestId) {
      const existing = requestLedgerEntries(requestId, ["transfer-out", "transfer-in"]);
      if (existing.length) {
        const out = existing.find(entry => entry.type === "transfer-out");
        const incoming = existing.find(entry => entry.type === "transfer-in");
        const valid = existing.length === 2 && out && incoming && out.account === from && out.counterpartAccount === to && incoming.account === to && incoming.counterpartAccount === from && roundMoney(out.amount) === roundMoney(-amount) && roundMoney(incoming.amount) === amount && out.transferId && out.transferId === incoming.transferId;
        if (!valid) return { ok:false, reason:"idempotency-conflict" };
        return { ok:true, idempotent:true, transferId:out.transferId, from, to, amount, afterFrom:roundMoney(data.accounts[from]), afterTo:roundMoney(data.accounts[to]) };
      }
    }
    const beforeFrom = roundMoney(data.accounts[from]);
    const beforeTo = roundMoney(data.accounts[to]);
    if (beforeFrom < amount) return { ok:false, reason:"insufficient", balance:beforeFrom };
    const transferId = uid();
    const expectedFrom = roundMoney(beforeFrom - amount);
    const expectedTo = roundMoney(beforeTo + amount);
    const transaction = runLedgerTransaction({
      undoLabel:`Transfer ${money(amount)} from ${from} to ${to}`,
      message:`${money(amount)} transferred from ${from} to ${to}`,
      expectedBalances:[{ account:from, target:expectedFrom }, { account:to, target:expectedTo }],
      mutate:() => {
        const added = appendLedgerEntries([
          { id:uid(), transactionId:transferId, operationId:`transfer-out:${transferId}`, requestId, account:from, counterpartAccount:to, type:"transfer-out", amount:-amount, date, description:`Transfer to ${to}`, transferId, source:"transfer", notes:note },
          { id:uid(), transactionId:transferId, operationId:`transfer-in:${transferId}`, requestId, account:to, counterpartAccount:from, type:"transfer-in", amount, date, description:`Transfer from ${from}`, transferId, source:"transfer", notes:note }
        ]);
        if (added.length !== 2) throw Object.assign(new Error("Transfer ledger pair was not created."), { userMessage:"The transfer could not be recorded. Nothing was changed." });
        return { kind:"transfer", requestId, transferId, from, to, amount, expectedFrom, expectedTo };
      },
      verify:transferStateErrors
    });
    return transaction.ok ? { ok:true, transferId, from, to, amount, beforeFrom, beforeTo, afterFrom:expectedFrom, afterTo:expectedTo } : { ok:false, reason:transaction.reason || "transaction-failed" };
  }

  function incomeStateErrors(target, context) {
    const errors = [];
    const records = Array.isArray(target?.incomeRecords) ? target.incomeRecords : [];
    const ledger = Array.isArray(target?.accountLedger) ? target.accountLedger : [];
    const record = records.find(item => item.id === context.id);
    if (context.deleted) {
      if (record) errors.push(`income-delete-record:${context.id}`);
    } else {
      if (!record) errors.push(`income-record-missing:${context.id}`);
      else if (context.postToLedger) {
        const deposits = ledger.filter(entry => entry.transactionId === record.ledgerTransactionId && entry.type === "income-deposit" && entry.incomeId === context.id);
        if (!record.ledgerTransactionId || deposits.length !== 1) errors.push(`income-deposit-count:${context.id}`);
        const deposit = deposits[0];
        if (!deposit || deposit.account !== context.account || roundMoney(deposit.amount) !== roundMoney(context.amount)) errors.push(`income-deposit-invalid:${context.id}`);
      } else if (record?.ledgerTransactionId) errors.push(`income-ledger-flag:${context.id}`);
    }
    if (context.originalTransactionId) {
      const operationId = `income-reversal:${context.id}:${context.originalTransactionId}`;
      const reversal = ledger.find(entry => entry.operationId === operationId && entry.type === "income-deposit-reversal" && entry.incomeId === context.id);
      if (!reversal) errors.push(`income-reversal-missing:${context.id}`);
      if (context.originalDepositId && reversal?.reversesEntryId !== context.originalDepositId) errors.push(`income-reversal-reference:${context.id}`);
    }
    return errors;
  }

  function commitIncomeRecord(recordInput) {
    const input = cloneData(recordInput || {});
    const id = input.id || uid();
    const existing = (data.incomeRecords || []).find(item => item.id === id) || null;
    const postToLedger = Boolean(input.postToLedger);
    if (!input.name || !input.date || !input.account || !Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0) return { ok:false, reason:"invalid-income" };
    if (!Object.prototype.hasOwnProperty.call(data.accounts || {}, input.account)) return { ok:false, reason:"missing-account" };
    const originalTransactionId = existing?.ledgerTransactionId || "";
    const originalDeposit = originalTransactionId ? (data.accountLedger || []).find(entry => entry.transactionId === originalTransactionId && entry.type === "income-deposit" && entry.incomeId === id) : null;
    const record = { ...input, id, ledgerTransactionId:originalTransactionId, postToLedger };
    let savedRecord = null;
    const transaction = runLedgerTransaction({
      undoLabel:existing ? `Edit income ${record.name}` : `Add income ${record.name}`,
      message:postToLedger ? (existing ? "Income updated and account ledger adjusted" : "Income added to account ledger") : (existing ? "Income updated" : "Income added"),
      mutate:() => {
        if (existing?.ledgerTransactionId) reverseIncomeLedger(existing, postToLedger ? "Income was edited and reposted" : "Income posting was removed");
        record.ledgerTransactionId = "";
        if (postToLedger && !postIncomeLedger(record)) throw Object.assign(new Error("Income deposit ledger entry was not created."), { userMessage:"The income could not be added to the account ledger. Nothing was changed." });
        if (existing) Object.assign(existing, record); else data.incomeRecords.push(record);
        savedRecord = existing || record;
        return { kind:"income", id, deleted:false, postToLedger, account:record.account, amount:roundMoney(record.amount), originalTransactionId, originalDepositId:originalDeposit?.id || "", ledgerTransactionId:savedRecord.ledgerTransactionId || "" };
      },
      verify:incomeStateErrors
    });
    return transaction.ok ? { ok:true, record:cloneData(savedRecord) } : { ok:false, reason:transaction.reason || "transaction-failed" };
  }

  function commitIncomeDeletion(id) {
    const item = (data.incomeRecords || []).find(record => record.id === id);
    if (!item) return { ok:false, reason:"missing-income" };
    const originalTransactionId = item.ledgerTransactionId || "";
    const originalDeposit = originalTransactionId ? (data.accountLedger || []).find(entry => entry.transactionId === originalTransactionId && entry.type === "income-deposit" && entry.incomeId === id) : null;
    const transaction = runLedgerTransaction({
      undoLabel:`Delete income ${item.name}`,
      message:originalTransactionId ? "Income deleted and account deposit reversed" : "Income deleted",
      mutate:() => {
        if (originalTransactionId) reverseIncomeLedger(item, "Income record deleted");
        data.incomeRecords = data.incomeRecords.filter(record => record.id !== id);
        return { kind:"income", id, deleted:true, postToLedger:false, account:item.account, amount:roundMoney(item.amount), originalTransactionId, originalDepositId:originalDeposit?.id || "" };
      },
      verify:incomeStateErrors
    });
    return transaction.ok ? { ok:true, id } : { ok:false, reason:transaction.reason || "transaction-failed" };
  }

  function quickSpendStateErrors(target, context) {
    const errors = expensePaymentStateErrors(target, context);
    const expense = (target?.expenses || []).find(item => item.id === context.expenseId);
    if (!expense || expense.quickSpend !== true || expense.quickSpendSource !== "account") errors.push(`quick-spend-record:${context.expenseId}`);
    return errors;
  }

  function commitQuickSpend({ account, amount, description, category = "Personal", date = localDateKey(), note = "", includeInTotals = true, idempotencyKey = "" }) {
    amount = roundMoney(Number(amount || 0));
    if (!Object.prototype.hasOwnProperty.call(data.accounts || {}, account)) return { ok:false, reason:"missing-account" };
    if (amount <= 0) return { ok:false, reason:"invalid-amount" };
    const requestId = safeText(idempotencyKey, 160);
    if (requestId) {
      const existingEntries = requestLedgerEntries(requestId, ["expense-payment"]);
      if (existingEntries.length) {
        const entry = existingEntries[0];
        const expense = (data.expenses || []).find(item => item.id === entry.expenseId && item.quickSpend === true && item.mutationRequestId === requestId);
        const valid = existingEntries.length === 1 && entry.account === account && roundMoney(entry.amount) === roundMoney(-amount) && expense && roundMoney(expense.paidAmount || expense.amount) === amount;
        if (!valid) return { ok:false, reason:"idempotency-conflict", balance:roundMoney(data.accounts[account]) };
        return { ok:true, idempotent:true, expense:cloneData(expense), before:roundMoney(data.accounts[account] + amount), after:roundMoney(data.accounts[account]), transactionId:entry.transactionId };
      }
    }
    const before = roundMoney(data.accounts[account]);
    if (before < amount) return { ok:false, reason:"insufficient", balance:before };
    const expectedAfter = roundMoney(before - amount);
    let expense = null;
    let mutationResult = null;
    const transaction = runLedgerTransaction({
      undoLabel:`Spend ${money(amount)} from ${account}: ${description}`,
      message:`${description} recorded · ${account} ${money(expectedAfter)} remaining`,
      expectedBalances:[{ account, target:expectedAfter }],
      mutate:() => {
        expense = makeQuickSpendExpense({ account, amount, description:safeText(description || "Purchase", 80), category:safeText(category || "Personal", 80), date, note:safeText(note, 160), includeInTotals, requestId });
        data.expenses.push(expense);
        mutationResult = mutateExpensePayment([expense], account, { auto:false, paidDate:date, requestId });
        if (!mutationResult.ok) throw Object.assign(new Error(`Quick spend failed: ${mutationResult.reason || "unknown"}`), { userMessage:"The purchase could not be recorded. Nothing was changed." });
        return { kind:"quick-spend", requestId, auto:false, account, expectedAfter, itemIds:[expense.id], itemAmounts:{ [expense.id]:amount }, transactionId:mutationResult.transactionId, expenseId:expense.id };
      },
      verify:quickSpendStateErrors
    });
    return transaction.ok ? { ok:true, expense:cloneData(expense), before, after:expectedAfter, transactionId:mutationResult.transactionId } : { ok:false, reason:transaction.reason || mutationResult?.reason || "transaction-failed", balance:before };
  }

  function gymBatchStateErrors(target, context) {
    const errors = [];
    const ledger = Array.isArray(target?.accountLedger) ? target.accountLedger : [];
    const expenses = Array.isArray(target?.expenses) ? target.expenses : [];
    for (const id of context.entryIds || []) {
      const entry = ledger.find(candidate => candidate.id === id && candidate.type === "gym-auto-payment");
      if (!entry) { errors.push(`gym-ledger-missing:${id}`); continue; }
      const item = expenses.find(expense => expense.id === entry.expenseId);
      if (!item || !item.paid || !item.accountDeducted || !item.autoPaidAtMonthEnd || item.paymentTransactionId !== entry.transactionId || item.paidFromAccount !== entry.account || roundMoney(item.paidAmount) !== roundMoney(-entry.amount)) errors.push(`gym-payment-state:${entry.expenseId}`);
    }
    for (const id of context.generatedIds || []) if (!expenses.some(expense => expense.id === id)) errors.push(`gym-generated-missing:${id}`);
    return errors;
  }

  function commitGymAutoPayments({ notify = true } = {}) {
    if (typeof originalProcessGymMonthEndAutoPayments !== "function") return { ok:false, reason:"gym-owner-unavailable" };
    const beforeLedgerIds = new Set((data.accountLedger || []).map(entry => entry.id));
    const beforeExpenseIds = new Set((data.expenses || []).map(item => item.id));
    const transaction = runLedgerTransaction({
      message:"Gym auto-payments updated",
      recordUndo:false,
      notify:false,
      mutate:() => {
        globalThis.__financeLedgerMutationInternal = true;
        globalThis.__financeLedgerGymMutationInternal = true;
        try { originalProcessGymMonthEndAutoPayments({ notify:false }); }
        finally {
          globalThis.__financeLedgerGymMutationInternal = false;
          globalThis.__financeLedgerMutationInternal = false;
        }
        const entryIds = (data.accountLedger || []).filter(entry => !beforeLedgerIds.has(entry.id) && entry.type === "gym-auto-payment").map(entry => entry.id);
        const generatedIds = (data.expenses || []).filter(item => !beforeExpenseIds.has(item.id)).map(item => item.id);
        return { kind:"gym-auto-pay", changed:Boolean(entryIds.length || generatedIds.length), entryIds, generatedIds, paidCount:entryIds.length, generatedCount:generatedIds.length };
      },
      verify:gymBatchStateErrors
    });
    if (!transaction.ok) return transaction;
    const context = transaction.context || {};
    if (!transaction.skipped) {
      try { renderAll(false); } catch (error) { console.error("Gym auto-payments were saved but the interface refresh failed.", error); }
    }
    if (notify && context.paidCount) showToast(`${context.paidCount} gym auto-payment${context.paidCount === 1 ? "" : "s"} processed`);
    else if (notify && context.generatedCount) showToast(`${context.generatedCount} recurring gym expense${context.generatedCount === 1 ? "" : "s"} prepared`, "info");
    return { ok:true, changed:!transaction.skipped, ...context };
  }

  if (originalProcessGymMonthEndAutoPayments) {
    processGymMonthEndAutoPayments = function ledgerGymAutoPayments(options = {}) { return commitGymAutoPayments(options); };
  }

  function setAccountSpendStatus(state = "", message = "") {
    const status = document.getElementById("accountSpendStatus");
    if (!status) return;
    status.dataset.state = state || "idle";
    status.textContent = message || "";
    status.hidden = !message;
  }

  function setModeControlsDisabled(root, disabled) {
    if (!root) return;
    root.querySelectorAll("input, select, textarea, button").forEach(control => {
      control.disabled = Boolean(disabled);
      if (disabled) control.dataset.modeDisabled = "true"; else delete control.dataset.modeDisabled;
    });
  }

  function accountSpendPrimaryButton() {
    return document.getElementById("accountPrimaryAction") || document.querySelector('#accountForm .account-dialog-footer .button-primary');
  }

  function bindAccountSpendControls(panel) {
    if (!panel || panel.dataset.spendControlsBound === "true") return;
    panel.dataset.spendControlsBound = "true";
    const amount = panel.querySelector("#accountSpendAmount");
    if (amount) {
      amount.dataset.numericBound = "simple";
      amount.maxLength = 80;
      amount.addEventListener("input", () => { setFieldError(amount, ""); setAccountSpendStatus(); updateAccountSpendPreview(); });
      amount.addEventListener("blur", () => { if (String(amount.value || "").trim()) formatMoneyInput(amount, false); updateAccountSpendPreview(); });
    }
    ["accountSpendDescription","accountSpendNote"].forEach(id => document.getElementById(id)?.addEventListener("input", () => { setAccountSpendStatus(); updateAccountSpendPreview(); }));
    ["accountSpendCategory","accountSpendDate","accountSpendIncludeTotals"].forEach(id => document.getElementById(id)?.addEventListener("change", () => { setAccountSpendStatus(); updateAccountSpendPreview(); }));
    document.getElementById("accountCorrectModeButton")?.addEventListener("click", () => setAccountDialogMode("correct", { focus:true }));
    document.getElementById("accountSpendModeButton")?.addEventListener("click", () => {
      resetAccountSpendForm(document.getElementById("originalAccountName")?.value || "");
      setAccountDialogMode("spend", { focus:true });
    });
    panel.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      submitAccountSpending();
    });
  }

  function bindAccountSpendPrimaryAction() {
    const primary = accountSpendPrimaryButton();
    if (!primary || primary.dataset.spendPrimaryBound === "true") return;
    primary.dataset.spendPrimaryBound = "true";
    primary.id = "accountPrimaryAction";
    primary.addEventListener("click", event => {
      if (document.getElementById("accountDialog")?.dataset.accountMode !== "spend") return;
      event.preventDefault();
      event.stopPropagation();
      submitAccountSpending();
    });
  }

  function ensureAccountSpendUi() {
    const dialog = document.getElementById("accountDialog");
    const form = document.getElementById("accountForm");
    if (!dialog || !form || document.getElementById("accountModeSwitch")) return;
    const body = dialog.querySelector(".modal-body");
    const grid = body?.querySelector(".form-grid");
    const context = body?.querySelector(".dialog-context-note");
    if (!body || !grid) return;
    grid.id = "accountMaintenanceFields";
    const switcher = document.createElement("div");
    switcher.className = "account-mode-switch";
    switcher.id = "accountModeSwitch";
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", "Account action");
    switcher.innerHTML = `
      <button class="account-mode-button" id="accountCorrectModeButton" type="button" data-account-mode="correct" aria-pressed="true">${CORRECT_ICON}<span><strong>Correct account balance</strong><small>Use when the displayed balance is wrong.</small></span></button>
      <button class="account-mode-button" id="accountSpendModeButton" type="button" data-account-mode="spend" aria-pressed="false">${SPEND_ICON}<span><strong>Record spending</strong><small>Use when you bought or paid for something.</small></span></button>`;
    if (context?.nextSibling) body.insertBefore(switcher, context.nextSibling); else body.insertBefore(switcher, grid);

    const panel = document.createElement("section");
    panel.id = "accountSpendPanel";
    panel.className = "account-spend-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="account-spend-summary">
        <div class="account-spend-summary-copy"><span>Payment account</span><strong id="accountSpendAccountName">N/A</strong></div>
        <div class="account-spend-summary-balance"><span>Current balance</span><strong id="accountSpendCurrentBalance">N/A</strong></div>
      </div>
      <div class="account-spend-grid">
        <div class="field"><label for="accountSpendAmount">Amount spent <span class="required-mark" aria-hidden="true">*</span></label><input class="input" id="accountSpendAmount" type="text" inputmode="decimal" autocomplete="off" data-money-input placeholder="0.00"></div>
        <div class="field"><label for="accountSpendDescription">What you bought / description <span class="required-mark" aria-hidden="true">*</span></label><input class="input" id="accountSpendDescription" maxlength="80" placeholder="Example: Lunch"></div>
        <div class="field"><label for="accountSpendCategory">Category <span class="required-mark" aria-hidden="true">*</span></label><select class="select" id="accountSpendCategory"></select></div>
        <div class="field"><label for="accountSpendDate">Date <span class="required-mark" aria-hidden="true">*</span></label><input class="input" id="accountSpendDate" type="date"></div>
        <div class="field field-full"><label for="accountSpendNote">Note <span class="muted-label">(optional)</span></label><input class="input" id="accountSpendNote" maxlength="160" placeholder="Example: Jollibee SM City"></div>
        <label class="account-spend-total-choice field-full" for="accountSpendIncludeTotals"><input id="accountSpendIncludeTotals" type="checkbox" checked><span><strong>Include in calculated totals</strong><small>Included by default in expenses and Money Remaining.</small></span></label>
      </div>
      <div class="account-spend-preview" id="accountSpendPreview" aria-live="polite">${SPEND_ICON}<p id="accountSpendPreviewText">Enter an amount to preview this purchase.</p><strong class="account-spend-preview-balance" id="accountSpendAfterBalance">N/A</strong></div>
      <div class="account-spend-status" id="accountSpendStatus" role="status" aria-live="polite" hidden></div>`;
    grid.insertAdjacentElement("afterend", panel);
    bindAccountSpendControls(panel);
    bindAccountSpendPrimaryAction();
    const dialogClose = () => { dialog.dataset.accountMode = "correct"; accountSpendSubmitPending = false; };
    dialog.addEventListener("close", dialogClose);
  }

  function fillSpendCategories() {
    const select = document.getElementById("accountSpendCategory");
    if (!select) return;
    const values = typeof categoryValues === "function" ? categoryValues(false) : ["Bills","Rent","Loans","Groceries","Utilities","Subscriptions","Transport","Project Costs","Personal","Health & Fitness","Other"];
    const previous = select.value;
    select.innerHTML = values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    else if ([...select.options].some(option => option.value === "Personal")) select.value = "Personal";
  }

  function resetAccountSpendForm(account) {
    fillSpendCategories();
    setMoneyInputValue("accountSpendAmount", "", true);
    const description = document.getElementById("accountSpendDescription");
    const date = document.getElementById("accountSpendDate");
    const note = document.getElementById("accountSpendNote");
    const include = document.getElementById("accountSpendIncludeTotals");
    if (description) description.value = "";
    if (date) date.value = localDateKey();
    if (note) note.value = "";
    if (include) include.checked = true;
    const dialog = document.getElementById("accountDialog");
    if (dialog) dialog.dataset.spendRequestId = uid();
    setAccountSpendStatus();
    const name = document.getElementById("accountSpendAccountName");
    if (name) name.textContent = account || "N/A";
    updateAccountSpendPreview();
  }

  function setAccountDialogMode(mode = "correct", { focus = false } = {}) {
    ensureAccountSpendUi();
    bindAccountSpendPrimaryAction();
    const dialog = document.getElementById("accountDialog");
    const editing = Boolean(document.getElementById("originalAccountName")?.value);
    const next = editing && mode === "spend" ? "spend" : "correct";
    dialog.dataset.accountMode = next;
    const title = document.getElementById("accountDialogTitle");
    if (title) title.textContent = next === "spend" ? "Record spending" : (editing ? "Edit account" : "Add account");
    const switcher = document.getElementById("accountModeSwitch");
    if (switcher) switcher.hidden = !editing;
    const maintenance = document.getElementById("accountMaintenanceFields");
    const spend = document.getElementById("accountSpendPanel");
    if (maintenance) maintenance.hidden = next === "spend";
    if (spend) spend.hidden = next !== "spend";
    setModeControlsDisabled(maintenance, next === "spend");
    setModeControlsDisabled(spend, next !== "spend");
    document.getElementById("accountCorrectModeButton")?.setAttribute("aria-pressed", String(next === "correct"));
    document.getElementById("accountSpendModeButton")?.setAttribute("aria-pressed", String(next === "spend"));
    const primary = accountSpendPrimaryButton();
    if (primary) {
      primary.type = next === "spend" ? "button" : "submit";
      primary.textContent = next === "spend" ? "Record spending" : "Save account";
      primary.disabled = false;
    }
    const deleteButton = document.getElementById("deleteAccountFromDialog");
    if (deleteButton) deleteButton.hidden = next === "spend" || !editing;
    const note = dialog.querySelector(".dialog-context-note");
    if (note) note.textContent = next === "spend" ? "This purchase will be deducted once and automatically added to Paid Expenses." : (editing ? "Correct the balance only when the displayed amount does not match the real account." : "The starting amount becomes this account’s opening-balance ledger entry.");
    if (next === "spend") updateAccountSpendPreview(); else setAccountSpendStatus();
    accountSpendSubmitPending = false;
    setTrackedFormBaseline?.("accountDialog");
    const body = dialog.querySelector(".modal-body");
    if (body) {
      body.scrollTop = 0;
      body.scrollLeft = 0;
    }
    if (focus) setTimeout(() => {
      const target = document.getElementById(next === "spend" ? "accountSpendAmount" : "accountName");
      const phone = matchMedia("(max-width: 700px)").matches;
      target?.focus(phone ? { preventScroll:true } : undefined);
      if (phone && body) {
        body.scrollTop = 0;
        body.scrollLeft = 0;
      }
    }, 0);
  }

  function updateAccountSpendPreview() {
    const account = document.getElementById("originalAccountName")?.value || "";
    const exists = account && Object.prototype.hasOwnProperty.call(data.accounts || {}, account);
    const current = exists ? roundMoney(data.accounts[account]) : 0;
    const amount = Math.max(0, Number(moneyInputValue("accountSpendAmount") || 0));
    const after = roundMoney(current - amount);
    const currentEl = document.getElementById("accountSpendCurrentBalance");
    const afterEl = document.getElementById("accountSpendAfterBalance");
    const preview = document.getElementById("accountSpendPreview");
    const text = document.getElementById("accountSpendPreviewText");
    if (currentEl) currentEl.textContent = exists ? money(current) : "N/A";
    if (afterEl) afterEl.textContent = exists && amount > 0 ? `After: ${money(after)}` : "N/A";
    const invalid = !exists || amount <= 0 || after < 0;
    preview?.classList.toggle("is-warning", Boolean(amount > 0 && invalid));
    if (!text) return;
    if (!exists) text.textContent = "This account no longer exists.";
    else if (amount <= 0) text.textContent = "Enter an amount to preview this purchase.";
    else if (after < 0) text.innerHTML = `Insufficient balance. ${escapeHtml(account)} is short by <strong>${money(Math.abs(after))}</strong>.`;
    else text.innerHTML = `This will deduct <strong>${money(amount)}</strong> from ${escapeHtml(account)} and create a <strong>Paid Expense</strong>.`;
  }

  function makeQuickSpendExpense({ account, amount, description, category, date, note, includeInTotals, requestId = "" }) {
    const id = uid();
    return {
      id, expenseType:"normal", name:description, amount, dailyRate:null, electricBillAmount:null, waterBillAmount:null,
      gymPricePerVisit:null, gymDays:[], gymSeriesPricePerVisit:null, gymSeriesDays:[], gymDateOverrides:{added:[],removed:[]}, gymVisitCount:0,
      expensePeriod:"other", budgetPeriod:"", date, dueDay:null, category, account, recurring:"No", seriesId:"", includeInTotals:Boolean(includeInTotals), notes:note,
      paid:false, paidDate:"", paidFromAccount:"", paidAmount:0, accountDeducted:false, paymentTransactionId:"", autoPaidAtMonthEnd:false,
      gymAutoPay:false, gymAutoPayAccount:"", gymAutoPaySuppressed:false, quickSpend:true, quickSpendSource:"account", mutationRequestId:safeText(requestId, 160), icon:null
    };
  }

  function submitAccountSpending() {
    if (accountSpendSubmitPending) return false;
    const account = document.getElementById("originalAccountName")?.value || "";
    const amountInput = document.getElementById("accountSpendAmount");
    const descriptionInput = document.getElementById("accountSpendDescription");
    const categoryInput = document.getElementById("accountSpendCategory");
    const dateInput = document.getElementById("accountSpendDate");
    [amountInput, descriptionInput, categoryInput, dateInput].forEach(input => input && setFieldError(input, ""));
    setAccountSpendStatus();
    if (!account || !Object.prototype.hasOwnProperty.call(data.accounts || {}, account)) { setAccountSpendStatus("error", "This account no longer exists."); showToast("This account no longer exists", "warning"); return false; }
    if (!validateMoneyInput(amountInput, { required:true, min:.01, message:"Enter an amount greater than zero." })) { setAccountSpendStatus("error", "Enter an amount greater than zero."); return false; }
    const amount = roundMoney(moneyInputValue(amountInput));
    const description = String(descriptionInput?.value || "").trim().replace(/\s+/g, " ");
    const category = String(categoryInput?.value || "").trim();
    const date = String(dateInput?.value || "");
    const note = String(document.getElementById("accountSpendNote")?.value || "").trim();
    const includeInTotals = Boolean(document.getElementById("accountSpendIncludeTotals")?.checked);
    if (!description) { setFieldError(descriptionInput, "Enter what you bought or paid for."); descriptionInput?.focus(); setAccountSpendStatus("error", "Enter what you bought or paid for."); return false; }
    if (!category) { setFieldError(categoryInput, "Choose a category."); categoryInput?.focus(); setAccountSpendStatus("error", "Choose a category."); return false; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setFieldError(dateInput, "Choose the purchase date."); dateInput?.focus(); setAccountSpendStatus("error", "Choose the purchase date."); return false; }
    const balance = roundMoney(data.accounts[account]);
    if (amount > balance) { setFieldError(amountInput, `Available balance is ${money(balance)}.`); updateAccountSpendPreview(); amountInput?.focus(); setAccountSpendStatus("error", `${account} has insufficient funds for this purchase.`); return false; }

    const primary = accountSpendPrimaryButton();
    accountSpendSubmitPending = true;
    if (primary) { primary.disabled = true; primary.textContent = "Recording…"; }
    setAccountSpendStatus("working", "Recording purchase…");
    const requestId = document.getElementById("accountDialog")?.dataset.spendRequestId || uid();
    const result = commitQuickSpend({ account, amount, description, category, date, note, includeInTotals, idempotencyKey:requestId });
    accountSpendSubmitPending = false;
    if (!result.ok) {
      if (primary) { primary.disabled = false; primary.textContent = "Record spending"; }
      const message = result.reason === "read-only" ? "This Viewer profile is read-only." : "The purchase could not be recorded. Your records were left unchanged.";
      setAccountSpendStatus("error", message);
      return false;
    }
    refreshReconciledAccountState(account, result.after);
    setAccountSpendStatus("success", `${description} recorded successfully · ${account} ${money(result.after)} remaining.`);
    closeTrackedFormAfterAction("accountDialog");
    return true;
  }

  function bindPersistentSpendActionDelegation() {
    if (document.documentElement.dataset.accountSpendDelegated === "true") return;
    document.documentElement.dataset.accountSpendDelegated = "true";
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-spend-account]");
      if (!button) return;
      event.preventDefault();
      const account = button.dataset.spendAccount || "";
      openAccountSpendDialog(account);
    });
  }

  function openAccountSpendDialog(account) {
    if (!account || !Object.prototype.hasOwnProperty.call(data.accounts || {}, account)) return showToast("This account no longer exists", "warning");
    openAccountDialog(account);
    resetAccountSpendForm(account);
    setAccountDialogMode("spend", { focus:true });
  }

  openAccountDialog = function ledgerOpenAccountDialog(name = "") {
    ensureAccountSpendUi();
    originalOpenAccountDialog(name);
    const editing = Boolean(name);
    const label = document.querySelector('#accountDialog label[for="accountBalance"]');
    const help = document.getElementById("accountBalanceHelp");
    if (label) label.textContent = editing ? "Correct account balance" : "Opening balance";
    if (help) help.textContent = editing ? "Use only when the displayed balance is wrong. The difference is recorded as a reconciliation adjustment." : "The starting amount becomes this account’s opening-balance ledger entry.";
    resetAccountSpendForm(name);
    setAccountDialogMode("correct");
  };

  openIncomeDialog = function ledgerOpenIncomeDialog(item = null) {
    originalOpenIncomeDialog(item);
    const checkbox = document.getElementById("incomePostToLedger");
    if (checkbox) checkbox.checked = item ? Boolean(item.ledgerTransactionId) : true;
    syncIncomeCategoryFields();
  };

  syncIncomeCategoryFields = function ledgerSyncIncomeCategoryFields() {
    originalSyncIncomeCategoryFields();
    const transfer = document.getElementById("incomeCategory")?.value === "Transfer from savings";
    const checkbox = document.getElementById("incomePostToLedger");
    const field = document.getElementById("incomePostToLedgerField");
    if (checkbox) {
      checkbox.disabled = transfer;
      if (transfer) checkbox.checked = false;
    }
    field?.classList.toggle("is-transfer", transfer);
  };

  function injectLedgerUi() {
    if (document.getElementById("accountLedgerCard")) return;
    const panel = document.getElementById("settings-panel-accounts");
    if (!panel) return;
    const accountForm = document.getElementById("accountsForm");
    const accountCard = accountForm?.closest("article.card") || null;
    if (accountCard) {
      const heading = accountCard.querySelector("h3");
      if (heading) {
        const headingText = [...heading.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
        if (headingText) headingText.textContent = "Update account balances";
        else heading.prepend(document.createTextNode("Update account balances"));
      }
      const copy = accountCard.querySelector(".card-header p");
      if (copy) copy.textContent = "Enter the balances shown by your bank, wallet, or cash count. Any difference is safely recorded.";
      const submit = accountForm.querySelector('button[type="submit"]');
      if (submit) submit.textContent = "Save account updates";
      if (!accountForm.querySelector(".ledger-reconcile-note")) accountForm.insertAdjacentHTML("afterbegin", '<p class="system-help ledger-reconcile-note">Saving a different balance records an adjustment so earlier account activity stays available.</p>');
    }

    const ledgerCard = document.createElement("article");
    ledgerCard.className = "card account-ledger-card";
    ledgerCard.id = "accountLedgerCard";
    ledgerCard.innerHTML = `
      <div class="card-header"><div><h3>Account ledger</h3><p>Every balance change, transfer, payment, and reconciliation</p></div><div class="ledger-header-actions"><button class="button button-primary button-small" id="openTransferDialog" type="button">Transfer money</button><button class="button button-secondary button-small" id="exportLedgerCsv" type="button">Export CSV</button></div></div>
      <div class="ledger-summary-grid"><div><span>Ledger entries</span><strong id="ledgerEntryCount">0</strong></div><div><span>Transfers</span><strong id="ledgerTransferCount">0</strong></div><div><span>Reconciliations</span><strong id="ledgerReconciliationCount">0</strong></div><div><span>Calculated accounts</span><strong id="ledgerAccountCount">0</strong></div></div>
      <div class="ledger-filter-grid"><div class="field"><label for="ledgerAccountFilter">Account</label><select class="select" id="ledgerAccountFilter"></select></div><div class="field"><label for="ledgerTypeFilter">Activity type</label><select class="select" id="ledgerTypeFilter"><option value="">All activity</option>${[...LEDGER_TYPES].map(type => `<option value="${type}">${LEDGER_LABELS[type]}</option>`).join("")}</select></div><div class="field ledger-search-field"><label for="ledgerSearch">Search</label><input class="input" id="ledgerSearch" placeholder="Description or note"></div></div>
      <div class="table-scroll"><table class="responsive-table ledger-table"><thead><tr><th>Date</th><th>Account</th><th>Activity</th><th>Description</th><th>Change</th><th>Balance after</th></tr></thead><tbody id="accountLedgerBody"></tbody></table></div>
      <p class="system-help">Ledger entries are append-only. Corrections create reversal or reconciliation entries so earlier activity remains traceable.</p>`;

    const reconciliationCard = document.createElement("article");
    reconciliationCard.className = "card account-reconciliation-card";
    reconciliationCard.id = "accountReconciliationCard";
    reconciliationCard.innerHTML = `
      <div class="card-header"><div><h3>Reconciliation history</h3><p>Recorded differences between the app and actual account statements</p></div><button class="button button-secondary button-small" id="exportReconciliationsCsv" type="button">Export CSV</button></div>
      <div class="table-scroll"><table class="responsive-table reconciliation-table"><thead><tr><th>Date</th><th>Account</th><th>Before</th><th>Actual</th><th>Difference</th><th>Note</th></tr></thead><tbody id="accountReconciliationBody"></tbody></table></div>`;
    panel.append(ledgerCard, reconciliationCard);
    window.simplifyAccountLedgerSettings?.(panel, ledgerCard, reconciliationCard);

    document.querySelector("#incomeDialog .income-account-helper")?.replaceChildren(document.createTextNode("When enabled below, saving the income adds it to this account’s ledger balance."));
    const incomeTotalsField = document.getElementById("incomeIncludeTotalsField");
    if (incomeTotalsField && !document.getElementById("incomePostToLedgerField")) incomeTotalsField.insertAdjacentHTML("beforebegin", '<label class="expense-total-choice income-total-choice" id="incomePostToLedgerField" for="incomePostToLedger"><input id="incomePostToLedger" type="checkbox" checked><span><strong>Add to account balance</strong><small>Creates a traceable income-deposit entry in the selected account ledger.</small></span></label>');

    if (!document.getElementById("accountTransferDialog")) document.body.insertAdjacentHTML("beforeend", `
      <dialog id="accountTransferDialog" class="app-dialog dialog-form dialog-standard" aria-labelledby="accountTransferDialogTitle">
        <form id="accountTransferForm">
          <div class="modal-header"><h3 id="accountTransferDialogTitle">Transfer money</h3><button type="button" class="button button-secondary button-small" data-close-ledger-dialog="accountTransferDialog">Close</button></div>
          <div class="modal-body"><p class="required-note"><span class="required-mark">*</span> Required fields</p><div class="dialog-context-note">A transfer creates two linked ledger entries and does not count as income or an expense.</div><div class="form-grid">
            <div class="field"><label for="transferFromAccount">From account <span class="required-mark">*</span></label><select class="select" id="transferFromAccount" required></select></div>
            <div class="field"><label for="transferToAccount">To account <span class="required-mark">*</span></label><select class="select" id="transferToAccount" required></select></div>
            <div class="field"><label for="transferAmount">Amount <span class="required-mark">*</span></label><div class="calculator-input-shell"><input class="input" id="transferAmount" type="text" inputmode="decimal" autocomplete="off" data-money-input data-min="0.01" required placeholder="0.00"></div></div>
            <div class="field"><label for="transferDate">Transfer date <span class="required-mark">*</span></label><input class="input" id="transferDate" type="date" required></div>
            <div class="field field-full"><label for="transferNote">Note</label><textarea class="textarea" id="transferNote" rows="2" maxlength="240" placeholder="Optional transfer reference"></textarea></div>
            <div class="ledger-transfer-preview field-full" id="transferPreview" aria-live="polite"></div>
          </div></div>
          <div class="modal-footer form-action-footer"><span class="footer-spacer"></span><button type="button" class="button button-secondary" data-close-ledger-dialog="accountTransferDialog">Cancel</button><button type="submit" class="button button-primary" id="saveTransferButton">Transfer money</button></div>
        </form>
      </dialog>`);
    setupNumericInputs(document);
  }

  function ledgerRowsWithBalances() {
    const balances = {};
    return [...(data.accountLedger || [])]
      .sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)))
      .map(entry => {
        balances[entry.account] = roundMoney((balances[entry.account] || 0) + Number(entry.amount || 0));
        return { entry, balanceAfter:balances[entry.account] };
      });
  }

  function renderLedgerWorkspace() {
    injectLedgerUi();
    if (!document.getElementById("accountLedgerBody")) return;
    ensureLedgerShape(data);
    const accountFilter = document.getElementById("ledgerAccountFilter");
    const savedAccount = accountFilter.value;
    const activeAndHistorical = [...new Set([...accountNames(), ...(data.accountLedger || []).map(entry => entry.account)])].sort((a,b) => a.localeCompare(b));
    accountFilter.innerHTML = `<option value="">All accounts</option>${activeAndHistorical.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
    if (activeAndHistorical.includes(savedAccount)) accountFilter.value = savedAccount;
    const type = document.getElementById("ledgerTypeFilter")?.value || "";
    const search = document.getElementById("ledgerSearch")?.value.trim().toLowerCase() || "";
    const rows = ledgerRowsWithBalances().filter(({entry}) => !accountFilter.value || entry.account === accountFilter.value).filter(({entry}) => !type || entry.type === type).filter(({entry}) => !search || `${entry.description} ${entry.notes} ${entry.account} ${entry.counterpartAccount}`.toLowerCase().includes(search)).reverse().slice(0, 300);
    document.getElementById("accountLedgerBody").innerHTML = rows.length ? rows.map(({entry,balanceAfter}) => `<tr><td data-label="Date">${formatDate(entry.date)}</td><td data-label="Account">${escapeHtml(entry.account)}</td><td data-label="Activity"><span class="status-badge ${entry.amount >= 0 ? "status-saved" : "status-excluded"}">${escapeHtml(LEDGER_LABELS[entry.type] || entry.type)}</span></td><td data-label="Description"><strong>${escapeHtml(entry.description)}</strong>${entry.counterpartAccount ? `<small>${entry.amount < 0 ? "To" : "From"}: ${escapeHtml(entry.counterpartAccount)}</small>` : ""}${entry.notes ? `<small>${escapeHtml(entry.notes)}</small>` : ""}</td><td data-label="Change" class="amount ${entry.amount >= 0 ? "text-green" : "text-red"}">${entry.amount >= 0 ? "+" : "−"}${money(Math.abs(entry.amount))}</td><td data-label="Balance after" class="amount">${money(balanceAfter)}</td></tr>`).join("") : `<tr><td colspan="6"><div class="system-empty">No ledger activity matches these filters.</div></td></tr>`;
    const reconciliations = [...(data.accountReconciliations || [])].sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100);
    document.getElementById("accountReconciliationBody").innerHTML = reconciliations.length ? reconciliations.map(item => `<tr><td data-label="Date">${formatDate(item.date)}</td><td data-label="Account">${escapeHtml(item.account)}</td><td data-label="Before">${money(item.previousBalance)}</td><td data-label="Actual">${money(item.statementBalance)}</td><td data-label="Difference" class="amount ${item.difference >= 0 ? "text-green" : "text-red"}">${item.difference >= 0 ? "+" : "−"}${money(Math.abs(item.difference))}</td><td data-label="Note">${escapeHtml(item.note || "Balance reconciliation")}</td></tr>`).join("") : `<tr><td colspan="6"><div class="system-empty">No reconciliations recorded yet.</div></td></tr>`;
    document.getElementById("ledgerEntryCount").textContent = String((data.accountLedger || []).length);
    document.getElementById("ledgerTransferCount").textContent = String(new Set((data.accountLedger || []).filter(entry => entry.transferId).map(entry => entry.transferId)).size);
    document.getElementById("ledgerReconciliationCount").textContent = String((data.accountReconciliations || []).length);
    document.getElementById("ledgerAccountCount").textContent = String(accountNames().length);
  }

  function openTransferDialog() {
    const from = document.getElementById("transferFromAccount");
    const to = document.getElementById("transferToAccount");
    const options = accountNames().map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)} · ${money(data.accounts[name])}</option>`).join("");
    from.innerHTML = options;
    to.innerHTML = options;
    from.value = accountNames()[0] || "";
    to.value = accountNames()[1] || accountNames()[0] || "";
    setMoneyInputValue("transferAmount", "", true);
    document.getElementById("transferDate").value = localDateKey();
    document.getElementById("transferNote").value = "";
    const dialog = document.getElementById("accountTransferDialog");
    if (dialog) dialog.dataset.transferRequestId = uid();
    updateTransferPreview();
    showAppDialog("accountTransferDialog", "#transferFromAccount");
  }

  function updateTransferPreview() {
    const from = document.getElementById("transferFromAccount")?.value || "";
    const to = document.getElementById("transferToAccount")?.value || "";
    const amount = moneyInputValue("transferAmount") || 0;
    const fromBalance = Number(data.accounts?.[from] || 0);
    const preview = document.getElementById("transferPreview");
    if (!preview) return;
    preview.innerHTML = `<div><span>Source balance</span><strong>${from ? money(fromBalance) : "N/A"}</strong></div><div><span>After transfer</span><strong class="${amount > fromBalance ? "text-red" : ""}">${from ? money(fromBalance - amount) : "N/A"}</strong></div><div><span>Destination receives</span><strong class="text-green">${to ? money(amount) : "N/A"}</strong></div>`;
  }

  function submitTransfer() {
    const from = document.getElementById("transferFromAccount").value;
    const to = document.getElementById("transferToAccount").value;
    const date = document.getElementById("transferDate").value;
    if (!validateMoneyInput("transferAmount", { required:true, min:.01, message:"Enter a transfer amount greater than zero." })) return false;
    const amount = roundMoney(moneyInputValue("transferAmount"));
    if (!from || !to || !date) { showToast("Complete all required transfer fields", "warning"); return false; }
    if (from === to) { showToast("Choose two different accounts", "warning"); return false; }
    const requestId = document.getElementById("accountTransferDialog")?.dataset.transferRequestId || uid();
    const result = commitTransfer({ from, to, amount, date, note:document.getElementById("transferNote").value.trim(), idempotencyKey:requestId });
    if (!result.ok) {
      if (result.reason === "insufficient") showToast(`${from} has insufficient funds for this transfer`, "warning");
      else if (result.reason === "missing-account") showToast("One of the transfer accounts no longer exists", "warning");
      else if (result.reason === "idempotency-conflict") showToast("This transfer request no longer matches the saved transaction. Reopen the transfer form and try again.", "warning");
      return false;
    }
    document.getElementById("accountTransferDialog").close();
    try { renderAll(false); } catch (error) { console.error("Transfer was saved but the interface refresh failed.", error); }
    return true;
  }

  function submitAccountForm() {
    const originalName = document.getElementById("originalAccountName").value;
    const newName = document.getElementById("accountName").value.trim();
    if (!validateMoneyInput("accountBalance", { required:false, min:0, message:"Enter a valid account balance of zero or more." })) return false;
    const balanceInput = document.getElementById("accountBalance").value.trim();
    const targetBalance = balanceInput === "" ? 0 : moneyInputValue("accountBalance");
    const type = ACCOUNT_TYPES.includes(document.getElementById("accountType").value) ? document.getElementById("accountType").value : "Other";
    if (!newName || !Number.isFinite(targetBalance)) { showToast("Enter a valid account name and balance", "warning"); return false; }
    const duplicate = accountNames().some(name => name.toLowerCase() === newName.toLowerCase() && name !== originalName);
    if (duplicate) { showToast("An account with this name already exists", "warning"); return false; }
    const archivedNames = Object.keys(data.ledgerSettings?.archivedAccounts || {});
    const archivedName = archivedNames.find(name => name.toLowerCase() === newName.toLowerCase());
    if (archivedName && archivedName !== originalName) {
      showToast("That name is reserved for archived ledger history. Choose a different account name.", "warning");
      return false;
    }

    const saved = runAccountMutation({
      undoLabel:originalName ? `Edit account ${originalName}` : `Add account ${newName}`,
      message:originalName ? "Account updated and reconciled" : "Account added with opening balance",
      expectedBalances:[{ account:newName, target:targetBalance }],
      mutate:() => {
        const existingOrder = accountNames();
        if (originalName && originalName !== newName) {
          renameAccountReferences(originalName, newName);
          data.accountOrder = existingOrder.map(name => name === originalName ? newName : name);
          data.accounts[newName] = Number(data.accounts[originalName] || 0);
          delete data.accounts[originalName];
          data.accountTypes[newName] = data.accountTypes[originalName];
          delete data.accountTypes[originalName];
          if (data.accountIcons?.[originalName]) { data.accountIcons[newName] = data.accountIcons[originalName]; delete data.accountIcons[originalName]; }
          if (data.savingsSettings?.defaultAccount === originalName) data.savingsSettings.defaultAccount = newName;
        }
        data.accounts[newName] = Number(data.accounts[newName] || 0);
        data.accountTypes[newName] = type;
        data.accountIcons = data.accountIcons || {};
        const accountIcon = pickerIcon("account");
        if (accountIcon) data.accountIcons[newName] = accountIcon; else delete data.accountIcons[newName];
        if (!originalName && !data.accountOrder.includes(newName)) data.accountOrder.push(newName);
        if (!originalName) {
          const openingId = `opening:${uid()}`;
          appendLedgerEntries([{ id:uid(), transactionId:openingId, operationId:openingId, account:newName, type:"opening-balance", amount:targetBalance, date:localDateKey(), description:`Opening balance for ${newName}`, source:"account-create" }]);
        } else appendReconciliation(newName, targetBalance, { note:"Balance changed from Edit account" });
        if (type !== "Savings") (data.savingsGoals || []).forEach(goal => { if (goal.sourceType === "linked" && goal.linkedAccount === newName) { goal.sourceType = "manual"; goal.currentAmount = Number(data.accounts[newName] || 0); goal.linkedAccount = ""; goal.updatedAt = new Date().toISOString(); } });
        if (type === "Savings" && !data.savingsSettings.defaultAccount) data.savingsSettings.defaultAccount = newName;
        if (type !== "Savings" && data.savingsSettings.defaultAccount === newName) data.savingsSettings.defaultAccount = "";
      }
    });
    if (!saved) return false;
    closeTrackedFormAfterAction("accountDialog");
    refreshReconciledAccountState(newName, targetBalance);
    return true;
  }

  function submitAccountsReconciliationForm() {
    const accountInputs = [...document.querySelectorAll(".account-input")];
    for (const input of accountInputs) if (!validateMoneyInput(input, { required:false, min:0, message:"Enter a balance of zero or more." })) return false;
    const changes = accountInputs.map(input => ({ account:input.dataset.account, target:moneyInputValue(input) })).filter(item => roundMoney(data.accounts[item.account]) !== roundMoney(item.target));
    const typeChanges = [...document.querySelectorAll(".account-type-input")].filter(select => accountType(select.dataset.accountType) !== select.value);
    if (!changes.length && !typeChanges.length) { showToast("Account balances already match the entered values", "info"); return false; }

    const saved = runAccountMutation({
      undoLabel:"Reconcile account balances",
      message:`${changes.length} account balance${changes.length === 1 ? "" : "s"} reconciled`,
      expectedBalances:changes.map(item => ({ account:item.account, target:item.target })),
      mutate:() => {
        typeChanges.forEach(select => { data.accountTypes[select.dataset.accountType] = ACCOUNT_TYPES.includes(select.value) ? select.value : "Other"; });
        changes.forEach(item => appendReconciliation(item.account, item.target, { note:"Balances form reconciliation" }));
        (data.savingsGoals || []).forEach(goal => { if (goal.sourceType === "linked" && accountType(goal.linkedAccount) !== "Savings") { goal.currentAmount = Number(data.accounts[goal.linkedAccount] || goal.currentAmount || 0); goal.sourceType = "manual"; goal.linkedAccount = ""; goal.updatedAt = new Date().toISOString(); } });
        if (data.savingsSettings.defaultAccount && accountType(data.savingsSettings.defaultAccount) !== "Savings") data.savingsSettings.defaultAccount = "";
      }
    });
    if (saved) {
      try { renderAll(false); } catch (error) { console.error("Account balances were saved but Settings refresh failed.", error); }
    }
    return saved;
  }

  function submitIncomeForm() {
    if (!validateMoneyInput("incomeAmount", {required:true,min:.01,message:"Enter an income amount greater than zero."})) return false;
    const rawCategory=document.getElementById("incomeCategory").value;
    let category=rawCategory;
    if (INCOME_OTHER_CATEGORIES.has(rawCategory)) {
      category=document.getElementById("incomeCustomCategory").value.trim();
      if(!category || !/[A-Za-z0-9]/.test(category)) { setFieldError(document.getElementById("incomeCustomCategory"),"Enter a clear category name."); document.getElementById("incomeCustomCategory").focus(); return false; }
    }
    const id=document.getElementById("incomeId").value;
    const existing=(data.incomeRecords||[]).find(item=>item.id===id);
    const recurring=document.getElementById("incomeRecurring").checked?"Monthly":"No";
    const categoryGroup = rawCategory === "Other wages" ? "Wages" : (rawCategory === "Transfer from savings" ? "Internal transfer" : (rawCategory === "Other income" ? "Other income" : incomeCategoryGroup(rawCategory)));
    const recordId = id || uid();
    const postToLedger = rawCategory !== "Transfer from savings" && Boolean(document.getElementById("incomePostToLedger")?.checked);
    const record={ id:recordId, name:document.getElementById("incomeName").value.trim(), amount:moneyInputValue("incomeAmount"), date:document.getElementById("incomeDate").value, category, categoryGroup, account:document.getElementById("incomeAccount").value, recurring, seriesId:existing?.seriesId || (recurring==="Monthly"?`income-series-${recordId}`:""), includeInTotals:category==="Transfer from savings"?false:document.getElementById("incomeIncludeInTotals").checked, notes:document.getElementById("incomeNotes").value.trim(), icon:pickerIcon("income"), ledgerTransactionId:existing?.ledgerTransactionId || "", postToLedger };
    if(!record.name || !record.date || !record.account) { showToast("Complete all required income fields", "warning"); return false; }
    const result = commitIncomeRecord(record);
    if (!result.ok) return false;
    closeTrackedFormAfterAction("incomeDialog");
    try { renderAll(false); } catch (error) { console.error("Income was saved but the interface refresh failed.", error); }
    return true;
  }

  async function deleteIncomeRecord(button) {
    const id=button.dataset.deleteIncome;
    const item=(data.incomeRecords||[]).find(record=>record.id===id);
    if(!item) return false;
    const confirmed=await openAppConfirmation({title:"Delete income?",message:`Delete “${item.name}”?`,details:`${money(item.amount)} · ${item.category}${item.ledgerTransactionId ? " · its account deposit will be reversed" : ""}`,confirmLabel:"Delete income",danger:true});
    if(!confirmed) return false;
    const result = commitIncomeDeletion(id);
    if (!result.ok) return false;
    closeTrackedFormAfterAction("incomeDialog");
    try { renderAll(false); } catch (error) { console.error("Income deletion was saved but the interface refresh failed.", error); }
    return true;
  }

  async function deleteAccountSafely(button) {
    const name = button.dataset.deleteAccount;
    if (!name) return false;
    if (accountNames().length <= 1) { showToast("Keep at least one account", "warning"); return false; }
    const balance = roundMoney(data.accounts[name]);
    if (balance !== 0) { showToast(`Transfer or reconcile ${name} to ₱0.00 before deleting it. Current balance: ${money(balance)}`, "warning"); return false; }
    const deductedPayments = data.expenses.filter(item => item.paid && item.accountDeducted && item.paidFromAccount === name).length;
    if (deductedPayments) { showToast(`Move ${deductedPayments} paid expense${deductedPayments === 1 ? "" : "s"} back to unpaid before deleting ${name}.`, "warning"); return false; }
    const confirmed = await openAppConfirmation({ title:"Delete zero-balance account?", message:`Delete “${name}”?`, details:"Historical ledger entries remain available for audit, but the account will no longer appear in selectors.", confirmLabel:"Delete account", danger:true });
    if (!confirmed) return false;
    const saved = runAccountMutation({
      undoLabel:`Delete account ${name}`,
      message:"Zero-balance account deleted; ledger history preserved",
      mutate:() => {
        data.ledgerSettings = data.ledgerSettings && typeof data.ledgerSettings === "object" ? data.ledgerSettings : {};
        const archivedAccounts = data.ledgerSettings.archivedAccounts && typeof data.ledgerSettings.archivedAccounts === "object" ? data.ledgerSettings.archivedAccounts : {};
        data.ledgerSettings.archivedAccounts = {
          ...archivedAccounts,
          [name]: { deletedAt:new Date().toISOString(), source:"account-deletion", inferred:false }
        };
        (data.savingsGoals || []).forEach(goal => { if (goal.sourceType === "linked" && goal.linkedAccount === name) { goal.sourceType = "manual"; goal.currentAmount = 0; goal.linkedAccount = ""; goal.updatedAt = new Date().toISOString(); } });
        delete data.accounts[name];
        delete data.accountTypes[name];
        if (data.accountIcons) delete data.accountIcons[name];
        data.accountOrder = accountNames().filter(accountName => accountName !== name);
        if (data.savingsSettings?.defaultAccount === name) data.savingsSettings.defaultAccount = "";
      }
    });
    if (!saved) return false;
    if (button.closest("#accountDialog")) closeTrackedFormAfterAction("accountDialog");
    try { renderAll(false); } catch (error) { console.error("Account deletion was saved but the interface refresh failed.", error); }
    return true;
  }

  function exportLedgerCsv() {
    const rows = [["Date","Account","Activity Type","Description","Change","Counterpart Account","Transaction ID","Operation ID","Expense ID","Income ID","Transfer ID","Reconciliation ID","Notes"], ...(data.accountLedger || []).map(entry => [entry.date,entry.account,LEDGER_LABELS[entry.type] || entry.type,entry.description,entry.amount,entry.counterpartAccount,entry.transactionId,entry.operationId,entry.expenseId,entry.incomeId,entry.transferId,entry.reconciliationId,entry.notes])];
    exportCsv(`account-ledger-${localDateKey()}.csv`, rows);
  }

  function exportReconciliationsCsv() {
    const rows = [["Date","Account","Balance Before","Actual Statement Balance","Difference","Note","Ledger Entry ID"], ...(data.accountReconciliations || []).map(item => [item.date,item.account,item.previousBalance,item.statementBalance,item.difference,item.note,item.ledgerEntryId])];
    exportCsv(`account-reconciliations-${localDateKey()}.csv`, rows);
  }

  document.addEventListener("submit", event => {
    if (event.target?.id === "accountForm" && document.getElementById("accountDialog")?.dataset.accountMode !== "spend") { event.preventDefault(); event.stopImmediatePropagation(); submitAccountForm(); }
    else if (event.target?.id === "accountsForm") { event.preventDefault(); event.stopImmediatePropagation(); submitAccountsReconciliationForm(); }
    else if (event.target?.id === "incomeForm") { event.preventDefault(); event.stopImmediatePropagation(); submitIncomeForm(); }
    else if (event.target?.id === "accountTransferForm") { event.preventDefault(); event.stopImmediatePropagation(); submitTransfer(); }
  }, true);

  document.addEventListener("click", event => {
    const deleteIncome = event.target.closest("#deleteIncomeFromDialog");
    const deleteAccount = event.target.closest("[data-delete-account]");
    const openTransfer = event.target.closest("#openTransferDialog");
    const closeDialog = event.target.closest("[data-close-ledger-dialog]");
    const exportLedger = event.target.closest("#exportLedgerCsv");
    const exportReconciliations = event.target.closest("#exportReconciliationsCsv");
    if (deleteIncome) { event.preventDefault(); event.stopImmediatePropagation(); deleteIncomeRecord(deleteIncome); }
    else if (deleteAccount) { event.preventDefault(); event.stopImmediatePropagation(); deleteAccountSafely(deleteAccount); }
    else if (openTransfer) openTransferDialog();
    else if (closeDialog) document.getElementById(closeDialog.dataset.closeLedgerDialog)?.close();
    else if (exportLedger) exportLedgerCsv();
    else if (exportReconciliations) exportReconciliationsCsv();
  }, true);

  document.addEventListener("input", event => {
    if (["transferAmount","transferFromAccount","transferToAccount"].includes(event.target?.id)) updateTransferPreview();
    if (["ledgerSearch"].includes(event.target?.id)) renderLedgerWorkspace();
  });
  document.addEventListener("change", event => {
    if (["transferFromAccount","transferToAccount","ledgerAccountFilter","ledgerTypeFilter"].includes(event.target?.id)) {
      if (String(event.target.id).startsWith("transfer")) updateTransferPreview();
      else renderLedgerWorkspace();
    }
  });

  ensureAccountSpendUi();
  bindPersistentSpendActionDelegation();
  injectLedgerUi();
  try { commitGymAutoPayments({ notify:false }); } catch (error) { console.error("Gym auto-payment hardening bootstrap failed.", error); }
  if (ledgerMigrationChanged) {
    if (typeof persistFinanceDataRaw === "function") persistFinanceDataRaw("Account ledger migrated");
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  renderAll(false);

  window.FinanceLedgerTransactions = Object.freeze({
    version:1,
    owner:"account-ledger-v1",
    capabilities:{ unifiedMoneyMutations:true, centralizedOwnership:true, transactionalPersistence:true, localVerification:true, profileVerification:true, ledgerInvariants:true, domainInvariants:true, rollback:true, idempotentRequests:true, externalPayments:true, paymentAccountCorrection:true, reconciliationBatch:true, integrityRepair:true },
    run:runLedgerTransaction,
    transfer:commitTransfer,
    payExpenses:commitExpensePayment,
    reverseExpensePayment:commitExpensePaymentReversal,
    markExpensesPaidExternally:commitExternalExpensePayment,
    correctPaidExpenseAccounts:commitPaidExpenseAccountCorrection,
    reconcileAccounts:commitReconciliationBatch,
    repairSafeIntegrity:commitSafeIntegrityRepair,
    quickSpend:commitQuickSpend,
    saveIncome:commitIncomeRecord,
    deleteIncome:commitIncomeDeletion,
    processGymAutoPayments:commitGymAutoPayments,
    invariantReport:moneyMutationInvariantReport,
    prepareLegacyImport
  });

  window.FinanceAccountMutations = {
    version:1,
    owner:"account-ledger-v1",
    capabilities:{ singleOwner:true, transactionalPersistence:true, invariantChecks:true, profileVerification:true, failClosedFallback:true, unifiedMoneyEngine:true },
    submitAccountForm,
    submitAccountsReconciliationForm,
    deleteAccountSafely,
    run:runAccountMutation,
    invariantReport:(expectedBalances = []) => accountMutationInvariantReport(expectedBalances, data)
  };

  window.FinanceAccountLedger = {
    version:LEDGER_VERSION,
    releaseVersion:"13.0.13",
    capabilities:{ accountSpending:true, verifiedSpendSubmit:true, persistentSpendActions:true, transactionalSpend:true, isolatedSpendAction:true, accountReconciliationOwner:true, transactionalAccountCorrection:true, profileVerifiedAccountCorrection:true, singleAccountMutationOwner:true, accountMutationInvariants:true, unifiedMoneyTransactions:true },
    recalculateBalances,
    appendLedgerEntries,
    appendReconciliation,
    submitAccountForm,
    submitAccountsReconciliationForm,
    openSpend:openAccountSpendDialog,
    submitSpend:submitAccountSpending,
    recordSpend:commitQuickSpend,
    render:renderLedgerWorkspace,
    get entries() { return cloneData(data.accountLedger || []); },
    get reconciliations() { return cloneData(data.accountReconciliations || []); }
  };
})();
