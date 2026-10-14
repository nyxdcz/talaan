import { expect, test } from "@playwright/test";
/* global data, renderMoneyPage, goToPage */

test.use({ serviceWorkers:"block", isMobile:true, hasTouch:true, deviceScaleFactor:3 });

async function openBudget(page, width = 393, theme = "light", height = 852) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(new Date("2026-10-12T04:00:00Z"));
  await page.addInitScript(value => {
    window.FINANCE_SYNC_CONFIG = { supabaseUrl:"", supabasePublishableKey:"" };
    localStorage.setItem("simple-finance-theme-v1", value);
  }, theme);
  await page.goto("http://127.0.0.1:3000/?page=money", { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock) && !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
}

async function gesture(row, dx, dy = 0, ending = "pointerup", target = null) {
  await expect(async () => { await row.scrollIntoViewIfNeeded(); }).toPass({ timeout:5000 });
  const surface = target || row.locator(".record-title-copy > strong");
  const box = await surface.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const pointer = { pointerId:1, pointerType:"touch", isPrimary:true, bubbles:true, clientX:x, clientY:y };
  await surface.dispatchEvent("pointerdown", pointer);
  await surface.dispatchEvent("pointermove", { ...pointer, clientX:x + dx / 2, clientY:y + dy / 2 });
  await surface.dispatchEvent("pointermove", { ...pointer, clientX:x + dx, clientY:y + dy });
  await surface.dispatchEvent(ending, { ...pointer, clientX:x + dx, clientY:y + dy });
}

for (const width of [375,384,388,393,430]) {
  for (const theme of ["light","dark"]) {
    test(`phone swipe selection and inline actions fit at ${width}px in ${theme}`, async ({ page }) => {
      await openBudget(page,width,theme);
      const row = page.locator("#money .phone-swipe-row").first();
      const checkbox = row.locator("[data-select-expense]");
      const before = await page.evaluate(() => JSON.stringify(data));
      await expect(checkbox).toBeHidden();
      await gesture(row,80);
      await expect(checkbox).toBeChecked();
      await expect(row.locator(".phone-selection-badge")).toBeVisible();
      await expect(page.locator("#bulkSelectedCount")).toHaveText("1 selected");
      await gesture(row,80);
      await expect(checkbox).not.toBeChecked();
      await expect(row.locator(".phone-selection-badge")).toBeHidden();
      await gesture(row,-80);
      const panel = row.locator(".record-more-panel");
      await expect(panel).toBeVisible();
      await expect(panel.locator(".phone-recurrence-label")).toHaveText(/Repeat monthly: (On|Off)/);
      await panel.scrollIntoViewIfNeeded();
      const geometry = await panel.evaluate(node => {
        const box = node.getBoundingClientRect();
        const buttons = [...node.querySelectorAll("button")].map(button => button.getBoundingClientRect());
        return { inside:box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
          sizes:buttons.map(b => ({ width:b.width,height:b.height })), gap:buttons[1].left - buttons[0].right,
          overflow:document.documentElement.scrollWidth > innerWidth + 1 };
      });
      expect(geometry.inside).toBe(true);
      expect(geometry.overflow).toBe(false);
      expect(geometry.gap).toBeCloseTo(8,0);
      for (const size of geometry.sizes) { expect(size.width).toBeGreaterThanOrEqual(44);expect(size.height).toBeGreaterThanOrEqual(44); }
      expect(await page.evaluate(() => JSON.stringify(data))).toBe(before);
      await panel.locator("[data-edit-expense]").click();
      await expect(page.locator("#expenseDialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await row.locator(".mobile-record-actions > [data-mark-paid]").click();
      await expect(page.locator("#expensePaymentDialog")).toBeVisible();
      await page.keyboard.press("Escape");
      expect(await page.evaluate(() => JSON.stringify(data))).toBe(before);
    });
  }
}

test("phone gestures ignore scrolling, short drags, cancelled gestures and controls", async ({ page }) => {
  await openBudget(page);
  const row = page.locator("#money .phone-swipe-row").first();
  const checkbox = row.locator("[data-select-expense]");
  for (const [dx,dy,end] of [[12,90,"pointerup"],[30,0,"pointerup"],[80,0,"pointercancel"],[80,0,"lostpointercapture"],[80,70,"pointerup"]]) {
    await gesture(row,dx,dy,end);
    await expect(checkbox).not.toBeChecked();
    await expect(row.locator(".record-more-panel")).toBeHidden();
  }
  await gesture(row,80,0,"pointerup",row.locator(".mobile-record-actions > [data-mark-paid]"));
  await expect(checkbox).not.toBeChecked();
  await expect(row).toHaveCSS("touch-action","pan-y pinch-zoom");
});

test("phone keyboard selection, action fallback, filter clearing and escape preserve state", async ({ page }) => {
  await openBudget(page);
  const row = page.locator("#money .phone-swipe-row").first();
  await row.focus();
  await page.keyboard.press("Space");
  await expect(row.locator("[data-select-expense]")).toBeChecked();
  await page.keyboard.press("Enter");
  const panel = row.locator(".record-more-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator("[data-edit-expense]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(row).toBeFocused();
  const trigger = row.locator(".overflow-menu-trigger");
  await trigger.focus();
  await expect(trigger).toHaveCSS("clip-path","none");
  await page.keyboard.press("Enter");
  await panel.locator("[data-phone-select-expense]").click();
  await expect(row.locator("[data-select-expense]")).not.toBeChecked();
  await expect(row).toBeFocused();
  await row.focus();
  await page.keyboard.press("Space");
  await page.locator("#expenseSearch").evaluate(node => { node.value = "Music";node.dispatchEvent(new Event("input",{ bubbles:true })); });
  await expect(page.locator("#bulkSelectedCount")).toHaveText("0 selected");
  expect(await page.locator("#money [data-select-expense]:checked").count()).toBe(0);
});

test("phone action trays close on outside tap, another row and resizing; inline actions survive scrolling", async ({ page }) => {
  await openBudget(page);
  const rows = page.locator("#money .record-row[data-expense-row]");
  const first = rows.nth(0), second = rows.nth(1);
  await gesture(first,-80);
  await expect(first.locator(".record-more-panel")).toBeVisible();
  await page.locator("#topTitle").click();
  await expect(first.locator(".record-more-panel")).toBeHidden();
  await gesture(first,-80);
  await gesture(second,-80);
  await expect(first.locator(".record-more-panel")).toBeHidden();
  await expect(second.locator(".record-more-panel")).toBeVisible();
  await page.evaluate(() => window.scrollBy(0,80));
  await expect(second.locator(".record-more-panel")).toBeVisible();
  await gesture(first,-80);
  await page.setViewportSize({ width:1024,height:852 });
  await expect(first.locator(".record-more-panel")).toBeHidden();
  await expect(first).not.toHaveClass(/phone-swipe-row/);
  await expect(first.locator("[data-select-expense]")).toBeVisible();
  await expect(first.locator(".desktop-record-actions")).toBeVisible();
});

for (const height of [660,852]) {
  for (const theme of ["light","dark"]) {
    test(`Monthly breakdown centers arrow and label at 393x${height} in ${theme}`, async ({ page }) => {
      await openBudget(page,393,theme,height);
      const summary = page.locator("#moneyBudgetBreakdown > summary");
      for (let state = 0;state < 2;state++) {
        const metrics = await summary.evaluate(node => {
          const box = node.getBoundingClientRect();
          const icon = node.querySelector("svg").getBoundingClientRect();
          const text = node.querySelector("span").getBoundingClientRect();
          return { dx:Math.abs((icon.left + text.right - box.left - box.right) / 2), dy:Math.abs((text.top + text.bottom - box.top - box.bottom) / 2), iconDy:Math.abs((icon.top + icon.bottom - box.top - box.bottom) / 2), gap:text.left - icon.right, height:box.height };
        });
        expect(metrics.dx).toBeLessThanOrEqual(1);
        expect(metrics.dy).toBeLessThanOrEqual(1);
        expect(metrics.iconDy).toBeLessThanOrEqual(1);
        expect(metrics.gap).toBeCloseTo(8,0);
        expect(metrics.height).toBeGreaterThanOrEqual(44);
        await summary.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#moneyBudgetBreakdown")).toHaveJSProperty("open",!state);
      }
    });
  }
}


test("native touch swipes select and reveal actions while vertical swipes scroll", async ({ page }) => {
  await openBudget(page);
  const row = page.locator("#money .phone-swipe-row").first();
  await row.scrollIntoViewIfNeeded();
  const session = await page.context().newCDPSession(page);
  async function touchSwipe(dx,dy) {
    const box = await row.locator(".record-title-copy > strong").boundingBox();
    const x=box.x + box.width/2, y=box.y + box.height/2;
    await session.send("Input.dispatchTouchEvent",{ type:"touchStart",touchPoints:[{ x,y }] });
    for (let step=1;step<=5;step++) {
      await session.send("Input.dispatchTouchEvent",{ type:"touchMove",touchPoints:[{ x:x+dx*step/5,y:y+dy*step/5 }] });
    }
    await session.send("Input.dispatchTouchEvent",{ type:"touchEnd",touchPoints:[] });
  }
  await touchSwipe(80,0);
  await expect(row.locator("[data-select-expense]")).toBeChecked();
  await touchSwipe(-80,0);
  await expect(row.locator(".record-more-panel")).toBeVisible();
  const scrollBefore = await page.evaluate(() => scrollY);
  await touchSwipe(0,-120);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrollBefore);
  await expect(row.locator("[data-select-expense]")).toBeChecked();
});

test("long phone expense content wraps and recurrence changes only after its action is tapped", async ({ page }) => {
  await openBudget(page,375,"dark",660);
  await page.evaluate(() => {
    const item=data.expenses.find(expense => expense.name === "Apple Music");
    item.name="Long household subscription with extended account information";
    item.notes="Additional detail that wraps across several lines without hiding the expense controls";
    renderMoneyPage();
  });
  const row = page.locator("#money .phone-swipe-row").filter({ hasText:"Long household subscription" });
  const id=await row.getAttribute("data-expense-row");
  const before=await page.evaluate(key=>JSON.stringify(data.expenses.find(e=>e.id===key)),id);
  await gesture(row,-80);
  expect(await page.evaluate(key=>JSON.stringify(data.expenses.find(e=>e.id===key)),id)).toBe(before);
  await row.locator(".record-more-panel [data-toggle-saved]").click();
  await expect(row.locator(".status-one-time")).toBeVisible();
  await gesture(row,-80);
  await expect(row.locator(".phone-recurrence-label")).toHaveText("Repeat monthly: Off");
  await row.locator(".record-more-panel [data-toggle-saved]").click();
  await expect(row.locator(".status-saved")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

for (const theme of ["light","dark"]) {
  test(`Paid Expenses menu stays inside the phone viewport and restores desktop positioning in ${theme}`, async ({ page }) => {
    await openBudget(page,393,theme,660);
    await page.evaluate(() => {
      const item=data.expenses.find(expense=>expense.name === "Apple Music");
      item.paid=true;
      item.paidDate="2026-10-12";
      goToPage("paid-expenses");
    });
    const menu = page.locator("#paid-expenses .record-more-menu").first();
    const trigger=menu.locator(".overflow-menu-trigger");
    await trigger.click();
    const panel=menu.locator(".record-more-panel");
    await expect(panel).toBeVisible();
    const box=await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(12);
    expect(box.y).toBeGreaterThanOrEqual(12);
    expect(box.x+box.width).toBeLessThanOrEqual(393-12);
    expect(box.y+box.height).toBeLessThanOrEqual(660-12);
    expect(await panel.evaluate(node => {
      const button=node.querySelector("[data-edit-expense]");
      const rect=button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));
    })).toBe(true);
    await panel.locator("[data-edit-expense]").click();
    await expect(page.locator("#expenseDialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await page.setViewportSize({ width:1024,height:852 });
    expect(await panel.evaluate(node=>node.style.position)).toBe("");
  });
}

test("phone row enhancement leaves unchanged attributes alone after DOM updates", async ({ page }) => {
  await openBudget(page);
  const count=await page.locator("#money .phone-swipe-row").first().evaluate(row=>new Promise(resolve=>{
    let changes=0;
    const observer=new MutationObserver(records=>{changes+=records.length;});
    observer.observe(row,{attributes:true});
    const fixture=document.createElement("span");
    fixture.hidden=true;
    row.append(fixture);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      observer.disconnect();fixture.remove();resolve(changes);
    }));
  }));
  expect(count).toBe(0);
});
