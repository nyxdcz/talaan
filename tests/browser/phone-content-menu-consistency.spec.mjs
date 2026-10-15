import { expect, test } from "../helpers/browser-fixtures.mjs";
/* global data */

test.use({ serviceWorkers:"block", isMobile:true, hasTouch:true, deviceScaleFactor:3 });

async function open(page, route, theme, width = 393, height = 852) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(new Date("2026-10-15T04:00:00Z"));
  await page.addInitScript(theme => {
    localStorage.setItem("simple-finance-theme-v1", theme);
    localStorage.setItem("simple-finance-budget-panel-state-v1", JSON.stringify({ planner:true }));
  }, theme);
  await page.goto(`http://127.0.0.1:3000/?page=${route}`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => window.FinancePrivacyLock && !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator(`#${route}.active`)).toBeVisible();
}

async function geometry(control) {
  return control.evaluate(node => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node), pieces = [];
    const visible = n => n.checkVisibility({ checkOpacity:true, checkVisibilityCSS:true }) && n.getBoundingClientRect().width > 0 && !n.closest(".sr-only");
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (text.textContent.trim() && visible(text.parentElement)) {
        const range = document.createRange();range.selectNodeContents(text);pieces.push(...range.getClientRects());
      }
    }
    for (const svg of node.querySelectorAll("svg")) if (visible(svg)) pieces.push(svg.getBoundingClientRect());
    const left = Math.min(...pieces.map(r => r.left)), right = Math.max(...pieces.map(r => r.right));
    const top = Math.min(...pieces.map(r => r.top)), bottom = Math.max(...pieces.map(r => r.bottom));
    return { width:rect.width, height:rect.height, font:style.fontSize, radius:style.borderRadius,
      contained:pieces.length > 0 && left >= rect.left - 1 && right <= rect.right + 1 && top >= rect.top - 1 && bottom <= rect.bottom + 1,
      dx:Math.abs((left + right - rect.left - rect.right) / 2),dy:Math.abs((top + bottom - rect.top - rect.bottom) / 2) };
  });
}

async function fits(control, centered = false) {
  const g = await geometry(control);
  expect(g.width).toBeGreaterThanOrEqual(44);expect(g.height).toBeGreaterThanOrEqual(44);
  expect(g.contained).toBe(true);expect(g.radius).toBe("10px");
  if (centered) { expect(g.dx).toBeLessThan(1);expect(g.dy).toBeLessThan(1); }
  return g;
}

async function expectMenuInViewport(page) {
  const panel = page.locator("#budgetPlannerMorePanel");await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate(n => {
    const r = n.getBoundingClientRect(), v = window.visualViewport;
    const left = v?.offsetLeft || 0, top = v?.offsetTop || 0, width = v?.width || innerWidth, height = v?.height || innerHeight;
    const header = document.querySelector(".topbar").getBoundingClientRect();
    return r.left >= left + 11 && r.right <= left + width - 11 && r.top >= Math.max(top + 11, header.bottom + 7) && r.bottom <= top + height - 11;
  })).toBe(true);
}

async function financeRecords(page) {
  return page.evaluate(() => JSON.stringify({ accounts:data.accounts, ledger:data.accountLedger, expenses:data.expenses, income:data.incomeRecords }));
}

async function textContrast(locator) {
  return locator.evaluate(n => {
    const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const context=canvas.getContext("2d");
    const rgba=color => {context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);const c=[...context.getImageData(0,0,1,1).data];return [...c.slice(0,3),c[3]/255];};
    const over=(fg,bg) => fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]));
    const luminance=color => color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const chain=[];for(let p=n;p;p=p.parentElement)chain.unshift(p);
    let background=[255,255,255],opacity=1;
    for(const p of chain){const s=getComputedStyle(p);background=over(rgba(s.backgroundColor),background);opacity*=Number(s.opacity);}
    const foreground=rgba(getComputedStyle(n).color);foreground[3]*=opacity;
    const a=luminance(over(foreground,background)),b=luminance(background);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
}

for (const theme of ["light", "dark"]) {
  test(`phone account mode labels fit and keep their accessible name in ${theme}`, async ({ page }) => {
    await open(page, "money", theme, 320, 660);
    const before = await financeRecords(page);
    await page.locator("#availableMoneySection .collapse-toggle[aria-expanded=false]").evaluateAll(ns => ns.forEach(n => n.click()));
    await page.locator("[data-spend-account]").first().click();
    await expect(page.locator("#accountDialog")).toBeVisible();
    const correct = page.getByRole("button", { name:"Correct account balance", exact:true });
    for (const width of [320,393,430]) {
      await page.setViewportSize({ width,height:660 });
      for (const button of [correct,page.locator("#accountSpendModeButton")]) await fits(button,true);
      await expect(correct.locator(".account-mode-phone-label")).toBeVisible();
      await expect(correct.locator(".account-mode-full-label")).toBeHidden();
    }
    await correct.click();await expect(correct).toHaveAttribute("aria-pressed","true");
    await page.locator("#accountSpendModeButton").click();await expect(page.locator("#accountSpendPanel")).toBeVisible();
    await page.keyboard.press("Escape");expect(await financeRecords(page)).toBe(before);
  });

  test(`phone report and template actions reflow without truncating in ${theme}`, async ({ page }) => {
    await open(page,"reports",theme,320,660);
    const before = await financeRecords(page);
    await page.evaluate(() => { for (const d of document.querySelectorAll("#reports details")) d.open = true;for (const b of document.querySelectorAll('#reports .collapse-toggle[aria-expanded="false"]')) b.click(); });
    for (const width of [320,393,430]) {
      await page.setViewportSize({ width,height:660 });
      for (const selector of ["#reportOpenBudgetPlan",".report-export-menu > button"]) {
        expect((await fits(page.locator(selector),true)).font).toBe("13px");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    await page.locator(".report-export-menu > button").click();
    await expect(page.locator("#reportExportMenuPanel")).toBeVisible();
    const reportDownload=page.waitForEvent("download");await page.locator("#exportMonthlyReportCsv").click();
    expect((await reportDownload).suggestedFilename()).toMatch(/\.csv$/);
    await page.locator("#reportOpenBudgetPlan").click();await expect(page.locator("#income.active")).toBeVisible();
    expect(await financeRecords(page)).toBe(before);
    await page.locator("#topbarToolsTrigger").click();await page.locator("#productivityCenterButton").click();
    const action = page.locator('#productivityPanelTemplates [data-productivity-action="expense"]');await fits(action,true);
    await action.click();await expect(page.locator("#expenseDialog")).toBeVisible();
    await page.keyboard.press("Escape");expect(await financeRecords(page)).toBe(before);
  });

  test(`security descriptions, connection summary and long reminders stay readable in ${theme}`, async ({ page }) => {
    await open(page,"settings",theme,320,660);
    const before = await financeRecords(page);
    await page.evaluate(() => document.querySelector('[data-settings-tab="profiles"]').click());
    const choices = page.locator("#rememberModeButtonGroup > button");
    for (const button of await choices.all()) { const g=await fits(button);expect(g.height).toBeGreaterThanOrEqual(56); }
    await expect(choices.first().locator("span")).toHaveCSS("font-size","12px");
    for(const button of await choices.all())expect(await textContrast(button.locator("span"))).toBeGreaterThanOrEqual(4.5);
    const gaps = await choices.evaluateAll(ns => ns.slice(1).map((n,i) => n.getBoundingClientRect().top - ns[i].getBoundingClientRect().bottom));
    expect(gaps).toEqual([8,8]);
    await choices.first().locator("span").evaluate(n => n.textContent = "Auto-unlocks on this device. A longer explanation must remain visible and stay inside its choice row.");
    await fits(choices.first());
    await page.evaluate(() => {document.querySelector('[data-settings-tab="sync"]').click();for(const d of document.querySelectorAll("#settings details"))d.open=true;});
    const summary = page.locator(".advanced-settings-disclosure > summary");await fits(summary);
    const lines = await summary.evaluate(n => ({ title:n.querySelector("span").getBoundingClientRect().bottom, description:n.querySelector("small").getBoundingClientRect().top }));
    expect(lines.description).toBeGreaterThanOrEqual(lines.title);
    await summary.click();await expect(summary.locator("xpath=..")).not.toHaveAttribute("open", "");await summary.click();
    await page.evaluate(() => {document.querySelector('[data-settings-tab="app"]').click();for(const d of document.querySelectorAll("#settings details"))d.open=true;});
    await page.waitForFunction(() => Boolean(window.FinanceReminderAlerts));
    await page.evaluate(() => window.FinanceReminderAlerts.check(false, { deliver:false, reason:"layout check" }));
    // The startup summary and scheduled review use different backup wording.
    const reminder = page.locator(".finance-alert-row").filter({ hasText:/No external recovery (?:bundle|backup)/ }).first();await fits(reminder);
    await reminder.locator("span").last().evaluate(n => {n.textContent = "A longer recovery reminder must remain readable without losing the next step, even on a narrow phone screen.";n.closest("button").id="longReminderFixture";});
    await fits(page.locator("#longReminderFixture"));expect(await financeRecords(page)).toBe(before);
  });

  test(`planner menu remains normally clickable through viewport, scroll and keyboard changes in ${theme}`, async ({ page }) => {
    test.setTimeout(90000);
    await open(page,"income",theme);
    const before = await financeRecords(page);
    await page.locator("#monthlyBudgetPlannerToggle").click();
    const trigger = page.locator(".budget-planner-more-menu > button"),panel=page.locator("#budgetPlannerMorePanel");
    for (const [width,height] of [[393,852],[393,660],[320,660]]) {
      await page.setViewportSize({ width,height });
      for (const targetY of [130,height/2,height-50]) {
        await trigger.evaluate((n,y) => scrollBy(0,n.getBoundingClientRect().top-y),targetY);
        await trigger.click();await expectMenuInViewport(page);
        await page.locator("#openBudgetSettings").click();await expect(page.locator("#budgetSettingsDialog")).toBeVisible();
        await page.keyboard.press("Escape");await expect(panel).toBeHidden();
      }
    }
    await trigger.focus();await page.keyboard.press("ArrowDown");await expect(page.locator("#openBudgetSettings")).toBeFocused();
    await page.keyboard.press("End");await expect(page.locator("#exportBudgetCsv")).toBeFocused();
    await page.keyboard.press("Escape");await expect(panel).toBeHidden();await expect(trigger).toBeFocused();
    await trigger.click();await page.evaluate(() => scrollBy(0,120));await expectMenuInViewport(page);
    await page.setViewportSize({ width:852,height:393 });await expectMenuInViewport(page);await fits(trigger);
    await page.setViewportSize({ width:393,height:660 });await expectMenuInViewport(page);
    await page.keyboard.press("Escape");await expect(trigger).toBeFocused();
    await trigger.click();await page.locator("#income-title").click();await expect(panel).toBeHidden();
    await trigger.click();const download=page.waitForEvent("download");await page.locator("#exportBudgetCsv").click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);await expect(panel).toBeHidden();
    expect(await financeRecords(page)).toBe(before);
    await page.setViewportSize({ width:1440,height:900 });await trigger.click();await expect(panel).not.toHaveAttribute("data-phone-positioned");
  });

  test(`rotated project and planner menus retain 44px touch targets in ${theme}`,async({ page }) => {
    await open(page,"projects",theme,852,393);
    expect(await page.evaluate(() => matchMedia("(pointer:coarse)").matches)).toBe(true);
    for(const button of await page.locator(".project-action-more > .overflow-menu-trigger").all())expect((await fits(button)).font).toBe("13px");
    await open(page,"income",theme,852,393);await page.locator("#monthlyBudgetPlannerToggle").click();expect((await fits(page.locator(".budget-planner-more-menu > button"))).font).toBe("13px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  });
}

test.describe("mouse layout preservation",() => {
  test.use({ isMobile:false,hasTouch:false,deviceScaleFactor:1 });
  test("desktop account copy and compact controls retain their existing roles",async({ page }) => {
    await open(page,"money","dark",1440,950);
    await page.locator("#availableMoneySection .collapse-toggle[aria-expanded=false]").evaluateAll(ns=>ns.forEach(n=>n.click()));
    await page.locator("[data-spend-account]").first().click();
    await expect(page.locator(".account-mode-full-label")).toBeVisible();await expect(page.locator(".account-mode-phone-label")).toBeHidden();
    await page.keyboard.press("Escape");
    expect((await page.locator("#availableMoneySection .collapse-toggle").boundingBox()).height).toBe(30);
    await expect(page.locator("#addAccountButton")).toHaveCSS("border-radius","12px");
  });
});
