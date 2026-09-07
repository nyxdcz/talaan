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

  function preservePhoneTextLabels() {
    if (!root.matchMedia?.("(max-width: 700px)").matches) return;
    doc.querySelectorAll(PHONE_TRUNCATION_TARGETS).forEach(element => {
      if (element.closest(".amount, .period-total, .summary-card-value, .legend-total, .kpi-value, [data-money-value]")) return;
      const text = String(element.textContent || "").replace(/\s+/g, " ").trim();
      if (text && !element.getAttribute("title")) element.setAttribute("title", text);
    });
  }

  function enhancePhoneCompactButtons() {
    bindPhoneIconOnlyButton(
      doc.getElementById("addAccountButton"),
      "Add account",
      '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 5v14M5 12h14"/></svg>'
    );
    doc.querySelectorAll("[data-pc-add], [data-pc-full-add]").forEach(button => bindPhoneIconOnlyButton(
      button,
      "Schedule event",
      '<svg viewBox="0 0 24 24" focusable="false"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16M12 12v5M9.5 14.5h5"/></svg>'
    ));
  }

  function installPhoneFinanceCompactUi() {
    const apply = () => {
      enhancePhoneCompactButtons();
      preservePhoneTextLabels();
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", apply, { once:true }); else apply();
    const startObserver = () => {
      if (!doc.body || doc.body.dataset.phoneFinanceCompactObserved === "true") return;
      doc.body.dataset.phoneFinanceCompactObserved = "true";
      const observer = new MutationObserver(() => apply());
      observer.observe(doc.body, { childList:true, subtree:true });
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", startObserver, { once:true }); else startObserver();
  }

  installPhoneFinanceCompactUi();
})(typeof window !== "undefined" ? window : globalThis);
