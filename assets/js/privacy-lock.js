"use strict";
(() => {
  const state = { authenticated:false, resolved:false, email:"" };
  const importReviewState = { bundle:null, beforeAccounts:{} };
  const RECOVERY_META_KEY = "simple-finance-project-records-v12-meta";
  const RECOVERY_DB_NAME = "simple-finance-project-records-v12-db";
  const RECOVERY_DB_VERSION = 2;
  const RECOVERY_STORE = "recoverySnapshots";
  const MAX_RECOVERY_SNAPSHOTS = 12;
  let recoveryStorageReadyPromise = null;
  let recoveryImportBusy = false;
  const allowedSelector = [
    "[data-page]", "#menuButton", "#sidebarCloseButton", "#overlay",
    "#previousMonthButton", "#nextMonthButton", "#monthDisplayButton", "#currentMonthButton",
    "#monthPicker", "#monthPickerPreviousYear", "#monthPickerNextYear", "#monthPickerGrid button",
    "#topbarToolsTrigger", "#themeToggleButton", ".finance-privacy-signin",
    "[data-help-key]", "[data-section-help]", "[data-privacy-signin]", "[data-privacy-signin]", "[data-close='sectionHelpDialog']", "[data-close='pwaInstallGuideDialog']",
    "[data-settings-tab='sync']", "[data-settings-tab='app']", "#settingsBackButton", "[data-settings-open='sync']", "[data-settings-open='app']",
    "#settingsSearchButton", "#settingsSearchInput", "#settingsSearchClear", "[data-settings-search-result]",
    "#cloudConfigUrl", "#cloudConfigKey", "#saveCloudConfig", "#clearCloudConfig",
    "#cloudAuthEmail", "#cloudAuthPassword", "#cloudPasswordToggle", "#cloudSignIn", "#cloudCreateAccount", "#cloudForgotPassword", "#cloudTestConnection",
    "#cloudRecoveryEmail", "#cloudRecoveryCode", "#cloudRecoveryResend", "#cloudVerifyRecoveryCode", "#cloudRecoveryBackToSignIn",
    "#cloudNewPassword", "#cloudConfirmPassword", "#cloudCompletePasswordReset", "#cloudCancelPasswordReset", "[data-cloud-password-target]",
    "#installPwaButton", "#checkUpdateButton", "#repairPwaButton", "#clearAppCacheButton", "#requestPersistenceButton", "#applyUpdateButton", "#laterUpdateButton",
    "label[for='importBackup']", "#importBackup", "label[for='importSyncBundleInput']", "#importSyncBundleInput", "#restoreV11BackupButton",
    "#closeSyncReviewButton", "#cancelSyncImportButton", "#mergeKeepCurrentButton", "#mergeUseIncomingButton", "#replaceWithIncomingButton"
  ].join(",");
  const sensitiveDialogIds = new Set([
    "accountDialog","incomeDialog","expenseDialog","expensePaymentDialog","expenseActionConfirmDialog","dashboardCustomizeDialog",
    "projectDialog","projectRevisionDialog","projectPaidDialog","savingsGoalDialog","syncReviewDialog","sampleResetDialog"
  ]);
  const recoveryImportActions = new Map([
    ["mergeKeepCurrentButton", ["merge", "current"]],
    ["mergeUseIncomingButton", ["merge", "incoming"]],
    ["replaceWithIncomingButton", ["replace", "incoming"]]
  ]);

  function cloneValue(value){
    try { return structuredClone(value); } catch(e){}
    try { return JSON.parse(JSON.stringify(value)); } catch(e) { return value; }
  }

  function currentAccounts(){
    try {
      const bundle=typeof window.buildBundle==="function" ? window.buildBundle() : null;
      return cloneValue(bundle?.data?.accounts || {});
    } catch(e) { return {}; }
  }

  function currentFinanceData(){
    try {
      const bundle=typeof window.buildBundle==="function" ? window.buildBundle("my-finance-v12-recovery") : null;
      if(bundle?.data) return cloneValue(bundle.data);
    } catch(e){}
    try { if(typeof data!=="undefined") return cloneValue(data); } catch(e){}
    return {};
  }

  function captureImportReview(bundle){
    importReviewState.bundle=cloneValue(bundle);
    importReviewState.beforeAccounts=currentAccounts();
  }

  function installSyncReviewCapture(){
    const original=window.openSyncReview;
    if(typeof original!=="function" || original.__financeRecoveryCapture) return;
    const wrapped=function(bundle){
      captureImportReview(bundle);
      return original.apply(this,arguments);
    };
    Object.defineProperty(wrapped,"__financeRecoveryCapture",{value:true});
    window.openSyncReview=wrapped;
  }

  function clearImportReviewCapture(){
    importReviewState.bundle=null;
    importReviewState.beforeAccounts={};
  }

  function importedAccounts(){
    const incoming=importReviewState.bundle?.data || importReviewState.bundle;
    return incoming?.accounts && typeof incoming.accounts==="object" && !Array.isArray(incoming.accounts) ? incoming.accounts : {};
  }

  function reconcileImportedAccountBalances(mode, conflictPolicy){
    const service=window.FinanceLedgerTransactions;
    if(!service?.reconcileAccounts) return {ok:false,count:0,reason:"ledger-transaction-service-unavailable"};
    if(window.FinanceProfileArchitecture?.canWrite?.()===false) return {ok:false,count:0,reason:"read-only"};
    const desired=importedAccounts();
    const before=importReviewState.beforeAccounts || {};
    const after=currentAccounts();
    const changes=[];
    Object.entries(desired).forEach(([name, rawValue])=>{
      const target=Number(rawValue);
      if(!Number.isFinite(target) || !Object.prototype.hasOwnProperty.call(after,name)) return;
      const existedBefore=Object.prototype.hasOwnProperty.call(before,name);
      const shouldUseIncoming=mode==="replace" || conflictPolicy==="incoming" || !existedBefore;
      if(!shouldUseIncoming) return;
      const actual=Number(after[name] || 0);
      if(Math.abs(actual-target)<0.005) return;
      changes.push({account:name,target});
    });
    if(!changes.length) return {ok:true,count:0};
    const result=service.reconcileAccounts(changes,{note:"Imported backup balance",message:"Imported account balances reconciled",recordUndo:false});
    if(!result?.ok){ console.error("Imported balance reconciliation failed",result?.reason || "unknown error"); return {ok:false,count:0,reason:result?.reason || "reconciliation-failed"}; }
    return {ok:true,count:Number(result.count || 0)};
  }

  function openRecoveryDb(){
    return new Promise((resolve,reject)=>{
      if(!("indexedDB" in window)) return reject(new Error("IndexedDB is unavailable"));
      const request=indexedDB.open(RECOVERY_DB_NAME,RECOVERY_DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains("accountSnapshots")) db.createObjectStore("accountSnapshots",{keyPath:"id"});
        if(!db.objectStoreNames.contains("pdfPacks")) db.createObjectStore("pdfPacks",{keyPath:"id"});
        if(!db.objectStoreNames.contains("reminderIndex")) db.createObjectStore("reminderIndex",{keyPath:"id"});
        if(!db.objectStoreNames.contains(RECOVERY_STORE)) db.createObjectStore(RECOVERY_STORE,{keyPath:"id"});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error || new Error("Could not open recovery storage"));
      request.onblocked=()=>reject(new Error("Recovery storage upgrade is blocked by another open tab"));
    });
  }

  function installRecoveryDbUpgrade(){
    try {
      if(typeof openFinanceDatabase!=="function" || openFinanceDatabase.__financeRecoveryV2) return;
      const upgraded=function(){ return openRecoveryDb(); };
      Object.defineProperty(upgraded,"__financeRecoveryV2",{value:true});
      openFinanceDatabase=upgraded;
    } catch(error){ console.warn("Could not attach recovery storage upgrade",error); }
  }

  async function recoveryPut(value){
    const db=await openRecoveryDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(RECOVERY_STORE,"readwrite");
      tx.objectStore(RECOVERY_STORE).put(value);
      tx.oncomplete=()=>{ db.close(); resolve(value); };
      tx.onerror=()=>{ db.close(); reject(tx.error || new Error("Could not save recovery snapshot")); };
      tx.onabort=()=>{ db.close(); reject(tx.error || new Error("Recovery snapshot transaction was aborted")); };
    });
  }

  async function recoveryDelete(id){
    if(!id) return;
    const db=await openRecoveryDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(RECOVERY_STORE,"readwrite");
      tx.objectStore(RECOVERY_STORE).delete(id);
      tx.oncomplete=()=>{ db.close(); resolve(); };
      tx.onerror=()=>{ db.close(); reject(tx.error || new Error("Could not remove old recovery snapshot")); };
      tx.onabort=()=>{ db.close(); reject(tx.error || new Error("Recovery cleanup was aborted")); };
    });
  }

  async function recoveryGetAll(){
    const db=await openRecoveryDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(RECOVERY_STORE,"readonly");
      const request=tx.objectStore(RECOVERY_STORE).getAll();
      request.onsuccess=()=>resolve(request.result || []);
      request.onerror=()=>reject(request.error || new Error("Could not read recovery snapshots"));
      tx.oncomplete=()=>db.close();
      tx.onabort=()=>{ db.close(); reject(tx.error || new Error("Recovery read was aborted")); };
    });
  }


  async function recoveryGet(id){
    if(!id) return null;
    const db=await openRecoveryDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(RECOVERY_STORE,"readonly");
      const request=tx.objectStore(RECOVERY_STORE).get(id);
      request.onsuccess=()=>resolve(request.result || null);
      request.onerror=()=>reject(request.error || new Error("Could not read recovery snapshot"));
      tx.oncomplete=()=>db.close();
      tx.onabort=()=>{ db.close(); reject(tx.error || new Error("Recovery snapshot read was aborted")); };
    });
  }

  async function restoreRecoverySnapshot(id,fallbackData,message="Import rolled back to the recovery snapshot"){
    const snapshot=await recoveryGet(id).catch(()=>null);
    const source=cloneValue(snapshot?.data || fallbackData || {});
    if(!source || typeof source!=="object") throw new Error("The pre-import recovery snapshot is unavailable.");
    if(typeof data!=="undefined") {
      const restored=typeof normalizeData==="function" ? normalizeData(source) : source;
      restored.accounts=cloneValue(source.accounts || {});
      restored.accountTypes=cloneValue(source.accountTypes || {});
      restored.accountOrder=cloneValue(source.accountOrder || Object.keys(source.accounts || {}));
      restored.accountIcons=cloneValue(source.accountIcons || {});
      data=restored;
    }
    if(typeof persistFinanceDataRaw==="function"){
      const saved=persistFinanceDataRaw(message);
      if(saved===false) throw new Error("The recovery snapshot could not be restored to local storage.");
    } else {
      localStorage.setItem("simple-finance-project-records-v2",JSON.stringify(data));
      window.FinanceProfileArchitecture?.persistCurrentData?.(data,message);
    }
    try { if(typeof renderAll==="function") renderAll(false); } catch(error) { console.error("Recovery snapshot restored but UI refresh failed",error); }
    return true;
  }

  function recoveryMetaObject(){
    try { if(typeof appMeta!=="undefined" && appMeta && typeof appMeta==="object") return appMeta; } catch(e){}
    try {
      const raw=localStorage.getItem(RECOVERY_META_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  function snapshotMetadata(snapshot){
    return {
      id:String(snapshot?.id || ""),
      label:String(snapshot?.label || "Recovery snapshot"),
      createdAt:String(snapshot?.createdAt || new Date().toISOString()),
      sourceDeviceId:String(snapshot?.sourceDeviceId || ""),
      checksum:String(snapshot?.checksum || ""),
      summary:cloneValue(snapshot?.summary || {}),
      storage:"indexeddb-v2"
    };
  }

  function persistRecoveryMeta(meta){
    try {
      if(typeof appMeta!=="undefined" && meta===appMeta && typeof writeMeta==="function") {
        writeMeta();
        return;
      }
    } catch(e){}
    localStorage.setItem(RECOVERY_META_KEY,JSON.stringify(meta));
  }

  function financeUid(){
    try { if(typeof uid==="function") return uid(); } catch(e){}
    return globalThis.crypto?.randomUUID?.() || `recovery-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function financeChecksum(value){
    try { if(typeof checksum==="function") return checksum(value); } catch(e){}
    try { return String(JSON.stringify(value).length); } catch(e) { return ""; }
  }

  function financeSummary(value){
    try { if(typeof dataSummary==="function") return cloneValue(dataSummary(value)); } catch(e){}
    return {};
  }

  function currentDeviceId(){
    try { return String(typeof appMeta!=="undefined" ? appMeta.currentDeviceId || "" : ""); } catch(e) { return ""; }
  }

  async function compactLegacyRecoverySnapshots(){
    installRecoveryDbUpgrade();
    const meta=recoveryMetaObject();
    if(!meta) return { migrated:0, total:0 };
    const snapshots=Array.isArray(meta.recoverySnapshots) ? meta.recoverySnapshots : [];
    let migrated=0;
    for(const snapshot of snapshots){
      if(!snapshot?.id || !snapshot?.data) continue;
      await recoveryPut(cloneValue(snapshot));
      migrated+=1;
    }
    if(migrated){
      meta.recoverySnapshots=snapshots.map(snapshotMetadata).slice(0,MAX_RECOVERY_SNAPSHOTS);
      persistRecoveryMeta(meta);
    }
    return { migrated, total:meta.recoverySnapshots?.length || 0 };
  }

  function ensureRecoveryStorageReady(){
    if(!recoveryStorageReadyPromise){
      recoveryStorageReadyPromise=compactLegacyRecoverySnapshots().catch(error=>{
        recoveryStorageReadyPromise=null;
        throw error;
      });
    }
    return recoveryStorageReadyPromise;
  }

  async function persistRecoverySnapshot(label,sourceData){
    await ensureRecoveryStorageReady();
    const source=cloneValue(sourceData);
    const snapshot={
      id:financeUid(),
      label:String(label || "Before import"),
      createdAt:new Date().toISOString(),
      sourceDeviceId:currentDeviceId(),
      checksum:financeChecksum(source),
      summary:financeSummary(source),
      data:source
    };
    await recoveryPut(snapshot);

    const meta=recoveryMetaObject();
    if(!meta) throw new Error("Recovery metadata is unavailable");
    const previous=Array.isArray(meta.recoverySnapshots) ? meta.recoverySnapshots : [];
    const next=[snapshotMetadata(snapshot),...previous.filter(item=>item?.id!==snapshot.id).map(snapshotMetadata)].slice(0,MAX_RECOVERY_SNAPSHOTS);
    const keepIds=new Set(next.map(item=>item.id));
    const removed=previous.filter(item=>item?.id && !keepIds.has(String(item.id))).map(item=>String(item.id));
    meta.recoverySnapshots=next;
    persistRecoveryMeta(meta);
    await Promise.allSettled(removed.map(recoveryDelete));
    return snapshotMetadata(snapshot);
  }

  function setImportButtonsBusy(active,activeButton=null){
    recoveryImportActions.forEach((_,id)=>{
      const button=document.getElementById(id);
      if(!button) return;
      if(active){
        button.dataset.recoveryOriginalText=button.textContent;
        button.disabled=true;
        if(button===activeButton) button.textContent="Creating recovery copy…";
      } else {
        button.disabled=false;
        if(button.dataset.recoveryOriginalText) button.textContent=button.dataset.recoveryOriginalText;
        delete button.dataset.recoveryOriginalText;
      }
    });
  }

  async function executeRecoveryImport(button,action){
    if(recoveryImportBusy) return;
    recoveryImportBusy=true;
    setImportButtonsBusy(true,button);
    const dialog=document.getElementById("syncReviewDialog");
    let originalCreateRecoverySnapshot=null;
    let replacedSnapshotCreator=false;
    let recoveryMeta=null;
    let before=null;
    let importApplied=false;
    try {
      await ensureRecoveryStorageReady();
      before=currentFinanceData();
      recoveryMeta=await persistRecoverySnapshot(`Before ${action[0]} import`,before);
      const integrity=window.FinanceIntegrity;
      if(!integrity?.scan) throw new Error("Financial integrity protection is unavailable. Reload Talaan before importing records.");
      const incoming=importReviewState.bundle?.data || importReviewState.bundle || {};
      const incomingReport=integrity.scan(incoming,{includeStorage:false});
      if(incomingReport.counts.critical) throw new Error(`Import blocked: ${incomingReport.counts.critical} critical financial integrity issue${incomingReport.counts.critical===1?"":"s"} found.`);

      try {
        if(typeof createRecoverySnapshot!=="function") throw new Error("Recovery snapshot hook is unavailable");
        originalCreateRecoverySnapshot=createRecoverySnapshot;
        createRecoverySnapshot=function(){ return recoveryMeta; };
        replacedSnapshotCreator=true;
      } catch(error){
        throw new Error(`Could not attach safe recovery storage: ${error?.message || "unknown error"}`);
      }

      if(typeof window.applyPendingSyncImport!=="function") throw new Error("Import action is unavailable");
      window.applyPendingSyncImport(action[0],action[1]);
      importApplied=true;
      if(dialog?.open) throw new Error("Import review expired. Choose the backup again.");
      const appliedReport=integrity.scan(currentFinanceData(),{includeStorage:false});
      if(appliedReport.counts.critical) throw new Error(`Imported records failed integrity verification with ${appliedReport.counts.critical} critical issue${appliedReport.counts.critical===1?"":"s"}.`);
      const reconciliation=reconcileImportedAccountBalances(action[0],action[1]);
      if(!reconciliation?.ok) throw new Error(`Imported account reconciliation failed: ${reconciliation?.reason || "unknown error"}.`);
      const finalReport=integrity.scan(currentFinanceData(),{includeStorage:true});
      if(finalReport.counts.critical) throw new Error(`Imported records failed final integrity verification with ${finalReport.counts.critical} critical issue${finalReport.counts.critical===1?"":"s"}.`);
      clearImportReviewCapture();
    } catch(error) {
      if(importApplied && recoveryMeta?.id){
        try { await restoreRecoverySnapshot(recoveryMeta.id,before,"Import failed; pre-import recovery snapshot restored"); }
        catch(rollbackError){ console.error("Recovery import rollback failed",rollbackError); }
      }
      console.error("Recovery import action failed",error);
      try { if(typeof showToast==="function") showToast(`Import failed: ${error?.message || "unknown error"}`,"warning"); } catch(e){}
    } finally {
      if(replacedSnapshotCreator){
        try { createRecoverySnapshot=originalCreateRecoverySnapshot; } catch(e){}
      }
      setImportButtonsBusy(false);
      recoveryImportBusy=false;
    }
  }

  function pageLabel(page){
    const heading=page.querySelector(".page-heading h2, .page-heading h3");
    return String(heading?.textContent || page.id || "Finance records").trim();
  }

  function ensurePrivacyStyles(){
    if(document.getElementById("financePrivacyInlineSigninStyles")) return;
    const style=document.createElement("style");
    style.id="financePrivacyInlineSigninStyles";
    style.textContent=`
      .finance-privacy-signin-form{display:grid;gap:10px;padding:12px;border:1px solid var(--line);border-radius:var(--talaan-card-radius,16px);background:var(--surface-soft);text-align:left}
      .finance-privacy-signin-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .finance-privacy-signin-fields label{display:grid;gap:5px;color:var(--muted);font-size:.72rem;font-weight:750}
      .finance-privacy-signin-fields input{width:100%;min-height:42px}
      .finance-privacy-signin-password{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center}
      .finance-privacy-signin-password button{min-height:42px;padding-inline:10px;border:1px solid var(--line);border-radius:var(--talaan-control-radius,10px);background:var(--surface);color:var(--text);cursor:pointer}
      .finance-privacy-signin-actions{display:flex;gap:8px;flex-wrap:wrap}
      .finance-privacy-signin-actions .button{flex:1 1 170px}
      .finance-privacy-signin-links{display:flex;justify-content:flex-end}
      .finance-privacy-signin-links button{border:0;background:transparent;color:var(--primary);font-size:.72rem;font-weight:750;padding:2px;cursor:pointer}
      .finance-privacy-signin-message{margin:0;color:var(--muted);font-size:.72rem;line-height:1.4}
      .finance-privacy-signin-message[data-tone="success"]{color:var(--green)}
      .finance-privacy-signin-message[data-tone="danger"]{color:var(--red)}
      .finance-privacy-signin-message[data-tone="warning"]{color:var(--orange)}
      @media(max-width:700px){.finance-privacy-signin-fields{grid-template-columns:1fr}.finance-privacy-signin-actions{display:grid}.finance-privacy-signin-actions .button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function setPrivacyFormMessage(form,message,tone="info"){
    const node=form?.querySelector?.("[data-privacy-auth-message]");
    if(!node) return;
    node.textContent=String(message||"");
    node.dataset.tone=tone;
  }

  function setPrivacyFormBusy(form,busy,label="Signing in…"){
    if(!form) return;
    form.dataset.busy=busy?"true":"false";
    form.querySelectorAll("input,button").forEach(control=>{ control.disabled=busy; });
    const submit=form.querySelector("[data-privacy-submit]");
    if(!submit) return;
    if(!submit.dataset.defaultLabel) submit.dataset.defaultLabel=submit.textContent;
    submit.textContent=busy?label:submit.dataset.defaultLabel;
  }

  function privacyFormCredentials(form){
    return {
      email:String(form?.querySelector?.("[name=\"email\"]")?.value||"").trim().toLowerCase(),
      password:String(form?.querySelector?.("[name=\"password\"]")?.value||"")
    };
  }

  function validPrivacyEmail(value){ return /^\S+@\S+\.\S+$/.test(String(value||"")); }

  async function handlePrivacySignInSubmit(form){
    if(!form || form.dataset.busy==="true") return;
    const {email,password}=privacyFormCredentials(form);
    if(!validPrivacyEmail(email)){ setPrivacyFormMessage(form,"Enter a valid email address.","warning"); form.querySelector("[name=\"email\"]")?.focus(); return; }
    if(password.length<6){ setPrivacyFormMessage(form,"Enter your password (at least 6 characters).","warning"); form.querySelector("[name=\"password\"]")?.focus(); return; }
    const api=window.FinanceCloudSync;
    if(typeof api?.signIn!=="function"){ setPrivacyFormMessage(form,"Cloud sign-in is still loading. Please try again in a moment.","warning"); return; }
    setPrivacyFormBusy(form,true,"Signing in…");
    setPrivacyFormMessage(form,"Signing in and preparing sync…","info");
    try {
      await api.signIn(email,password);
      setPrivacyFormMessage(form,"Signed in. Your records are available while sync continues in the background.","success");
    } catch(error) {
      setPrivacyFormMessage(form,error?.message||"Could not sign in. Check your details and try again.","danger");
    } finally {
      setPrivacyFormBusy(form,false);
    }
  }

  async function handlePrivacyCreateAccount(form){
    if(!form || form.dataset.busy==="true") return;
    const {email,password}=privacyFormCredentials(form);
    if(!validPrivacyEmail(email)){ setPrivacyFormMessage(form,"Enter a valid email address.","warning"); form.querySelector("[name=\"email\"]")?.focus(); return; }
    if(password.length<6){ setPrivacyFormMessage(form,"Use a password with at least 6 characters.","warning"); form.querySelector("[name=\"password\"]")?.focus(); return; }
    const api=window.FinanceCloudSync;
    if(typeof api?.createAccount!=="function"){ setPrivacyFormMessage(form,"Cloud sign-in is still loading. Please try again in a moment.","warning"); return; }
    setPrivacyFormBusy(form,true,"Creating…");
    setPrivacyFormMessage(form,"Creating your private account…","info");
    try {
      const result=await api.createAccount(email,password);
      const message=result?.confirmed===false ? "Account created. Check your email to confirm it, then sign in here." : "Account created. Your records are available while sync continues in the background.";
      setPrivacyFormMessage(form,message,result?.confirmed===false?"warning":"success");
    } catch(error) {
      setPrivacyFormMessage(form,error?.message||"Could not create the account. Try again.","danger");
    } finally {
      setPrivacyFormBusy(form,false);
    }
  }

  function handlePrivacyPasswordToggle(button){
    const form=button?.closest?.("[data-privacy-signin]");
    const input=form?.querySelector?.("[name=\"password\"]");
    if(!input) return;
    const visible=input.type==="password";
    input.type=visible?"text":"password";
    button.textContent=visible?"Hide":"Show";
    button.setAttribute("aria-pressed",String(visible));
    button.setAttribute("aria-label",`${visible?"Hide":"Show"} password`);
  }

  function handlePrivacyForgotPassword(form){
    const email=privacyFormCredentials(form).email;
    try { if(typeof goToPage==="function") goToPage("settings",{historyMode:"none",smooth:false}); } catch(error) {}
    try { if(typeof activateSettingsPanel==="function") activateSettingsPanel("sync",false); } catch(error) {}
    setTimeout(()=>{
      const input=document.getElementById("cloudAuthEmail");
      if(input){ input.value=email; input.focus(); }
      document.getElementById("cloudForgotPassword")?.scrollIntoView?.({block:"center",behavior:"smooth"});
    },30);
  }

  function ensurePrivacyViews(){
    ensurePrivacyStyles();
    document.querySelectorAll(".page:not(#settings)").forEach(page=>{
      let view=page.querySelector(":scope > .finance-privacy-lock-view");
      if(view) return;
      view=document.createElement("section");
      view.className="finance-privacy-lock-view";
      view.setAttribute("aria-live","polite");
      view.innerHTML=`
        <div class="finance-privacy-lock-card">
          <div class="finance-privacy-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>
          <div class="finance-privacy-lock-copy"><span class="finance-privacy-eyebrow">Signed-out privacy</span><h3>Sign in to view ${pageLabel(page)}</h3><p>No accounts, expenses, projects, payments, calendar events, reports, or search suggestions are shown while signed out.</p></div>
          <div class="finance-privacy-zero-grid" aria-label="Signed-out finance totals">
            <div><span>Available money</span><strong>₱0.00</strong></div>
            <div><span>Income</span><strong>₱0.00</strong></div>
            <div><span>Expenses</span><strong>₱0.00</strong></div>
            <div><span>Projects</span><strong>0</strong></div>
          </div>
          <form class="finance-privacy-signin-form" data-privacy-signin novalidate>
            <div class="finance-privacy-signin-fields">
              <label>Email<input name="email" type="email" autocomplete="username" inputmode="email" placeholder="you@example.com"></label>
              <label>Password<div class="finance-privacy-signin-password"><input name="password" type="password" autocomplete="current-password" minlength="6" placeholder="At least 6 characters"><button type="button" data-privacy-password-toggle="true" aria-pressed="false" aria-label="Show password">Show</button></div></label>
            </div>
            <div class="finance-privacy-signin-actions"><button class="button button-primary" type="submit" data-privacy-submit>Sign in &amp; sync</button><button class="button button-secondary" type="button" data-privacy-create="true">Create account</button></div>
            <div class="finance-privacy-signin-links"><button type="button" data-privacy-forgot="true">Forgot password?</button></div>
            <p class="finance-privacy-signin-message" data-privacy-auth-message role="status" aria-live="polite">Sign in once to unlock your records. Sync will continue automatically.</p>
          </form>
          <small>Your local records stay stored on this device. Signing out hides them; it does not delete them.</small>
        </div>`;
      page.appendChild(view);
    });
  }  function removeTopbarSignIn(){
    document.getElementById("privacySignInButton")?.remove();
  }

  function ensureSettingsPrivacyNote(){
    const panel=document.querySelector("[data-settings-panel='app']");
    if(!panel || panel.querySelector(":scope > .finance-settings-privacy-note")) return;
    const note=document.createElement("section");
    note.className="finance-settings-privacy-note";
    note.setAttribute("aria-label","Signed-out Settings privacy");
    note.innerHTML=`<div><strong>Finance-specific app settings are hidden while signed out.</strong><p>Sign in to manage reminders and offline finance documents. Installation, updates, appearance, app repair, storage protection, and Help remain available.</p></div><button class="button button-primary finance-privacy-signin" type="button">Sign in</button>`;
    const intro=panel.querySelector(":scope > .settings-section-intro");
    if(intro) intro.after(note); else panel.prepend(note);
  }

  function structurallyRemoveExpenseDialogGuidance(){
    const dialog=document.getElementById("expenseDialog");
    if(!dialog) return;
    dialog.querySelector(":scope > form > .modal-body > .required-note")?.remove();
    const modeNote=dialog.querySelector("#expenseFormModeNote");
    if(!modeNote) return;
    modeNote.remove();
    if(document.querySelector("[data-expense-mode-surrogate='true']")) return;
    const surrogate=document.createElement("span");
    surrogate.id="expenseFormModeNote";
    surrogate.hidden=true;
    surrogate.setAttribute("aria-hidden","true");
    surrogate.dataset.expenseModeSurrogate="true";
    document.body.appendChild(surrogate);
  }

  function openSignIn(){
    try { if(typeof goToPage==="function") goToPage("settings", { historyMode:"none", smooth:false }); } catch(e){}
    try { if(typeof activateSettingsPanel==="function") activateSettingsPanel("sync", false); } catch(e){}
    setTimeout(()=>document.getElementById("cloudAuthEmail")?.focus(),30);
  }

  function closeSensitiveSurfaces(){
    document.querySelectorAll("dialog[open]").forEach(dialog=>{
      if(sensitiveDialogIds.has(dialog.id) || dialog.hasAttribute("data-form-dialog")) {
        try { dialog.close(); } catch(e) { dialog.removeAttribute("open"); }
      }
    });
    document.querySelectorAll(".topbar-tools-menu.is-open, .project-dialog-more-footer.is-open, .overflow-menu.is-open").forEach(node=>{
      node.classList.remove("is-open");
      const trigger=node.querySelector(":scope > [aria-haspopup='menu']");
      trigger?.setAttribute("aria-expanded","false");
      const panel=trigger?document.getElementById(trigger.getAttribute("aria-controls")):null;
      if(panel) panel.hidden=true;
    });
    const pop=document.getElementById("cloudSyncToolbarPopover"); if(pop) pop.hidden=true;
  }

  function updateSettingsForSignedOut(){
    if(!document.body.classList.contains("finance-signed-out")) return;
    const settings=document.getElementById("settings");
    if(!settings?.classList.contains("active")) return;
    const selected=document.querySelector("[data-settings-tab][aria-selected='true']")?.dataset.settingsTab;
    if(!["sync","app"].includes(selected)) {
      try { if(typeof activateSettingsPanel==="function") activateSettingsPanel("sync", false); } catch(e){}
    }
  }

  function notifyServiceWorker(){
    const payload={ type:"FINANCE_AUTH_STATE", authenticated:state.authenticated };
    try { navigator.serviceWorker?.controller?.postMessage(payload); } catch(e){}
    try { navigator.serviceWorker?.ready?.then(reg=>reg.active?.postMessage(payload)).catch(()=>{}); } catch(e){}
  }

  function apply(){
    ensurePrivacyViews();
    removeTopbarSignIn();
    ensureSettingsPrivacyNote();
    structurallyRemoveExpenseDialogGuidance();
    installRecoveryDbUpgrade();
    ensureRecoveryStorageReady().catch(error=>console.error("Recovery storage migration failed",error));
    installSyncReviewCapture();
    const locked=!state.authenticated;
    document.body.classList.toggle("finance-signed-out",locked);
    document.body.classList.toggle("finance-signed-in",!locked);
    document.body.classList.toggle("finance-auth-pending",!state.resolved);
    document.documentElement.dataset.financeAuth=locked?"signed-out":"signed-in";
    if(locked){ closeSensitiveSurfaces(); updateSettingsForSignedOut(); }
    notifyServiceWorker();
  }

  function setAuthenticated(authenticated, detail={}){
    state.authenticated=Boolean(authenticated);
    state.resolved=true;
    state.email=String(detail.email||"");
    apply();
    window.dispatchEvent(new CustomEvent("finance:privacy-auth-change",{detail:{authenticated:state.authenticated,email:state.email}}));
    if(state.authenticated){
      setTimeout(()=>{ try { if(typeof renderAll==="function") renderAll(false); } catch(e){} },0);
    }
  }

  function isAllowed(target){ return Boolean(target?.closest?.(allowedSelector)); }
  function blockLockedInteraction(event){
    if(!document.body.classList.contains("finance-signed-out")) return;
    const target=event.target;
    if(isAllowed(target)) return;
    const interactive=target?.closest?.("button, input, select, textarea, form, [contenteditable='true'], [role='button'], [role='menuitem']");
    if(!interactive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const message=interactive.closest("#settings") ? "Sign in to manage this finance setting." : "Sign in to use finance records.";
    try { if(typeof showToast==="function") showToast(message,"info"); } catch(e){}
  }

  function runRecoveryImportAction(event){
    const button=event.target.closest?.("#mergeKeepCurrentButton, #mergeUseIncomingButton, #replaceWithIncomingButton");
    if(!button) return false;
    const action=recoveryImportActions.get(button.id);
    if(!action) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    executeRecoveryImport(button,action);
    return true;
  }

  function runCloudFirstSyncRecovery(event){
    const button=event.target.closest?.("#cloudInitialConfirm");
    if(!button) return false;
    const mode=document.querySelector('input[name="cloudInitialMode"]:checked')?.value || "upload";
    if(mode!=="upload") return false;
    const replace=window.FinanceCloudSync?.replaceCloudWithThisDevice;
    if(typeof replace!=="function") return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    const originalText=button.textContent;
    button.disabled=true;
    button.textContent="Protecting this device…";
    Promise.resolve()
      .then(()=>persistRecoverySnapshot("Before first-sync device upload",currentFinanceData()))
      .then(()=>replace())
      .catch(error=>{
        console.error("First-sync device protection failed",error);
        try { if(typeof showToast==="function") showToast(`Could not use this device safely: ${error?.message || "unknown error"}`,"warning"); } catch(e){}
      })
      .finally(()=>{
        button.disabled=false;
        button.textContent=originalText;
      });
    return true;
  }

  document.addEventListener("click",event=>{
    if(runRecoveryImportAction(event)) return;
    if(runCloudFirstSyncRecovery(event)) return;
    const toggle=event.target.closest?.("[data-privacy-password-toggle]");
    if(toggle){ event.preventDefault(); handlePrivacyPasswordToggle(toggle); return; }
    const create=event.target.closest?.("[data-privacy-create]");
    if(create){ event.preventDefault(); handlePrivacyCreateAccount(create.closest("[data-privacy-signin]")); return; }
    const forgot=event.target.closest?.("[data-privacy-forgot]");
    if(forgot){ event.preventDefault(); handlePrivacyForgotPassword(forgot.closest("[data-privacy-signin]")); return; }
    const closeImport=event.target.closest?.("#closeSyncReviewButton, #cancelSyncImportButton");
    if(closeImport) setTimeout(clearImportReviewCapture,0);
    const signin=event.target.closest?.(".finance-privacy-signin");
    if(signin){ event.preventDefault(); openSignIn(); return; }
    blockLockedInteraction(event);
  },true);
  document.addEventListener("submit",event=>{
    const form=event.target.closest?.("[data-privacy-signin]");
    if(form){ event.preventDefault(); handlePrivacySignInSubmit(form); return; }
    blockLockedInteraction(event);
  },true);
    window.addEventListener("finance:page-changed",updateSettingsForSignedOut);
  window.addEventListener("pageshow",apply);
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",apply,{once:true}); else apply();

  window.FinancePrivacyLock={
    setAuthenticated,
    lock:()=>setAuthenticated(false),
    unlock:detail=>setAuthenticated(true,detail||{}),
    openSignIn,
    recoveryStorage:{
      ready:ensureRecoveryStorageReady,
      compact:async()=>{ recoveryStorageReadyPromise=null; return ensureRecoveryStorageReady(); },
      list:recoveryGetAll,
      save:persistRecoverySnapshot,
      version:RECOVERY_DB_VERSION,
      store:RECOVERY_STORE
    },
    get status(){ return {...state}; }
  };
})();

/* Talaan cloud authority guard.
   Runs before Cloud Sync initializes because privacy-lock.js is loaded first and is network-first in the service worker. */
(() => {
  const PROFILE_META_KEY="simple-finance-profiles-v1";
  const ACTIVE_DATA_KEY="simple-finance-project-records-v2";
  const PROFILE_DATA_PREFIX="simple-finance-profile-data-v1:";
  const CLOUD_META_PREFIX="simple-finance-cloud-sync-v3:";
  const CLOUD_BASE_PREFIX="simple-finance-cloud-record-base-v3:";
  const CLOUD_QUEUE_PREFIX="simple-finance-cloud-record-queue-v3:";
  const CLOUD_CONFIG_KEY="simple-finance-cloud-config-v1";
  const GUARD_MARKER_PREFIX="simple-finance-cloud-revert-guard-v1:";
  const LEGACY_HOLD_UNTIL=253402300799000;
  const APP_VERSION_CODE=130000;
  const ARRAY_COLLECTIONS=["expenses","projects","incomeRecords","savingsGoals","accountLedger","accountReconciliations","budgetTemplates","expenseTemplates"];
  const MAP_COLLECTIONS=["monthlyReports","monthlyChecklists","monthlyBudgets","iconLibrary"];
  const KNOWN_TOP_LEVEL=new Set([
    ...ARRAY_COLLECTIONS,...MAP_COLLECTIONS,
    "accounts","accountTypes","accountOrder","accountIcons","expenseRecurrenceSkips",
    "savingsSettings","projectCalendarSettings","salaryWorkSettings","ledgerSettings","budgetSettings","productivitySettings","reminderSettings"
  ]);

  function clone(value){
    try { return structuredClone(value); } catch(error){}
    try { return JSON.parse(JSON.stringify(value)); } catch(error) { return value; }
  }
  function readJson(key,fallback=null){
    try { const raw=localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch(error) { return fallback; }
  }
  function isObject(value){ return Boolean(value && typeof value==="object" && !Array.isArray(value)); }
  function recordKey(collection,recordId){ return `${collection}\u001f${recordId}`; }
  function splitKey(key){ const at=String(key||"").indexOf("\u001f"); return at>=0 ? [key.slice(0,at),key.slice(at+1)] : ["",String(key||"")]; }
  function stable(value){
    if(value===undefined) return "__undefined__";
    if(value===null || typeof value!=="object") return JSON.stringify(value);
    if(Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function same(a,b){ return stable(a)===stable(b); }

  function storedProfileContext(){
    const meta=readJson(PROFILE_META_KEY,null);
    const profiles=Array.isArray(meta?.profiles) ? meta.profiles : [];
    const active=profiles.find(profile=>profile?.id===meta?.activeProfileId) || profiles[0];
    if(!active?.id) return null;
    return { profileId:String(active.id), cloudProfileId:String(active.cloudProfileId || "") };
  }

  function jwtSubject(token){
    try {
      const part=String(token||"").split(".")[1];
      if(!part) return "";
      const normalized=part.replace(/-/g,"+").replace(/_/g,"/");
      const json=JSON.parse(atob(normalized+"=".repeat((4-normalized.length%4)%4)));
      return String(json?.sub || "");
    } catch(error) { return ""; }
  }

  function authUserIdFromValue(value){
    if(!value || typeof value!=="object") return "";
    const direct=value?.user?.id || value?.currentSession?.user?.id || value?.session?.user?.id || value?.data?.user?.id;
    if(direct) return String(direct);
    const token=value?.access_token || value?.currentSession?.access_token || value?.session?.access_token || value?.data?.session?.access_token;
    return jwtSubject(token);
  }

  function storedSupabaseUserId(){
    const config=readJson(CLOUD_CONFIG_KEY,{}) || {};
    let preferred="";
    try {
      const host=new URL(String(config.supabaseUrl||"")).hostname;
      const projectRef=host.split(".")[0];
      if(projectRef) preferred=`sb-${projectRef}-auth-token`;
    } catch(error){}
    const keys=[];
    if(preferred) keys.push(preferred);
    for(let index=0; index<localStorage.length; index+=1){
      const key=localStorage.key(index);
      if(/^sb-.+-auth-token$/.test(String(key||"")) && !keys.includes(key)) keys.push(key);
    }
    for(const key of keys){
      const userId=authUserIdFromValue(readJson(key,null));
      if(userId) return userId;
    }
    return "";
  }

  function meaningfulFinanceData(source){
    if(!isObject(source)) return false;
    if(ARRAY_COLLECTIONS.some(key=>Array.isArray(source[key]) && source[key].length)) return true;
    if(MAP_COLLECTIONS.some(key=>isObject(source[key]) && Object.keys(source[key]).length)) return true;
    const accounts=isObject(source.accounts) ? source.accounts : {};
    if(Object.keys(accounts).length>1) return true;
    if(Object.values(accounts).some(value=>Math.abs(Number(value||0))>0.005)) return true;
    if(Array.isArray(source.ledgerSettings?.netWorth?.items) && source.ledgerSettings.netWorth.items.length) return true;
    if(Array.isArray(source.ledgerSettings?.householdSplits?.groups) && source.ledgerSettings.householdSplits.groups.length) return true;
    if(Array.isArray(source.ledgerSettings?.householdSplits?.settlements) && source.ledgerSettings.householdSplits.settlements.length) return true;
    return false;
  }

  function recoveryRecordMap(source){
    const records={};
    const add=(collection,recordId,payload,sortIndex=0)=>{
      if(!recordId) return;
      const id=String(recordId);
      records[recordKey(collection,id)]={ collection,recordId:id,payload:clone(payload||{}),sortIndex:Number(sortIndex||0) };
    };

    ARRAY_COLLECTIONS.forEach(collection=>{
      (Array.isArray(source?.[collection]) ? source[collection] : []).forEach((item,index)=>{ if(item?.id) add(collection,item.id,item,index); });
    });

    const accounts=isObject(source?.accounts) ? source.accounts : {};
    const accountOrder=Array.isArray(source?.accountOrder) ? source.accountOrder : Object.keys(accounts);
    accountOrder.forEach((name,index)=>{
      if(!Object.prototype.hasOwnProperty.call(accounts,name)) return;
      add("accounts",name,{ name,balance:Number(accounts[name]||0),type:source?.accountTypes?.[name]||"Other",icon:source?.accountIcons?.[name]||null },index);
    });
    Object.keys(accounts).filter(name=>!accountOrder.includes(name)).forEach((name,index)=>{
      add("accounts",name,{ name,balance:Number(accounts[name]||0),type:source?.accountTypes?.[name]||"Other",icon:source?.accountIcons?.[name]||null },accountOrder.length+index);
    });

    MAP_COLLECTIONS.forEach(collection=>{
      Object.entries(isObject(source?.[collection]) ? source[collection] : {}).forEach(([id,payload],index)=>add(collection,id,payload,index));
    });

    (Array.isArray(source?.expenseRecurrenceSkips) ? source.expenseRecurrenceSkips : []).forEach((item,index)=>{
      const id=`${String(item?.seriesId||"")}::${String(item?.month||"")}`;
      if(item?.seriesId && item?.month) add("expenseRecurrenceSkips",id,item,index);
    });

    const ledgerSettings=clone(source?.ledgerSettings||{});
    if(isObject(ledgerSettings)) delete ledgerSettings.lastRecalculatedAt;
    add("settings","preferences",{
      savingsSettings:clone(source?.savingsSettings||{}),
      projectCalendarSettings:clone(source?.projectCalendarSettings||{}),
      salaryWorkSettings:clone(source?.salaryWorkSettings||{}),
      ledgerSettings,
      budgetSettings:clone(source?.budgetSettings||{}),
      productivitySettings:clone(source?.productivitySettings||{}),
      reminderSettings:clone(source?.reminderSettings||{})
    },0);

    const extra={};
    Object.keys(source||{}).forEach(key=>{ if(!KNOWN_TOP_LEVEL.has(key)) extra[key]=clone(source[key]); });
    if(Object.keys(extra).length) add("extra","root",extra,0);
    return records;
  }

  function resolveScope(meta,cloudProfileId){
    const existing=String(meta?.initializedUserId||"");
    if(existing && existing.endsWith(`:${cloudProfileId}`)) return existing;
    const userId=storedSupabaseUserId();
    return userId ? `${userId}:${cloudProfileId}` : "";
  }

  function localMatchesBase(local,base){
    if(!local) return Boolean(base?.deletedAt);
    if(!base || base.deletedAt) return false;
    return same(local.payload,base.payload) && Number(local.sortIndex||0)===Number(base.sortIndex||0);
  }

  function savePreSyncRecovery(source){
    try {
      const save=window.FinancePrivacyLock?.recoveryStorage?.save;
      if(typeof save!=="function") return;
      Promise.resolve(save("Before cloud authority reconciliation",source)).catch(error=>console.warn("Could not save pre-sync recovery snapshot",error));
    } catch(error){ console.warn("Could not start pre-sync recovery snapshot",error); }
  }

  function armRevertGuard(){
    const context=storedProfileContext();
    if(!context?.cloudProfileId) return { armed:false,reason:"no-cloud-profile" };
    const profileDataRaw=localStorage.getItem(`${PROFILE_DATA_PREFIX}${context.profileId}`);
    if(!profileDataRaw) return { armed:false,reason:"no-established-profile-data" };
    const profileData=readJson(`${PROFILE_DATA_PREFIX}${context.profileId}`,{});
    const activeData=readJson(ACTIVE_DATA_KEY,null);
    const source=meaningfulFinanceData(profileData) ? profileData : activeData;
    if(!meaningfulFinanceData(source)) return { armed:false,reason:"no-local-finance-data" };

    const baseKey=`${CLOUD_BASE_PREFIX}${context.profileId}`;
    const metaKey=`${CLOUD_META_PREFIX}${context.profileId}`;
    const queueKey=`${CLOUD_QUEUE_PREFIX}${context.profileId}`;
    const base=readJson(baseKey,{}) || {};
    const meta=readJson(metaKey,{}) || {};
    const queue=readJson(queueKey,{}) || {};
    const scope=resolveScope(meta,context.cloudProfileId);
    if(!scope) return { armed:false,reason:"cloud-account-unresolved" };

    const records=recoveryRecordMap(source);
    if(!Object.keys(records).length) return { armed:false,reason:"no-records" };
    const baselinePresent=Object.keys(base).length>0;
    const keys=new Set([...Object.keys(records),...Object.keys(base)]);
    const now=new Date().toISOString();
    let seeded=0;
    let released=0;

    keys.forEach(key=>{
      const local=records[key];
      const baseline=base[key];
      if(baselinePresent && localMatchesBase(local,baseline)) return;
      const existing=queue[key];
      if(existing){
        const legacyHold=Number(existing.nextAttemptAt||0)>=LEGACY_HOLD_UNTIL-1000 || /baseline was missing on this device/i.test(String(existing.lastError||""));
        if(legacyHold && existing.status!=="conflict"){
          existing.status="pending";
          existing.attempts=0;
          existing.nextAttemptAt=0;
          existing.updatedAt=now;
          existing.reason="Recovered local Finance change waiting for current cloud revision";
          existing.lastError="This device is protected. Cloud revisions will be read before this record can upload.";
          released+=1;
        }
        return;
      }
      const [fallbackCollection,fallbackRecordId]=splitKey(key);
      queue[key]={
        key,
        collection:String(local?.collection || baseline?.collection || fallbackCollection),
        recordId:String(local?.recordId || baseline?.recordId || fallbackRecordId),
        payload:clone(local?.payload || baseline?.payload || {}),
        sortIndex:Number(local?.sortIndex ?? baseline?.sortIndex ?? 0),
        deleted:!local,
        baseRevision:Number(baseline?.revision || 0),
        basePayload:baseline ? clone(baseline.payload ?? null) : null,
        baseSortIndex:Number(baseline?.sortIndex || 0),
        minWriterVersionCode:APP_VERSION_CODE,
        status:"pending",
        attempts:0,
        nextAttemptAt:0,
        updatedAt:now,
        reason:baselinePresent ? "Recovered unqueued local Finance change before cloud pull" : "Recovered local Finance record before cloud baseline reconstruction",
        lastError:baselinePresent ? "This device differs from its stored cloud baseline. Local data is protected until the current cloud revision is checked." : "The cloud baseline is missing. Local data is protected and cloud revisions will be read before upload."
      };
      seeded+=1;
    });

    const metadataRepaired=meta.initializedUserId!==scope || meta.initializedProfileId!==context.cloudProfileId;
    meta.initializedUserId=scope;
    meta.initializedProfileId=context.cloudProfileId;
    if(!baselinePresent) meta.lastAuditId=0;
    if(seeded || released) meta.status="Protected local recovery";
    else if(metadataRepaired) meta.status="Sync authority repaired";
    localStorage.setItem(metaKey,JSON.stringify(meta));
    localStorage.setItem(queueKey,JSON.stringify(queue));

    const shouldSnapshot=!baselinePresent || seeded>0 || released>0;
    if(shouldSnapshot) savePreSyncRecovery(source);
    const result={
      armed:shouldSnapshot || metadataRepaired,
      reason:!baselinePresent ? "baseline-missing" : seeded || released ? "local-diverged-from-baseline" : metadataRepaired ? "sync-metadata-repaired" : "baseline-matches-local",
      profileId:context.profileId,
      cloudProfileId:context.cloudProfileId,
      baselinePresent,
      seeded,
      released,
      metadataRepaired,
      protectedUntil:0,
      armedAt:now
    };
    localStorage.setItem(`${GUARD_MARKER_PREFIX}${context.profileId}`,JSON.stringify(result));
    return result;
  }

  let lastResult;
  function runGuard(){
    try { lastResult=armRevertGuard(); }
    catch(error) { lastResult={armed:false,reason:"guard-error",error:String(error?.message||error)}; }
    return clone(lastResult);
  }
  runGuard();

  function installFastResumeSync(){
    let timer=null;
    const request=reason=>{
      clearTimeout(timer);
      timer=setTimeout(()=>{
        if(!navigator.onLine || document.hidden) return;
        runGuard();
        const sync=window.FinanceCloudSync?.syncNow;
        if(typeof sync!=="function") return;
        Promise.resolve(sync({reason:`fast-${reason}`})).catch(()=>{});
      },120);
    };
    window.addEventListener("online",()=>request("online"));
    window.addEventListener("focus",()=>request("focus"));
    window.addEventListener("pageshow",()=>request("pageshow"));
    document.addEventListener("visibilitychange",()=>{ if(!document.hidden) request("visible"); });
    setTimeout(()=>request("startup"),1500);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",installFastResumeSync,{once:true});
  else installFastResumeSync();

  window.FinanceCloudRevertGuard={ arm:runGuard, buildRecordMap:recoveryRecordMap, get last(){ return clone(lastResult); }, holdUntil:0 };
})();
