import { expect, test } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000/";

async function openPhone(page) {
  await page.setViewportSize({ width:393, height:852 });
  await page.goto(APP_URL, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => Boolean(document.querySelector(".topbar")));
}

async function exposePage(page, pageId) {
  await page.evaluate(id => {
    document.documentElement.dataset.financeAuth = "signed-in";
    document.body.classList.remove("finance-signed-out", "finance-auth-pending");
    const target = document.getElementById(id);
    if (!target) return;
    document.querySelectorAll(".page.active").forEach(node => node.classList.remove("active"));
    target.classList.add("active");
    target.style.setProperty("display", "block", "important");
    window.dispatchEvent(new CustomEvent("finance:privacy-auth-change", { detail:{ authenticated:true } }));
    window.dispatchEvent(new CustomEvent("finance:page-changed", { detail:{ pageId:id } }));
  }, pageId);
}

test("phone Add Expense stays in the toolbar grid instead of covering the title", async ({ page }) => {
  await openPhone(page);
  await page.evaluate(() => {
    const button = document.getElementById("quickAddExpense");
    button.hidden = false;
  });

  const contract = await page.locator("#quickAddExpense").evaluate(button => {
    const style = getComputedStyle(button);
    const title = document.getElementById("topTitle");
    const buttonRect = button.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return {
      position:style.position,
      width:buttonRect.width,
      height:buttonRect.height,
      overlapsTitle:!(buttonRect.right <= titleRect.left || buttonRect.left >= titleRect.right || buttonRect.bottom <= titleRect.top || buttonRect.top >= titleRect.bottom)
    };
  });

  expect(contract.position).toBe("static");
  expect(contract.width).toBe(35);
  expect(contract.height).toBe(35);
  expect(contract.overlapsTitle).toBe(false);
});

test("phone Add account and Schedule event are true 35px icon-only controls", async ({ page }) => {
  await openPhone(page);

  const targets = [
    { pageId:"money", selector:"#addAccountButton" },
    { pageId:"projects", selector:".project-calendar-v13020 [data-pc-add]" }
  ];

  for (const target of targets) {
    await exposePage(page, target.pageId);
    const button = page.locator(target.selector).first();
    await expect(button).toHaveCount(1);
    await page.waitForFunction(selector => Boolean(document.querySelector(selector)?.querySelector(".phone-only-action-icon")), target.selector);
    const contract = await button.evaluate(node => {
      const style = getComputedStyle(node);
      const before = getComputedStyle(node, "::before");
      const after = getComputedStyle(node, "::after");
      const label = node.querySelector(".phone-only-action-label");
      const icon = node.querySelector(".phone-only-action-icon");
      return {
        width:style.width,
        height:style.height,
        beforeContent:before.content,
        afterContent:after.content,
        labelDisplay:label ? getComputedStyle(label).display : null,
        iconDisplay:icon ? getComputedStyle(icon).display : null,
        ariaLabel:node.getAttribute("aria-label")
      };
    });
    expect(contract.width).toBe("35px");
    expect(contract.height).toBe("35px");
    expect(["none", "normal", "\"\""]).toContain(contract.beforeContent);
    expect(["none", "normal", "\"\""]).toContain(contract.afterContent);
    expect(contract.labelDisplay).toBe("none");
    expect(contract.iconDisplay).toBe("grid");
    expect(contract.ariaLabel).toBeTruthy();
  }
});

test("phone Finance tabs are static and expense actions stay on one 35px row", async ({ page }) => {
  await openPhone(page);
  await exposePage(page, "money");

  const switcherContract = await page.locator("#money > .finance-workspace-marquee-row").evaluate(row => {
    const switcher = row.querySelector(":scope > .money-workspace-switcher");
    return {
      rowPosition:getComputedStyle(row).position,
      switcherPosition:getComputedStyle(switcher).position,
      switcherHeight:getComputedStyle(switcher).height,
      marqueeDisplay:getComputedStyle(row.querySelector(":scope > .finance-week-marquee")).display
    };
  });
  expect(switcherContract.rowPosition).toBe("static");
  expect(switcherContract.switcherPosition).toBe("static");
  expect(switcherContract.switcherHeight).toBe("35px");
  expect(switcherContract.marqueeDisplay).toBe("none");

  await page.evaluate(() => {
    const host = document.getElementById("money");
    const row = document.createElement("div");
    row.id = "phoneHotfixExpenseFixture";
    row.className = "record-row";
    row.dataset.expenseRow = "fixture";
    row.style.setProperty("display", "grid", "important");
    row.style.setProperty("width", "360px", "important");
    row.innerHTML = '<div class="record-title">Fixture</div><strong class="amount">₱100.00</strong><div class="due-cell">21</div><div data-label="Planned account">Maya</div><div class="mobile-record-actions"><button class="button button-paid">Mark paid</button><div class="record-more-menu overflow-menu"><button class="button button-secondary overflow-menu-trigger" type="button">⋮</button></div></div>';
    host.appendChild(row);
  });

  const actions = await page.locator("#phoneHotfixExpenseFixture > .mobile-record-actions").evaluate(node => {
    const rect = node.getBoundingClientRect();
    const more = node.querySelector(":scope > .record-more-menu").getBoundingClientRect();
    const markPaid = node.querySelector(":scope > .button").getBoundingClientRect();
    return {
      height:rect.height,
      moreWidth:more.width,
      moreHeight:more.height,
      sameRow:Math.abs(markPaid.top - more.top) < 1
    };
  });
  expect(actions.height).toBe(35);
  expect(actions.moreWidth).toBe(35);
  expect(actions.moreHeight).toBe(35);
  expect(actions.sameRow).toBe(true);
});
