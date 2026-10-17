"use strict";
(function installPhoneFinanceCompat(root) {
  const doc = root.document;
  if (!doc) return;

  function bindPhoneIconOnlyButton(button, label, iconMarkup) {
    if (!button || button.dataset.phoneCompactIconBound === "true") return;
    const visibleLabel = String(button.textContent || label).trim() || label;
    button.dataset.phoneCompactIconBound = "true";
    button.classList.add("phone-icon-only-action");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.replaceChildren();
    const icon = doc.createElement("span");
    icon.className = "phone-only-action-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = iconMarkup;
    const text = doc.createElement("span");
    text.className = "phone-only-action-label";
    text.textContent = visibleLabel;
    button.append(icon, text);
  }

  const PHONE_TRUNCATION_TARGETS = [
    "#topTitle",
    "#todayLabel",
    ".month-display-value",
    ".workspace-switcher-button",
    ".dashboard-week-copy strong",
    ".card-header h3",
    ".settings-status-copy",
    ".settings-state-chip",
    ".system-status-value",
    ".summary-card-label",
    ".legend-copy",
    ".record-title-copy > strong",
    ".record-title-copy > small",
    "[data-label=\"Planned account\"]",
    ".account-card-label",
    ".account-card-main strong",
    ".finance-kanban-card-meta",
    ".finance-kanban-card-value",
    ".pc-event-title",
    ".pc-event-meta",
    ".project-title-text",
    ".project-title-note",
    ".productivity-search-copy strong",
    ".productivity-search-copy small",
    ".productivity-search-value",
    ".transaction-calendar-entry span"
  ].join(",");

  function matchingElements(scope, selector) {
    const elements = [...scope.querySelectorAll(selector)];
    if (scope.matches?.(selector)) elements.unshift(scope);
    return elements;
  }

  function preservePhoneTextLabels(scope = doc) {
    if (!root.matchMedia?.("(max-width: 700px)").matches) return;
    matchingElements(scope, PHONE_TRUNCATION_TARGETS).forEach(element => {
      if (element.closest(".amount, .period-total, .summary-card-value, .legend-total, .kpi-value, [data-money-value]")) return;
      const text = String(element.textContent || "").replace(/\s+/g, " ").trim();
      if (text && !element.getAttribute("title")) element.setAttribute("title", text);
    });
  }

  function enhancePhoneCompactButtons(scope = doc) {
    matchingElements(scope, "#addAccountButton").forEach(button => bindPhoneIconOnlyButton(
      button,
      "Add account",
      '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 5v14M5 12h14"/></svg>'
    ));
    matchingElements(scope, "[data-pc-add], [data-pc-full-add]").forEach(button => bindPhoneIconOnlyButton(
      button,
      "Schedule event",
      '<svg viewBox="0 0 24 24" focusable="false"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16M12 12v5M9.5 14.5h5"/></svg>'
    ));
  }

  function installPhoneFinanceCompactUi() {
    const apply = (scope = doc) => {
      enhancePhoneCompactButtons(scope);
      preservePhoneTextLabels(scope);
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => apply(), { once:true }); else apply();
    const startObserver = () => {
      if (!doc.body || doc.body.dataset.phoneFinanceCompactObserved === "true") return;
      doc.body.dataset.phoneFinanceCompactObserved = "true";
      const observer = new MutationObserver(records => {
        const scopes = new Set();
        for (const record of records) {
          if (record.target.closest?.(".calculator-input-shell")) continue;
          const label = record.target.closest?.(PHONE_TRUNCATION_TARGETS);
          if (label) scopes.add(label);
          for (const node of record.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) scopes.add(node);
          }
        }
        for (const scope of scopes) if (scope.isConnected) apply(scope);
      });
      observer.observe(doc.body, { childList:true, subtree:true });
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", startObserver, { once:true }); else startObserver();
    root.matchMedia?.("(max-width: 700px)").addEventListener?.("change", () => preservePhoneTextLabels());
  }

  installPhoneFinanceCompactUi();
})(typeof window !== "undefined" ? window : globalThis);
