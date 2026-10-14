import { test, expect } from "../helpers/browser-fixtures.mjs";

test.use({ serviceWorkers:"block" });

async function ensureMoneyVisible(page) {
  await page.evaluate(() => document.querySelector('.nav-button[data-page="money"]')?.click());
  await page.waitForFunction(() => {
    const money = document.getElementById("money");
    return Boolean(money && getComputedStyle(money).display !== "none" && money.getBoundingClientRect().width > 0);
  });
}

async function ensurePeriodsExpanded(page) {
  for (const key of ["first-half", "second-half", "other-expenses"]) {
    const button = page.locator(`#money [data-collapse-toggle='${key}']`);
    if (await button.getAttribute("aria-expanded") === "false") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
  }
}

async function waitForMascotGeometry(page) {
  await page.waitForFunction(() => {
    const firstSection = document.getElementById("firstHalfSection");
    const mascot = document.getElementById("earlyTotal");
    const collapse = firstSection?.querySelector(".collapse-toggle");
    if (!firstSection || !mascot || !collapse) return false;

    const mascotBox = mascot.getBoundingClientRect();
    const collapseBox = collapse.getBoundingClientRect();
    return mascot.classList.contains("summary-mascot-slot")
      && mascotBox.width > 0
      && mascotBox.height > 0
      && collapseBox.width > 0
      && collapseBox.height > 0;
  });
}

async function openMoney(page, width = 1440, { today = "2026-09-01", month = "2026-08" } = {}) {
  await page.setViewportSize({ width, height:900 });
  await page.goto("http://127.0.0.1:3000/index.html?page=money", { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("body")).toHaveClass(/finance-signed-in/);
  await page.waitForFunction(() => Boolean(window.FinanceSummaryMascots?.apply));
  await page.evaluate(({ today, month }) => {
    window.FINANCE_SUMMARY_TODAY_OVERRIDE = today;
    window.selectedMonth = () => month;
    window.FinanceSummaryMascots.apply();
  }, { today, month });
  await page.waitForTimeout(50);
  await ensureMoneyVisible(page);
  if (width >= 851) await ensurePeriodsExpanded(page);
}

test("desktop Budget & Expenses uses the approved supplied mascots and exact spacing", async ({ page }) => {
  await openMoney(page, 1440);

  const imageLoads = await page.evaluate(async () => Promise.all(
    Object.values(window.FinanceSummaryMascots.assets).map(src => new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve({ src:image.src, ok:true, width:image.naturalWidth, height:image.naturalHeight });
      image.onerror = () => resolve({ src:image.src, ok:false, width:0, height:0 });
      image.src = src;
    }))
  ));

  for (const image of imageLoads) {
    expect(image.ok).toBe(true);
    expect(image.src).toContain("?v=2.5.0-talaan1");
    expect(image.width).toBe(256);
    expect(image.height).toBe(256);
  }

  /* Image decoding adds an async wait long enough for startup routing to settle.
     Re-select Finance and expand the sections so geometry is measured only while visible. */
  await ensureMoneyVisible(page);
  await ensurePeriodsExpanded(page);

  await page.evaluate(() => {
    for (const id of ["legendEarlyTotal", "legendLateTotal", "legendOtherTotal", "earlyTotal", "lateTotal", "otherTotal"]) {
      const element = document.getElementById(id);
      element.textContent = "₱0.00";
      element.classList.remove("summary-mascot-slot");
      delete element.dataset.summaryMascot;
      element.removeAttribute("aria-label");
      element.removeAttribute("title");
    }

    /* Reproduce the legacy completion smile that previously won this slot. */
    const legacyFirst = document.getElementById("legendEarlyTotal");
    legacyFirst.dataset.firstHalfOriginalText = "₱0.00";
    legacyFirst.textContent = "";
    const legacySmile = document.createElement("img");
    legacySmile.dataset.firstHalfCompleteIcon = "true";
    legacySmile.src = "./icons/heart-smile-light.png";
    legacyFirst.appendChild(legacySmile);

    window.FinanceSummaryMascots.apply();
  });

  await waitForMascotGeometry(page);

  const state = await page.evaluate(() => {
    const readSlot = id => {
      const element = document.getElementById(id);
      const box = element.getBoundingClientRect();
      const pseudo = getComputedStyle(element, "::after");
      return {
        mascot:element.dataset.summaryMascot || "",
        aria:element.getAttribute("aria-label") || "",
        width:box.width,
        height:box.height,
        pseudoWidth:parseFloat(pseudo.width),
        pseudoHeight:parseFloat(pseudo.height),
        background:pseudo.backgroundImage
      };
    };

    const top = document.getElementById("legendEarlyTotal");
    const topStyle = getComputedStyle(top);
    const firstSection = document.getElementById("firstHalfSection");
    const header = firstSection.querySelector(".period-header").getBoundingClientRect();
    const lowerMascot = document.getElementById("earlyTotal").getBoundingClientRect();
    const collapse = firstSection.querySelector(".collapse-toggle").getBoundingClientRect();
    const mascotCenter = (lowerMascot.top + lowerMascot.bottom) / 2;
    const collapseCenter = (collapse.top + collapse.bottom) / 2;
    const legacySmile = top.querySelector("img[data-first-half-complete-icon]");

    return {
      slots:{
        legendEarlyTotal:readSlot("legendEarlyTotal"),
        legendLateTotal:readSlot("legendLateTotal"),
        legendOtherTotal:readSlot("legendOtherTotal"),
        earlyTotal:readSlot("earlyTotal"),
        lateTotal:readSlot("lateTotal"),
        otherTotal:readSlot("otherTotal")
      },
      legacySmileDisplay:getComputedStyle(legacySmile).display,
      topPosition:topStyle.position,
      topRightOffset:parseFloat(topStyle.right),
      lower:{
        mascotWidth:lowerMascot.width,
        mascotHeight:lowerMascot.height,
        mascotGap:collapse.left - lowerMascot.right,
        mascotLift:collapseCenter - mascotCenter,
        collapseWidth:collapse.width,
        collapseHeight:collapse.height,
        collapseRightInset:header.right - collapse.right
      }
    };
  });

  const expected = {
    legendEarlyTotal:["red", "mascot-red.png?v=2.5.0-talaan1"],
    legendLateTotal:["orange", "mascot-orange.png?v=2.5.0-talaan1"],
    legendOtherTotal:["blue", "mascot-blue.png?v=2.5.0-talaan1"],
    earlyTotal:["red", "mascot-red.png?v=2.5.0-talaan1"],
    lateTotal:["orange", "mascot-orange.png?v=2.5.0-talaan1"],
    otherTotal:["blue", "mascot-blue.png?v=2.5.0-talaan1"]
  };

  for (const [id, [color, asset]] of Object.entries(expected)) {
    const slot = state.slots[id];
    expect(slot.mascot).toBe(color);
    expect(slot.aria).toContain("₱0.00");
    expect(slot.pseudoWidth).toBeCloseTo(30, 0);
    expect(slot.pseudoHeight).toBeCloseTo(30, 0);
    expect(slot.background).toContain(asset);
  }

  expect(state.legacySmileDisplay).toBe("none");
  expect(state.topPosition).toBe("absolute");
  expect(state.topRightOffset).toBeCloseTo(19, 0);
  expect(state.lower.mascotWidth).toBeCloseTo(30, 0);
  expect(state.lower.mascotHeight).toBeCloseTo(30, 0);
  expect(state.lower.mascotGap).toBeCloseTo(10, 0);
  expect(state.lower.mascotLift).toBeCloseTo(16, 0);
  expect(state.lower.collapseWidth).toBeCloseTo(30, 0);
  expect(state.lower.collapseHeight).toBeCloseTo(30, 0);
  expect(state.lower.collapseRightInset).toBeCloseTo(10, 0);
});

test("difference cards follow green and red state while phone disables mascot override", async ({ page }) => {
  await openMoney(page, 1440);

  const setDifference = negative => page.evaluate(negative => {
    const card = [...document.querySelectorAll("#moneySummary .summary-card")].find(item => {
      const label = item.querySelector(".summary-label-desktop")?.textContent?.trim()
        || item.querySelector(".summary-card-label")?.textContent?.trim()
        || "";
      return label === "First-half difference";
    });
    const value = card.querySelector(".summary-card-value");
    value.textContent = negative ? "-₱100.00" : "₱100.00";
    delete value.dataset.firstHalfOriginalText;
    value.classList.toggle("text-danger", negative);
    value.classList.toggle("text-green", !negative);
    card.classList.toggle("summary-card-danger", negative);
    card.classList.toggle("summary-card-green", !negative);
    window.FinanceSummaryMascots.apply();
    return {
      mascot:value.dataset.summaryMascot || "",
      aria:value.getAttribute("aria-label") || "",
      text:value.textContent,
      background:getComputedStyle(value, "::after").backgroundImage
    };
  }, negative);

  const positive = await setDifference(false);
  expect(positive.mascot).toBe("green");
  expect(positive.aria).toContain("₱100.00");
  expect(positive.text).toBe("₱100.00");
  expect(positive.background).toContain("mascot-green.png?v=2.5.0-talaan1");

  const negative = await setDifference(true);
  expect(negative.mascot).toBe("red");
  expect(negative.aria).toContain("-₱100.00");
  expect(negative.text).toBe("-₱100.00");
  expect(negative.background).toContain("mascot-red.png?v=2.5.0-talaan1");

  await page.setViewportSize({ width:390, height:844 });

  await expect.poll(() => page.evaluate(() => ({
    slots:document.querySelectorAll("#money .summary-mascot-slot").length,
    data:document.querySelectorAll("#money [data-summary-mascot]").length,
    desktopMedia:window.matchMedia("(min-width: 851px)").matches
  }))).toEqual({ slots:0, data:0, desktopMedia:false });
});

test("period mascots do not replace live amounts before their date boundary", async ({ page }) => {
  await openMoney(page, 1440, { today:"2026-08-10", month:"2026-08" });

  const snapshot = async today => page.evaluate(today => {
    window.FINANCE_SUMMARY_TODAY_OVERRIDE = today;
    for (const id of ["legendEarlyTotal", "legendLateTotal", "earlyTotal", "lateTotal"]) {
      const element = document.getElementById(id);
      element.textContent = "₱0.00";
      delete element.dataset.firstHalfOriginalText;
      delete element.dataset.otherExpensesOriginalText;
    }
    const cards = [...document.querySelectorAll("#moneySummary .summary-card")];
    const readDifference = label => {
      const card = cards.find(item => (item.querySelector(".summary-label-desktop")?.textContent?.trim() || item.querySelector(".summary-card-label")?.textContent?.trim()) === label);
      const value = card.querySelector(".summary-card-value");
      value.textContent = "₱1,234.00";
      return value;
    };
    const firstDifference = readDifference("First-half difference");
    const secondDifference = readDifference("Second-half difference");
    window.FinanceSummaryMascots.apply();
    return {
      early:document.getElementById("legendEarlyTotal").dataset.summaryMascot || "",
      late:document.getElementById("legendLateTotal").dataset.summaryMascot || "",
      firstDifference:firstDifference.dataset.summaryMascot || "",
      secondDifference:secondDifference.dataset.summaryMascot || "",
      firstText:firstDifference.textContent,
      secondText:secondDifference.textContent
    };
  }, today);

  expect(await snapshot("2026-08-10")).toEqual({
    early:"",
    late:"",
    firstDifference:"",
    secondDifference:"",
    firstText:"₱1,234.00",
    secondText:"₱1,234.00"
  });

  expect(await snapshot("2026-08-28")).toEqual({
    early:"red",
    late:"",
    firstDifference:"green",
    secondDifference:"",
    firstText:"₱1,234.00",
    secondText:"₱1,234.00"
  });

  expect(await snapshot("2026-09-01")).toEqual({
    early:"red",
    late:"orange",
    firstDifference:"green",
    secondDifference:"green",
    firstText:"₱1,234.00",
    secondText:"₱1,234.00"
  });
});
