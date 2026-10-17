import { expect, test } from "../helpers/browser-fixtures.mjs";
/* global data, renderMoneyPage */

test.use({ serviceWorkers:"block", isMobile:true, hasTouch:true, deviceScaleFactor:3 });

async function open(page, theme) {
  await page.setViewportSize({ width:393,height:852 });
  await page.clock.setFixedTime(new Date("2026-10-14T04:00:00Z"));
  await page.addInitScript(theme => localStorage.setItem("simple-finance-theme-v1",theme),theme);
  await page.goto("http://127.0.0.1:3000/?page=money",{ waitUntil:"networkidle" });
  await page.waitForFunction(() => window.FinancePrivacyLock && !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await page.locator("#money .period-card .collapse-toggle[aria-expanded=false]").evaluateAll(ns => ns.forEach(n => n.click()));
}

async function snapshot(page) {
  return page.evaluate(() => JSON.stringify({ accounts:data.accounts,ledger:data.accountLedger,expenses:data.expenses }));
}

async function geometry(row) {
  return row.evaluate(row => {
    const r=row.getBoundingClientRect();
    const rect=n => {const b=n.getBoundingClientRect();return { x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height };};
    const button=row.querySelector(".mobile-record-actions > [data-mark-paid]");
    const range=document.createRange();range.selectNodeContents(button);const t=range.getBoundingClientRect(),b=button.getBoundingClientRect();
    const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT),escaped=[];
    while(walker.nextNode()){
      const text=walker.currentNode,n=text.parentElement;
      if(!text.textContent.trim() || !n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) || n.closest('.sr-only,.overflow-menu-trigger') || getComputedStyle(n).display==='none')continue;
      const q=document.createRange();q.selectNodeContents(text);
      for(const box of q.getClientRects())if(box.width>0 && (box.left<r.left || box.right>r.right+1 || box.top<r.top || box.bottom>r.bottom+1))escaped.push(text.textContent);
    }
    const selectors={ title:'.record-title-copy > strong',amount:'.amount',description:'.record-title-copy > small',statuses:'.record-statuses',due:'.due-cell',account:'[data-label="Planned account"]' };
    return { box:rect(row),parts:Object.fromEntries(Object.entries(selectors).map(([k,s])=>[k,rect(row.querySelector(s))])),button:rect(button),dx:Math.abs((t.left+t.right-b.left-b.right)/2),dy:Math.abs((t.top+t.bottom-b.top-b.bottom)/2),escaped,background:getComputedStyle(row).backgroundColor,surface:getComputedStyle(document.querySelector('#moneyPrioritySummary')).backgroundColor,edge:getComputedStyle(row).borderLeftColor,radius:getComputedStyle(row).borderRadius };
  });
}

async function contrast(locator) {
  return locator.evaluate(n=>{
    const rgb=color=>color.match(/[\d.]+/g).slice(0,3).map(Number);
    const luminance=color=>rgb(color).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const a=luminance(getComputedStyle(n).color),b=luminance(getComputedStyle(n.matches('button')?n:n.closest('[data-expense-row]')).backgroundColor);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
}

for(const theme of ["light","dark"]){
  test(`expense hierarchy, warning and centered action fit phone widths in ${theme}`,async({page})=>{
    await open(page,theme);
    const row=page.locator('#money [data-expense-row]').filter({has:page.locator('.record-title-copy > strong',{hasText:'Apple Music'})}).first();
    const before=await snapshot(page);
    await expect(row.locator('.phone-expense-payment-status')).toHaveText('Unpaid · 5 days overdue');
    await expect(row.locator('.phone-expense-schedule')).toHaveText('Monthly · due 9th');
    await expect(row.locator('.status-unpaid')).toBeHidden();await expect(row.locator('.status-saved')).toBeHidden();
    await expect(row.locator('.expense-inline-due-warning')).toBeHidden();
    for(const selector of ['.phone-expense-payment-status','.record-title-copy > small','.phone-expense-schedule','.mobile-record-actions > [data-mark-paid]'])expect(await contrast(row.locator(selector))).toBeGreaterThanOrEqual(4.5);
    for(const width of [320,375,393,430,700]){
      await page.setViewportSize({width,height:852});
      await row.scrollIntoViewIfNeeded();
      const g=await geometry(row),p=g.parts;
      expect(g.escaped).toEqual([]);expect(g.radius).toBe('12px');expect(g.background).toBe(g.surface);
      expect(g.edge).not.toBe('rgba(0, 0, 0, 0)');
      expect(p.title.right).toBeLessThanOrEqual(p.amount.x-11);
      expect(p.description.y).toBeGreaterThanOrEqual(Math.max(p.title.bottom,p.amount.bottom)+3);
      expect(p.statuses.y).toBeGreaterThanOrEqual(p.description.bottom+3);
      expect(p.due.x).toBeCloseTo(p.account.x,0);
      expect(p.account.bottom).toBeLessThanOrEqual(g.button.bottom+1);
      expect(g.button.width).toBe(104);expect(g.button.height).toBeGreaterThanOrEqual(44);
      expect(g.dx).toBeLessThan(1);expect(g.dy).toBeLessThan(1);
      expect(Math.abs((p.due.y+p.account.bottom-g.button.y-g.button.bottom)/2)).toBeLessThan(1);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
    }
    for(const [selector,size]of [['.record-title-copy > strong','14px'],['.amount','16px'],['.phone-expense-payment-status','12px'],['.phone-expense-schedule','12px'],['.mobile-record-actions > [data-mark-paid]','13px']])await expect(row.locator(selector)).toHaveCSS('font-size',size);
    expect(await snapshot(page)).toBe(before);
  });

  test(`long expense details and exceptional warnings remain visible in ${theme}`,async({page})=>{
    await open(page,theme);
    const id=await page.evaluate(()=>{
      const item=data.expenses.find(x=>x.name==='Apple Music');
      item.name='Long subscription name with additional household information';item.notes='A meaningful description that wraps across several lines and must remain completely readable.';item.account='Long account name with multiple words';item.amount=999999999.99;item.icon={type:'emoji',value:'🎵'};item.includeInTotals=false;
      item.householdSplit=window.FinanceHouseholdSplits.normalizeSplit({groupId:'fixture-home',groupName:'Home',ownerMemberId:'fixture-you',method:'exact',totalAmount:item.amount,shares:[{memberId:'fixture-you',memberName:'You',amount:item.amount},{memberId:'fixture-other',memberName:'Other',amount:0}],updatedAt:'2026-10-14T04:00:00.000Z'},item.amount);renderMoneyPage();return item.id;
    });
    const row=page.locator(`[data-expense-row="${id}"]`);
    for(const width of [320,393]){
      await page.setViewportSize({width,height:660});await row.scrollIntoViewIfNeeded();
      await expect(row.locator('.status-excluded')).toBeVisible();await expect(row.locator('.status-household')).toBeVisible();await expect(row.locator('.record-icon')).toBeVisible();
      expect((await geometry(row)).escaped).toEqual([]);
      const before=await snapshot(page);
      await row.focus();await page.keyboard.press('Space');await expect(row.locator('.phone-selection-badge')).toBeVisible();await expect(row).not.toHaveCSS('box-shadow','none');
      await page.keyboard.press('Enter');const panel=row.locator('.record-more-panel');await expect(panel).toBeVisible();
      await expect(panel.locator('[data-edit-expense]')).toBeFocused();await panel.scrollIntoViewIfNeeded();
      const box=await panel.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');await expect(row).toBeFocused();
      await row.locator('.mobile-record-actions > [data-mark-paid]').click();await expect(page.locator('#expensePaymentDialog')).toBeVisible();await page.keyboard.press('Escape');
      expect(await snapshot(page)).toBe(before);
      await row.focus();await page.keyboard.press('Space');
    }
  });
}

test('phone schedules retain ordinals, all-date context, visit counts and recurrence changes',async({page})=>{
  await open(page,'light');
  await page.evaluate(()=>{
    const base=data.expenses.find(x=>x.name==='Apple Music');
    data.expenses=[...data.expenses,...[1,2,3,11,12,13,21,22,23,31].map(day=>({...base,id:`ordinal-${day}`,name:`Ordinal ${day}`,dueDay:day,expensePeriod:'first'}))];
    document.querySelector('#expenseDateFilter').value='all';renderMoneyPage();
  });
  for(const [day,label]of [[1,'1st'],[2,'2nd'],[3,'3rd'],[11,'11th'],[12,'12th'],[13,'13th'],[21,'21st'],[22,'22nd'],[23,'23rd'],[31,'31st']])await expect(page.locator(`[data-expense-row="ordinal-${day}"] .phone-expense-schedule`)).toHaveText(`Monthly · due ${label} · Oct 2026`);
  const gym=page.locator('#money [data-expense-row]').filter({has:page.locator('.record-title-copy > strong',{hasText:/^Gym$/})}).first();
  await expect(gym.locator('.phone-expense-schedule')).toContainText(/planned visits/);
  const row=page.locator('[data-expense-row="ordinal-11"]');await row.focus();await page.keyboard.press('Enter');await row.locator('.record-more-panel [data-toggle-saved]').click();
  await expect(row.locator('.phone-expense-schedule')).toContainText('One-time · due 11th');
});

test('rotating beyond the phone breakpoint restores original expense labels and controls',async({page})=>{
  await open(page,'dark');const row=page.locator('#money [data-expense-row]').first();const before=await snapshot(page);
  await page.setViewportSize({width:1024,height:852});
  await expect(row.locator('.phone-expense-schedule')).toBeHidden();await expect(row.locator('.phone-expense-payment-status')).toBeHidden();
  await expect(row.locator('.expense-due-original')).toBeVisible();await expect(row.locator('.status-unpaid')).toBeVisible();await expect(row.locator('[data-select-expense]')).toBeVisible();
  await page.setViewportSize({width:393,height:852});await expect(row.locator('.phone-expense-schedule')).toBeVisible();await expect(row.locator('[data-select-expense]')).toBeHidden();
  expect(await snapshot(page)).toBe(before);
});

for(const theme of ['light','dark']){
  test(`combined status preserves due states and auto-pay warnings in ${theme}`,async({page})=>{
    await open(page,theme);
    await page.evaluate(()=>{
      const base=data.expenses.find(x=>x.name==='Apple Music'),gym=data.expenses.find(x=>x.expenseType==='gym');
      data.expenses.push(...[14,15,16,25].map(day=>({...base,id:`status-${day}`,name:`Status ${day}`,dueDay:day,expensePeriod:'first'})),
        {...base,id:'status-undated',name:'Undated expense',date:'',dueDay:null,expensePeriod:'other',recurring:'One-time'},
        {...gym,id:'status-auto-pay',date:'2026-09-01',gymAutoPay:true,gymAutoPayAccount:'',gymAutoPaySuppressed:false});
      document.querySelector('#expenseDateFilter').value='all';renderMoneyPage();
    });
    for(const [id,status]of [['status-14','Unpaid · due today'],['status-15','Unpaid · due tomorrow'],['status-16','Unpaid · due in 2 days'],['status-25','Unpaid'],['status-undated','Unpaid']]){
      const row=page.locator(`[data-expense-row="${id}"]`);await expect(row.locator('.phone-expense-payment-status')).toHaveText(status);
      expect(await contrast(row.locator('.phone-expense-payment-status'))).toBeGreaterThanOrEqual(4.5);
    }
    await expect(page.locator('[data-expense-row="status-auto-pay"] .status-auto-pay-warning')).toHaveText('Auto-pay needs a valid account');
    await expect(page.locator('[data-expense-row="status-auto-pay"] .status-auto-pay-warning')).toBeVisible();
    await expect(page.locator('[data-expense-row="status-undated"] .phone-expense-schedule')).toHaveText('One-time · N/A');
  });
}
