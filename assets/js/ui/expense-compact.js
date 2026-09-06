"use strict";

(function installCompactExpenseCardEnhancements(root) {
  const PERIOD_SELECTOR = "#money .period-card[data-collapse-key]";
  const ROW_SELECTOR = "#money .record-row[data-expense-row]";
  const REPEAT_SELECTOR = "#money [data-toggle-saved], #paidExpenseList .desktop-record-actions [data-toggle-saved]";
  const PAID_REPEAT_STYLE_ID = "talaan-paid-repeat-png-control";
  let refreshQueued = false;

  function installPaidRepeatPngStyles() {
    if (document.getElementById(PAID_REPEAT_STYLE_ID)) return false;
    const style = document.createElement("style");
    style.id = PAID_REPEAT_STYLE_ID;
    style.textContent = `
@media (min-width: 851px) and (hover: hover) and (pointer: fine) {
  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved],
  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved]:hover,
  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved]:focus-visible,
  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved]:active,
  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved].active,
  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved].active:hover {
    box-sizing: border-box !important;
    flex: 0 0 30px !important;
    width: 30px !important;
    min-width: 30px !important;
    max-width: 30px !important;
    height: 30px !important;
    min-height: 30px !important;
    max-height: 30px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    overflow: visible !important;
  }

  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved] .saved-icon-container {
    display: block !important;
    flex: 0 0 30px !important;
    width: 30px !important;
    min-width: 30px !important;
    max-width: 30px !important;
    height: 30px !important;
    min-height: 30px !important;
    max-height: 30px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background-image: url("./icons/repeat-monthly-off.png?v=2.4.0-talaan1") !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
    background-size: 30px 30px !important;
  }

  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved].active .saved-icon-container {
    background-image: url("./icons/repeat-monthly-on.png?v=2.4.0-talaan1") !important;
  }

  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved] .saved-icon {
    opacity: 0 !important;
  }

  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved] > .monthly-repeat-label {
    display: none !important;
  }
}

/* Compact expense CSS intentionally uses explicit light-theme colors with
   !important. These dark-theme rules are injected after the runtime styles so
   Budget & Expenses keeps readable headings, record names, metadata, and
   amounts without changing light mode or finance behavior. */
@media (min-width: 851px) and (hover: hover) and (pointer: fine) {
  html[data-theme="dark"] body #money .period-header h3,
  html[data-theme="dark"] body #money .record-row[data-expense-row] .expense-record-title .record-title-copy > strong {
    color: #F8FAFC !important;
  }

  html[data-theme="dark"] body #money .period-header p,
  html[data-theme="dark"] body #money .record-row[data-expense-row] .expense-record-title .record-title-copy > small,
  html[data-theme="dark"] body #money .record-row[data-expense-row] .expense-record-title .ui-tag,
  html[data-theme="dark"] body #money .record-row[data-expense-row] > .due-cell,
  html[data-theme="dark"] body #money .record-row[data-expense-row] > [data-label="Planned account"],
  html[data-theme="dark"] body #money .record-row[data-expense-row] > [data-label="Planned account"]::before {
    color: #AEBBD0 !important;
  }

  html[data-theme="dark"] body #money .record-row[data-expense-row] > .amount {
    color: #F1F5F9 !important;
  }

  html[data-theme="dark"] body #money .period-card .period-header .collapse-toggle {
    border-color: #475569 !important;
    background: #172033 !important;
    color: #CBD5E1 !important;
  }

  html[data-theme="dark"] body #money .period-card .period-header .collapse-toggle:hover {
    background: #1E293B !important;
  }

  html[data-theme="dark"] body #money .period-card .period-header .collapse-icon {
    color: #CBD5E1 !important;
  }
}`;
    document.head.appendChild(style);
    const readableStyle = document.createElement("style");
    readableStyle.id = `${PAID_REPEAT_STYLE_ID}-readable`;
    readableStyle.textContent = `
@media (min-width: 851px) {
  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved],
  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved]:hover,
  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved]:focus-visible,
  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved]:active,
  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved].active,
  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved].active:hover {
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 auto !important;
    flex-shrink: 0 !important;
    width: max-content !important;
    min-width: 112px !important;
    max-width: 100% !important;
    height: 30px !important;
    min-height: 30px !important;
    max-height: 30px !important;
    padding: 0 7px !important;
    gap: 5px !important;
    border: 1px solid var(--line) !important;
    border-radius: 8px !important;
    background: var(--surface) !important;
    color: var(--text) !important;
    box-shadow: none !important;
    text-shadow: none !important;
    overflow: visible !important;
    white-space: nowrap !important;
  }

  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved] .saved-icon-container {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 30px !important;
    width: 30px !important;
    height: 30px !important;
    min-height: 30px !important;
    max-height: 30px !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
    background-size: 30px 30px !important;
  }

  html body #paidExpenseList .desktop-record-actions > [data-toggle-saved] > .monthly-repeat-label {
    display: flex !important;
    align-items: center !important;
    width: auto !important;
    min-width: 0 !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    color: inherit !important;
    font-size: .65rem !important;
    font-weight: 700 !important;
    line-height: 1 !important;
    opacity: 1 !important;
    visibility: visible !important;
    white-space: nowrap !important;
    overflow: visible !important;
  }
}
`;
    document.head.appendChild(readableStyle);
    return true;
  }

  function moveDueWarningInline(row) {
    if (!row) return false;
    const statuses = row.querySelector(".expense-record-title .record-statuses");
    const dueCell = row.querySelector(":scope > .due-cell");
    if (!statuses || !dueCell) return false;

    const warning = dueCell.querySelector(".due-warning");
    if (!warning) return false;

    warning.classList.add("expense-inline-due-warning");
    const unpaid = statuses.querySelector(".status-unpaid");
    if (unpaid?.nextSibling) statuses.insertBefore(warning, unpaid.nextSibling);
    else if (unpaid) unpaid.insertAdjacentElement("afterend", warning);
    else statuses.prepend(warning);
    return true;
  }

  function refresh(scope = document) {
    const rows = scope.matches?.(ROW_SELECTOR) ? [scope] : [...scope.querySelectorAll?.(ROW_SELECTOR) || []];
    rows.forEach(moveDueWarningInline);
    return rows.length;
  }

  function queueRefresh(scope = document) {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      refresh(scope);
    });
  }

  function prefersReducedMotion() {
    return root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function animateRepeatMonthly(button) {
    if (!button?.isConnected || prefersReducedMotion()) return false;
    const icon = button.querySelector(".saved-icon-container");
    if (!icon || typeof icon.animate !== "function") return false;

    icon.getAnimations().forEach(animation => animation.cancel());
    icon.animate([
      { transform:"scale(1)", offset:0 },
      { transform:"scale(0.82)", offset:0.24 },
      { transform:"scale(1.12)", offset:0.56 },
      { transform:"scale(0.97)", offset:0.78 },
      { transform:"scale(1)", offset:1 }
    ], {
      duration:340,
      easing:"cubic-bezier(0.22, 1, 0.36, 1)"
    });
    return true;
  }

  function findRepeatButton(key, fallback) {
    if (key) {
      const match = [...document.querySelectorAll(REPEAT_SELECTOR)].find(button => button.dataset.toggleSaved === key);
      if (match) return match;
    }
    return fallback?.isConnected ? fallback : null;
  }

  function ensureCollapseChanged(button, previousExpanded) {
    if (!button?.isConnected) return;
    if (button.getAttribute("aria-expanded") !== previousExpanded) return;

    const key = button.dataset.collapseToggle;
    const section = button.closest(PERIOD_SELECTOR);
    if (!key || !section) return;

    if (typeof root.toggleCollapsibleSection === "function") {
      root.toggleCollapsibleSection(key);
      return;
    }

    const shouldCollapse = previousExpanded !== "false";
    section.classList.toggle("is-collapsed", shouldCollapse);
    button.setAttribute("aria-expanded", shouldCollapse ? "false" : "true");
    const icon = button.querySelector(".collapse-icon");
    if (icon) icon.style.transform = shouldCollapse ? "rotate(180deg)" : "";
  }

  document.addEventListener("click", event => {
    const repeatButton = event.target.closest?.(REPEAT_SELECTOR);
    if (repeatButton) {
      const repeatKey = repeatButton.dataset.toggleSaved || "";
      requestAnimationFrame(() => animateRepeatMonthly(findRepeatButton(repeatKey, repeatButton)));
    }

    const button = event.target.closest?.(`${PERIOD_SELECTOR} [data-collapse-toggle]`);
    if (!button) return;
    const previousExpanded = button.getAttribute("aria-expanded");
    setTimeout(() => ensureCollapseChanged(button, previousExpanded), 0);
  }, true);

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type !== "childList") continue;
      if (record.target.closest?.("#money") || [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE && (node.matches?.("#money, #money *") || node.querySelector?.("#money")))) {
        queueRefresh(document);
        break;
      }
    }
  });

  function start() {
    installPaidRepeatPngStyles();
    refresh(document);
    observer.observe(document.documentElement, { childList:true, subtree:true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once:true });
  else start();

  root.FinanceExpenseCompact = Object.freeze({ refresh, moveDueWarningInline, animateRepeatMonthly, installPaidRepeatPngStyles });
})(typeof window !== "undefined" ? window : globalThis);
