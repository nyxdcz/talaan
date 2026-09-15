"use strict";

/* My Finance Records V12.24.0 · Quick Entry & Productivity.
   Adds universal quick entry, synchronized expense templates, global search,
   advanced filters, bulk corrections, multi-step undo history, recent records,
   account suggestions, Mac keyboard shortcuts, and iPhone bottom-sheet forms. */
(function productivityToolsBootstrap() {
  const PRODUCTIVITY_VERSION = 1;
  const ACTIVITY_KEY = "simple-finance-productivity-activity-v1";
  const UNDO_HISTORY_KEY = "simple-finance-productivity-undo-history-v1";
  const FILTER_KEY = "simple-finance-productivity-filters-v1";
  const MAX_ACTIVITY = 60;
  const MAX_UNDO = 12;
  const ARRAY_COLLECTIONS = ["expenses", "incomeRecords", "projects", "savingsGoals", "accountLedger", "accountReconciliations", "expenseTemplates", "budgetTemplates"];
  const MAP_COLLECTIONS = ["monthlyBudgets"];
  const COLLECTION_META = {
    expenses:{label:"Expense",page:"money"},
    incomeRecords:{label:"Income",page:"income"},
    projects:{label:"Project",page:"projects"},
    savingsGoals:{label:"Savings goal",page:"dashboard"},
    accountLedger:{label:"Ledger entry",page:"settings"},
    accountReconciliations:{label:"Reconciliation",page:"settings"},
    expenseTemplates:{label:"Expense template",page:"money"},
    budgetTemplates:{label:"Budget template",page:"income"},
    monthlyBudgets:{label:"Monthly budget",page:"income"},
    accounts:{label:"Account",page:"settings"}
  };

  const clone = value => {
    try { return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
    catch (error) { return JSON.parse(JSON.stringify(value || {})); }
  };
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const attr = esc;
  const nowIso = () => new Date().toISOString();
  const safeJson = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (error) { return fallback; }
  };
  const writeJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { return false; }
  };
  const makeId = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  const compactText = (value, limit = 120) => String(value || "").trim().slice(0, limit);
  const parseAmount = value => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const cleaned = String(value || "").replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const monthName = month => {
    try { return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-PH", {month:"long",year:"numeric"}); }
    catch (error) { return month || "Selected month"; }
  };

  async function confirmProductivityAction(options) {
    if (typeof openAppConfirmation === "function") return openAppConfirmation(options);
    return window.confirm(`${options.title || "Confirm"}\n\n${options.message || ""}`);
  }

  function requestProductivityText({ title, label, value = "", confirmLabel = "Save" }) {
    return new Promise(resolve => {
      const returnFocus = document.activeElement;
      const dialog = document.createElement("dialog");
      dialog.className = "modal app-dialog productivity-text-dialog";
      dialog.innerHTML = `<form method="dialog"><div class="modal-header"><h3>${esc(title)}</h3><button class="button button-secondary button-small" type="button" data-productivity-prompt-cancel>Cancel</button></div><div class="modal-body"><label class="field"><span>${esc(label)}</span><input class="input" data-productivity-prompt-input maxlength="80" autocomplete="off"></label><p class="field-error" data-productivity-prompt-error hidden></p></div><div class="modal-footer"><button class="button button-secondary" type="button" data-productivity-prompt-cancel>Cancel</button><button class="button button-primary" type="submit">${esc(confirmLabel)}</button></div></form>`;
      document.body.appendChild(dialog);
      const input = dialog.querySelector("[data-productivity-prompt-input]");
      const error = dialog.querySelector("[data-productivity-prompt-error]");
      input.value = String(value || "");
      let settled = false;
      const finish = result => { if (settled) return; settled = true; if (dialog.open) dialog.close(); dialog.remove(); returnFocus?.focus?.(); resolve(result); };
      dialog.querySelectorAll("[data-productivity-prompt-cancel]").forEach(button => button.addEventListener("click", () => finish(null)));
      dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
      dialog.querySelector("form").addEventListener("submit", event => { event.preventDefault(); const next=input.value.trim(); if(!next){error.hidden=false;error.textContent=`Enter ${String(label || "a value").toLowerCase()}.`;input.focus();return;} finish(next); });
      dialog.showModal();
      requestAnimationFrame(() => { input.focus(); input.select(); });
    });
  }

  function normalizeTemplate(item) {
    if (!item || typeof item !== "object") return null;
    const id = compactText(item.id || makeId("expense-template"), 120);
    const name = compactText(item.name || item.expenseName || "Expense template", 80);
    const expenseType = ["normal","utility","budget","gym"].includes(item.expenseType) ? item.expenseType : "normal";
    return {
      ...item,
      id,
      name,
      expenseName:compactText(item.expenseName || item.name || "", 80),
      expenseType,
      amount:Math.max(0, parseAmount(item.amount)),
      dailyRate:Math.max(0, parseAmount(item.dailyRate)),
      electricBillAmount:Math.max(0, parseAmount(item.electricBillAmount)),
      waterBillAmount:Math.max(0, parseAmount(item.waterBillAmount)),
      gymPricePerVisit:Math.max(0, parseAmount(item.gymPricePerVisit || 80)),
      gymDays:Array.isArray(item.gymDays) ? [...new Set(item.gymDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))] : [1,2,4,5],
      expensePeriod:["first","second","other"].includes(item.expensePeriod) ? item.expensePeriod : "first",
      dueDay:Number.isInteger(Number(item.dueDay)) ? Number(item.dueDay) : null,
      category:compactText(item.category || (expenseType === "gym" ? "Health & Fitness" : expenseType === "budget" ? "Reserved Budget" : "Bills"), 40),
      account:compactText(item.account || "", 100),
      recurring:Boolean(item.recurring),
      includeInTotals:item.includeInTotals !== false,
      gymAutoPay:Boolean(item.gymAutoPay),
      gymAutoPayAccount:compactText(item.gymAutoPayAccount || "", 100),
      icon:item.icon && typeof item.icon === "object" ? clone(item.icon) : null,
      createdAt:item.createdAt || nowIso(),
      updatedAt:item.updatedAt || item.createdAt || nowIso()
    };
  }

  function ensureProductivityShape(value) {
    const target = value && typeof value === "object" ? value : {};
    const seen = new Set();
    target.expenseTemplates = (Array.isArray(target.expenseTemplates) ? target.expenseTemplates : [])
      .map(normalizeTemplate)
      .filter(item => item && !seen.has(item.id) && seen.add(item.id))
      .slice(0, 80);
    target.productivitySettings = {
      version:PRODUCTIVITY_VERSION,
      enabled:true,
      shortcuts:true,
      ...(target.productivitySettings && typeof target.productivitySettings === "object" ? target.productivitySettings : {})
    };
    return target;
  }

  const baseNormalizeData = normalizeData;
  normalizeData = function productivityNormalizeData(value) {
    return ensureProductivityShape(baseNormalizeData(value));
  };
  data = ensureProductivityShape(data);
  try { if (typeof persistFinanceDataRaw === "function") persistFinanceDataRaw("Productivity tools initialized"); else localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (error) {}

  let activity = safeJson(ACTIVITY_KEY, []);
  activity = Array.isArray(activity) ? activity.slice(0, MAX_ACTIVITY) : [];
  let undoHistory = safeJson(UNDO_HISTORY_KEY, []);
  undoHistory = Array.isArray(undoHistory) ? undoHistory.slice(0, MAX_UNDO) : [];
  let filters = safeJson(FILTER_KEY, {});
  filters = {
    expense:{account:"",min:"",max:"",dateFrom:"",dateTo:"",status:"",...(filters.expense || {})},
    paid:{account:"",min:"",max:"",dateFrom:"",dateTo:"",status:"",...(filters.paid || {})}
  };
  let observedData = clone(data);
  let suppressRenderDiff = false;
  let quickDialogReturnFocus = null;
  let searchSelection = 0;
  let paidSelection = new Set();
  let lastVisiblePaidIds = [];
  let filterMode = "expense";

  function recordName(collection, item, id = "") {
    if (collection === "accountLedger") return item?.description || item?.account || "Ledger entry";
    if (collection === "accountReconciliations") return `${item?.account || "Account"} reconciliation`;
    if (collection === "monthlyBudgets") return monthName(id);
    if (collection === "accounts") return id || item?.name || "Account";
    return item?.name || item?.category || item?.description || id || COLLECTION_META[collection]?.label || "Record";
  }

  function simpleHash(value) {
    const text = JSON.stringify(value ?? null);
    let hash = 2166136261;
    for (let index=0; index<text.length; index+=1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16);
  }

  function addActivity(entries) {
    if (!entries.length) return;
    const next = [...entries, ...activity];
    const seen = new Set();
    activity = next.filter(item => {
      const key = `${item.collection}|${item.recordId}|${item.action}|${item.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_ACTIVITY);
    writeJson(ACTIVITY_KEY, activity);
  }

  function diffArray(collection, beforeValue, afterValue, message, timestamp) {
    const beforeMap = new Map((Array.isArray(beforeValue) ? beforeValue : []).filter(item => item?.id).map(item => [String(item.id), item]));
    const afterMap = new Map((Array.isArray(afterValue) ? afterValue : []).filter(item => item?.id).map(item => [String(item.id), item]));
    const entries = [];
    const ids = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    ids.forEach(id => {
      const before = beforeMap.get(id), after = afterMap.get(id);
      let action = "updated";
      if (!before && after) action = "added";
      else if (before && !after) action = "deleted";
      else if (simpleHash(before) === simpleHash(after)) return;
      const source = after || before || {};
      entries.push({
        id:makeId("activity"), collection, recordId:id, action,
        label:recordName(collection, source, id), page:COLLECTION_META[collection]?.page || "dashboard",
        detail:compactText(message || `${COLLECTION_META[collection]?.label || collection} ${action}`, 140), timestamp
      });
    });
    return entries;
  }

  function diffMap(collection, beforeValue, afterValue, message, timestamp) {
    const before = beforeValue && typeof beforeValue === "object" ? beforeValue : {};
    const after = afterValue && typeof afterValue === "object" ? afterValue : {};
    const entries = [];
    new Set([...Object.keys(before), ...Object.keys(after)]).forEach(id => {
      if (simpleHash(before[id]) === simpleHash(after[id])) return;
      const action = !(id in before) ? "added" : !(id in after) ? "deleted" : "updated";
      entries.push({id:makeId("activity"),collection,recordId:id,action,label:recordName(collection,after[id] || before[id],id),page:COLLECTION_META[collection]?.page || "dashboard",detail:compactText(message,140),timestamp});
    });
    return entries;
  }

  function captureDataChanges(before, after, message = "Records updated") {
    if (simpleHash(before) === simpleHash(after)) return [];
    const timestamp = nowIso();
    let entries = [];
    ARRAY_COLLECTIONS.forEach(collection => { entries.push(...diffArray(collection, before?.[collection], after?.[collection], message, timestamp)); });
    MAP_COLLECTIONS.forEach(collection => { entries.push(...diffMap(collection, before?.[collection], after?.[collection], message, timestamp)); });
    const beforeAccounts = before?.accounts || {}, afterAccounts = after?.accounts || {};
    new Set([...Object.keys(beforeAccounts), ...Object.keys(afterAccounts)]).forEach(name => {
      if (Number(beforeAccounts[name] || 0) === Number(afterAccounts[name] || 0) && (name in beforeAccounts) === (name in afterAccounts)) return;
      const action = !(name in beforeAccounts) ? "added" : !(name in afterAccounts) ? "deleted" : "updated";
      entries.push({id:makeId("activity"),collection:"accounts",recordId:name,action,label:name,page:"settings",detail:compactText(message,140),timestamp});
    });
    if (!entries.length) entries.push({id:makeId("activity"),collection:"data",recordId:"root",action:"updated",label:message,page:activePageId?.() || "dashboard",detail:message,timestamp});
    addActivity(entries.slice(0, 20));
    return entries;
  }

  const basePushUndo = pushUndo;
  pushUndo = function productivityPushUndo(label = "Last change") {
    const snapshot = {id:makeId("undo"),label:compactText(label,140),timestamp:nowIso(),data:clone(data),hash:simpleHash(data)};
    if (undoHistory[0]?.hash !== snapshot.hash) {
      undoHistory = [snapshot, ...undoHistory].slice(0, MAX_UNDO);
      writeJson(UNDO_HISTORY_KEY, undoHistory);
    }
    const result = basePushUndo(label);
    renderProductivityPanels();
    return result;
  };

  const baseUndoLastChange = undoLastChange;
  undoLastChange = function productivityUndoLastChange() {
    const result = baseUndoLastChange();
    renderProductivityPanels();
    return result;
  };
  const baseRedoLastChange = redoLastChange;
  redoLastChange = function productivityRedoLastChange() {
    const result = baseRedoLastChange();
    renderProductivityPanels();
    return result;
  };

  const baseSaveData = saveData;
  saveData = function productivitySaveData(message = "Saved") {
    const before = clone(observedData);
    const after = clone(data);
    captureDataChanges(before, after, message);
    observedData = after;
    suppressRenderDiff = true;
    try { return baseSaveData(message); }
    finally { suppressRenderDiff = false; renderProductivityPanels(); }
  };

  const baseRenderAll = renderAll;
  renderAll = function productivityRenderAll(full = false) {
    const result = baseRenderAll(full);
    if (!suppressRenderDiff && simpleHash(observedData) !== simpleHash(data)) {
      captureDataChanges(observedData, data, "Records updated");
      observedData = clone(data);
    }
    ensureUniversalActions();
    renderProductivityPanels();
    renderRecentAccountSuggestions();
    return result;
  };

  function selectedCategoryFromForm() {
    const select = document.getElementById("expenseCategory");
    const custom = document.getElementById("expenseCustomCategory");
    return select?.value === "Other" ? compactText(custom?.value || "Other", 40) : compactText(select?.value || "Bills", 40);
  }

  function captureExpenseTemplate() {
    const type = document.getElementById("expenseType")?.value || "normal";
    return normalizeTemplate({
      id:makeId("expense-template"),
      name:document.getElementById("expenseName")?.value.trim() || "Expense template",
      expenseName:document.getElementById("expenseName")?.value.trim() || "",
      expenseType:type,
      amount:moneyInputValue("expenseAmount"),
      dailyRate:moneyInputValue("expenseDailyRate"),
      electricBillAmount:moneyInputValue("electricBillAmount"),
      waterBillAmount:moneyInputValue("waterBillAmount"),
      gymPricePerVisit:moneyInputValue("gymPricePerVisit"),
      gymDays:[...document.querySelectorAll("[data-gym-day]:checked")].map(input => Number(input.dataset.gymDay)),
      expensePeriod:document.getElementById("expenseBudgetPeriod")?.value || "first",
      dueDay:Number(document.getElementById("expenseDueDay")?.value || 0) || null,
      category:selectedCategoryFromForm(),
      account:document.getElementById("expenseAccount")?.value || "",
      recurring:Boolean(document.getElementById("expenseRecurring")?.checked),
      includeInTotals:document.getElementById("expenseIncludeInTotals")?.checked !== false,
      gymAutoPay:Boolean(document.getElementById("gymAutoPay")?.checked),
      gymAutoPayAccount:document.getElementById("gymAutoPayAccount")?.value || "",
      icon:typeof pickerIcon === "function" ? pickerIcon("expense") : null,
      createdAt:nowIso(),updatedAt:nowIso()
    });
  }

  function setSelectValue(id, value) {
    const node = document.getElementById(id);
    if (!node) return;
    if ([...node.options].some(option => option.value === String(value))) node.value = String(value);
    node.dispatchEvent(new Event("change", {bubbles:true}));
  }

  function setInputValue(id, value) {
    const node = document.getElementById(id);
    if (!node) return;
    node.value = value == null ? "" : String(value);
    node.dispatchEvent(new Event("input", {bubbles:true}));
  }

  function applyTemplateToExpenseForm(template) {
    const item = normalizeTemplate(template);
    if (!item) return;
    openExpenseDialog();
    setTimeout(() => {
      setSelectValue("expenseType", item.expenseType);
      setInputValue("expenseName", item.expenseName || item.name);
      setMoneyInputValue("expenseAmount", item.amount || "", !item.amount);
      setMoneyInputValue("expenseDailyRate", item.dailyRate || "", !item.dailyRate);
      setMoneyInputValue("electricBillAmount", item.electricBillAmount || 0, false);
      setMoneyInputValue("waterBillAmount", item.waterBillAmount || 0, false);
      setMoneyInputValue("gymPricePerVisit", item.gymPricePerVisit || 80, false);
      if (typeof setGymDaysInForm === "function") setGymDaysInForm(item.gymDays);
      setSelectValue("expenseBudgetPeriod", item.expensePeriod);
      setInputValue("expenseDueDay", item.dueDay || "");
      refreshCategorySelects();
      const categorySelect = document.getElementById("expenseCategory");
      const standard = [...categorySelect.options].some(option => option.value === item.category && item.category !== "Other");
      categorySelect.value = standard ? item.category : "Other";
      categorySelect.dispatchEvent(new Event("change", {bubbles:true}));
      setInputValue("expenseCustomCategory", standard ? "" : item.category);
      if (accountNames().includes(item.account)) setSelectValue("expenseAccount", item.account);
      document.getElementById("expenseRecurring").checked = Boolean(item.recurring);
      document.getElementById("expenseIncludeInTotals").checked = item.includeInTotals !== false;
      document.getElementById("gymAutoPay").checked = Boolean(item.gymAutoPay);
      if (item.gymAutoPayAccount && accountNames().includes(item.gymAutoPayAccount)) setSelectValue("gymAutoPayAccount", item.gymAutoPayAccount);
      if (item.icon && typeof setIconPicker === "function") setIconPicker("expense", item.icon);
      toggleDailyBudgetFields();
      syncExpenseIncludeTotalsUi();
      if (typeof updateGymPreview === "function") updateGymPreview();
      if (typeof setExpenseFormBaseline === "function") setExpenseFormBaseline();
      updateExpenseFormDirty?.();
      document.getElementById("expenseName")?.focus();
      showToast(`Template “${item.name}” applied`, "success");
    }, 0);
  }

  async function saveTemplateFromDialog() {
    const template = captureExpenseTemplate();
    if (!template?.expenseName) { showToast("Enter an expense name before saving a template", "warning"); document.getElementById("expenseName")?.focus(); return; }
    const name = await requestProductivityText({title:"Save expense template",label:"Template name",value:template.expenseName,confirmLabel:"Save template"});
    if (!name) return;
    template.name = compactText(name, 80);
    template.updatedAt = nowIso();
    pushUndo(`Save expense template ${template.name}`);
    data.expenseTemplates.push(template);
    saveData("Expense template saved");
  }

  async function updateTemplate(templateId) {
    const existing = data.expenseTemplates.find(item => item.id === templateId);
    if (!existing) return;
    const name = await requestProductivityText({title:"Rename expense template",label:"Template name",value:existing.name,confirmLabel:"Rename"});
    if (!name) return;
    pushUndo(`Rename expense template ${existing.name}`);
    existing.name = compactText(name,80);
    existing.updatedAt = nowIso();
    saveData("Expense template renamed");
  }

  async function deleteTemplate(templateId) {
    const existing = data.expenseTemplates.find(item => item.id === templateId);
    if (!existing) return;
    const confirmed=await confirmProductivityAction({title:"Delete expense template?",message:`Delete “${existing.name}”?`,details:"This removes the saved template only. Existing expenses are unchanged.",confirmLabel:"Delete template",danger:true});
    if(!confirmed)return;
    pushUndo(`Delete expense template ${existing.name}`);
    data.expenseTemplates = data.expenseTemplates.filter(item => item.id !== templateId);
    saveData("Expense template deleted");
  }

  function recentAccounts(limit = 3) {
    const scores = new Map(accountNames().map(name => [name, 0]));
    const add = (name, weight) => { if (scores.has(name)) scores.set(name, scores.get(name) + weight); };
    [...(data.expenses || [])].sort((a,b) => String(b.paidDate || b.date || "").localeCompare(String(a.paidDate || a.date || ""))).slice(0,40).forEach((item,index) => {
      add(item.paidFromAccount || item.account, Math.max(1, 40-index));
      add(item.account, Math.max(1, 24-index));
    });
    [...(data.incomeRecords || [])].sort((a,b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0,24).forEach((item,index) => add(item.account, Math.max(1,24-index)));
    return [...scores.entries()].sort((a,b) => b[1]-a[1] || accountNames().indexOf(a[0])-accountNames().indexOf(b[0])).slice(0,limit).map(([name]) => name);
  }

  function ensureRecentAccountRow(selectId, rowId) {
    const select = document.getElementById(selectId);
    if (!select) return null;
    let row = document.getElementById(rowId);
    if (!row) {
      row = document.createElement("div");
      row.id = rowId;
      row.className = "productivity-recent-account-row";
      select.closest(".field")?.insertAdjacentElement("afterend", row);
    }
    return row;
  }

  function renderRecentAccountSuggestions() {
    const names = recentAccounts(3);
    const configs = [
      ["expenseAccount","expenseRecentAccounts","Recent accounts"],
      ["incomeAccount","incomeRecentAccounts","Recent accounts"]
    ];
    configs.forEach(([selectId,rowId,label]) => {
      const row = ensureRecentAccountRow(selectId,rowId);
      if (!row) return;
      row.innerHTML = names.length ? `<span>${label}</span>${names.map(name => `<button class="productivity-chip" type="button" data-recent-account-target="${attr(selectId)}" data-recent-account="${attr(name)}">${esc(name)}</button>`).join("")}` : "";
      row.hidden = !names.length || !document.getElementById(selectId)?.closest("dialog")?.open;
    });
  }

  const baseOpenExpenseDialog = openExpenseDialog;
  openExpenseDialog = function productivityOpenExpenseDialog(item = null, options = {}) {
    const result = baseOpenExpenseDialog(item, options);
    injectTemplateSaveButton();
    renderRecentAccountSuggestions();
    return result;
  };
  const baseOpenIncomeDialog = openIncomeDialog;
  openIncomeDialog = function productivityOpenIncomeDialog(item = null) {
    const result = baseOpenIncomeDialog(item);
    renderRecentAccountSuggestions();
    return result;
  };

  function injectTemplateSaveButton() {
    const footer = document.querySelector("#expenseDialog .expense-dialog-footer");
    if (!footer || document.getElementById("saveExpenseTemplateButton")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-secondary";
    button.id = "saveExpenseTemplateButton";
    button.textContent = "Save as template";
    footer.querySelector(".footer-spacer")?.before(button);
  }

  function productivityUiIcon(name) {
    const icons = {
      expense:'<svg viewBox="0 0 24 24" focusable="false"><path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21V3Z"/><path d="M10 8h4M10 12h4M10 16h3"/></svg>',
      income:'<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="8"/><path d="M12 7v10M15 9.2c-.7-.8-1.7-1.2-3-1.2-1.7 0-3 .8-3 2s1.1 1.8 3 2 3 1 3 2-1.3 2-3 2c-1.3 0-2.4-.4-3-1.2"/></svg>',
      project:'<svg viewBox="0 0 24 24" focusable="false"><path d="M4 19V8l8-4 8 4v11H4Z"/><path d="M8 19v-5h8v5M8 9h.01M12 9h.01M16 9h.01"/></svg>',
      transfer:'<svg viewBox="0 0 24 24" focusable="false"><path d="M4 8h14M15 5l3 3-3 3M20 16H6M9 13l-3 3 3 3"/></svg>',
      duplicate:'<svg viewBox="0 0 24 24" focusable="false"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
      center:'<svg viewBox="0 0 24 24" focusable="false"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6"/></svg>'
    };
    return `<span class="productivity-quick-icon" aria-hidden="true">${icons[name] || icons.center}</span>`;
  }

  function quickActionHtml() {
    return `
      <button class="productivity-quick-action" type="button" data-productivity-action="expense">${productivityUiIcon("expense")}<span><strong>Add expense</strong><small>Expense form</small></span></button>
      <button class="productivity-quick-action" type="button" data-productivity-action="income">${productivityUiIcon("income")}<span><strong>Add income</strong><small>Record income</small></span></button>
      <button class="productivity-quick-action" type="button" data-productivity-action="project">${productivityUiIcon("project")}<span><strong>Add project</strong><small>New project</small></span></button>
      <button class="productivity-quick-action" type="button" data-productivity-action="transfer">${productivityUiIcon("transfer")}<span><strong>Transfer money</strong><small>Between accounts</small></span></button>
      <button class="productivity-quick-action" type="button" data-productivity-action="duplicate">${productivityUiIcon("duplicate")}<span><strong>Duplicate last month</strong><small>Reuse expense</small></span></button>
      <button class="productivity-quick-action" type="button" data-productivity-action="center">${productivityUiIcon("center")}<span><strong>Productivity center</strong><small>Templates & undo</small></span></button>`;
  }

  function injectUi() {
    if (document.getElementById("globalSearchDialog")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <dialog id="quickAddMenuDialog" class="app-dialog productivity-dialog" aria-labelledby="quickAddMenuTitle">
        <div class="modal-header"><h3 id="quickAddMenuTitle">Quick add</h3><button class="button button-secondary button-small" type="button" data-close-productivity="quickAddMenuDialog">Close</button></div>
        <div class="modal-body">
          <div class="productivity-quick-grid">${quickActionHtml()}</div>
          <section class="productivity-section"><div class="productivity-section-heading"><h4>Saved expense templates</h4><small>Review before saving</small></div><div class="productivity-template-chips" id="quickTemplateChips"></div></section>
          <section class="productivity-section"><div class="productivity-section-heading"><h4>Reconcile an account</h4><small>Creates a ledger adjustment</small></div><div class="productivity-account-chips" id="quickReconcileAccounts"></div></section>
        </div>
      </dialog>

      <dialog id="globalSearchDialog" class="app-dialog productivity-dialog productivity-dialog-wide" aria-labelledby="globalSearchTitle">
        <div class="modal-header"><h3 id="globalSearchTitle">Search all finance records</h3><button class="button button-secondary button-small" type="button" data-close-productivity="globalSearchDialog">Close</button></div>
        <div class="modal-body">
          <div class="productivity-search-shell"><input class="input productivity-search-input" id="globalSearchInput" autocomplete="off" placeholder="Search expenses, income, projects, accounts, ledger, budgets…" aria-label="Search all finance records"><div class="productivity-search-meta"><span id="globalSearchCount">Start typing to search</span><span>↑ ↓ to move · Enter to open</span></div></div>
          <div class="productivity-search-results" id="globalSearchResults" role="listbox"></div>
        </div>
      </dialog>

      <dialog id="productivityCenterDialog" class="app-dialog productivity-dialog productivity-dialog-wide" aria-labelledby="productivityCenterTitle">
        <div class="modal-header"><h3 id="productivityCenterTitle">Productivity center</h3><button class="button button-secondary button-small" type="button" data-close-productivity="productivityCenterDialog">Close</button></div>
        <div class="modal-body">
          <div class="productivity-tabs" role="tablist" aria-label="Productivity sections">
            <button class="productivity-tab" type="button" role="tab" aria-selected="true" data-productivity-tab="templates">Templates</button>
            <button class="productivity-tab" type="button" role="tab" aria-selected="false" data-productivity-tab="recent">Recently edited</button>
            <button class="productivity-tab" type="button" role="tab" aria-selected="false" data-productivity-tab="undo">Undo history</button>
            <button class="productivity-tab" type="button" role="tab" aria-selected="false" data-productivity-tab="shortcuts">Shortcuts</button>
          </div>
          <section class="productivity-panel" id="productivityPanelTemplates" data-productivity-panel="templates"><div class="productivity-section-heading"><div><h4>Expense templates</h4><small>Templates synchronize through Cloud Sync</small></div><button class="button button-primary button-small" type="button" data-productivity-action="expense">Create from expense form</button></div><div class="productivity-list" id="productivityTemplateList"></div></section>
          <section class="productivity-panel" id="productivityPanelRecent" data-productivity-panel="recent" hidden><div class="productivity-section-heading"><div><h4>Recently edited records</h4><small>Stored only on this device</small></div><button class="button button-secondary button-small" type="button" id="clearProductivityActivity">Clear history</button></div><div class="productivity-list" id="productivityRecentList"></div></section>
          <section class="productivity-panel" id="productivityPanelUndo" data-productivity-panel="undo" hidden><div class="productivity-section-heading"><div><h4>Undo history</h4><small>Restore one of the last ${MAX_UNDO} pre-change snapshots</small></div><button class="button button-secondary button-small" type="button" id="clearProductivityUndo">Clear history</button></div><div class="productivity-list" id="productivityUndoList"></div></section>
          <section class="productivity-panel" id="productivityPanelShortcuts" data-productivity-panel="shortcuts" hidden><div class="productivity-shortcuts">
            <div class="productivity-shortcut"><span>Global search</span><kbd>⌘ / Ctrl K</kbd></div>
            <div class="productivity-shortcut"><span>Quick add</span><kbd>⌘ / Ctrl ⇧ A</kbd></div>
            <div class="productivity-shortcut"><span>Add expense</span><kbd>⌘ / Ctrl ⇧ E</kbd></div>
            <div class="productivity-shortcut"><span>Add income</span><kbd>⌘ / Ctrl ⇧ I</kbd></div>
            <div class="productivity-shortcut"><span>Add project</span><kbd>⌘ / Ctrl ⇧ P</kbd></div>
            <div class="productivity-shortcut"><span>Undo last change</span><kbd>⌘ / Ctrl Z</kbd></div>
            <div class="productivity-shortcut"><span>Search when idle</span><kbd>/</kbd></div>
            <div class="productivity-shortcut"><span>Show shortcuts</span><kbd>?</kbd></div>
          </div></section>
        </div>
      </dialog>

      <dialog id="duplicateLastMonthDialog" class="app-dialog productivity-dialog" aria-labelledby="duplicateLastMonthTitle">
        <div class="modal-header"><h3 id="duplicateLastMonthTitle">Duplicate last month’s expense</h3><button class="button button-secondary button-small" type="button" data-close-productivity="duplicateLastMonthDialog">Close</button></div>
        <div class="modal-body"><input class="input" id="duplicateLastMonthSearch" placeholder="Search previous-month expenses" aria-label="Search previous-month expenses"><div class="productivity-duplicate-list" id="duplicateLastMonthList"></div></div>
      </dialog>

      <dialog id="advancedExpenseFilterDialog" class="app-dialog productivity-dialog" aria-labelledby="advancedExpenseFilterTitle">
        <form id="advancedExpenseFilterForm">
          <div class="modal-header"><h3 id="advancedExpenseFilterTitle">More expense filters</h3><button class="button button-secondary button-small" type="button" data-close-productivity="advancedExpenseFilterDialog">Close</button></div>
          <div class="modal-body"><div class="productivity-filter-grid">
            <div class="field"><label for="productivityFilterAccount">Account</label><select class="select" id="productivityFilterAccount"></select></div>
            <div class="field"><label for="productivityFilterStatus">Status</label><select class="select" id="productivityFilterStatus"></select></div>
            <div class="field"><label for="productivityFilterMin">Minimum amount</label><input class="input" id="productivityFilterMin" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00"></div>
            <div class="field"><label for="productivityFilterMax">Maximum amount</label><input class="input" id="productivityFilterMax" type="text" inputmode="decimal" autocomplete="off" placeholder="No maximum"></div>
            <div class="field"><label for="productivityFilterDateFrom">Date from</label><input class="input" id="productivityFilterDateFrom" type="date"></div>
            <div class="field"><label for="productivityFilterDateTo">Date to</label><input class="input" id="productivityFilterDateTo" type="date"></div>
          </div></div>
          <div class="modal-footer form-action-footer"><button class="button button-secondary" id="clearAdvancedExpenseFilters" type="button">Clear filters</button><span class="footer-spacer"></span><button class="button button-secondary" type="button" data-close-productivity="advancedExpenseFilterDialog">Cancel</button><button class="button button-primary" type="submit">Apply filters</button></div>
        </form>
      </dialog>`);
    injectTopbarButtons();
    injectTemplateSaveButton();
    injectAdvancedFilterButtons();
    injectPaidBulkToolbar();
  }

  function injectTopbarButtons() {
    const tools = document.querySelector(".topbar-tools-panel");
    if (!tools) return;
    // V13.0.2 provides Search and Quick actions as standard SVG menu items in index.html.
  }

  function ensureUniversalActions() {
    // Keep the contextual Add Expense / Add Income / Add Project action managed by the core UI.
    // Universal quick actions remain available through More tools and keyboard shortcuts.
  }

  function openDialog(id, focusSelector = "") {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    quickDialogReturnFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    if (focusSelector) setTimeout(() => dialog.querySelector(focusSelector)?.focus(), 0);
  }
  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog?.open) dialog.close();
    if (quickDialogReturnFocus?.focus) quickDialogReturnFocus.focus({preventScroll:true});
    quickDialogReturnFocus = null;
  }

  function renderQuickMenu() {
    const templates = data.expenseTemplates || [];
    const templateNode = document.getElementById("quickTemplateChips");
    if (templateNode) templateNode.innerHTML = templates.length ? templates.slice(0,8).map(item => `<button class="productivity-chip" type="button" data-use-expense-template="${attr(item.id)}">${esc(item.name)}</button>`).join("") : '<span class="productivity-empty">No templates yet. Open an expense and choose Save as template.</span>';
    const accountNode = document.getElementById("quickReconcileAccounts");
    if (accountNode) accountNode.innerHTML = accountNames().length ? accountNames().map(name => `<button class="productivity-chip" type="button" data-quick-reconcile="${attr(name)}">${esc(name)}</button>`).join("") : '<span class="productivity-empty">Add an account first.</span>';
  }

  function openQuickMenu() { renderQuickMenu(); openDialog("quickAddMenuDialog"); }
  function openGlobalSearch(query = "") {
    openDialog("globalSearchDialog", "#globalSearchInput");
    const input = document.getElementById("globalSearchInput");
    input.value = query;
    searchSelection = 0;
    renderGlobalSearch();
  }
  function openProductivityCenter(tab = "templates") {
    setProductivityTab(tab);
    renderProductivityPanels();
    openDialog("productivityCenterDialog");
  }

  function setProductivityTab(tab) {
    document.querySelectorAll("[data-productivity-tab]").forEach(button => button.setAttribute("aria-selected", String(button.dataset.productivityTab === tab)));
    document.querySelectorAll("[data-productivity-panel]").forEach(panel => { panel.hidden = panel.dataset.productivityPanel !== tab; });
  }

  function templateTypeLabel(template) {
    return ({normal:"Normal expense",utility:"Utility bill",budget:"Daily budget",gym:"Gym expense"})[template.expenseType] || "Expense";
  }

  function renderProductivityPanels() {
    const templateList = document.getElementById("productivityTemplateList");
    if (templateList) templateList.innerHTML = (data.expenseTemplates || []).length ? data.expenseTemplates.map(item => `<article class="productivity-list-item"><div><strong>${esc(item.name)}</strong><small>${esc(item.expenseName || item.name)} · ${esc(templateTypeLabel(item))} · ${esc(item.category)}${item.account ? ` · ${esc(item.account)}` : ""}</small></div><div class="productivity-list-actions"><button class="button button-primary button-small" type="button" data-use-expense-template="${attr(item.id)}">Use</button><button class="button button-secondary button-small" type="button" data-rename-expense-template="${attr(item.id)}">Rename</button><button class="button button-secondary button-small" type="button" data-delete-expense-template="${attr(item.id)}">Delete</button></div></article>`).join("") : '<div class="productivity-empty">No expense templates. Open Add Expense, fill the reusable fields, then choose Save as template.</div>';
    const recentList = document.getElementById("productivityRecentList");
    if (recentList) recentList.innerHTML = activity.length ? activity.slice(0,30).map(item => `<article class="productivity-list-item"><div><strong>${esc(item.label)}</strong><small>${esc(COLLECTION_META[item.collection]?.label || item.collection)} · ${esc(item.action)} · ${esc(formatDateTime?.(item.timestamp) || new Date(item.timestamp).toLocaleString())}<br>${esc(item.detail || "")}</small></div><div class="productivity-list-actions"><button class="button button-secondary button-small" type="button" data-open-recent-record="${attr(item.id)}">Open</button></div></article>`).join("") : '<div class="productivity-empty">Recently edited records will appear here.</div>';
    const undoList = document.getElementById("productivityUndoList");
    if (undoList) undoList.innerHTML = undoHistory.length ? undoHistory.map(item => `<article class="productivity-list-item"><div><strong>${esc(item.label)}</strong><small>Saved before the change · ${esc(formatDateTime?.(item.timestamp) || new Date(item.timestamp).toLocaleString())}</small></div><div class="productivity-list-actions"><button class="button button-primary button-small" type="button" data-restore-undo-snapshot="${attr(item.id)}">Restore</button></div></article>`).join("") : '<div class="productivity-empty">Undo snapshots appear before changes that support Undo.</div>';
    renderQuickMenu();
  }

  async function restoreUndoSnapshot(snapshotId) {
    const snapshot = undoHistory.find(item => item.id === snapshotId);
    if (!snapshot) return;
    const confirmed=await confirmProductivityAction({title:"Restore this undo snapshot?",message:`Restore the snapshot saved before “${snapshot.label}”?`,details:"Your current records will first become a new undo point.",confirmLabel:"Restore snapshot",danger:true});
    if(!confirmed)return;
    pushUndo("Restore prior undo snapshot");
    data = normalizeData(clone(snapshot.data));
    saveData(`Restored snapshot: ${snapshot.label}`);
    closeDialog("productivityCenterDialog");
  }

  function searchRecords(query) {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return [];
    const terms = normalized.split(/\s+/).filter(Boolean);
    const rows = [];
    const add = (type, id, label, detail, value, searchText, open) => {
      const haystack = `${label} ${detail} ${value} ${searchText}`.toLowerCase();
      if (!terms.every(term => haystack.includes(term))) return;
      let score = 0;
      if (String(label).toLowerCase().startsWith(normalized)) score += 90;
      if (String(label).toLowerCase().includes(normalized)) score += 45;
      terms.forEach(term => { if (String(label).toLowerCase().includes(term)) score += 12; if (String(detail).toLowerCase().includes(term)) score += 4; });
      rows.push({type,id,label,detail,value,score,open});
    };
    add("Action","transaction-views","Customize transaction view","Open columns, saved views, list/calendar mode, sorting, and density","Open","workspace columns calendar saved views",() => window.FinanceTransactionViews?.openForActivePage?.());
    add("Action","privacy-display",window.FinancePrivacyDisplay?.hidden ? "Show monetary values" : "Hide monetary values","Mask or restore amounts on this device","Run","privacy hide show values screen share",() => window.FinancePrivacyDisplay?.toggle?.());
    add("Action","finance-tools","Manage payees and rules","Open normalized payees, aliases, ordered rules, and preview","Open","payee merchant alias categorization automation rule preview",() => window.FinancePayeeRules?.open?.());
    add("Action","import-center","Import local CSV","Map, preview, deduplicate, and recover a financial CSV import","Open","csv statement import mapping duplicate rollback",() => window.FinanceImportCenter?.open?.());
    add("Action","net-worth","Open net worth","Manage manual assets, liabilities, and valuation history","Open","net worth asset liability valuation wealth",() => window.FinanceNetWorth?.open?.());
    add("Action","household-splits","Manage household splits","Review shared expenses, member balances, and settlements","Open","household split shared bill owed settlement member",() => { goToPage("settings",{smooth:false}); setTimeout(() => { document.querySelector('[data-settings-tab="finance-tools"]')?.click(); document.getElementById("financeToolsHouseholdSplits")?.scrollIntoView({behavior:"smooth",block:"start"}); },0); });
    (data.expenses || []).forEach(item => add("Expense",item.id,item.name,`${item.category} · ${item.paid ? "Paid" : "Unpaid"} · ${item.paidFromAccount || item.account || "No account"} · ${item.paidDate || item.date || "No date"}`,money(effectiveExpenseAmount(item)),`${item.notes || ""} ${item.recurring || ""} ${item.expenseType || ""}`,() => openExpenseDialog(item)));
    (data.incomeRecords || []).forEach(item => add("Income",item.id,item.name,`${item.category} · ${item.account || "No account"} · ${item.date || "No date"}`,money(item.amount),`${item.notes || ""} ${item.recurring || ""}`,() => openIncomeDialog(item)));
    (data.projects || []).forEach(item => add("Project",item.id,item.name,`${item.type} · ${item.status} · ${item.deadline || item.workMonth || "No date"}`,projectIsFinancial(item) ? money(item.value) : "Salary work",`${item.notes || ""} ${projectWorkSource(item)}`,() => openProjectDialog(item)));
    (data.savingsGoals || []).forEach(item => add("Savings goal",item.id,item.name,`${item.status || "active"} · ${item.linkedAccount || "Manual progress"}`,`${money(item.currentAmount)} / ${money(item.targetAmount)}`,`${item.targetDate || ""}`,() => openSavingsGoalDialog(item)));
    accountNames().forEach(name => add("Account",name,name,`${accountType(name)} account`,money(data.accounts[name]),name,() => openAccountDialog(name)));
    (data.accountLedger || []).forEach(item => add("Ledger",item.id,item.description || item.account,`${item.account} · ${item.type} · ${item.date}`,money(item.amount),`${item.notes || ""} ${item.counterpartAccount || ""}`,() => { goToPage("settings",{smooth:false}); setTimeout(() => { document.querySelector('[data-settings-tab="accounts"]')?.click(); const search=document.getElementById("ledgerSearch"); if(search){search.value=item.description || item.account; search.dispatchEvent(new Event("input",{bubbles:true})); search.focus();} },0); }));
    Object.entries(data.monthlyBudgets || {}).forEach(([month,item]) => add("Budget",month,monthName(month),`${(item.items || []).length} categories · monthly plan`,money((item.items || []).reduce((total,row)=>total+Number(row.plannedAmount||0),0)),(item.items || []).map(row=>`${row.category} ${row.notes||""}`).join(" "),() => { applySelectedMonth(month,false); goToPage("income",{smooth:false}); setTimeout(()=>document.getElementById("monthlyBudgetPlannerCard")?.scrollIntoView({behavior:"smooth",block:"start"}),0); }));
    (data.expenseTemplates || []).forEach(item => add("Template",item.id,item.name,`${templateTypeLabel(item)} · ${item.category}${item.account ? ` · ${item.account}` : ""}`,item.amount ? money(item.amount) : "",item.expenseName,() => applyTemplateToExpenseForm(item)));
    const financeTools = data.ledgerSettings?.financeTools || {};
    (financeTools.payees || []).forEach(item => add("Payee",item.id,item.name,item.archived ? "Archived payee" : `${item.aliases?.length || 0} aliases`,"Open",`${(item.aliases || []).join(" ")} ${item.defaultCategory || ""} ${item.defaultAccount || ""}`,() => window.FinancePayeeRules?.openPayee?.(item.id)));
    (financeTools.transactionRules || []).forEach(item => add("Rule",item.id,item.name,`Priority ${item.priority} · ${item.enabled ? "Enabled" : "Disabled"}`,"Open",`${item.match?.mode || "all"} ${(item.match?.conditions || []).map(condition => `${condition.field} ${condition.operator} ${condition.value}`).join(" ")}`,() => window.FinancePayeeRules?.openRule?.(item.id)));
    (data.ledgerSettings?.householdSplits?.groups || []).forEach(item => add("Household",item.id,item.name,`${item.members?.length || 0} members · ${item.archived ? "Archived" : "Active"}`,"Open",(item.members || []).map(member => member.name).join(" "),() => { goToPage("settings",{smooth:false}); setTimeout(() => { document.querySelector('[data-settings-tab="finance-tools"]')?.click(); document.getElementById("financeToolsHouseholdSplits")?.scrollIntoView({behavior:"smooth",block:"start"}); },0); }));
    (data.ledgerSettings?.netWorth?.items || []).forEach(item => {
      const latest = window.FinanceNetWorth?.latestValuation?.(item);
      add(item.type === "liability" ? "Liability" : "Asset",item.id,item.name,`${item.category || "Uncategorized"} · ${item.archived ? "Archived" : "Active"}`,latest ? money(latest.amountPhp) : "No value",`${item.currency || "PHP"} valuation net worth`,() => window.FinanceNetWorth?.openItem?.(item.id));
    });
    return rows.sort((a,b) => b.score-a.score || a.type.localeCompare(b.type) || a.label.localeCompare(b.label)).slice(0,80);
  }

  function renderGlobalSearch() {
    const input = document.getElementById("globalSearchInput");
    const resultsNode = document.getElementById("globalSearchResults");
    if (!input || !resultsNode) return;
    const results = searchRecords(input.value);
    searchSelection = Math.max(0, Math.min(searchSelection, Math.max(0, results.length-1)));
    resultsNode.dataset.resultCount = String(results.length);
    resultsNode._financeResults = results;
    document.getElementById("globalSearchCount").textContent = input.value.trim() ? `${results.length} matching record${results.length === 1 ? "" : "s"}` : "Start typing to search";
    resultsNode.innerHTML = !input.value.trim() ? `<div class="productivity-empty">Search by name, category, account, amount, date, status, note, or record type.</div>` : results.length ? results.map((item,index) => `<button class="productivity-search-result" type="button" role="option" aria-selected="${index===searchSelection}" data-global-search-index="${index}"><span class="productivity-search-copy"><strong><span class="productivity-type-badge">${esc(item.type)}</span>${esc(item.label)}</strong><small>${esc(item.detail)}</small></span><span class="productivity-search-value">${esc(item.value || "Open")}</span></button>`).join("") : `<div class="productivity-empty">No matching finance records.<div class="empty-state-actions"><button class="button button-secondary button-small" type="button" data-clear-global-search>Clear search</button></div></div>`;
    resultsNode.querySelector('[aria-selected="true"]')?.scrollIntoView({block:"nearest"});
  }

  function openSearchResult(index) {
    const node = document.getElementById("globalSearchResults");
    const result = node?._financeResults?.[Number(index)];
    if (!result) return;
    closeDialog("globalSearchDialog");
    result.open();
  }

  function previousMonthKey() {
    return typeof shiftMonth === "function" ? shiftMonth(selectedMonth(), -1) : (() => { const date=new Date(`${selectedMonth()}-01T00:00:00`); date.setMonth(date.getMonth()-1); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`; })();
  }

  function renderDuplicateList() {
    const query = document.getElementById("duplicateLastMonthSearch")?.value.trim().toLowerCase() || "";
    const month = previousMonthKey();
    const items = (data.expenses || []).filter(item => String(item.date || "").startsWith(month)).filter(item => !query || `${item.name} ${item.category} ${item.account} ${item.notes || ""}`.toLowerCase().includes(query)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    document.getElementById("duplicateLastMonthTitle").textContent = `Duplicate from ${monthName(month)}`;
    document.getElementById("duplicateLastMonthList").innerHTML = items.length ? items.map(item => `<button class="productivity-duplicate-item" type="button" data-duplicate-previous-expense="${attr(item.id)}"><span><strong>${esc(item.name)}</strong><small>${esc(item.category)} · ${esc(item.account || "No account")} · ${item.paid ? "Paid last month" : "Unpaid last month"}</small></span><span>${esc(money(effectiveExpenseAmount(item)))}</span></button>`).join("") : '<div class="productivity-empty">No previous-month expenses match this search.</div>';
  }

  function duplicatePreviousExpense(id) {
    const source = (data.expenses || []).find(item => item.id === id);
    if (!source) return;
    const copy = typeof duplicateExpenseNextMonth === "function" ? duplicateExpenseNextMonth(source) : clone(source);
    copy.id = "";
    const sourceDay = Math.min(28, Number(String(source.date || "").slice(-2)) || 1);
    copy.date = `${selectedMonth()}-${String(sourceDay).padStart(2,"0")}`;
    copy.paid = false; copy.paidDate=""; copy.paidFromAccount=""; copy.paidAmount=0; copy.accountDeducted=false; copy.paymentTransactionId=""; copy.autoPaidAtMonthEnd=false; copy.recurring="No"; copy.seriesId="";
    closeDialog("duplicateLastMonthDialog");
    closeDialog("quickAddMenuDialog");
    openExpenseDialog(copy,{duplicate:true});
  }

  function statusOptions(mode) {
    return mode === "paid" ? [
      ["","All paid statuses"],["manual","Manual payment"],["auto","Gym auto-payment"],["recurring","Recurring"],["one-time","One-time"],["included","Included in totals"],["excluded","Excluded from totals"]
    ] : [
      ["","All unpaid statuses"],["overdue","Overdue"],["due-soon","Due soon"],["recurring","Recurring"],["one-time","One-time"],["included","Included in totals"],["excluded","Excluded from totals"]
    ];
  }

  function openAdvancedFilters(mode) {
    filterMode = mode === "paid" ? "paid" : "expense";
    const value = filters[filterMode];
    document.getElementById("advancedExpenseFilterTitle").textContent = filterMode === "paid" ? "More paid-expense filters" : "More unpaid-expense filters";
    document.getElementById("productivityFilterAccount").innerHTML = `<option value="">All accounts</option>${accountNames().map(name=>`<option value="${attr(name)}">${esc(name)}</option>`).join("")}`;
    document.getElementById("productivityFilterStatus").innerHTML = statusOptions(filterMode).map(([key,label])=>`<option value="${attr(key)}">${esc(label)}</option>`).join("");
    document.getElementById("productivityFilterAccount").value = value.account || "";
    document.getElementById("productivityFilterStatus").value = value.status || "";
    document.getElementById("productivityFilterMin").value = value.min || "";
    document.getElementById("productivityFilterMax").value = value.max || "";
    document.getElementById("productivityFilterDateFrom").value = value.dateFrom || "";
    document.getElementById("productivityFilterDateTo").value = value.dateTo || "";
    openDialog("advancedExpenseFilterDialog", "#productivityFilterAccount");
  }

  function activeFilterCount(mode) {
    return Object.values(filters[mode] || {}).filter(value => String(value || "").trim()).length;
  }

  function injectAdvancedFilterButtons() {
    const configs = [
      ["expenseSearch","expenseAdvancedFilterButton","expense"],
      ["paidSearch","paidAdvancedFilterButton","paid"]
    ];
    configs.forEach(([anchorId,buttonId,mode]) => {
      if (document.getElementById(buttonId)) return;
      const anchor = document.getElementById(anchorId)?.closest(".toolbar");
      if (!anchor) return;
      const button = document.createElement("button");
      button.id = buttonId;
      button.type = "button";
      button.className = "button button-secondary productivity-advanced-filter-button";
      button.dataset.openAdvancedFilters = mode;
      button.innerHTML = `More filters <span class="productivity-filter-count"></span>`;
      const clear = anchor.querySelector("button[id^='clear']");
      clear ? clear.before(button) : anchor.append(button);
    });
    updateAdvancedFilterButtons();
  }

  function updateAdvancedFilterButtons() {
    [["expenseAdvancedFilterButton","expense"],["paidAdvancedFilterButton","paid"]].forEach(([id,mode]) => {
      const button = document.getElementById(id); if (!button) return;
      const count = activeFilterCount(mode);
      button.classList.toggle("filter-control-active", count > 0);
      const badge = button.querySelector(".productivity-filter-count"); if (badge) badge.textContent = count ? String(count) : "";
      button.title = count ? `${count} additional filter${count===1?"":"s"} active` : "Filter by account, amount, date and status";
    });
  }

  function matchAdvancedFilter(item, mode) {
    const value = filters[mode];
    if (!value) return true;
    const account = mode === "paid" ? (item.paidFromAccount || item.account || "") : (item.account || "");
    const amount = mode === "paid" ? settledExpenseAmount(item) : effectiveExpenseAmount(item);
    const date = mode === "paid" ? (item.paidDate || item.date || "") : (item.date || "");
    if (value.account && account !== value.account) return false;
    if (value.min !== "" && amount < parseAmount(value.min)) return false;
    if (value.max !== "" && amount > parseAmount(value.max)) return false;
    if (value.dateFrom && date < value.dateFrom) return false;
    if (value.dateTo && date > value.dateTo) return false;
    if (!value.status) return true;
    if (value.status === "recurring") return item.recurring === "Monthly";
    if (value.status === "one-time") return item.recurring !== "Monthly";
    if (value.status === "included") return expenseIncludedInTotals(item);
    if (value.status === "excluded") return !expenseIncludedInTotals(item);
    if (value.status === "auto") return Boolean(item.autoPaidAtMonthEnd);
    if (value.status === "manual") return !item.autoPaidAtMonthEnd;
    const due = typeof expenseDueStatus === "function" ? expenseDueStatus(item) : {};
    if (value.status === "overdue") return due.badgeClass === "status-overdue" || String(due.label || "").toLowerCase().includes("overdue");
    if (value.status === "due-soon") return due.badgeClass === "status-due-soon" || /due (today|tomorrow|in )/i.test(String(due.label || ""));
    return true;
  }

  const baseRenderExpenseRows = renderExpenseRows;
  renderExpenseRows = function productivityRenderExpenseRows(items, targetId, isOther = false) {
    return baseRenderExpenseRows((items || []).filter(item => matchAdvancedFilter(item,"expense")), targetId, isOther);
  };

  function injectPaidBulkToolbar() {
    if (document.getElementById("paidProductivityBulk")) return;
    const panel = document.getElementById("paidFiltersPanel");
    if (!panel) return;
    panel.insertAdjacentHTML("afterend", `<div class="productivity-paid-bulk" id="paidProductivityBulk"><label class="productivity-paid-select"><input id="selectAllVisiblePaid" type="checkbox"> Select visible</label><strong id="paidProductivitySelectedCount">0 selected</strong><select class="select" id="paidProductivityAction"><option value="">Bulk action</option><option value="category">Change category</option><option value="payment-account">Correct payment account</option></select><select class="select" id="paidProductivityValue" disabled><option value="">Choose a value</option></select><button class="button button-primary button-small" id="applyPaidProductivityAction" type="button" disabled>Apply</button><button class="button button-secondary button-small" id="clearPaidProductivitySelection" type="button">Clear</button></div>`);
  }

  const baseRenderPaidExpenses = renderPaidExpenses;
  function productivityRenderPaidExpenses() {
    baseRenderPaidExpenses();
    const list = document.getElementById("paidExpenseList");
    if (!list) return;
    const paidById = new Map((data.expenses || []).filter(item => item.paid).map(item => [String(item.id),item]));
    const rows = [...list.querySelectorAll("[data-paid-expense-row]")];
    lastVisiblePaidIds = [];
    rows.forEach(row => {
      const id = String(row.dataset.paidExpenseRow || "");
      const item = paidById.get(id);
      const matches = item && matchAdvancedFilter(item,"paid");
      row.classList.toggle("productivity-record-filtered", !matches);
      if (matches) lastVisiblePaidIds.push(id);
      const title = row.querySelector(".record-title");
      if (title && !title.querySelector("[data-select-paid-expense]")) title.insertAdjacentHTML("afterbegin", `<label class="productivity-paid-checkbox"><input type="checkbox" data-select-paid-expense="${attr(id)}" ${paidSelection.has(id)?"checked":""}><span class="sr-only">Select ${esc(item?.name || "paid expense")}</span></label>`);
    });
    paidSelection = new Set([...paidSelection].filter(id => paidById.has(id)));
    list.querySelector(".productivity-filter-empty")?.remove();
    if (rows.length && !lastVisiblePaidIds.length) list.insertAdjacentHTML("afterbegin", '<div class="productivity-empty productivity-filter-empty">No paid expenses match the additional filters.</div>');
    updatePaidBulkToolbar();
  }
  PAGE_RENDERERS["paid-expenses"] = productivityRenderPaidExpenses;
  renderPaidExpenses = productivityRenderPaidExpenses;

  function updatePaidBulkToolbar() {
    injectPaidBulkToolbar();
    const count = paidSelection.size;
    document.getElementById("paidProductivitySelectedCount").textContent = `${count} selected`;
    const selectAll = document.getElementById("selectAllVisiblePaid");
    const visibleSelected = lastVisiblePaidIds.filter(id => paidSelection.has(id)).length;
    selectAll.checked = lastVisiblePaidIds.length > 0 && visibleSelected === lastVisiblePaidIds.length;
    selectAll.indeterminate = visibleSelected > 0 && visibleSelected < lastVisiblePaidIds.length;
    const action = document.getElementById("paidProductivityAction").value;
    const value = document.getElementById("paidProductivityValue");
    value.disabled = !action;
    document.getElementById("applyPaidProductivityAction").disabled = !count || !action || !value.value;
  }

  function refreshPaidBulkValue() {
    const action = document.getElementById("paidProductivityAction")?.value || "";
    const value = document.getElementById("paidProductivityValue");
    if (!value) return;
    if (action === "category") value.innerHTML = `<option value="">Choose category</option>${expenseCategories(true).filter(category=>category!=="Reserved Budget").map(category=>`<option value="${attr(category)}">${esc(category)}</option>`).join("")}`;
    else if (action === "payment-account") value.innerHTML = `<option value="">Choose account</option>${accountNames().map(name=>`<option value="${attr(name)}">${esc(name)}</option>`).join("")}`;
    else value.innerHTML = '<option value="">Choose a value</option>';
    value.disabled = !action;
    updatePaidBulkToolbar();
  }

  function correctPaidAccounts(items, newAccount) {
    const service = window.FinanceLedgerTransactions;
    if (!service?.correctPaidExpenseAccounts) throw new Error("Account ledger is updating. Reload Talaan before correcting payment accounts.");
    const result = service.correctPaidExpenseAccounts(items, newAccount);
    if (!result?.ok) {
      if (result?.reason === "insufficient") throw new Error(`${newAccount} does not have enough balance for these corrected payments.`);
      if (result?.reason === "missing-account") throw new Error("Choose an existing account.");
      throw new Error("The payment account correction could not be completed safely.");
    }
    return Number(result.count || 0);
  }

  function applyPaidBulkAction() {
    const items = (data.expenses || []).filter(item => paidSelection.has(item.id) && item.paid);
    const action = document.getElementById("paidProductivityAction")?.value;
    const value = document.getElementById("paidProductivityValue")?.value;
    if (!items.length || !action || !value) return;
    try {
      let count = 0;
      if (action === "category") {
        pushUndo(`Bulk category correction for ${items.length} paid expenses`);
        items.forEach(item => { if (item.category !== value) { item.category=value; count+=1; } });
        saveData(`${count} paid expense categor${count===1?"y":"ies"} corrected`);
      } else count = correctPaidAccounts(items,value);
      paidSelection.clear();
      document.getElementById("paidProductivityAction").value="";
      refreshPaidBulkValue();
    } catch (error) { showToast(error?.message || "Could not apply the bulk correction", "warning"); }
  }

  const baseRefreshBulkActionValue = refreshBulkActionValue;
  refreshBulkActionValue = function productivityRefreshBulkActionValue() {
    const action = document.getElementById("bulkExpenseAction")?.value;
    if (action !== "change-category") return baseRefreshBulkActionValue();
    const value = document.getElementById("bulkExpenseValue");
    value.hidden = false;
    value.innerHTML = expenseCategories(true).filter(category=>category!=="Reserved Budget").map(category=>`<option value="${attr(category)}">${esc(category)}</option>`).join("");
    updateBulkExpenseControls();
  };
  const baseApplyBulkExpenseAction = applyBulkExpenseAction;
  applyBulkExpenseAction = function productivityApplyBulkExpenseAction() {
    const action = document.getElementById("bulkExpenseAction")?.value;
    if (action !== "change-category") return baseApplyBulkExpenseAction();
    const ids = [...selectedExpenseIds];
    const items = data.expenses.filter(item => ids.includes(item.id) && !item.paid);
    const value = document.getElementById("bulkExpenseValue")?.value;
    if (!items.length || !value) return;
    pushUndo(`Bulk category change for ${items.length} expenses`);
    items.forEach(item => { item.category=value; });
    selectedExpenseIds.clear();
    document.getElementById("bulkExpenseAction").value="";
    refreshBulkActionValue();
    saveData(`${items.length} expense categor${items.length===1?"y":"ies"} updated`);
  };

  function ensureBulkCategoryOption() {
    const select = document.getElementById("bulkExpenseAction");
    if (select && !select.querySelector('option[value="change-category"]')) {
      const option = document.createElement("option"); option.value="change-category"; option.textContent="Change category";
      select.querySelector('option[value="change-account"]')?.before(option);
    }
  }

  function openRecentRecord(activityId) {
    const entry = activity.find(item => item.id === activityId);
    if (!entry) return;
    closeDialog("productivityCenterDialog");
    const collection = entry.collection, id = entry.recordId;
    if (collection === "expenses") { const item=data.expenses.find(row=>row.id===id); item ? openExpenseDialog(item) : goToPage("money"); }
    else if (collection === "incomeRecords") { const item=data.incomeRecords.find(row=>row.id===id); item ? openIncomeDialog(item) : goToPage("income"); }
    else if (collection === "projects") { const item=data.projects.find(row=>row.id===id); item ? openProjectDialog(item) : goToPage("projects"); }
    else if (collection === "savingsGoals") { const item=data.savingsGoals.find(row=>row.id===id); item ? openSavingsGoalDialog(item) : goToPage("dashboard"); }
    else if (collection === "accounts") openAccountDialog(id);
    else if (collection === "expenseTemplates") { const item=data.expenseTemplates.find(row=>row.id===id); item ? applyTemplateToExpenseForm(item) : openProductivityCenter("templates"); }
    else if (collection === "monthlyBudgets") { applySelectedMonth(id,false); goToPage("income",{smooth:false}); setTimeout(()=>document.getElementById("monthlyBudgetPlannerCard")?.scrollIntoView({behavior:"smooth",block:"start"}),0); }
    else { goToPage(entry.page || "settings",{smooth:false}); if (entry.page === "settings") setTimeout(()=>document.querySelector('[data-settings-tab="accounts"]')?.click(),0); }
  }

  function handleQuickAction(action) {
    if (action === "expense") { closeDialog("quickAddMenuDialog"); closeDialog("productivityCenterDialog"); openExpenseDialog(); }
    else if (action === "income") { closeDialog("quickAddMenuDialog"); openIncomeDialog(); }
    else if (action === "project") { closeDialog("quickAddMenuDialog"); openProjectDialog(); }
    else if (action === "transfer") { closeDialog("quickAddMenuDialog"); document.getElementById("openTransferDialog")?.click(); }
    else if (action === "duplicate") { closeDialog("quickAddMenuDialog"); renderDuplicateList(); openDialog("duplicateLastMonthDialog", "#duplicateLastMonthSearch"); }
    else if (action === "center") { closeDialog("quickAddMenuDialog"); openProductivityCenter("templates"); }
  }

  function editableTarget(target) {
    return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
  }

  function setupKeyboardShortcuts() {
    document.addEventListener("keydown", event => {
      if (data.productivitySettings?.shortcuts === false) return;
      const command = event.metaKey || event.ctrlKey;
      const key = String(event.key || "").toLowerCase();
      if (command && key === "k") { event.preventDefault(); openGlobalSearch(); return; }
      if (command && event.shiftKey && key === "a") { event.preventDefault(); openQuickMenu(); return; }
      if (command && event.shiftKey && key === "e") { event.preventDefault(); openExpenseDialog(); return; }
      if (command && event.shiftKey && key === "i") { event.preventDefault(); openIncomeDialog(); return; }
      if (command && event.shiftKey && key === "p") { event.preventDefault(); openProjectDialog(); return; }
      if (command && key === "z" && !event.shiftKey && !editableTarget(event.target) && !document.querySelector("dialog[open]")) { event.preventDefault(); undoLastChange(); return; }
      if (command && ((key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey)) && !editableTarget(event.target) && !document.querySelector("dialog[open]")) { event.preventDefault(); redoLastChange(); return; }
      if (!command && !event.altKey && key === "/" && !editableTarget(event.target) && !document.querySelector("dialog[open]")) { event.preventDefault(); openGlobalSearch(); return; }
      if (!command && !event.altKey && key === "?" && !editableTarget(event.target) && !document.querySelector("dialog[open]")) { event.preventDefault(); openProductivityCenter("shortcuts"); }
    });
  }

  function setupEvents() {
    document.addEventListener("click", event => {
      const quick = event.target.closest("#mobileAddExpenseButton");
      if (quick) { event.preventDefault(); event.stopImmediatePropagation(); openQuickMenu(); return; }
      if (event.target.closest("#globalSearchButton")) { openGlobalSearch(); return; }
      if (event.target.closest("#productivityCenterButton")) { openProductivityCenter("templates"); return; }
      const close = event.target.closest("[data-close-productivity]"); if (close) { closeDialog(close.dataset.closeProductivity); return; }
      const action = event.target.closest("[data-productivity-action]"); if (action) { handleQuickAction(action.dataset.productivityAction); return; }
      const template = event.target.closest("[data-use-expense-template]"); if (template) { const item=data.expenseTemplates.find(row=>row.id===template.dataset.useExpenseTemplate); if(item){ closeDialog("quickAddMenuDialog"); closeDialog("productivityCenterDialog"); applyTemplateToExpenseForm(item);} return; }
      const rename = event.target.closest("[data-rename-expense-template]"); if (rename) { updateTemplate(rename.dataset.renameExpenseTemplate); return; }
      const remove = event.target.closest("[data-delete-expense-template]"); if (remove) { deleteTemplate(remove.dataset.deleteExpenseTemplate); return; }
      if (event.target.closest("#saveExpenseTemplateButton")) { saveTemplateFromDialog(); return; }
      const recentAccount = event.target.closest("[data-recent-account]"); if (recentAccount) { setSelectValue(recentAccount.dataset.recentAccountTarget,recentAccount.dataset.recentAccount); return; }
      const reconcile = event.target.closest("[data-quick-reconcile]"); if (reconcile) { closeDialog("quickAddMenuDialog"); openAccountDialog(reconcile.dataset.quickReconcile); return; }
      const tab = event.target.closest("[data-productivity-tab]"); if (tab) { setProductivityTab(tab.dataset.productivityTab); return; }
      const recent = event.target.closest("[data-open-recent-record]"); if (recent) { openRecentRecord(recent.dataset.openRecentRecord); return; }
      const restore = event.target.closest("[data-restore-undo-snapshot]"); if (restore) { restoreUndoSnapshot(restore.dataset.restoreUndoSnapshot); return; }
      const searchResult = event.target.closest("[data-global-search-index]"); if (searchResult) { openSearchResult(searchResult.dataset.globalSearchIndex); return; }
      if (event.target.closest("[data-clear-global-search]")) { const input=document.getElementById("globalSearchInput"); if(input){input.value="";searchSelection=0;renderGlobalSearch();input.focus();} return; }
      const duplicate = event.target.closest("[data-duplicate-previous-expense]"); if (duplicate) { duplicatePreviousExpense(duplicate.dataset.duplicatePreviousExpense); return; }
      const filterButton = event.target.closest("[data-open-advanced-filters]"); if (filterButton) { openAdvancedFilters(filterButton.dataset.openAdvancedFilters); return; }
      const paidCheckbox = event.target.closest("[data-select-paid-expense]"); if (paidCheckbox) { const id=paidCheckbox.dataset.selectPaidExpense; paidCheckbox.checked ? paidSelection.add(id) : paidSelection.delete(id); updatePaidBulkToolbar(); return; }
      if (event.target.closest("#applyPaidProductivityAction")) { applyPaidBulkAction(); return; }
      if (event.target.closest("#clearPaidProductivitySelection")) { paidSelection.clear(); productivityRenderPaidExpenses(); return; }
      if (event.target.closest("#clearProductivityActivity")) { confirmProductivityAction({title:"Clear recent history?",message:"Clear recently edited history on this device?",details:"Finance records are not deleted.",confirmLabel:"Clear history",danger:true}).then(ok=>{if(ok){activity=[];writeJson(ACTIVITY_KEY,activity);renderProductivityPanels();}}); return; }
      if (event.target.closest("#clearProductivityUndo")) { confirmProductivityAction({title:"Clear undo history?",message:"Clear the multi-step undo history on this device?",details:"Your current finance records stay unchanged, but these older restore points will be removed.",confirmLabel:"Clear undo history",danger:true}).then(ok=>{if(ok){undoHistory=[];writeJson(UNDO_HISTORY_KEY,undoHistory);renderProductivityPanels();}}); return; }
    }, true);

    document.addEventListener("input", event => {
      if (event.target?.id === "globalSearchInput") { searchSelection=0; renderGlobalSearch(); }
      if (event.target?.id === "duplicateLastMonthSearch") renderDuplicateList();
    });
    document.addEventListener("change", event => {
      if (event.target?.id === "paidProductivityAction") refreshPaidBulkValue();
      if (event.target?.id === "paidProductivityValue") updatePaidBulkToolbar();
      if (event.target?.id === "selectAllVisiblePaid") {
        lastVisiblePaidIds.forEach(id => event.target.checked ? paidSelection.add(id) : paidSelection.delete(id));
        productivityRenderPaidExpenses();
      }
    });
    document.getElementById("advancedExpenseFilterForm")?.addEventListener("submit", event => {
      event.preventDefault();
      filters[filterMode] = {
        account:document.getElementById("productivityFilterAccount").value,
        status:document.getElementById("productivityFilterStatus").value,
        min:document.getElementById("productivityFilterMin").value.trim(),
        max:document.getElementById("productivityFilterMax").value.trim(),
        dateFrom:document.getElementById("productivityFilterDateFrom").value,
        dateTo:document.getElementById("productivityFilterDateTo").value
      };
      writeJson(FILTER_KEY,filters); updateAdvancedFilterButtons(); closeDialog("advancedExpenseFilterDialog");
      filterMode === "paid" ? productivityRenderPaidExpenses() : renderMoneyPage();
    });
    document.getElementById("clearAdvancedExpenseFilters")?.addEventListener("click", () => {
      filters[filterMode] = {account:"",min:"",max:"",dateFrom:"",dateTo:"",status:""};
      writeJson(FILTER_KEY,filters); updateAdvancedFilterButtons(); closeDialog("advancedExpenseFilterDialog");
      filterMode === "paid" ? productivityRenderPaidExpenses() : renderMoneyPage();
    });
    document.getElementById("globalSearchInput")?.addEventListener("keydown", event => {
      const node=document.getElementById("globalSearchResults"), count=Number(node?.dataset.resultCount||0);
      if (event.key === "ArrowDown" && count) { event.preventDefault(); searchSelection=(searchSelection+1)%count; renderGlobalSearch(); }
      else if (event.key === "ArrowUp" && count) { event.preventDefault(); searchSelection=(searchSelection-1+count)%count; renderGlobalSearch(); }
      else if (event.key === "Enter" && count) { event.preventDefault(); openSearchResult(searchSelection); }
    });
  }

  window.FinanceProductivityInternals = {
    normalizeTemplate, ensureProductivityShape, searchRecords, matchAdvancedFilter, recentAccounts,
    captureDataChanges, simpleHash, parseAmount, correctPaidAccounts
  };
  if (globalThis.__FINANCE_PRODUCTIVITY_TEST__) return;

  injectUi();
  ensureBulkCategoryOption();
  ensureUniversalActions();
  setupEvents();
  setupKeyboardShortcuts();
  updateAdvancedFilterButtons();
  renderProductivityPanels();
  renderRecentAccountSuggestions();
  observedData = clone(data);

  window.FinanceProductivityTools = {
    version:PRODUCTIVITY_VERSION,
    search:searchRecords,
    matchAdvancedFilter,
    normalizeTemplate,
    openSearch:openGlobalSearch,
    openQuickAdd:openQuickMenu,
    getFilters(mode) { return clone(filters[mode] || {}); },
    setFilters(mode, value, shouldRender = true) {
      if (!Object.prototype.hasOwnProperty.call(filters, mode)) return false;
      filters[mode] = {...filters[mode], ...(value || {})};
      writeJson(FILTER_KEY, filters);
      updateAdvancedFilterButtons();
      if (shouldRender) mode === "paid" ? productivityRenderPaidExpenses() : renderMoneyPage();
      return true;
    },
    get activity() { return clone(activity); },
    get undoHistory() { return clone(undoHistory.map(item=>({...item,data:undefined}))); },
    get templates() { return clone(data.expenseTemplates || []); }
  };

  function installPhaseOneStylesheet(file) {
    if (document.querySelector(`link[data-phase-one-asset="${file}"]`)) return;
    const link=document.createElement("link"); link.rel="stylesheet"; link.href=`./${file}?v=2.4.0-talaan1`; link.dataset.phaseOneAsset=file; document.head.append(link);
  }
  function installPhaseOneScript(file) {
    return new Promise(resolve=>{if(document.querySelector(`script[data-phase-one-asset="${file}"]`)){resolve(true);return;}const script=document.createElement("script");script.src=`./${file}?v=2.4.0-talaan1`;script.dataset.phaseOneAsset=file;script.onload=()=>resolve(true);script.onerror=()=>resolve(false);document.body.append(script);});
  }
  async function installPhaseOneWorkspace() {
    installPhaseOneStylesheet("transaction-views.css"); installPhaseOneStylesheet("privacy-display.css");
    if(!await installPhaseOneScript("transaction-views.js"))return false;
    return installPhaseOneScript("privacy-display.js");
  }
  void installPhaseOneWorkspace();
})();
