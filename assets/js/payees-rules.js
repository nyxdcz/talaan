"use strict";

/* Talaan Finance tools: normalized payees and deterministic transaction-rule preview.
   Original local-first implementation. Rules never change paid state or account balances. */
(function payeesRulesBootstrap() {
  const VERSION = 1;
  const RULE_FIELDS = ["name", "notes", "category", "account", "payee", "description", "type"];
  const OPERATORS = ["equals", "contains", "startsWith", "regex"];
  const ACTION_FIELDS = new Set(["payeeId", "category", "suggestedAccount", "tags", "includeInTotals"]);
  const clone = value => {
    try { return structuredClone(value); } catch (error) {}
    return JSON.parse(JSON.stringify(value ?? null));
  };
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const compact = (value, limit = 120) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, limit);
  const canonical = value => compact(value, 240).toLocaleLowerCase("en-PH");
  const nowIso = () => new Date().toISOString();
  const makeId = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  const validDate = value => Number.isFinite(Date.parse(String(value || ""))) ? String(value) : nowIso();

  function regexError(value) {
    try { new RegExp(String(value || ""), "iu"); return ""; }
    catch (error) { return String(error?.message || "Invalid regular expression"); }
  }

  function normalizeAliases(values, payeeName = "") {
    const seen = new Set([canonical(payeeName)]);
    return (Array.isArray(values) ? values : String(values || "").split(","))
      .map(value => compact(value, 80)).filter(value => {
        const key = canonical(value);
        if (!key || seen.has(key)) return false;
        seen.add(key); return true;
      }).slice(0, 40);
  }

  function normalizePayee(item) {
    if (!item || typeof item !== "object") return null;
    const name = compact(item.name, 80);
    if (!name) return null;
    return {
      id:compact(item.id || makeId("payee"), 120), name,
      aliases:normalizeAliases(item.aliases, name),
      defaultCategory:compact(item.defaultCategory, 40),
      defaultAccount:compact(item.defaultAccount, 100),
      archived:Boolean(item.archived), createdAt:validDate(item.createdAt), updatedAt:validDate(item.updatedAt || item.createdAt)
    };
  }

  function normalizeCondition(item) {
    if (!item || typeof item !== "object") return null;
    const field = RULE_FIELDS.includes(item.field) ? item.field : "description";
    const operator = OPERATORS.includes(item.operator) ? item.operator : "contains";
    const value = compact(item.value, 160);
    return value ? { field, operator, value } : null;
  }

  function normalizeActions(actions) {
    const source = actions && typeof actions === "object" && !Array.isArray(actions) ? actions : {};
    const output = {};
    if (source.payeeId) output.payeeId = compact(source.payeeId, 120);
    if (source.category) output.category = compact(source.category, 40);
    if (source.suggestedAccount) output.suggestedAccount = compact(source.suggestedAccount, 100);
    const tags = [...new Map((Array.isArray(source.tags) ? source.tags : String(source.tags || "").split(",")).map(tag => compact(tag, 32)).filter(Boolean).map(tag => [canonical(tag), tag])).values()].slice(0, 20);
    if (tags.length) output.tags = tags;
    if (typeof source.includeInTotals === "boolean") output.includeInTotals = source.includeInTotals;
    return output;
  }

  function normalizeRule(item) {
    if (!item || typeof item !== "object") return null;
    const name = compact(item.name, 80);
    const conditions = (Array.isArray(item.match?.conditions) ? item.match.conditions : []).map(normalizeCondition).filter(Boolean).slice(0, 12);
    if (!name || !conditions.length) return null;
    return {
      id:compact(item.id || makeId("rule"), 120), name, enabled:item.enabled !== false,
      priority:Math.max(0, Math.min(999999, Math.round(Number(item.priority ?? 100) || 0))),
      match:{ mode:item.match?.mode === "any" ? "any" : "all", conditions },
      actions:normalizeActions(item.actions), continue:Boolean(item.continue),
      createdAt:validDate(item.createdAt), updatedAt:validDate(item.updatedAt || item.createdAt)
    };
  }

  function validateRule(rule) {
    const errors = [];
    if (!compact(rule?.name, 80)) errors.push("Enter a rule name.");
    const conditions = Array.isArray(rule?.match?.conditions) ? rule.match.conditions : [];
    if (!conditions.length) errors.push("Add at least one condition.");
    conditions.forEach((condition, index) => {
      if (!RULE_FIELDS.includes(condition?.field)) errors.push(`Condition ${index + 1} has an unsupported field.`);
      if (!OPERATORS.includes(condition?.operator)) errors.push(`Condition ${index + 1} has an unsupported operator.`);
      if (!compact(condition?.value, 160)) errors.push(`Condition ${index + 1} needs a value.`);
      if (condition?.operator === "regex") { const error = regexError(condition.value); if (error) errors.push(`Condition ${index + 1}: ${error}`); }
    });
    const rawActionKeys = Object.keys(rule?.actions || {});
    const unsupportedActions = rawActionKeys.filter(key => !ACTION_FIELDS.has(key));
    if (unsupportedActions.length) errors.push(`Unsupported action${unsupportedActions.length === 1 ? "" : "s"}: ${unsupportedActions.join(", ")}.`);
    const actionKeys = rawActionKeys.filter(key => ACTION_FIELDS.has(key));
    if (!actionKeys.length) errors.push("Choose at least one safe action.");
    return errors;
  }

  function normalizeTools(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const payeeSeen = new Set();
    const payees = (Array.isArray(source.payees) ? source.payees : []).map(normalizePayee).filter(item => item && !payeeSeen.has(item.id) && payeeSeen.add(item.id));
    const ruleSeen = new Set();
    const transactionRules = (Array.isArray(source.transactionRules) ? source.transactionRules : []).map(normalizeRule).filter(item => item && !ruleSeen.has(item.id) && ruleSeen.add(item.id));
    return { version:VERSION, payees, transactionRules };
  }

  function ensureShape(source) {
    const target = source && typeof source === "object" ? source : {};
    target.ledgerSettings = target.ledgerSettings && typeof target.ledgerSettings === "object" && !Array.isArray(target.ledgerSettings) ? target.ledgerSettings : {};
    target.ledgerSettings.financeTools = normalizeTools(target.ledgerSettings.financeTools);
    return target;
  }

  const baseNormalizeData = normalizeData;
  normalizeData = value => ensureShape(baseNormalizeData(value));
  data = ensureShape(data);
  function tools() {
    const current = data?.ledgerSettings?.financeTools;
    if (!current || typeof current !== "object" || !Array.isArray(current.payees) || !Array.isArray(current.transactionRules)) data = ensureShape(data);
    return data.ledgerSettings.financeTools;
  }
  const orderedRules = () => [...tools().transactionRules].filter(rule => rule.enabled && !validateRule(rule).length)
    .sort((a, b) => a.priority - b.priority || String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
  const payeeById = id => tools().payees.find(payee => payee.id === id) || null;

  function resolvePayee(value) {
    const key = canonical(value);
    if (!key) return null;
    return tools().payees.find(payee => !payee.archived && [payee.name, ...payee.aliases].some(alias => canonical(alias) === key)) || null;
  }

  function recordField(record, field) {
    if (field === "description") return `${record?.name || ""} ${record?.notes || ""}`;
    if (field === "payee") return payeeById(record?.payeeId)?.name || record?.payee || record?.name || "";
    if (field === "type") return record?.expenseType || record?.categoryGroup || record?.type || "";
    return record?.[field] ?? "";
  }

  function conditionMatches(record, condition) {
    const actual = compact(recordField(record, condition.field), 500);
    const expected = compact(condition.value, 160);
    if (condition.operator === "regex") {
      if (regexError(expected)) return false;
      return new RegExp(expected, "iu").test(actual);
    }
    const left = canonical(actual), right = canonical(expected);
    if (condition.operator === "equals") return left === right;
    if (condition.operator === "startsWith") return left.startsWith(right);
    return left.includes(right);
  }

  function ruleMatches(record, rule) {
    if (!rule?.enabled || validateRule(rule).length) return false;
    const results = rule.match.conditions.map(condition => conditionMatches(record, condition));
    return rule.match.mode === "any" ? results.some(Boolean) : results.every(Boolean);
  }

  function applySafeActions(record, rule) {
    const next = clone(record), changes = [];
    const set = (field, value, label = field) => {
      if (JSON.stringify(next[field] ?? null) === JSON.stringify(value ?? null)) return;
      changes.push({ field, label, before:clone(next[field] ?? null), after:clone(value ?? null), ruleId:rule.id, ruleName:rule.name });
      next[field] = clone(value);
    };
    const actions = normalizeActions(rule.actions);
    if (actions.payeeId) {
      const payee = payeeById(actions.payeeId);
      if (payee && !payee.archived) {
        set("payeeId", payee.id, "Payee");
        if (!actions.category && payee.defaultCategory) set("category", payee.defaultCategory, "Category");
        if (!actions.suggestedAccount && payee.defaultAccount) set("suggestedAccount", payee.defaultAccount, "Account suggestion");
      }
    }
    if (actions.category) set("category", actions.category, "Category");
    if (actions.suggestedAccount) set("suggestedAccount", actions.suggestedAccount, "Account suggestion");
    if (actions.tags) set("tags", [...new Map([...(Array.isArray(next.tags) ? next.tags : []), ...actions.tags].map(tag => [canonical(tag), compact(tag, 32)])).values()].filter(Boolean), "Tags");
    if (typeof actions.includeInTotals === "boolean") set("includeInTotals", actions.includeInTotals, "Calculated totals");
    return { record:next, changes };
  }

  function previewRecord(record, collection = "expenses") {
    let working = clone(record), changes = [];
    const matches = [];
    for (const rule of orderedRules()) {
      if (!ruleMatches(working, rule)) continue;
      const result = applySafeActions(working, rule);
      matches.push({ id:rule.id, name:rule.name, priority:rule.priority, changes:result.changes.length });
      working = result.record; changes = [...changes, ...result.changes];
      if (!rule.continue) break;
    }
    return { collection, recordId:String(record?.id || ""), before:clone(record), after:working, matches, changes };
  }

  function previewRecords(records, options = {}) {
    const collection = options.collection === "incomeRecords" ? "incomeRecords" : "expenses";
    return (Array.isArray(records) ? records : []).filter(record => record?.id).map(record => previewRecord(record, collection));
  }

  let currentPayeeId = "", currentRuleId = "", latestPreview = [];
  const toast = (message, tone = "info") => typeof showToast === "function" ? showToast(message, tone) : undefined;
  const canWrite = () => window.FinanceProfileArchitecture?.canWrite?.() !== false && !document.body.classList.contains("finance-signed-out");
  async function confirmAction(options) {
    if (typeof openAppConfirmation === "function") return openAppConfirmation(options);
    return window.confirm(`${options.title || "Confirm"}\n\n${options.message || ""}`);
  }
  async function recovery(label) {
    if (window.FinancePrivacyLock?.recoveryStorage?.save) return window.FinancePrivacyLock.recoveryStorage.save(label, clone(data));
    return typeof createRecoverySnapshot === "function" ? createRecoverySnapshot(label, clone(data)) : null;
  }
  function persist(label) {
    const financeTools = normalizeTools(tools());
    data = normalizeData(data);
    data.ledgerSettings = data.ledgerSettings && typeof data.ledgerSettings === "object" && !Array.isArray(data.ledgerSettings) ? data.ledgerSettings : {};
    data.ledgerSettings.financeTools = financeTools;
    return typeof saveData === "function" ? saveData(label) : false;
  }
  function openSettingsTools() {
    if (typeof goToPage === "function") goToPage("settings", { smooth:false });
    if (typeof activateSettingsPanel === "function") activateSettingsPanel("finance-tools", true, true);
    setTimeout(() => document.getElementById("settings-panel-finance-tools")?.scrollIntoView({ block:"start" }), 0);
  }

  function ensureDialogs() {
    if (!document.getElementById("payeeDialog")) document.body.insertAdjacentHTML("beforeend", `
      <dialog class="app-dialog finance-tool-dialog" id="payeeDialog" aria-labelledby="payeeDialogTitle"><form id="payeeForm">
        <div class="modal-header"><h3 id="payeeDialogTitle">Add payee</h3><button class="button button-secondary button-small" type="button" data-close-finance-dialog="payeeDialog">Close</button></div>
        <div class="modal-body finance-tool-form-grid"><label class="field"><span>Name</span><input class="input" id="payeeName" maxlength="80" required></label><label class="field finance-tool-wide"><span>Aliases</span><input class="input" id="payeeAliases" maxlength="600" placeholder="Comma-separated names"><small>Matching ignores case, Unicode width differences, and repeated spaces.</small></label><label class="field"><span>Default category</span><input class="input" id="payeeDefaultCategory" maxlength="40"></label><label class="field"><span>Default account suggestion</span><select class="select" id="payeeDefaultAccount"></select></label><label class="finance-tool-checkbox"><input type="checkbox" id="payeeArchived"> Archived</label><p class="field-error finance-tool-wide" id="payeeFormError" role="alert" hidden></p></div>
        <div class="modal-footer"><button class="button button-secondary" type="button" data-close-finance-dialog="payeeDialog">Cancel</button><span class="footer-spacer"></span><button class="button button-primary" type="submit">Save payee</button></div>
      </form></dialog>`);
    if (!document.getElementById("ruleDialog")) document.body.insertAdjacentHTML("beforeend", `
      <dialog class="app-dialog finance-tool-dialog finance-tool-dialog-wide" id="ruleDialog" aria-labelledby="ruleDialogTitle"><form id="ruleForm">
        <div class="modal-header"><h3 id="ruleDialogTitle">Add transaction rule</h3><button class="button button-secondary button-small" type="button" data-close-finance-dialog="ruleDialog">Close</button></div>
        <div class="modal-body"><div class="finance-tool-form-grid"><label class="field finance-tool-wide"><span>Rule name</span><input class="input" id="ruleName" maxlength="80" required></label><label class="field"><span>Priority</span><input class="input" id="rulePriority" type="number" min="0" max="999999" value="100"></label><label class="field"><span>Condition mode</span><select class="select" id="ruleMatchMode"><option value="all">Match all</option><option value="any">Match any</option></select></label><label class="finance-tool-checkbox"><input type="checkbox" id="ruleEnabled" checked> Enabled</label><label class="finance-tool-checkbox"><input type="checkbox" id="ruleContinue"> Continue to later rules</label></div>
        <section class="finance-rule-editor-section"><div class="finance-tool-section-heading"><div><h4>Conditions</h4><small>Equals, contains, starts with, or validated regex</small></div><button class="button button-secondary button-small" type="button" id="addRuleCondition">Add condition</button></div><div id="ruleConditions"></div></section>
        <section class="finance-rule-editor-section"><div class="finance-tool-section-heading"><div><h4>Safe actions</h4><small>Account is a suggestion only; paid state is never available here</small></div></div><div class="finance-tool-form-grid"><label class="field"><span>Payee</span><select class="select" id="ruleActionPayee"></select></label><label class="field"><span>Category</span><input class="input" id="ruleActionCategory" maxlength="40"></label><label class="field"><span>Account suggestion</span><select class="select" id="ruleActionAccount"></select></label><label class="field"><span>Add tags</span><input class="input" id="ruleActionTags" maxlength="300" placeholder="Comma-separated tags"></label><label class="field"><span>Calculated totals</span><select class="select" id="ruleActionTotals"><option value="">No change</option><option value="include">Include</option><option value="exclude">Exclude</option></select></label></div></section><p class="field-error" id="ruleFormError" role="alert" hidden></p></div>
        <div class="modal-footer"><button class="button button-secondary" type="button" data-close-finance-dialog="ruleDialog">Cancel</button><span class="footer-spacer"></span><button class="button button-primary" type="submit">Save rule</button></div>
      </form></dialog>`);
  }

  function accountOptions(selected = "") { return `<option value="">No suggestion</option>${Object.keys(data.accounts || {}).map(name => `<option value="${esc(name)}" ${name === selected ? "selected" : ""}>${esc(name)}</option>`).join("")}`; }
  function payeeOptions(selected = "") { return `<option value="">No change</option>${tools().payees.filter(payee => !payee.archived).map(payee => `<option value="${esc(payee.id)}" ${payee.id === selected ? "selected" : ""}>${esc(payee.name)}</option>`).join("")}`; }
  function conditionRow(condition = {}) {
    const field = RULE_FIELDS.includes(condition.field) ? condition.field : "description", operator = OPERATORS.includes(condition.operator) ? condition.operator : "contains";
    return `<div class="finance-rule-condition" data-rule-condition><label class="field"><span>Field</span><select class="select" data-condition-field>${RULE_FIELDS.map(value => `<option value="${value}" ${value === field ? "selected" : ""}>${esc(value[0].toUpperCase() + value.slice(1))}</option>`).join("")}</select></label><label class="field"><span>Operator</span><select class="select" data-condition-operator>${OPERATORS.map(value => `<option value="${value}" ${value === operator ? "selected" : ""}>${esc(value === "startsWith" ? "Starts with" : value[0].toUpperCase() + value.slice(1))}</option>`).join("")}</select></label><label class="field finance-condition-value"><span>Value</span><input class="input" data-condition-value maxlength="160" value="${esc(condition.value || "")}" required></label><button class="button button-secondary finance-remove-condition" type="button" data-remove-rule-condition aria-label="Remove condition">Remove</button></div>`;
  }

  function renderPanel() {
    const panel = document.getElementById("settings-panel-finance-tools"); if (!panel) return;
    const activePayees = tools().payees.filter(payee => !payee.archived).length;
    const enabledRules = tools().transactionRules.filter(rule => rule.enabled).length;
    const householdGroups = (data.ledgerSettings?.householdSplits?.groups || []).filter(group => !group.archived).length;
    panel.innerHTML = `<div class="settings-section-intro"><div><h3>Finance tools</h3><p>Normalize transaction names and preview deterministic changes before applying them.</p></div><span class="status-chip info">Local-first</span></div>
      <article class="card" id="financeToolsPayees"><div class="card-header finance-tool-card-header"><div><h3>Payees</h3><p>Canonical names, aliases, and optional defaults</p></div><button class="button button-primary" type="button" data-add-payee>Add payee</button></div><div class="finance-tool-list" id="financePayeeList"></div></article>
      <article class="card" id="financeToolsRules"><div class="card-header finance-tool-card-header"><div><h3>Transaction rules</h3><p>Lower priority numbers run first; ties use creation time then ID</p></div><div class="finance-tool-header-actions"><button class="button button-secondary" type="button" data-export-rules>Export</button><label class="button button-secondary finance-rule-import">Import<input type="file" accept="application/json,.json" data-import-rules hidden></label><button class="button button-primary" type="button" data-add-rule>Add rule</button></div></div><div class="finance-tool-list" id="financeRuleList"></div></article>
      <article class="card" id="financeRulePreview"><div class="card-header"><div><h3>Rule preview</h3><p>Review every matched rule and proposed change before applying</p></div><span class="status-chip info" id="rulePreviewStatus">Not run</span></div><div class="finance-preview-controls"><label class="field"><span>Records</span><select class="select" id="rulePreviewCollection"><option value="expenses">Expenses</option><option value="incomeRecords">Income</option></select></label><label class="field"><span>Search</span><input class="input" id="rulePreviewSearch" type="search" placeholder="Optional name or note"></label><button class="button button-secondary" type="button" data-run-rule-preview>Preview changes</button></div><div class="finance-rule-preview-list" id="financeRulePreviewList"><div class="system-empty">Run Preview to evaluate current records. Nothing is changed during preview.</div></div><div class="finance-preview-footer" hidden><span id="rulePreviewSelectionSummary">0 selected</span><button class="button button-primary" type="button" data-apply-rule-preview>Apply selected changes</button></div></article>`;
    const payeeList = panel.querySelector("#financePayeeList");
    payeeList.innerHTML = tools().payees.length ? tools().payees.map(payee => `<div class="finance-tool-row ${payee.archived ? "is-archived" : ""}"><div><strong>${esc(payee.name)}</strong><small>${payee.aliases.length ? `${esc(payee.aliases.join(", "))} · ` : ""}${payee.defaultCategory ? esc(payee.defaultCategory) : "No default category"}${payee.defaultAccount ? ` · Suggest ${esc(payee.defaultAccount)}` : ""}</small></div><div class="finance-tool-row-actions"><span class="status-chip ${payee.archived ? "neutral" : "success"}">${payee.archived ? "Archived" : "Active"}</span><button class="button button-secondary button-small" type="button" data-edit-payee="${esc(payee.id)}">Edit</button></div></div>`).join("") : `<div class="system-empty">No normalized payees yet. Add one to group aliases under a consistent name.</div>`;
    const ruleList = panel.querySelector("#financeRuleList");
    ruleList.innerHTML = tools().transactionRules.length ? [...tools().transactionRules].sort((a,b) => a.priority-b.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(rule => `<div class="finance-tool-row"><div><strong>${esc(rule.name)}</strong><small>Priority ${rule.priority} · ${rule.match.mode === "all" ? "All" : "Any"} of ${rule.match.conditions.length} condition${rule.match.conditions.length === 1 ? "" : "s"} · ${rule.continue ? "Continue" : "Stop after match"}</small></div><div class="finance-tool-row-actions"><button class="status-chip ${rule.enabled ? "success" : "neutral"}" type="button" data-toggle-rule="${esc(rule.id)}" aria-pressed="${rule.enabled}">${rule.enabled ? "Enabled" : "Disabled"}</button><button class="button button-secondary button-small" type="button" data-edit-rule="${esc(rule.id)}">Edit</button><button class="button button-secondary button-small" type="button" data-delete-rule="${esc(rule.id)}">Delete</button></div></div>`).join("") : `<div class="system-empty">No transaction rules. Add a rule, then preview it against existing records.</div>`;
    const status = document.getElementById("settingsOverviewFinanceToolsStatus"), text = document.getElementById("settingsOverviewFinanceToolsText"), chip = document.getElementById("settingsOverviewFinanceToolsChip");
    if (status) status.textContent = `${activePayees} payee${activePayees === 1 ? "" : "s"} · ${enabledRules} rule${enabledRules === 1 ? "" : "s"} · ${householdGroups} household${householdGroups === 1 ? "" : "s"}`;
    if (text) text.textContent = "Preview rules, import statements, and reconcile shared bills.";
    if (chip) { const configured = enabledRules || householdGroups; chip.textContent = configured ? "Configured" : "Ready"; chip.className = `settings-state-chip ${configured ? "success" : "neutral"}`; }
    panel.querySelector("[data-add-payee]").onclick = event => { event.stopPropagation(); openPayee(); };
    panel.querySelector("[data-add-rule]").onclick = event => { event.stopPropagation(); openRule(); };
    panel.onclick = event => { event.stopPropagation(); void handlePanelClick(event); };
    panel.onchange = event => { event.stopPropagation(); handlePanelChange(event); };
  }

  function openPayee(id = "") {
    ensureDialogs(); currentPayeeId = id; const payee = payeeById(id);
    document.getElementById("payeeDialogTitle").textContent = payee ? "Edit payee" : "Add payee";
    document.getElementById("payeeName").value = payee?.name || ""; document.getElementById("payeeAliases").value = payee?.aliases?.join(", ") || "";
    document.getElementById("payeeDefaultCategory").value = payee?.defaultCategory || ""; document.getElementById("payeeDefaultAccount").innerHTML = accountOptions(payee?.defaultAccount || ""); document.getElementById("payeeArchived").checked = Boolean(payee?.archived);
    document.getElementById("payeeFormError").hidden = true;
    if (typeof showAppDialog === "function") showAppDialog("payeeDialog", "#payeeName");
    else { const dialog = document.getElementById("payeeDialog"); if (!dialog.open) dialog.showModal(); setTimeout(() => document.getElementById("payeeName")?.focus(), 0); }
  }

  function collectRuleForm() {
    const totals = document.getElementById("ruleActionTotals").value;
    const actions = normalizeActions({ payeeId:document.getElementById("ruleActionPayee").value, category:document.getElementById("ruleActionCategory").value, suggestedAccount:document.getElementById("ruleActionAccount").value, tags:document.getElementById("ruleActionTags").value, ...(totals ? { includeInTotals:totals === "include" } : {}) });
    const existingRule = currentRuleId ? tools().transactionRules.find(rule => rule.id === currentRuleId) : null;
    return normalizeRule({ id:currentRuleId || makeId("rule"), name:document.getElementById("ruleName").value, enabled:document.getElementById("ruleEnabled").checked, priority:document.getElementById("rulePriority").value, match:{ mode:document.getElementById("ruleMatchMode").value, conditions:[...document.querySelectorAll("[data-rule-condition]")].map(row => ({ field:row.querySelector("[data-condition-field]").value, operator:row.querySelector("[data-condition-operator]").value, value:row.querySelector("[data-condition-value]").value })) }, actions, continue:document.getElementById("ruleContinue").checked, createdAt:existingRule?.createdAt || nowIso(), updatedAt:nowIso() });
  }

  function openRule(id = "") {
    ensureDialogs(); currentRuleId = id; const rule = tools().transactionRules.find(item => item.id === id) || null;
    document.getElementById("ruleDialogTitle").textContent = rule ? "Edit transaction rule" : "Add transaction rule"; document.getElementById("ruleName").value = rule?.name || ""; document.getElementById("rulePriority").value = String(rule?.priority ?? 100); document.getElementById("ruleMatchMode").value = rule?.match?.mode || "all"; document.getElementById("ruleEnabled").checked = rule?.enabled !== false; document.getElementById("ruleContinue").checked = Boolean(rule?.continue);
    document.getElementById("ruleConditions").innerHTML = (rule?.match?.conditions?.length ? rule.match.conditions : [{field:"description",operator:"contains",value:""}]).map(conditionRow).join("");
    document.getElementById("ruleActionPayee").innerHTML = payeeOptions(rule?.actions?.payeeId || ""); document.getElementById("ruleActionCategory").value = rule?.actions?.category || ""; document.getElementById("ruleActionAccount").innerHTML = accountOptions(rule?.actions?.suggestedAccount || ""); document.getElementById("ruleActionTags").value = rule?.actions?.tags?.join(", ") || ""; document.getElementById("ruleActionTotals").value = typeof rule?.actions?.includeInTotals === "boolean" ? (rule.actions.includeInTotals ? "include" : "exclude") : "";
    document.getElementById("ruleFormError").hidden = true;
    if (typeof showAppDialog === "function") showAppDialog("ruleDialog", "#ruleName");
    else { const dialog = document.getElementById("ruleDialog"); if (!dialog.open) dialog.showModal(); setTimeout(() => document.getElementById("ruleName")?.focus(), 0); }
  }

  function closeDialog(id) { const dialog = document.getElementById(id); if (dialog?.open) dialog.close(); }
  function formatChange(change) {
    const value = item => item === null || item === "" ? "None" : Array.isArray(item) ? item.join(", ") : typeof item === "boolean" ? (item ? "Included" : "Excluded") : String(item);
    return `${change.label}: ${value(change.before)} → ${value(change.after)}`;
  }
  function updatePreviewSelection() {
    const checked = [...document.querySelectorAll("[data-preview-record]:checked")]; const summary = document.getElementById("rulePreviewSelectionSummary"); if (summary) summary.textContent = `${checked.length} selected`; const button = document.querySelector("[data-apply-rule-preview]"); if (button) button.disabled = !checked.length;
  }
  function runPreview() {
    const collection = document.getElementById("rulePreviewCollection").value === "incomeRecords" ? "incomeRecords" : "expenses"; const query = canonical(document.getElementById("rulePreviewSearch").value);
    const records = (data[collection] || []).filter(record => !query || canonical(`${record.name || ""} ${record.notes || ""} ${record.category || ""}`).includes(query)); latestPreview = previewRecords(records, { collection }).filter(item => item.changes.length);
    const list = document.getElementById("financeRulePreviewList"); const status = document.getElementById("rulePreviewStatus"); const footer = document.querySelector(".finance-preview-footer");
    status.textContent = `${latestPreview.length} proposed`; status.className = `status-chip ${latestPreview.length ? "warning" : "success"}`; footer.hidden = !latestPreview.length;
    list.innerHTML = latestPreview.length ? latestPreview.map((item,index) => `<article class="finance-preview-item"><label class="finance-preview-select"><input type="checkbox" data-preview-record="${index}" checked><span><strong>${esc(item.before.name || item.before.description || item.recordId)}</strong><small>${esc(item.collection === "incomeRecords" ? "Income" : "Expense")} · ${item.matches.map(rule => `${esc(rule.name)} (#${rule.priority})`).join(" → ")}</small></span></label><ul>${item.changes.map(change => `<li><strong>${esc(change.ruleName)}</strong>: ${esc(formatChange(change))}</li>`).join("")}</ul></article>`).join("") : `<div class="system-empty">No proposed changes. Disabled or invalid rules never execute.</div>`;
    updatePreviewSelection();
  }

  async function applyPreview() {
    if (!canWrite()) return toast("Sign in with an Owner or Editor profile to apply rules", "warning");
    const indexes = [...document.querySelectorAll("[data-preview-record]:checked")].map(input => Number(input.dataset.previewRecord)).filter(Number.isInteger); const chosen = indexes.map(index => latestPreview[index]).filter(Boolean); if (!chosen.length) return;
    const confirmed = await confirmAction({ title:"Apply previewed rule changes?", message:`Apply the reviewed changes to ${chosen.length} record${chosen.length === 1 ? "" : "s"}?`, details:"A recovery copy and Undo point will be created. Account balances and paid state remain unchanged.", confirmLabel:"Apply changes" }); if (!confirmed) return;
    const accountsBefore = JSON.stringify(data.accounts || {}); await recovery("Before transaction rule bulk apply"); if (typeof pushUndo === "function") pushUndo("Apply transaction rules");
    let applied = 0, skipped = 0;
    chosen.forEach(item => { const collection = item.collection === "incomeRecords" ? "incomeRecords" : "expenses"; const index = (data[collection] || []).findIndex(record => String(record.id) === item.recordId); if (index < 0 || JSON.stringify(data[collection][index]) !== JSON.stringify(item.before)) { skipped += 1; return; } data[collection][index] = clone(item.after); applied += 1; });
    if (JSON.stringify(data.accounts || {}) !== accountsBefore) throw new Error("Rule apply attempted to change account balances.");
    if (applied) persist(`Applied transaction rules to ${applied} record${applied === 1 ? "" : "s"}`); latestPreview = []; renderPanel(); if (skipped) toast(`${skipped} changed record${skipped === 1 ? " was" : "s were"} skipped; preview again`, "warning");
  }

  function exportRules() {
    const bundle = { format:"talaan-transaction-rules-v1", version:VERSION, exportedAt:nowIso(), transactionRules:clone(tools().transactionRules) }; const blob = new Blob([JSON.stringify(bundle, null, 2)], { type:"application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `talaan-transaction-rules-${nowIso().slice(0,10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  async function importRules(file) {
    if (!file || !canWrite()) return; let parsed;
    try { parsed = JSON.parse(await file.text()); } catch (error) { return toast("The transaction-rule file is not valid JSON", "warning"); }
    if (parsed?.format !== "talaan-transaction-rules-v1" || !Array.isArray(parsed.transactionRules)) return toast("Choose a Talaan transaction-rule export", "warning");
    const normalized = parsed.transactionRules.map(normalizeRule);
    const invalid = normalized.some((rule, index) => {
      if (!rule || validateRule(rule).length) return true;
      const importedActions = parsed.transactionRules[index]?.actions;
      return !importedActions || Object.keys(importedActions).some(key => !ACTION_FIELDS.has(key));
    });
    if (invalid) return toast("Import stopped: every rule must have valid conditions, regex, and safe actions", "warning");
    const confirmed = await confirmAction({ title:"Import transaction rules?", message:`Merge ${normalized.length} validated rule${normalized.length === 1 ? "" : "s"} by rule ID?`, details:"Existing rules with the same ID will be replaced after a recovery copy is created.", confirmLabel:"Import rules" }); if (!confirmed) return;
    await recovery("Before transaction rule import"); if (typeof pushUndo === "function") pushUndo("Import transaction rules"); const map = new Map(tools().transactionRules.map(rule => [rule.id, rule])); normalized.forEach(rule => map.set(rule.id, rule)); tools().transactionRules = [...map.values()]; persist("Transaction rules imported"); renderPanel();
  }

  async function handlePanelClick(event) {
    const target = event.target;
    const editPayee = target.closest("[data-edit-payee]"); if (editPayee) return openPayee(editPayee.dataset.editPayee);
    const editRule = target.closest("[data-edit-rule]"); if (editRule) return openRule(editRule.dataset.editRule);
    const toggle = target.closest("[data-toggle-rule]"); if (toggle && canWrite()) { const rule = tools().transactionRules.find(item => item.id === toggle.dataset.toggleRule); if (rule) { pushUndo?.(`${rule.enabled ? "Disable" : "Enable"} transaction rule`); rule.enabled = !rule.enabled; rule.updatedAt = nowIso(); persist(`Transaction rule ${rule.enabled ? "enabled" : "disabled"}`); renderPanel(); } return; }
    const removeRule = target.closest("[data-delete-rule]"); if (removeRule && canWrite()) { const rule = tools().transactionRules.find(item => item.id === removeRule.dataset.deleteRule); if (rule && await confirmAction({ title:"Delete transaction rule?", message:`Delete “${rule.name}”?`, details:"Existing transactions are not changed.", confirmLabel:"Delete rule", danger:true })) { pushUndo?.("Delete transaction rule"); tools().transactionRules = tools().transactionRules.filter(item => item.id !== rule.id); persist("Transaction rule deleted"); renderPanel(); } return; }
    if (target.closest("[data-run-rule-preview]")) return runPreview(); if (target.closest("[data-apply-rule-preview]")) { try { await applyPreview(); } catch (error) { toast(error.message || "Rule changes could not be applied", "warning"); } return; }
    if (target.closest("[data-export-rules]")) return exportRules();
  }

  function handlePanelChange(event) {
    if (event.target.matches("[data-preview-record]")) updatePreviewSelection();
    if (event.target.matches("[data-import-rules]")) importRules(event.target.files?.[0]).finally(() => { event.target.value = ""; });
  }

  function bindEvents() {
    document.addEventListener("click", async event => {
      const target = event.target;
      const close = target.closest("[data-close-finance-dialog]"); if (close) return closeDialog(close.dataset.closeFinanceDialog);
      if (target.closest("#addRuleCondition")) { document.getElementById("ruleConditions").insertAdjacentHTML("beforeend", conditionRow()); return; }
      const remove = target.closest("[data-remove-rule-condition]"); if (remove) { const rows = document.querySelectorAll("[data-rule-condition]"); if (rows.length > 1) remove.closest("[data-rule-condition]").remove(); else toast("A rule needs at least one condition", "warning"); return; }
    });
    const submitFinanceToolForm = event => {
      event.stopPropagation();
      if (event.target.matches("#payeeForm")) { event.preventDefault(); if (!canWrite()) return; const item = normalizePayee({ id:currentPayeeId || makeId("payee"), name:document.getElementById("payeeName").value, aliases:document.getElementById("payeeAliases").value, defaultCategory:document.getElementById("payeeDefaultCategory").value, defaultAccount:document.getElementById("payeeDefaultAccount").value, archived:document.getElementById("payeeArchived").checked, createdAt:payeeById(currentPayeeId)?.createdAt || nowIso(), updatedAt:nowIso() }); const error = document.getElementById("payeeFormError"); if (!item) { error.textContent = "Enter a payee name."; error.hidden = false; return; } const duplicate = tools().payees.find(payee => payee.id !== item.id && [payee.name,...payee.aliases].some(value => [item.name,...item.aliases].some(next => canonical(value) === canonical(next)))); if (duplicate) { error.textContent = `That name or alias already belongs to ${duplicate.name}.`; error.hidden = false; return; } pushUndo?.(currentPayeeId ? "Edit payee" : "Add payee"); const index = tools().payees.findIndex(payee => payee.id === item.id); if (index >= 0) tools().payees[index] = item; else tools().payees.push(item); persist(currentPayeeId ? "Payee updated" : "Payee added"); closeDialog("payeeDialog"); renderPanel(); return; }
      if (event.target.matches("#ruleForm")) { event.preventDefault(); if (!canWrite()) return; const rule = collectRuleForm(); const errors = rule ? validateRule(rule) : ["Complete the rule name and conditions."]; const error = document.getElementById("ruleFormError"); if (errors.length) { error.innerHTML = errors.map(message => esc(message)).join("<br>"); error.hidden = false; return; } pushUndo?.(currentRuleId ? "Edit transaction rule" : "Add transaction rule"); const index = tools().transactionRules.findIndex(item => item.id === rule.id); if (index >= 0) tools().transactionRules[index] = rule; else tools().transactionRules.push(rule); persist(currentRuleId ? "Transaction rule updated" : "Transaction rule added"); closeDialog("ruleDialog"); renderPanel(); }
    };
    document.getElementById("payeeForm")?.addEventListener("submit", submitFinanceToolForm);
    document.getElementById("ruleForm")?.addEventListener("submit", submitFinanceToolForm);
  }

  ensureDialogs(); renderPanel(); bindEvents();
  window.addEventListener("finance:profile-changed", () => { data = ensureShape(data); latestPreview = []; renderPanel(); });
  window.addEventListener("finance:data-persisted", () => renderPanel());
  window.FinancePayeeRules = { version:VERSION, open:openSettingsTools, openPayee, openRule, normalizeTools, normalizePayee, normalizeRule, validateRule, regexError, resolvePayee, ruleMatches, previewRecord, previewRecords, get data() { return clone(tools()); } };
})();
