import { test, expect } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000/index.html?page=money";
const APP_CACHE = "finance-v2-20260828-household-splits-r17";

async function openFinance(page, viewport) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.setItem("simple-finance-theme-v1", "light"));
  await page.goto(APP_URL, { waitUntil:"networkidle" });
  await expect.poll(async () => {
    try { return await page.evaluate(() => navigator.serviceWorker?.controller?.scriptURL || ""); }
    catch { return ""; }
  }, { timeout:15000 }).toContain(`cache=${APP_CACHE}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(350);
  await expect.poll(async () => {
    try {
      return await page.evaluate(() => {
        if (!window.FinancePrivacyLock || typeof window.goToPage !== "function") return null;
        window.FinancePrivacyLock.setAuthenticated(true);
        window.goToPage("money", { historyMode:"none", smooth:false });
        const visible = selector => [...document.querySelectorAll(selector)].filter(node => {
          const box = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        });
        return {
          auth:document.body.classList.contains("finance-signed-in"),
          page:document.querySelector("#money")?.classList.contains("active") || false,
          summaries:visible("#money .legend-item, #money .summary-item").length,
          periods:visible("#money .period-card").length
        };
      });
    } catch { return null; }
  }, { timeout:15000 }).toEqual({ auth:true, page:true, summaries:8, periods:3 });
}

for (const width of [1024, 1280, 1366, 1440, 1920]) {
  test(`desktop toolbar, summaries, and period disclosure geometry stay compact at ${width}px`, async ({ page }) => {
    await openFinance(page, { width, height:1000 });
    const metrics = await page.evaluate(() => {
      const visible = selector => [...document.querySelectorAll(selector)].filter(node => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
      const heights = selector => visible(selector).map(node => node.getBoundingClientRect().height);
      const height = selector => visible(selector)[0]?.getBoundingClientRect().height || 0;
      const sizes = selector => visible(selector).map(node => {
        const box = node.getBoundingClientRect();
        return [box.width, box.height];
      });
      return {
        overflow:Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1,
        toolbarGap:parseFloat(getComputedStyle(document.querySelector(".topbar-actions")).gap),
        requiredToolbarHeights:{
          monthNavigator:height(".topbar-actions .month-navigator"),
          moreTools:height(".topbar-actions .topbar-tools-trigger")
        },
        visibleToolbarHeights:heights(".topbar-actions > .cloud-sync-toolbar-button, .topbar-actions .topbar-history-button, .topbar-actions .topbar-add-button, .topbar-actions .topbar-tools-trigger, .topbar-actions .month-navigator"),
        summaryHeights:heights("#money .legend-item, #money .summary-item"),
        periodDisclosureSizes:sizes("#money .period-card .collapse-toggle"),
        otherDisclosureSizes:sizes("#money #availableMoneySection [data-collapse-toggle='available-money']")
      };
    });
    expect(metrics.overflow).toBe(false);
    expect(metrics.toolbarGap).toBe(4);
    expect(metrics.requiredToolbarHeights.monthNavigator).toBeCloseTo(30, 0);
    expect(metrics.requiredToolbarHeights.moreTools).toBeCloseTo(30, 0);
    metrics.visibleToolbarHeights.forEach(heightValue => expect(heightValue).toBeCloseTo(30, 0));
    expect(metrics.summaryHeights).toHaveLength(8);
    metrics.summaryHeights.forEach(heightValue => expect(heightValue).toBeLessThanOrEqual(58));
    expect(metrics.periodDisclosureSizes).toHaveLength(3);
    metrics.periodDisclosureSizes.forEach(([widthValue, heightValue]) => {
      expect(widthValue).toBeCloseTo(30, 0);
      expect(heightValue).toBeCloseTo(30, 0);
    });
    expect(metrics.otherDisclosureSizes.length).toBeGreaterThanOrEqual(1);
    metrics.otherDisclosureSizes.forEach(([widthValue, heightValue]) => {
      expect(widthValue).toBeCloseTo(30, 0);
      expect(heightValue).toBeCloseTo(30, 0);
    });
  });
}

for (const contract of [{ width:1440, size:30 }, { width:390, size:35 }]) {
  test(`all eight section disclosures share the ${contract.size}px contract at ${contract.width}px`, async ({ page }) => {
    await openFinance(page, { width:contract.width, height:1000 });
    const groups = [
      { pageId:"money", selector:"#availableMoneySection [data-collapse-toggle='available-money'], #money .period-card .collapse-toggle", count:4 },
      { pageId:"income", selector:"#monthlyBudgetPlannerToggle, #income [data-budget-panel-toggle]", count:3 },
      { pageId:"paid-expenses", selector:"#paidExpensesSection [data-collapse-toggle='paid-expenses']", count:1 }
    ];
    let total = 0;
    for (const group of groups) {
      await page.evaluate(pageId => window.goToPage(pageId, { historyMode:"none", smooth:false }), group.pageId);
      await expect(page.locator(`#${group.pageId}`)).toHaveClass(/active/);
      const metrics = await page.locator(group.selector).evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect();
        const icon = button.querySelector(".collapse-icon") || button.querySelector(":scope > svg");
        const iconRect = icon?.getBoundingClientRect();
        return {
          width:rect.width,
          height:rect.height,
          radius:parseFloat(getComputedStyle(button).borderRadius),
          iconWidth:iconRect?.width || 0,
          iconHeight:iconRect?.height || 0,
          path:button.querySelector("svg path")?.getAttribute("d") || ""
        };
      }));
      expect(metrics).toHaveLength(group.count);
      total += metrics.length;
      for (const metric of metrics) {
        expect(metric.width).toBeCloseTo(contract.size, 0);
        expect(metric.height).toBeCloseTo(contract.size, 0);
        expect(metric.radius).toBe(12);
        expect(metric.iconWidth).toBeCloseTo(20, 0);
        expect(metric.iconHeight).toBeCloseTo(20, 0);
        expect(metric.path).toBe("m6 15 6-6 6 6");
      }
    }
    expect(total).toBe(8);
  });
}

test("fine-pointer desktop account and project header actions use the 30px compact contract", async ({ page }) => {
  await openFinance(page, { width:1440, height:1000 });

  const account = page.locator("#money #availableMoneySection #addAccountButton");
  await expect(account).toBeVisible();
  expect(await account.evaluate(node => node.getBoundingClientRect().height)).toBeCloseTo(30, 0);

  await page.evaluate(() => window.goToPage("projects", { historyMode:"none", smooth:false }));
  await expect(page.locator("#projects")).toHaveClass(/active/);
  const projectActions = page.locator("#projectCalendarV13020 .pc-header-actions > .button, #activeProjectsCard .project-kanban-header-actions > .button");
  await expect(projectActions).toHaveCount(4);
  const heights = await projectActions.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  heights.forEach(height => expect(height).toBeCloseTo(30, 0));
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1)).toBe(false);
});

test("desktop expense cards match the approved compact type, status, and footer specification", async ({ page }) => {
  await openFinance(page, { width:1440, height:1100 });
  const metrics = await page.evaluate(() => {
    const firstRow = document.querySelector("#money .record-row[data-expense-row]");
    const firstPeriod = document.querySelector("#money .period-card");
    const header = firstPeriod?.querySelector(".period-header");
    const title = header?.querySelector("h3");
    const helper = header?.querySelector("p");
    const total = header?.querySelector(".period-total");
    const collapse = header?.querySelector(".collapse-toggle");
    const collapseIcon = collapse?.querySelector(".collapse-icon");

    let warning = firstRow?.querySelector(".due-warning");
    if (firstRow && !warning) {
      warning = document.createElement("span");
      warning.className = "status-badge due-warning status-overdue";
      warning.textContent = "Past due · 6 days";
      firstRow.querySelector(":scope > .due-cell")?.append(warning);
    }
    window.FinanceExpenseCompact?.refresh();
    warning = firstRow?.querySelector(".expense-inline-due-warning") || null;

    const actions = firstRow ? [...firstRow.querySelectorAll(":scope > .desktop-record-actions > button")] : [];
    const repeat = firstRow?.querySelector(".desktop-record-actions [data-toggle-saved]");
    const markPaid = firstRow?.querySelector(".desktop-record-actions [data-mark-paid]");
    const edit = firstRow?.querySelector(".desktop-record-actions [data-edit-expense]");
    const repeatText = repeat?.querySelector(".monthly-repeat-label");
    const repeatIcon = repeat?.querySelector(".saved-icon-container");
    const checkboxLabel = firstRow?.querySelector(".expense-select-footer");
    const checkbox = firstRow?.querySelector(".expense-select-checkbox");
    const rowTitle = firstRow?.querySelector(".record-title-copy > strong");
    const detail = firstRow?.querySelector(".record-title-copy > small");
    const tag = firstRow?.querySelector(".record-title-copy .ui-tag");
    const unpaid = firstRow?.querySelector(".record-statuses .status-unpaid");
    const dueCell = firstRow?.querySelector(":scope > .due-cell");
    const account = firstRow?.querySelector(":scope > [data-label='Planned account']");
    const amount = firstRow?.querySelector(":scope > .amount");
    const actionBar = firstRow?.querySelector(":scope > .desktop-record-actions");

    const rect = node => node?.getBoundingClientRect() || { width:0, height:0, left:0, right:0, top:0, bottom:0 };
    const style = node => node ? getComputedStyle(node) : null;
    const font = node => ({ size:node ? parseFloat(style(node).fontSize) : 0, weight:node ? Number(style(node).fontWeight) : 0, color:node ? style(node).color : "" });
    const repeatRect = rect(repeat), paidRect = rect(markPaid), editRect = rect(edit), collapseRect = rect(collapse), headerRect = rect(header);

    return {
      sectionTitle:font(title),
      sectionHelper:font(helper),
      sectionTotal:font(total),
      collapseSize:[collapseRect.width, collapseRect.height],
      collapseRightInset:headerRect.right - collapseRect.right,
      collapseIconSize:[rect(collapseIcon).width, rect(collapseIcon).height],
      expenseTitle:font(rowTitle),
      detail:font(detail),
      tag:font(tag),
      unpaid:font(unpaid),
      warning:font(warning),
      warningParentClass:warning?.parentElement?.className || "",
      warningGap:warning && unpaid ? rect(warning).left - rect(unpaid).right : 0,
      duePseudo:dueCell ? getComputedStyle(dueCell, "::before").content : "",
      dueText:font(dueCell),
      account:font(account),
      amount:font(amount),
      actionGap:actionBar ? parseFloat(style(actionBar).gap) : 0,
      repeatSize:[repeatRect.width, repeatRect.height],
      repeatIconSize:[rect(repeatIcon).width, rect(repeatIcon).height],
      repeatBackground:repeatIcon ? style(repeatIcon).backgroundImage : "",
      repeatLabelDisplay:repeatText ? style(repeatText).display : "",
      repeatText:repeatText?.textContent?.trim() || "",
      repeatShadow:repeat ? style(repeat).boxShadow : "",
      repeatRadius:repeat ? parseFloat(style(repeat).borderRadius) : 0,
      markPaidShadow:markPaid ? style(markPaid).boxShadow : "",
      editShadow:edit ? style(edit).boxShadow : "",
      markPaidSize:[paidRect.width, paidRect.height],
      markPaidFont:font(markPaid),
      markPaidBackground:markPaid ? style(markPaid).backgroundColor : "",
      markPaidRadius:markPaid ? parseFloat(style(markPaid).borderRadius) : 0,
      editSize:[editRect.width, editRect.height],
      editFont:font(edit),
      editBorder:edit ? style(edit).borderColor : "",
      editRadius:edit ? parseFloat(style(edit).borderRadius) : 0,
      repeatToPaidGap:paidRect.left - repeatRect.right,
      paidToEditGap:editRect.left - paidRect.right,
      actionCount:actions.length,
      repeatIndex:actions.indexOf(repeat),
      paidIndex:actions.indexOf(markPaid),
      editIndex:actions.indexOf(edit),
      checkboxSize:[rect(checkbox).width, rect(checkbox).height],
      checkboxPosition:checkboxLabel ? style(checkboxLabel).position : "",
      checkboxLeft:checkboxLabel ? parseFloat(style(checkboxLabel).left) : -1,
      checkboxBottom:checkboxLabel ? parseFloat(style(checkboxLabel).bottom) : -1,
      mobileActionsDisplay:firstRow ? style(firstRow.querySelector(":scope > .mobile-record-actions")).display : ""
    };
  });

  expect(metrics.sectionTitle.size).toBeCloseTo(15, 0);
  expect(metrics.sectionTitle.weight).toBe(700);
  expect(metrics.sectionTitle.color).toBe("rgb(31, 41, 55)");
  expect(metrics.sectionHelper.size).toBeCloseTo(10, 0);
  expect(metrics.sectionHelper.weight).toBe(400);
  expect(metrics.sectionHelper.color).toBe("rgb(100, 116, 139)");
  expect(metrics.sectionTotal.size).toBeCloseTo(15, 0);
  expect(metrics.sectionTotal.weight).toBe(700);
  expect(metrics.collapseSize[0]).toBeCloseTo(30, 0);
  expect(metrics.collapseSize[1]).toBeCloseTo(30, 0);
  expect(metrics.collapseRightInset).toBeCloseTo(10, 0);
  expect(metrics.collapseIconSize[0]).toBeCloseTo(20, 0);
  expect(metrics.collapseIconSize[1]).toBeCloseTo(20, 0);

  expect(metrics.expenseTitle.size).toBeCloseTo(13, 0);
  expect(metrics.expenseTitle.weight).toBe(700);
  expect(metrics.detail.size).toBeCloseTo(10, 0);
  expect(metrics.detail.weight).toBe(400);
  expect(metrics.tag.size).toBeCloseTo(9, 0);
  expect(metrics.tag.weight).toBe(600);
  expect(metrics.unpaid.size).toBeCloseTo(10, 0);
  expect(metrics.unpaid.weight).toBe(700);
  expect(metrics.warning.size).toBeCloseTo(10, 0);
  expect(metrics.warning.weight).toBe(700);
  expect(metrics.warningParentClass).toContain("record-statuses");
  expect(metrics.warningGap).toBeCloseTo(4, 0);
  expect(["none", "normal", "\"\""]).toContain(metrics.duePseudo);
  expect(metrics.dueText.size).toBeCloseTo(10, 0);
  expect(metrics.dueText.weight).toBe(400);
  expect(metrics.account.size).toBeCloseTo(10, 0);
  expect(metrics.account.weight).toBe(600);
  expect(metrics.amount.size).toBeCloseTo(13, 0);
  expect(metrics.amount.weight).toBe(700);

  expect(metrics.actionGap).toBeCloseTo(5, 0);
  expect(metrics.repeatSize[0]).toBeGreaterThan(110);
  expect(metrics.repeatSize[1]).toBeCloseTo(30, 0);
  expect(metrics.repeatIconSize[0]).toBeCloseTo(30, 0);
  expect(metrics.repeatIconSize[1]).toBeCloseTo(30, 0);
  expect(metrics.repeatBackground).toMatch(/repeat-monthly-(?:on|off)\.png/);
  expect(["inline-flex", "flex"]).toContain(metrics.repeatLabelDisplay);
  expect(metrics.repeatText).toMatch(/Repeat(?:s)? monthly/);
  expect(metrics.repeatShadow).toBe("none");
  expect(metrics.repeatRadius).toBeCloseTo(12, 0);
  expect(metrics.markPaidSize[0]).toBeCloseTo(74, 0);
  expect(metrics.markPaidSize[1]).toBeCloseTo(30, 0);
  expect(metrics.markPaidFont.size).toBeCloseTo(11, 0);
  expect(metrics.markPaidFont.weight).toBe(600);
  expect(metrics.markPaidBackground).toBe("rgb(53, 111, 209)");
  expect(metrics.markPaidShadow).toBe("none");
  expect(metrics.markPaidRadius).toBeCloseTo(12, 0);
  expect(metrics.editSize[0]).toBeCloseTo(48, 0);
  expect(metrics.editSize[1]).toBeCloseTo(30, 0);
  expect(metrics.editFont.size).toBeCloseTo(11, 0);
  expect(metrics.editFont.weight).toBe(600);
  expect(metrics.editBorder).toBe("rgb(213, 220, 229)");
  expect(metrics.editShadow).toBe("none");
  expect(metrics.editRadius).toBeCloseTo(12, 0);
  expect(metrics.repeatToPaidGap).toBeCloseTo(5, 0);
  expect(metrics.paidToEditGap).toBeCloseTo(5, 0);
  expect(metrics.actionCount).toBeGreaterThanOrEqual(3);
  expect(metrics.repeatIndex).toBeGreaterThanOrEqual(0);
  expect(metrics.paidIndex).toBe(metrics.repeatIndex + 1);
  expect(metrics.editIndex).toBe(metrics.paidIndex + 1);
  expect(metrics.checkboxSize[0]).toBeCloseTo(18, 0);
  expect(metrics.checkboxSize[1]).toBeCloseTo(18, 0);
  expect(metrics.checkboxPosition).toBe("absolute");
  expect(metrics.checkboxLeft).toBeCloseTo(7, 0);
  expect(metrics.checkboxBottom).toBeCloseTo(7, 0);
  expect(metrics.mobileActionsDisplay).toBe("none");
});

test("desktop expense action rows stay inside their cards without a divider through the metadata", async ({ page }) => {
  await openFinance(page, { width:1440, height:1100 });
  const geometry = await page.evaluate(() => {
    const row = document.querySelector("#money .record-row[data-expense-row]");
    const account = row?.querySelector(":scope > [data-label='Planned account']");
    const amount = row?.querySelector(":scope > .amount");
    const actions = row?.querySelector(":scope > .desktop-record-actions");
    const rect = node => node?.getBoundingClientRect();
    const style = node => node ? getComputedStyle(node) : null;
    const rowRect = rect(row);
    const accountRect = rect(account);
    const amountRect = rect(amount);
    const actionRect = rect(actions);
    return {
      rowLeft:rowRect?.left || 0,
      rowRight:rowRect?.right || 0,
      accountBottom:accountRect?.bottom || 0,
      amountBottom:amountRect?.bottom || 0,
      actionLeft:actionRect?.left || 0,
      actionRight:actionRect?.right || 0,
      actionTop:actionRect?.top || 0,
      actionBorderTop:parseFloat(style(actions)?.borderTopWidth || "0")
    };
  });

  expect(geometry.actionBorderTop).toBe(0);
  expect(geometry.actionLeft).toBeGreaterThan(geometry.rowLeft);
  expect(geometry.actionRight).toBeLessThan(geometry.rowRight);
  expect(geometry.actionTop).toBeGreaterThanOrEqual(Math.max(geometry.accountBottom, geometry.amountBottom));
});

test("First half, Second half, and Other expenses collapse independently and restore their cards", async ({ page }) => {
  await openFinance(page, { width:1440, height:1000 });
  const keys = ["first-half", "second-half", "other-expenses"];

  for (const key of keys) {
    const button = page.locator(`#money [data-collapse-toggle='${key}']`);
    if (await button.getAttribute("aria-expanded") === "false") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
  }

  for (const key of keys) {
    const button = page.locator(`#money [data-collapse-toggle='${key}']`);
    const section = page.locator(`#money .period-card[data-collapse-key='${key}']`);
    const controlId = await button.getAttribute("aria-controls");
    const content = page.locator(`#${controlId}`);

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(section).toHaveClass(/is-collapsed/);
    await expect(content).toBeHidden();

    for (const otherKey of keys.filter(value => value !== key)) {
      await expect(page.locator(`#money [data-collapse-toggle='${otherKey}']`)).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(`#money .period-card[data-collapse-key='${otherKey}']`)).not.toHaveClass(/is-collapsed/);
    }

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(section).not.toHaveClass(/is-collapsed/);
    await expect(content).toBeVisible();
  }
});

for (const width of [390, 430]) {
  test(`phone Budget periods use the approved compact disclosure size at ${width}px`, async ({ page }) => {
    await openFinance(page, { width, height:900 });
    await page.evaluate(() => {
      document.querySelectorAll("#money .period-card").forEach(card => card.classList.add("is-collapsed"));
    });
    const metrics = await page.evaluate(() => {
      const visible = selector => [...document.querySelectorAll(selector)].filter(node => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
      const periods = visible("#money .period-card");
      const toggles = visible("#money .period-card .collapse-toggle");
      const stack = document.querySelector("#money .section-stack");
      return {
        overflow:Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1,
        stackGap:parseFloat(getComputedStyle(stack).gap),
        periodHeights:periods.map(card => card.getBoundingClientRect().height),
        periodMargins:periods.map(card => parseFloat(getComputedStyle(card).marginTop)),
        toggleSizes:toggles.map(toggle => {
          const box = toggle.getBoundingClientRect();
          return [box.width, box.height];
        })
      };
    });
    expect(metrics.overflow).toBe(false);
    expect(metrics.stackGap).toBeLessThanOrEqual(8);
    expect(metrics.periodHeights.length).toBeGreaterThanOrEqual(3);
    expect(metrics.toggleSizes).toHaveLength(metrics.periodHeights.length);
    metrics.periodHeights.forEach(height => expect(height).toBeLessThanOrEqual(72));
    metrics.periodMargins.forEach(margin => expect(margin).toBe(0));
    metrics.toggleSizes.forEach(([widthValue, heightValue]) => {
      expect(widthValue).toBeCloseTo(35, 0);
      expect(heightValue).toBeCloseTo(35, 0);
    });
  });
}

test("summary acknowledgement disables animation for reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ viewport:{ width:1440, height:900 }, reducedMotion:"reduce" });
  const page = await context.newPage();
  await openFinance(page, { width:1440, height:900 });
  const item = page.locator("#money .legend-item").first();
  await item.evaluate(node => node.classList.add("legend-live-update"));
  await expect.poll(() => item.evaluate(node => getComputedStyle(node).animationName)).toBe("none");
  await context.close();
});
