(() => {
  const root = window;
  const DESKTOP_QUERY = "(min-width: 851px)";
  const media = window.matchMedia(DESKTOP_QUERY);
  const ASSETS = Object.freeze({
    red:"./assets/mascots/mascot-red.png?v=2.5.0-talaan1",
    green:"./assets/mascots/mascot-green.png?v=2.5.0-talaan1",
    blue:"./assets/mascots/mascot-blue.png?v=2.5.0-talaan1",
    orange:"./assets/mascots/mascot-orange.png?v=2.5.0-talaan1"
  });

  let queued = false;

  function storedAmountText(element) {
    if (!element) return "";
    return element.dataset.firstHalfOriginalText
      || element.dataset.otherExpensesOriginalText
      || element.textContent?.trim()
      || "";
  }

  function numericAmount(value) {
    const text = String(value || "").replace(/,/g, "").trim();
    if (!text) return NaN;
    const negative = /^\(.*\)$/.test(text) || /(^|\s)-/.test(text);
    const number = Number(text.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(number)) return NaN;
    return negative ? -number : number;
  }

  function selectedFinanceMonth() {
    try {
      const value = typeof root.selectedMonth === "function" ? root.selectedMonth() : "";
      if (/^\d{4}-\d{2}$/.test(String(value || ""))) return String(value);
    } catch (error) {}
    const picker = document.getElementById("monthPicker")?.value;
    if (/^\d{4}-\d{2}$/.test(String(picker || ""))) return String(picker);
    const shortValue = document.getElementById("monthDisplayShort")?.textContent?.trim();
    return /^\d{4}-\d{2}$/.test(String(shortValue || "")) ? String(shortValue) : "";
  }

  function manilaTodayKey() {
    const override = String(root.FINANCE_SUMMARY_TODAY_OVERRIDE || root.FINANCE_FIRST_HALF_TODAY_OVERRIDE || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
    try {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Manila", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
      const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
      return `${map.year}-${map.month}-${map.day}`;
    } catch (error) {
      const date = new Date();
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    }
  }

  function periodState(month = selectedFinanceMonth()) {
    if (!/^\d{4}-\d{2}$/.test(month)) return { firstHalfFinished:false, monthFinished:false };
    const today = manilaTodayKey();
    const currentMonth = today.slice(0, 7);
    if (month < currentMonth) return { firstHalfFinished:true, monthFinished:true };
    if (month > currentMonth) return { firstHalfFinished:false, monthFinished:false };
    return {
      firstHalfFinished:Number(today.slice(8, 10)) > 15,
      monthFinished:false
    };
  }

  function clearMascot(element) {
    if (!element) return;
    const legacyAmount = storedAmountText(element);
    const hasLegacyCompletion = Boolean(element.querySelector("img[data-first-half-complete-icon], img[data-other-expenses-complete-icon]"));
    element.classList.remove("summary-mascot-slot");
    delete element.dataset.summaryMascot;
    if (hasLegacyCompletion && legacyAmount) {
      element.setAttribute("aria-label", legacyAmount);
      element.title = legacyAmount;
    } else {
      element.removeAttribute("aria-label");
      element.removeAttribute("title");
    }
    element.closest(".summary-card")?.classList.remove("has-summary-mascot");
    element.closest(".collapse-actions")?.classList.remove("has-period-mascot");
  }

  function useMascot(element, { color, accessibleLabel, cardClass = true, periodClass = false }) {
    if (!element) return;
    const value = storedAmountText(element);
    const nextLabel = `${accessibleLabel}: ${value}`;
    if (!element.classList.contains("summary-mascot-slot")) element.classList.add("summary-mascot-slot");
    if (element.dataset.summaryMascot !== color) element.dataset.summaryMascot = color;
    if (element.getAttribute("aria-label") !== nextLabel) element.setAttribute("aria-label", nextLabel);
    if (element.getAttribute("title") !== nextLabel) element.setAttribute("title", nextLabel);
    if (cardClass) element.closest(".summary-card")?.classList.add("has-summary-mascot");
    if (periodClass) element.closest(".collapse-actions")?.classList.add("has-period-mascot");
  }

  function zeroTotal(id, color, label, { period = false, eligible = true } = {}) {
    const element = document.getElementById(id);
    if (!element) return;
    if (!eligible) {
      clearMascot(element);
      return;
    }
    const amount = numericAmount(storedAmountText(element));
    if (Number.isFinite(amount) && Math.abs(amount) < 0.005) {
      useMascot(element, { color, accessibleLabel:label, cardClass:!period, periodClass:period });
    } else {
      clearMascot(element);
    }
  }

  function differenceCards({ firstHalfFinished, monthFinished }) {
    const cards = document.querySelectorAll("#moneySummary .summary-card");
    for (const card of cards) {
      const label = card.querySelector(".summary-label-desktop")?.textContent?.trim()
        || card.querySelector(".summary-card-label")?.textContent?.trim()
        || "";
      const isFirstHalf = label === "First-half difference";
      const isSecondHalf = label === "Second-half difference";
      if (!isFirstHalf && !isSecondHalf) continue;
      const value = card.querySelector(".summary-card-value");
      if (!value) continue;
      const eligible = isFirstHalf ? firstHalfFinished : monthFinished;
      if (!eligible) {
        clearMascot(value);
        continue;
      }
      const isRed = card.classList.contains("summary-card-danger") || value.classList.contains("text-danger") || value.classList.contains("text-red");
      useMascot(value, { color:isRed ? "red" : "green", accessibleLabel:label, cardClass:true });
    }
  }

  function clearAll() {
    document.querySelectorAll("#money .summary-mascot-slot").forEach(clearMascot);
  }

  function apply() {
    queued = false;
    if (!media.matches) {
      clearAll();
      return;
    }

    const state = periodState();
    zeroTotal("legendEarlyTotal", "red", "First half of the month", { eligible:state.firstHalfFinished });
    zeroTotal("legendLateTotal", "orange", "Second half of the month", { eligible:state.monthFinished });
    zeroTotal("legendOtherTotal", "blue", "Other expenses");

    differenceCards(state);

    zeroTotal("earlyTotal", "red", "First half of the month", { period:true, eligible:state.firstHalfFinished });
    zeroTotal("lateTotal", "orange", "Second half of the month", { period:true, eligible:state.monthFinished });
    zeroTotal("otherTotal", "blue", "Other expenses", { period:true });
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  }

  function start() {
    apply();
    const money = document.getElementById("money") || document.body;
    new MutationObserver(schedule).observe(money, {
      childList:true,
      subtree:true,
      characterData:true,
      attributes:true,
      attributeFilter:["class"]
    });
    media.addEventListener?.("change", schedule);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("finance:page-changed", schedule);
    document.addEventListener("change", event => {
      if (event.target?.id === "monthPicker") schedule();
    });
  }

  root.FinanceSummaryMascots = Object.freeze({ refresh:schedule, apply, assets:ASSETS, periodState, manilaTodayKey });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once:true });
  else start();
})();

/* Collapsed desktop navigation changes pages without opening the rail. */
(() => {
  const desktop = window.matchMedia("(min-width: 851px)");
  document.addEventListener("click", event => {
    const navButton = event.target.closest?.("#sidebar .nav-button");
    if (!navButton || !desktop.matches) return;

    const sidebar = document.getElementById("sidebar");
    if (!sidebar || sidebar.classList.contains("sidebar-pinned")) return;

    sidebar.classList.remove("desktop-open");
    document.body?.classList.remove("sidebar-layout-pinned");
    sidebar.setAttribute("aria-hidden", "false");

    const menuButton = document.getElementById("menuButton");
    if (menuButton) {
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Pin navigation open");
      menuButton.title = "Pin navigation open";
    }

    const expandButton = document.getElementById("sidebarCloseButton");
    if (expandButton) {
      expandButton.setAttribute("aria-label", "Pin navigation open");
      expandButton.title = "Pin navigation open";
    }
  });
})();

/* Budget & Expenses uses one compact desktop toolbar while preserving tablet/phone filter collapse. */
(() => {
  const desktop = window.matchMedia("(min-width: 1181px)");
  let queued = false;

  function hideGroup(element) {
    if (!element) return;
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
    element.querySelectorAll?.("input, select, button").forEach(control => { control.tabIndex = -1; });
  }

  function enforceMonthScope(rerender = false) {
    const dateControl = document.getElementById("expenseDateFilter");
    if (!dateControl) return false;
    const changed = dateControl.value !== "month";
    dateControl.value = "month";
    dateControl.tabIndex = -1;
    dateControl.setAttribute("aria-hidden", "true");
    hideGroup(dateControl.closest(".field"));
    if (changed && rerender) {
      if (typeof renderMoneyPage === "function") renderMoneyPage();
      else if (typeof renderPage === "function") renderPage("money");
    }
    return changed;
  }

  function placeToolbar() {
    const panel = document.getElementById("expenseFiltersPanel");
    const toolbar = document.getElementById("transactionToolbar-expense");
    if (!panel || !toolbar) return;

    toolbar.querySelector("[data-transaction-density]")?.closest("label")?.remove();
    document.getElementById("money")?.classList.add("transaction-density-compact");

    const row = panel.querySelector(":scope > .expense-toolbar-single-line");
    if (desktop.matches && row) {
      if (toolbar.parentElement !== row) row.append(toolbar);
      return;
    }
    if (panel.nextElementSibling !== toolbar) panel.after(toolbar);
  }

  function apply() {
    queued = false;
    hideGroup(document.getElementById("bulkExpenseBar"));
    enforceMonthScope(false);
    placeToolbar();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(apply);
  }

  function start() {
    apply();
    const money = document.getElementById("money") || document.body;
    new MutationObserver(schedule).observe(money, { childList:true, subtree:true });
    desktop.addEventListener?.("change", schedule);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("finance:page-changed", schedule);
    window.addEventListener("finance:profile-changed", schedule);
    document.addEventListener("change", event => {
      if (event.target?.matches?.("#transactionToolbar-expense [data-transaction-saved-view]")) {
        queueMicrotask(() => enforceMonthScope(true));
      } else if (event.target?.id === "expenseDateFilter") {
        queueMicrotask(() => enforceMonthScope(true));
      }
    });
  }

  window.FinanceCompactExpenseToolbar = Object.freeze({ apply, enforceMonthScope, placeToolbar });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once:true });
  else start();
})();
