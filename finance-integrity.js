"use strict";
(function financeIntegrityBootstrap(root) {
  const VERSION = 1;
  const EPSILON = 0.005;

  function clone(value) {
    try { return structuredClone(value); } catch (error) {}
    try { return JSON.parse(JSON.stringify(value)); } catch (error) { return value; }
  }
  function roundMoney(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
  function finiteMoney(value) { return Number.isFinite(Number(value)); }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function issue(severity, code, message, details = {}, repair = null) {
    return { severity, code, message, details:clone(details), repair:repair ? clone(repair) : null };
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function own(target, key) { return Boolean(target && Object.prototype.hasOwnProperty.call(target, key)); }
  function accountName(value) { return String(value || "").trim().slice(0, 100); }
  function archivedStore(target) {
    const accounts = asObject(target?.accounts);
    const settings = asObject(target?.ledgerSettings);
    const source = asObject(settings.archivedAccounts);
    const archived = {};
    Object.entries(source).forEach(([rawName, value]) => {
      const name = accountName(rawName);
      if (!name || own(accounts, name)) return;
      archived[name] = value && typeof value === "object" && !Array.isArray(value) ? { ...value } : { inferred:Boolean(value) };
    });
    target.ledgerSettings = { ...settings, archivedAccounts:archived };
    return archived;
  }
  function isArchivedAccount(target, account) {
    const name = accountName(account);
    return Boolean(name && !own(asObject(target?.accounts), name) && own(asObject(target?.ledgerSettings?.archivedAccounts), name));
  }
  function archiveLegacyAccountReferences(target, ledger) {
    if (!target || typeof target !== "object") return [];
    const accounts = asObject(target.accounts);
    const archived = archivedStore(target);
    const byAccount = new Map();
    asArray(ledger).forEach(entry => {
      const account = accountName(entry?.account);
      if (!account) return;
      if (!byAccount.has(account)) byAccount.set(account, []);
      byAccount.get(account).push(entry);
    });
    const candidates = new Set(byAccount.keys());
    asArray(target.expenses).forEach(item => { const account = item?.paid && item.accountDeducted ? accountName(item.paidFromAccount) : ""; if (account && !own(accounts, account)) candidates.add(account); });
    const inferred = [];
    candidates.forEach(account => {
      if (own(accounts, account) || own(archived, account)) return;
      const entries = byAccount.get(account) || [];
      const net = entries.reduce((total, entry) => total + Number(entry?.amount || 0), 0);
      if (!entries.length || !Number.isFinite(net) || Math.abs(net) >= EPSILON) return;
      archived[account] = { deletedAt:"", source:"legacy-import", inferred:true };
      inferred.push(account);
    });
    target.ledgerSettings.archivedAccounts = archived;
    return inferred;
  }
  function financialProjection(value) {
    const source = asObject(value);
    return {
      accounts:asObject(source.accounts),
      accountLedger:asArray(source.accountLedger),
      accountReconciliations:asArray(source.accountReconciliations),
      expenses:asArray(source.expenses).map(item => ({
        id:item?.id || "", paid:Boolean(item?.paid), accountDeducted:Boolean(item?.accountDeducted),
        paidFromAccount:item?.paidFromAccount || "", paidAmount:Number(item?.paidAmount || 0), paymentTransactionId:item?.paymentTransactionId || "",
        autoPaidAtMonthEnd:Boolean(item?.autoPaidAtMonthEnd)
      })),
      incomeRecords:asArray(source.incomeRecords).map(item => ({
        id:item?.id || "", account:item?.account || "", amount:Number(item?.amount || 0), postToLedger:Boolean(item?.postToLedger), ledgerTransactionId:item?.ledgerTransactionId || ""
      }))
    };
  }
  function currentProfileId() {
    try { return String(root.FinanceProfileArchitecture?.activeProfileId?.() || "profile-personal"); } catch (error) { return "profile-personal"; }
  }
  function readStored(key) {
    try {
      const raw = root.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }
  function storageIssues(source) {
    if (!root.localStorage) return [];
    const active = readStored("simple-finance-project-records-v2");
    const profile = readStored(`simple-finance-profile-data-v1:${currentProfileId()}`);
    const issues = [];
    if (active && profile && stable(financialProjection(active)) !== stable(financialProjection(profile))) {
      issues.push(issue("warning", "storage-profile-mismatch", "The active local finance copy and active profile copy do not match.", { profileId:currentProfileId() }));
    }
    if (active && source && stable(financialProjection(active)) !== stable(financialProjection(source))) {
      issues.push(issue("warning", "runtime-storage-mismatch", "The current runtime finance state does not match the active local copy."));
    }
    return issues;
  }

  function scan(source, { includeStorage = false } = {}) {
    const target = asObject(source);
    const accounts = asObject(target.accounts);
    const ledger = asArray(target.accountLedger);
    const reconciliations = asArray(target.accountReconciliations);
    const expenses = asArray(target.expenses);
    const incomes = asArray(target.incomeRecords);
    const issues = [];
    const archivedAccounts = asObject(target.ledgerSettings?.archivedAccounts);
    // Deleted accounts remain valid ledger namespaces for audit history. They
    // are deliberately excluded from the active balance map, selectors, and
    // available-money totals, but their historical entries must not be treated
    // as broken references during import or sync verification.
    const accountNames = new Set([...Object.keys(accounts), ...Object.keys(archivedAccounts)]);
    const ledgerById = new Map();
    const ledgerByTransaction = new Map();
    const operationIds = new Set();
    const requestTransactions = new Map();
    const calculated = Object.fromEntries(Object.keys(accounts).map(name => [name, 0]));
    const hasLedgerHistory = ledger.length > 0;

    for (const [name, balance] of Object.entries(accounts)) {
      if (!finiteMoney(balance)) issues.push(issue("critical", "invalid-account-balance", `Account “${name}” has an invalid balance.`, { account:name, value:balance }));
    }

    for (const entry of ledger) {
      if (!entry || typeof entry !== "object") {
        issues.push(issue("critical", "invalid-ledger-entry", "Account Ledger contains an invalid entry."));
        continue;
      }
      const id = String(entry.id || "");
      const operationId = String(entry.operationId || "");
      const account = String(entry.account || "");
      const transactionId = String(entry.transactionId || "");
      if (!id) issues.push(issue("critical", "missing-ledger-id", "A ledger entry is missing its ID.", { operationId }));
      else if (ledgerById.has(id)) issues.push(issue("critical", "duplicate-ledger-id", `Ledger entry ID “${id}” is duplicated.`, { id }));
      else ledgerById.set(id, entry);
      if (!operationId) issues.push(issue("warning", "missing-operation-id", "A ledger entry is missing its operation ID.", { id }));
      else if (operationIds.has(operationId)) issues.push(issue("critical", "duplicate-operation-id", `Ledger operation “${operationId}” is duplicated.`, { operationId }));
      else operationIds.add(operationId);
      if (!finiteMoney(entry.amount)) issues.push(issue("critical", "invalid-ledger-amount", `Ledger entry “${id || operationId || "unknown"}” has an invalid amount.`, { id, amount:entry.amount }));
      if (!accountNames.has(account)) issues.push(issue("critical", "ledger-account-missing", `Ledger entry references missing account “${account || "unknown"}”.`, { id, account }));
      else if (finiteMoney(entry.amount)) calculated[account] = roundMoney(calculated[account] + Number(entry.amount));
      if (transactionId) {
        if (!ledgerByTransaction.has(transactionId)) ledgerByTransaction.set(transactionId, []);
        ledgerByTransaction.get(transactionId).push(entry);
      }
      const requestId = String(entry.requestId || "");
      if (requestId) {
        if (!requestTransactions.has(requestId)) requestTransactions.set(requestId, new Set());
        requestTransactions.get(requestId).add(transactionId || id || operationId);
      }
    }

    if (!hasLedgerHistory && Object.keys(accounts).length && Number(target?.ledgerSettings?.version || 0) < 1) {
      issues.push(issue("warning", "legacy-ledger-migration", "This dataset predates Account Ledger initialization and will use the existing opening-balance migration."));
    }
    if (hasLedgerHistory) {
      for (const [account, balance] of Object.entries(accounts)) {
        if (!finiteMoney(balance) || !finiteMoney(calculated[account])) continue;
        const targetBalance = roundMoney(calculated[account]);
        if (Math.abs(roundMoney(balance) - targetBalance) >= EPSILON) {
          issues.push(issue("safe-repair", "ledger-balance-mismatch", `Cached balance for “${account}” does not match Account Ledger.`, { account, stored:roundMoney(balance), ledger:targetBalance }, { type:"recalculate-account", account, target:targetBalance }));
        }
      }
    }

    for (const reconciliation of reconciliations) {
      if (!reconciliation || typeof reconciliation !== "object") {
        issues.push(issue("critical", "invalid-reconciliation", "Account reconciliation history contains an invalid record."));
        continue;
      }
      const id = String(reconciliation.id || "");
      const account = String(reconciliation.account || "");
      const linkedId = String(reconciliation.ledgerEntryId || "");
      let linked = linkedId ? ledgerById.get(linkedId) : null;
      if (!linked) {
        const candidates = ledger.filter(entry => entry?.reconciliationId === id && entry?.account === account);
        if (candidates.length === 1) {
          linked = candidates[0];
          issues.push(issue("safe-repair", "reconciliation-link-missing", `Reconciliation “${id || account}” can be relinked to its unambiguous ledger entry.`, { reconciliationId:id, account }, { type:"relink-reconciliation", reconciliationId:id, ledgerEntryId:String(linked.id || "") }));
        } else {
          issues.push(issue("critical", "broken-reconciliation", `Reconciliation “${id || account}” does not have a valid ledger link.`, { reconciliationId:id, account, candidates:candidates.length }));
          continue;
        }
      }
      if (linked.account !== account || linked.reconciliationId !== id || linked.type !== "reconciliation-adjustment") {
        issues.push(issue("critical", "reconciliation-ledger-mismatch", `Reconciliation “${id || account}” does not match its ledger entry.`, { reconciliationId:id, ledgerEntryId:linked.id }));
      }
      if (!finiteMoney(reconciliation.difference) || !finiteMoney(linked.amount) || roundMoney(reconciliation.difference) !== roundMoney(linked.amount)) {
        issues.push(issue("critical", "reconciliation-amount-mismatch", `Reconciliation “${id || account}” amount does not match Account Ledger.`, { reconciliationId:id }));
      }
    }

    const transferGroups = new Map();
    for (const entry of ledger.filter(item => item?.type === "transfer-out" || item?.type === "transfer-in")) {
      const transferId = String(entry.transferId || "");
      if (!transferId) {
        issues.push(issue("critical", "transfer-id-missing", "A transfer ledger entry is missing its transfer ID.", { ledgerEntryId:entry.id || "" }));
        continue;
      }
      if (!transferGroups.has(transferId)) transferGroups.set(transferId, []);
      transferGroups.get(transferId).push(entry);
    }
    for (const [transferId, entries] of transferGroups) {
      const outgoing = entries.filter(entry => entry.type === "transfer-out");
      const incoming = entries.filter(entry => entry.type === "transfer-in");
      if (entries.length !== 2 || outgoing.length !== 1 || incoming.length !== 1) {
        issues.push(issue("critical", "transfer-pair-incomplete", `Transfer “${transferId}” does not have exactly one outgoing and one incoming ledger entry.`, { transferId, count:entries.length }));
        continue;
      }
      const out = outgoing[0], inc = incoming[0];
      if (String(out.transactionId || "") !== String(inc.transactionId || "") || roundMoney(Number(out.amount || 0) + Number(inc.amount || 0)) !== 0 || Number(out.amount) >= 0 || Number(inc.amount) <= 0 || out.counterpartAccount !== inc.account || inc.counterpartAccount !== out.account) {
        issues.push(issue("critical", "transfer-pair-mismatch", `Transfer “${transferId}” has mismatched ledger sides.`, { transferId }));
      }
    }

    for (const expense of expenses) {
      if (!expense || typeof expense !== "object") continue;
      const id = String(expense.id || "");
      const paid = Boolean(expense.paid);
      const deducted = Boolean(expense.accountDeducted);
      const transactionId = String(expense.paymentTransactionId || "");
      const paidAccount = String(expense.paidFromAccount || "");
      const paidAmount = Number(expense.paidAmount || 0);
      if (paid && deducted) {
        const entries = asArray(ledgerByTransaction.get(transactionId)).filter(entry => entry?.expenseId === id && ["expense-payment", "gym-auto-payment"].includes(entry?.type));
        if (!transactionId || entries.length !== 1) {
          issues.push(issue("critical", "expense-payment-ledger-missing", `Paid expense “${expense.name || id}” does not have exactly one payment debit.`, { expenseId:id, transactionId, count:entries.length }));
        } else {
          const debit = entries[0];
          if (!paidAccount || debit.account !== paidAccount || !finiteMoney(paidAmount) || roundMoney(debit.amount) !== roundMoney(-paidAmount)) {
            issues.push(issue("critical", "expense-payment-mismatch", `Paid expense “${expense.name || id}” does not match its payment ledger debit.`, { expenseId:id, ledgerEntryId:debit.id || "" }));
          }
        }
      }
      if (!paid && (deducted || paidAccount || transactionId || Math.abs(paidAmount) >= EPSILON)) {
        issues.push(issue("warning", "unpaid-expense-payment-state", `Unpaid expense “${expense.name || id}” still contains payment state.`, { expenseId:id }));
      }
    }

    for (const reversal of ledger.filter(entry => entry?.type === "expense-payment-reversal")) {
      const originalId = String(reversal.reversesEntryId || "");
      if (!originalId) {
        issues.push(issue("warning", "legacy-payment-reversal-link", "A payment reversal has no link to its original debit.", { ledgerEntryId:reversal.id || "" }));
        continue;
      }
      const original = ledgerById.get(originalId);
      if (!original || !["expense-payment", "gym-auto-payment"].includes(original.type) || original.expenseId !== reversal.expenseId || original.account !== reversal.account || roundMoney(Number(original.amount || 0) + Number(reversal.amount || 0)) !== 0) {
        issues.push(issue("critical", "payment-reversal-mismatch", "A payment reversal does not match its original payment debit.", { ledgerEntryId:reversal.id || "", reversesEntryId:originalId }));
      }
    }

    for (const income of incomes) {
      if (!income || typeof income !== "object" || (!income.postToLedger && !income.ledgerTransactionId)) continue;
      const id = String(income.id || "");
      const transactionId = String(income.ledgerTransactionId || "");
      const deposits = asArray(ledgerByTransaction.get(transactionId)).filter(entry => entry?.type === "income-deposit" && entry?.incomeId === id);
      if (!transactionId || deposits.length !== 1) {
        issues.push(issue("critical", "income-deposit-ledger-missing", `Posted income “${income.name || id}” does not have exactly one active deposit.`, { incomeId:id, transactionId, count:deposits.length }));
        continue;
      }
      const deposit = deposits[0];
      if (deposit.account !== income.account || roundMoney(deposit.amount) !== roundMoney(income.amount)) {
        issues.push(issue("critical", "income-deposit-mismatch", `Posted income “${income.name || id}” does not match its ledger deposit.`, { incomeId:id, ledgerEntryId:deposit.id || "" }));
      }
    }

    for (const [requestId, transactions] of requestTransactions) {
      if (transactions.size > 1) issues.push(issue("critical", "idempotency-request-conflict", `Request ID “${requestId}” is reused by multiple financial transactions.`, { requestId, transactions:[...transactions] }));
    }

    if (includeStorage) issues.push(...storageIssues(target));
    const counts = {
      critical:issues.filter(item => item.severity === "critical").length,
      warning:issues.filter(item => item.severity === "warning").length,
      safeRepair:issues.filter(item => item.severity === "safe-repair").length
    };
    return { version:VERSION, ok:counts.critical === 0, issues, counts, checkedAt:new Date().toISOString() };
  }

  function repairSafe(source) {
    const before = scan(source, { includeStorage:false });
    if (before.counts.critical) return { ok:false, data:clone(source), changes:[], report:before, reason:"critical-issues" };
    const next = clone(asObject(source));
    next.accounts = asObject(next.accounts);
    next.accountReconciliations = asArray(next.accountReconciliations);
    const changes = [];
    for (const item of before.issues.filter(candidate => candidate.severity === "safe-repair" && candidate.repair)) {
      const repair = item.repair;
      if (repair.type === "recalculate-account" && Object.prototype.hasOwnProperty.call(next.accounts, repair.account)) {
        next.accounts[repair.account] = roundMoney(repair.target);
        changes.push({ type:repair.type, account:repair.account, target:roundMoney(repair.target) });
      } else if (repair.type === "relink-reconciliation") {
        const reconciliation = next.accountReconciliations.find(candidate => candidate?.id === repair.reconciliationId);
        if (reconciliation && repair.ledgerEntryId) {
          reconciliation.ledgerEntryId = repair.ledgerEntryId;
          changes.push({ type:repair.type, reconciliationId:repair.reconciliationId, ledgerEntryId:repair.ledgerEntryId });
        }
      }
    }
    const report = scan(next, { includeStorage:false });
    return { ok:report.counts.critical === 0, data:next, changes, report };
  }

  function summary(report) {
    const counts = report?.counts || { critical:0, warning:0, safeRepair:0 };
    if (counts.critical) return `${counts.critical} critical · ${counts.warning} review · ${counts.safeRepair} safe repair`;
    if (counts.warning || counts.safeRepair) return `${counts.warning} review · ${counts.safeRepair} safe repair`;
    return "No financial integrity issues found";
  }

  root.FinanceIntegrity = Object.freeze({ version:VERSION, scan, repairSafe, summary, financialProjection, isArchivedAccount, archiveLegacyAccountReferences });
})(typeof window !== "undefined" ? window : globalThis);
