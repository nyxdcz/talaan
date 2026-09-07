"use strict";

/* Profile-scoped presentation preferences for the three transaction workspaces.
   This module never writes to finance data, backup payloads, or cloud sync. */
(function transactionViewsBootstrap() {
  const STORAGE_PREFIX = "simple-finance-transaction-views-v1";
  const WORKSPACES = {
    income: {
      page:"income", anchor:".income-records-card .record-header", listIds:["incomeList"], rowSelector:".income-record-row",
      columns:[['identity','Income',true],['category','Category'],['date','Date received'],['account','Account'],['amount','Amount',true],['actions','Actions',true]],
      filters:{search:"incomeSearch",category:"incomeCategoryFilter"}
    },
    expense: {
      page:"money", anchor:"#expenseFiltersPanel + .section-stack", listIds:["earlyExpenses","lateExpenses","otherExpenses"], rowSelector:"[data-expense-row]",
      columns:[['identity','Expense',true],['date','Due date'],['account','Payment account'],['amount','Amount',true],['actions','Actions',true]],
      filters:{search:"expenseSearch",category:"expenseCategoryFilter",dateRange:"expenseDateFilter"}
    },
    paid: {
      page:"paid-expenses", anchor:"#paidExpensesSection .record-header", listIds:["paidExpenseList"], rowSelector:"[data-paid-expense-row]",
      columns:[['identity','Expense',true],['date','Paid date'],['account','Paid from'],['amount','Amount',true],['actions','Actions',true]],
      filters:{search:"paidSearch",category:"paidCategoryFilter"}
    }
  };
  const defaults = workspace => ({mode:"list",density:"comfortable",sort:"default",columns:WORKSPACES[workspace].columns.map(([id])=>id),hidden:[],views:[]});
  const clone = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));

  function profileId() {
    return String(window.FinanceProfileArchitecture?.activeProfileId?.() || "default").replace(/[^a-zA-Z0-9_-]/g,"-");
  }
  function storageKey() { return `${STORAGE_PREFIX}:${profileId()}`; }
  function normalize(raw = {}) {
    const output = {};
    Object.keys(WORKSPACES).forEach(name => {
      const base=defaults(name), source=raw[name] || {}, valid=base.columns;
      const order=[...(Array.isArray(source.columns)?source.columns:[])].filter(id=>valid.includes(id));
      valid.forEach(id=>{ if(!order.includes(id)) order.push(id); });
      const protectedIds=WORKSPACES[name].columns.filter(([, ,locked])=>locked).map(([id])=>id);
      const modeOnly=name==="expense";
      output[name]={
        mode:source.mode==="calendar"?"calendar":"list",
        density:modeOnly?"compact":source.density==="compact"?"compact":"comfortable",
        sort:modeOnly?"default":["default","newest","oldest","amount-high","amount-low","name"].includes(source.sort)?source.sort:"default",
        columns:modeOnly?[...valid]:order,
        hidden:modeOnly?[]:(Array.isArray(source.hidden)?source.hidden:[]).filter(id=>valid.includes(id)&&!protectedIds.includes(id)),
        views:modeOnly?[]:(Array.isArray(source.views)?source.views:[]).slice(0,20).map(view=>({name:String(view.name||"").slice(0,60),settings:view.settings||{},filters:view.filters||{}})).filter(view=>view.name)
      };
    });
    return output;
  }
  function read() { try{return normalize(JSON.parse(localStorage.getItem(storageKey())||"{}"));}catch{return normalize();} }
  let state=read(), activeWorkspace="expense", incomeSelection=new Set();
  function write() { try{localStorage.setItem(storageKey(),JSON.stringify(state));}catch{} }
  function currentPageWorkspace() {
    const page=document.querySelector(".page.active")?.id;
    return Object.keys(WORKSPACES).find(name=>WORKSPACES[name].page===page) || activeWorkspace;
  }
  function records(name) {
    if(name==="income") return data.incomeRecords || [];
    return (data.expenses || []).filter(item=>name==="paid"?item.paid:!item.paid);
  }
  function recordId(row,name,index) {
    return String(row.dataset.expenseRow || row.dataset.paidExpenseRow || (name==="income" ? visibleIncome()[index]?.id : "") || "");
  }
  function visibleIncome() {
    const search=document.getElementById("incomeSearch")?.value.trim().toLowerCase()||"";
    const category=document.getElementById("incomeCategoryFilter")?.value||"";
    const month=typeof selectedMonth==="function"?selectedMonth():"";
    return (data.incomeRecords||[]).filter(item=>String(item.date||"").startsWith(month)).filter(item=>!search||`${item.name} ${item.notes||""}`.toLowerCase().includes(search)).filter(item=>!category||item.category===category).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  }
  function rowEntries(name) {
    const byId=new Map(records(name).map(item=>[String(item.id),item]));
    const result=[];
    WORKSPACES[name].listIds.forEach(id=>{
      const list=document.getElementById(id); if(!list)return;
      [...list.querySelectorAll(WORKSPACES[name].rowSelector)].forEach((row,index)=>{
        if(row.classList.contains("productivity-record-filtered"))return;
        const idValue=recordId(row,name,index), item=byId.get(idValue) || (name==="income"?visibleIncome()[index]:null);
        if(item) { row.dataset.transactionRecordId=String(item.id); result.push({row,item,list}); }
      });
    });
    return result;
  }
  function itemAmount(item,name) {
    if(name==="income") return Number(item.amount||0);
    if(name==="paid" && typeof settledExpenseAmount==="function") return Number(settledExpenseAmount(item)||0);
    return typeof effectiveExpenseAmount==="function"?Number(effectiveExpenseAmount(item)||0):Number(item.amount||0);
  }
  function itemDate(item,name) {
    if(name==="paid") return item.paidDate || item.date || "";
    if(name==="expense" && !item.date && item.dueDay) return `${typeof selectedMonth==="function"?selectedMonth():"0000-00"}-${String(item.dueDay).padStart(2,"0")}`;
    return item.date || "";
  }
  function mapColumns(container,name,isHeader=false) {
    const definition=WORKSPACES[name].columns.map(([id])=>id);
    [...container.children].forEach((cell,index)=>{
      if(index>=definition.length)return;
      const id=definition[index]; cell.dataset.transactionColumn=id;
      cell.style.order=String(state[name].columns.indexOf(id));
      cell.classList.toggle("transaction-column-hidden",state[name].hidden.includes(id));
      if(isHeader) cell.setAttribute("aria-hidden",state[name].hidden.includes(id)?"true":"false");
    });
  }
  function sortRows(name,entries) {
    const mode=state[name].sort; if(mode==="default")return [...entries];
    const multiplier=mode==="oldest"||mode==="amount-low"?1:-1;
    const compare=(a,b)=>{
      if(mode==="name") return String(a.item.name||"").localeCompare(String(b.item.name||""));
      if(mode.startsWith("amount")) return multiplier*(itemAmount(a.item,name)-itemAmount(b.item,name));
      return multiplier*String(itemDate(a.item,name)).localeCompare(String(itemDate(b.item,name)));
    };
    const ordered=[...entries].sort(compare);
    WORKSPACES[name].listIds.forEach(id=>{
      const list=document.getElementById(id); if(!list)return;
      ordered.filter(entry=>entry.list===list).forEach(entry=>list.append(entry.row));
    });
    return ordered;
  }
  function addIncomeSelection(entry) {
    const title=entry.row.querySelector(".record-title"); if(!title||title.querySelector("[data-select-income]"))return;
    const label=document.createElement("label"); label.className="transaction-select";
    label.innerHTML=`<input type="checkbox" data-select-income="${esc(entry.item.id)}" ${incomeSelection.has(String(entry.item.id))?"checked":""}><span class="sr-only">Select ${esc(entry.item.name||"income")}</span>`;
    title.prepend(label);
  }
  function selectedIds(name) {
    const selector=name==="income"?"[data-select-income]:checked":name==="paid"?"[data-select-paid-expense]:checked":"[data-select-expense]:checked";
    return new Set([...document.querySelectorAll(selector)].map(input=>String(input.dataset.selectIncome||input.dataset.selectPaidExpense||input.dataset.selectExpense||"")));
  }
  function renderFooter(name,entries) {
    const footer=document.getElementById(`transactionTotals-${name}`); if(!footer)return;
    const selected=selectedIds(name), chosen=selected.size?entries.filter(entry=>selected.has(String(entry.item.id))):entries;
    const total=chosen.reduce((sum,entry)=>sum+itemAmount(entry.item,name),0);
    footer.innerHTML=`<span>${entries.length} visible</span><span>${selected.size?`${selected.size} selected · `:""}<strong>${typeof money==="function"?money(total):total}</strong></span>`;
    footer.setAttribute("aria-label",selected.size?`${selected.size} selected. Total ${typeof money==="function"?money(total):total}`:`${entries.length} visible records. Total ${typeof money==="function"?money(total):total}`);
  }
  function renderCalendar(name,entries) {
    const calendar=document.getElementById(`transactionCalendar-${name}`); if(!calendar)return;
    const groups=new Map();
    entries.forEach(entry=>{const key=itemDate(entry.item,name)||"Unscheduled";if(!groups.has(key))groups.set(key,[]);groups.get(key).push(entry.item);});
    const calendarGroups=[...groups.entries()];
    if(state[name].sort==="default")calendarGroups.sort(([a],[b])=>a.localeCompare(b));
    calendar.innerHTML=calendarGroups.length?calendarGroups.map(([date,items])=>`<section class="transaction-calendar-day"><h4>${date==="Unscheduled"?date:(typeof formatDate==="function"?formatDate(date):date)}</h4>${items.map(item=>{const label=String(item.name||"Record").trim()||"Record";const amount=typeof money==="function"?money(itemAmount(item,name)):itemAmount(item,name);return `<button type="button" class="transaction-calendar-entry" data-transaction-open="${esc(item.id)}" title="${esc(label)}" aria-label="${esc(`${label}: ${amount}`)}"><span>${esc(label)}</span><strong>${amount}</strong></button>`;}).join("")}</section>`).join(""):`<div class="empty-state"><strong>No visible records</strong>Change or clear the active filters.</div>`;
  }
  function captureFilters(name) {
    const values={}; Object.entries(WORKSPACES[name].filters).forEach(([key,id])=>values[key]=document.getElementById(id)?.value||"");
    if(name!=="income") values.advanced=window.FinanceProductivityTools?.getFilters?.(name==="expense"?"expense":"paid")||null;
    return values;
  }
  function applyFilters(name,filters={}) {
    Object.entries(WORKSPACES[name].filters).forEach(([key,id])=>{const control=document.getElementById(id);if(control&&Object.hasOwn(filters,key))control.value=filters[key];});
    if(filters.advanced&&name!=="income") window.FinanceProductivityTools?.setFilters?.(name==="expense"?"expense":"paid",filters.advanced,false);
  }
  function renderToolbar(name) {
    const toolbar=document.getElementById(`transactionToolbar-${name}`); if(!toolbar)return;
    const prefs=state[name];
    const modeControls=`<div class="transaction-view-group" role="group" aria-label="Display mode"><button type="button" class="button button-secondary" data-transaction-mode="list" aria-pressed="${prefs.mode==="list"}">List</button><button type="button" class="button button-secondary" data-transaction-mode="calendar" aria-pressed="${prefs.mode==="calendar"}">Calendar</button></div>`;
    if(name==="expense"){toolbar.innerHTML=modeControls;return;}
    const views=prefs.views.map((view,index)=>`<option value="${index}">${esc(view.name)}</option>`).join("");
    toolbar.innerHTML=`${modeControls}<label><span class="sr-only">Saved view</span><select class="select" data-transaction-saved-view><option value="">Saved views</option>${views}</select></label><button class="button button-secondary" type="button" data-save-transaction-view>Save view</button><button class="button button-secondary transaction-columns-button" type="button" data-open-transaction-columns>Columns</button><label><span class="sr-only">Sort records</span><select class="select" data-transaction-sort><option value="default">Default sort</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount-high">Amount: high to low</option><option value="amount-low">Amount: low to high</option><option value="name">Name A–Z</option></select></label><label><span class="sr-only">Row density</span><select class="select" data-transaction-density><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>`;
    toolbar.querySelector("[data-transaction-sort]").value=prefs.sort;
    toolbar.querySelector("[data-transaction-density]").value=prefs.density;
  }
  function ensureUi(name) {
    const config=WORKSPACES[name]; if(document.getElementById(`transactionToolbar-${name}`))return;
    const anchor=document.querySelector(config.anchor); if(!anchor)return;
    const toolbar=document.createElement("div"); toolbar.id=`transactionToolbar-${name}`; toolbar.className="transaction-workspace-toolbar no-print"; toolbar.dataset.transactionWorkspace=name; toolbar.setAttribute("aria-label",`${name} view controls`);
    anchor.before(toolbar);
    const calendar=document.createElement("div"); calendar.id=`transactionCalendar-${name}`; calendar.className="transaction-calendar"; calendar.hidden=true; anchor.before(calendar);
    const footer=document.createElement("div"); footer.id=`transactionTotals-${name}`; footer.className="transaction-totals-footer"; footer.setAttribute("aria-live","polite");
    if(name==="expense") document.querySelector("#money .section-stack")?.after(footer); else config.listIds.map(id=>document.getElementById(id)).filter(Boolean).at(-1)?.after(footer);
    renderToolbar(name);
  }
  function enhance(name) {
    activeWorkspace=name; ensureUi(name); renderToolbar(name);
    const entries=rowEntries(name); if(name==="income")entries.forEach(addIncomeSelection);
    document.querySelectorAll(`#${WORKSPACES[name].page} .record-header`).forEach(header=>mapColumns(header,name,true));
    entries.forEach(entry=>mapColumns(entry.row,name)); const orderedEntries=sortRows(name,entries);
    const page=document.getElementById(WORKSPACES[name].page); page?.classList.toggle("transaction-density-compact",state[name].density==="compact"); page?.classList.toggle("transaction-calendar-mode",state[name].mode==="calendar");
    const calendar=document.getElementById(`transactionCalendar-${name}`); if(calendar)calendar.hidden=state[name].mode!=="calendar";
    renderCalendar(name,orderedEntries); renderFooter(name,entries);
  }
  function rerender(name) {
    const page=WORKSPACES[name].page;
    if(typeof renderPage==="function")renderPage(page); else enhance(name);
  }
  function openColumns(name=currentPageWorkspace()) {
    activeWorkspace=name; const dialog=document.getElementById("transactionColumnsDialog"), list=dialog?.querySelector("[data-transaction-column-list]"); if(!dialog||!list)return;
    list.innerHTML=state[name].columns.map((id,index)=>{const column=WORKSPACES[name].columns.find(([value])=>value===id),locked=Boolean(column?.[2]);return `<li data-column-id="${id}"><label><input type="checkbox" ${state[name].hidden.includes(id)?"":"checked"} ${locked?"disabled":""}> <span>${esc(column?.[1]||id)}</span>${locked?'<small>Always shown</small>':''}</label><span><button type="button" class="button button-secondary button-small" data-column-up ${index===0?"disabled":""} aria-label="Move ${esc(column?.[1]||id)} up">↑</button><button type="button" class="button button-secondary button-small" data-column-down ${index===state[name].columns.length-1?"disabled":""} aria-label="Move ${esc(column?.[1]||id)} down">↓</button></span></li>`;}).join("");
    typeof openDialog==="function"?openDialog("transactionColumnsDialog"):dialog.showModal();
  }
  function saveNamedView(name) {
    const proposed=window.prompt("Name this transaction view"); if(!proposed?.trim())return;
    const viewName=proposed.trim().slice(0,60), settings=clone({...state[name],views:undefined});
    const existing=state[name].views.findIndex(view=>view.name.toLowerCase()===viewName.toLowerCase());
    const view={name:viewName,settings,filters:captureFilters(name)}; if(existing>=0)state[name].views[existing]=view;else state[name].views.push(view);
    write(); renderToolbar(name); if(typeof showToast==="function")showToast(`Saved view: ${viewName}`);
  }
  function applyNamedView(name,index) {
    const view=state[name].views[Number(index)]; if(!view)return;
    const saved=normalize({[name]:{...view.settings,views:state[name].views}})[name]; state[name]={...saved,views:state[name].views}; applyFilters(name,view.filters); write(); rerender(name);
  }
  function injectDialog() {
    if(document.getElementById("transactionColumnsDialog"))return;
    document.body.insertAdjacentHTML("beforeend",`<dialog class="modal app-dialog transaction-columns-dialog" id="transactionColumnsDialog"><form method="dialog"><div class="modal-header"><div><h3>Transaction columns</h3><p>Choose and reorder desktop columns. Essential columns stay visible.</p></div><button class="button button-secondary button-small" value="cancel">Close</button></div><div class="modal-body"><ul data-transaction-column-list></ul></div><div class="modal-footer"><button class="button button-secondary" type="button" data-reset-transaction-columns>Reset</button><button class="button button-primary" value="default">Done</button></div></form></dialog>`);
  }
  function setupEvents() {
    document.addEventListener("click",event=>{
      const toolbar=event.target.closest("[data-transaction-workspace]"); const name=toolbar?.dataset.transactionWorkspace||currentPageWorkspace();
      const mode=event.target.closest("[data-transaction-mode]"); if(mode){state[name].mode=mode.dataset.transactionMode;write();enhance(name);return;}
      if(event.target.closest("[data-open-transaction-columns]")){openColumns(name);return;}
      if(event.target.closest("[data-save-transaction-view]")){saveNamedView(name);return;}
      const move=event.target.closest("[data-column-up],[data-column-down]"); if(move){const id=move.closest("[data-column-id]")?.dataset.columnId,index=state[activeWorkspace].columns.indexOf(id),delta=move.hasAttribute("data-column-up")?-1:1,next=index+delta;if(index>=0&&next>=0&&next<state[activeWorkspace].columns.length){[state[activeWorkspace].columns[index],state[activeWorkspace].columns[next]]=[state[activeWorkspace].columns[next],state[activeWorkspace].columns[index]];write();openColumns(activeWorkspace);enhance(activeWorkspace);}return;}
      if(event.target.closest("[data-reset-transaction-columns]")){const views=state[activeWorkspace].views;state[activeWorkspace]={...defaults(activeWorkspace),views};write();openColumns(activeWorkspace);enhance(activeWorkspace);return;}
      const calendarEntry=event.target.closest("[data-transaction-open]"); if(calendarEntry){const id=calendarEntry.dataset.transactionOpen;if(name==="income")document.querySelector(`[data-edit-income="${CSS.escape(id)}"]`)?.click();else document.querySelector(`[data-edit-expense="${CSS.escape(id)}"]`)?.click();}
    });
    document.addEventListener("change",event=>{
      const toolbar=event.target.closest("[data-transaction-workspace]"); if(toolbar){const name=toolbar.dataset.transactionWorkspace;if(event.target.matches("[data-transaction-sort]"))state[name].sort=event.target.value;if(event.target.matches("[data-transaction-density]"))state[name].density=event.target.value;if(event.target.matches("[data-transaction-saved-view]")){applyNamedView(name,event.target.value);return;}write();enhance(name);return;}
      const checkbox=event.target.closest("#transactionColumnsDialog [data-column-id] input[type=checkbox]"); if(checkbox){const id=checkbox.closest("[data-column-id]").dataset.columnId;state[activeWorkspace].hidden=checkbox.checked?state[activeWorkspace].hidden.filter(value=>value!==id):[...new Set([...state[activeWorkspace].hidden,id])];write();enhance(activeWorkspace);return;}
      const selected=event.target.closest("[data-select-income]"); if(selected){selected.checked?incomeSelection.add(selected.dataset.selectIncome):incomeSelection.delete(selected.dataset.selectIncome);enhance("income");return;}
      if(event.target.matches("[data-select-expense],[data-select-paid-expense],#selectAllVisibleExpenses,#selectAllVisiblePaid"))queueMicrotask(()=>enhance(currentPageWorkspace()));
    },true);
    window.addEventListener("finance:page-changed",event=>{const name=Object.keys(WORKSPACES).find(key=>WORKSPACES[key].page===event.detail?.pageId);if(name)enhance(name);});
    window.addEventListener("finance:profile-changed",()=>{state=read();Object.keys(WORKSPACES).forEach(enhance);});
  }
  Object.keys(WORKSPACES).forEach(name=>{const page=WORKSPACES[name].page,base=PAGE_RENDERERS[page];if(typeof base!=="function")return;PAGE_RENDERERS[page]=function transactionViewRenderer(){base();enhance(name);};if(name==="income")renderIncomePage=PAGE_RENDERERS[page];if(name==="expense")renderMoneyPage=PAGE_RENDERERS[page];if(name==="paid")renderPaidExpenses=PAGE_RENDERERS[page];});
  injectDialog(); setupEvents(); Object.keys(WORKSPACES).forEach(enhance);
  window.FinanceTransactionViews={storagePrefix:STORAGE_PREFIX,get storageKey(){return storageKey();},getState:()=>clone(state),openColumns,openForActivePage:()=>document.querySelector(`#transactionToolbar-${currentPageWorkspace()}`)?.scrollIntoView({behavior:"smooth",block:"center"}),reset:name=>{const views=state[name].views;state[name]={...defaults(name),views};write();rerender(name);}};
})();
