"use strict";
(function installHeaderToolsCompat(root) {
  const doc = root.document;
  if (!doc) return;

  function installQuickEntryToolsMenuRelocation() {
    const apply = () => {
      const panel = doc.getElementById("topbarToolsPanel");
      const theme = doc.getElementById("themeToggleButton");
      if (panel && theme) {
        let button = doc.getElementById("quickEntryMenuButton");
        if (!button) {
          button = doc.createElement("button");
          button.className = "topbar-tools-item";
          button.id = "quickEntryMenuButton";
          button.type = "button";
          button.setAttribute("role", "menuitem");
          button.setAttribute("aria-label", "Quick add");
          button.title = "Quick add";
          button.innerHTML = '<span class="toolbar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M17 14v6M14 17h6"/></svg></span><span><strong>Quick add</strong><small>Add a finance or work record</small></span>';
        }
        if (theme.nextElementSibling !== button) theme.insertAdjacentElement("afterend", button);
      }
      const standalone = doc.getElementById("mobileAddExpenseButton");
      if (standalone) {
        standalone.hidden = true;
        standalone.setAttribute("aria-hidden", "true");
        standalone.tabIndex = -1;
        standalone.dataset.movedToToolsMenu = "true";
      }
    };
    const activate = event => {
      const button = event.target.closest?.("#quickEntryMenuButton");
      if (!button) return;
      event.preventDefault();
      if (typeof root.FinanceProductivityTools?.openQuickAdd === "function") {
        root.FinanceProductivityTools.openQuickAdd();
        return;
      }
      const fallback = doc.getElementById("mobileAddExpenseButton");
      if (!fallback) return;
      const wasHidden = fallback.hidden;
      fallback.hidden = false;
      fallback.click();
      fallback.hidden = wasHidden;
    };
    doc.addEventListener("click", activate);
    const start = () => {
      apply();
      if (!doc.body || doc.body.dataset.quickEntryMenuRelocationObserved === "true") return;
      doc.body.dataset.quickEntryMenuRelocationObserved = "true";
      const observer = new MutationObserver(() => apply());
      observer.observe(doc.body, { childList:true, subtree:true });
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once:true }); else start();
  }

  function installHeaderToolsRelocation() {
    const hideStandalone = node => {
      if (!node) return;
      node.hidden = true;
      node.setAttribute("aria-hidden", "true");
      node.tabIndex = -1;
      node.style.setProperty("display", "none", "important");
    };
    const apply = () => {
      const panel = doc.getElementById("topbarToolsPanel");
      const theme = doc.getElementById("themeToggleButton");
      const quick = doc.getElementById("quickEntryMenuButton");
      const search = doc.getElementById("globalSearchButton");
      const quickActions = doc.getElementById("productivityCenterButton");
      const undo = doc.getElementById("undoMoneyMenuButton");
      const redo = doc.getElementById("redoMoneyMenuButton");
      if (panel && theme) {
        let customize = doc.getElementById("customizeDashboardMenuButton");
        if (!customize) {
          customize = doc.createElement("button");
          customize.className = "topbar-tools-item";
          customize.id = "customizeDashboardMenuButton";
          customize.type = "button";
          customize.setAttribute("role", "menuitem");
          customize.setAttribute("aria-label", "Customize dashboard");
          customize.title = "Customize dashboard";
          customize.innerHTML = '<span class="toolbar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M17 14v6M14 17h6"/></svg></span><span><strong>Customize dashboard</strong><small>Show, hide, reorder, and resize cards</small></span>';
        }
        const anchor = quick || theme;
        if (anchor.nextElementSibling !== customize) anchor.insertAdjacentElement("afterend", customize);
        if (customize && undo && customize.nextElementSibling !== undo) customize.insertAdjacentElement("afterend", undo);
        if (undo && redo && undo.nextElementSibling !== redo) undo.insertAdjacentElement("afterend", redo);
        if (redo && search && redo.nextElementSibling !== search) redo.insertAdjacentElement("afterend", search);
        panel.querySelectorAll(":scope > .menu-command-separator").forEach(separator => separator.remove());
        if (quickActions && quickActions.parentElement === panel && search && search.nextElementSibling !== quickActions) search.insertAdjacentElement("afterend", quickActions);
      }
      const history = doc.querySelector(".topbar-history-actions");
      if (history) {
        history.hidden = true;
        history.setAttribute("aria-hidden", "true");
        history.style.setProperty("display", "none", "important");
        history.querySelectorAll("button").forEach(button => { button.tabIndex = -1; });
      }
      hideStandalone(doc.getElementById("mobileAddExpenseButton"));
      doc.querySelectorAll(".topbar-actions button").forEach(button => {
        if (button.id === "customizeDashboardMenuButton") return;
        const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""} ${button.textContent || ""}`.toLowerCase();
        if (label.includes("customize dashboard")) hideStandalone(button);
      });
    };
    const activate = event => {
      const button = event.target.closest?.("#customizeDashboardMenuButton");
      if (!button) return;
      event.preventDefault();
      const openCustomizer = () => doc.getElementById("customizeDashboardButton")?.click();
      if (doc.querySelector("#dashboard.active")) {
        openCustomizer();
        return;
      }
      const dashboardNav = doc.querySelector('[data-page="dashboard"]');
      if (dashboardNav) {
        dashboardNav.click();
        root.setTimeout?.(openCustomizer, 0);
      } else openCustomizer();
    };
    doc.addEventListener("click", activate);
    const start = () => {
      apply();
      if (!doc.body || doc.body.dataset.headerToolsRelocationObserved === "true") return;
      doc.body.dataset.headerToolsRelocationObserved = "true";
      const observer = new MutationObserver(() => apply());
      observer.observe(doc.body, { childList:true, subtree:true });
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once:true }); else start();
  }

  const KANBAN_EDGE_GAP = 8;
  const KANBAN_TRIGGER_GAP = 6;

  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

  const getKanbanMenuTrigger = menu => menu?.querySelector(":scope > .overflow-menu-trigger");

  const getKanbanMenuPanel = (menu, docRef) => {
    const trigger = getKanbanMenuTrigger(menu);
    const id = trigger?.getAttribute("aria-controls");
    return id ? docRef.getElementById(id) : null;
  };

  const resetKanbanPanelStyles = panel => {
    if (!panel) return;
    ["position", "left", "top", "right", "bottom", "z-index", "margin", "max-width", "max-height", "overflow-y", "visibility"].forEach(property => panel.style.removeProperty(property));
    delete panel.dataset.viewportPlacement;
  };

  const resetKanbanMenuStyles = menu => {
    if (!menu) return;
    ["position", "left", "top", "right", "bottom", "width", "height", "z-index", "margin", "overflow", "-webkit-backdrop-filter", "backdrop-filter", "transform", "filter", "perspective", "contain", "clip-path", "will-change"].forEach(property => menu.style.removeProperty(property));
    delete menu.dataset.viewportPortal;
  };

  const createKanbanMenuPlaceholder = (docRef, menu, rect) => {
    const placeholder = docRef.createElement("span");
    placeholder.className = "kanban-column-menu-portal-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.style.width = `${Math.max(1, rect.width)}px`;
    placeholder.style.height = `${Math.max(1, rect.height)}px`;
    placeholder.style.flex = `0 0 ${Math.max(1, rect.width)}px`;
    placeholder.style.display = "inline-block";
    menu.parentNode?.insertBefore(placeholder, menu);
    return placeholder;
  };

  const portalKanbanMenu = (docRef, menu) => {
    if (!menu || menu.__financeKanbanPortal) return menu?.__financeKanbanPortal || null;
    const trigger = getKanbanMenuTrigger(menu);
    if (!trigger || !docRef.body) return null;
    const rect = trigger.getBoundingClientRect();
    const activeElement = menu.contains(docRef.activeElement) ? docRef.activeElement : null;
    const placeholder = createKanbanMenuPlaceholder(docRef, menu, rect);
    const state = {
      placeholder,
      originalParent:menu.parentNode,
      activeElement
    };
    menu.__financeKanbanPortal = state;
    docRef.body.appendChild(menu);
    menu.dataset.viewportPortal = "true";
    menu.style.setProperty("position", "fixed", "important");
    menu.style.setProperty("left", `${Math.round(rect.left)}px`, "important");
    menu.style.setProperty("top", `${Math.round(rect.top)}px`, "important");
    menu.style.setProperty("right", "auto", "important");
    menu.style.setProperty("bottom", "auto", "important");
    menu.style.setProperty("width", `${Math.max(1, rect.width)}px`, "important");
    menu.style.setProperty("height", `${Math.max(1, rect.height)}px`, "important");
    menu.style.setProperty("margin", "0", "important");
    menu.style.setProperty("z-index", "2600", "important");
    menu.style.setProperty("overflow", "visible", "important");
    menu.style.setProperty("-webkit-backdrop-filter", "none", "important");
    menu.style.setProperty("backdrop-filter", "none", "important");
    menu.style.setProperty("transform", "none", "important");
    menu.style.setProperty("filter", "none", "important");
    menu.style.setProperty("perspective", "none", "important");
    menu.style.setProperty("contain", "none", "important");
    menu.style.setProperty("clip-path", "none", "important");
    menu.style.setProperty("will-change", "auto", "important");
    if (activeElement?.isConnected) activeElement.focus();
    return state;
  };

  const restoreKanbanMenu = (docRef, menu) => {
    const state = menu?.__financeKanbanPortal;
    if (!menu || !state) return;
    const activeElement = menu.contains(docRef.activeElement) ? docRef.activeElement : null;
    const placeholder = state.placeholder;
    if (placeholder?.isConnected) placeholder.replaceWith(menu);
    else if (state.originalParent?.isConnected) state.originalParent.appendChild(menu);
    resetKanbanMenuStyles(menu);
    placeholder?.remove();
    delete menu.__financeKanbanPortal;
    if (activeElement?.isConnected) activeElement.focus();
  };

  const anchorPortaledKanbanMenu = menu => {
    const state = menu?.__financeKanbanPortal;
    if (!state) return;
    const rect = state.placeholder?.isConnected ? state.placeholder.getBoundingClientRect() : null;
    if (!rect) return;
    menu.style.setProperty("left", `${Math.round(rect.left)}px`, "important");
    menu.style.setProperty("top", `${Math.round(rect.top)}px`, "important");
    menu.style.setProperty("width", `${Math.max(1, rect.width)}px`, "important");
    menu.style.setProperty("height", `${Math.max(1, rect.height)}px`, "important");
  };

  const positionKanbanMenu = (menu, docRef, rootRef) => {
    const trigger = getKanbanMenuTrigger(menu);
    const panel = getKanbanMenuPanel(menu, docRef);
    if (!trigger || !panel) return;
    if (!menu.classList.contains("is-open") || panel.hidden) {
      resetKanbanPanelStyles(panel);
      restoreKanbanMenu(docRef, menu);
      return;
    }
    portalKanbanMenu(docRef, menu);
    anchorPortaledKanbanMenu(menu);
    const viewportWidth = Math.max(docRef.documentElement.clientWidth || 0, rootRef.innerWidth || 0);
    const viewportHeight = Math.max(docRef.documentElement.clientHeight || 0, rootRef.innerHeight || 0);
    const availableWidth = Math.max(0, viewportWidth - KANBAN_EDGE_GAP * 2);
    const availableHeight = Math.max(0, viewportHeight - KANBAN_EDGE_GAP * 2);
    panel.style.setProperty("position", "fixed", "important");
    panel.style.setProperty("z-index", "2601", "important");
    panel.style.setProperty("margin", "0", "important");
    panel.style.setProperty("right", "auto", "important");
    panel.style.setProperty("bottom", "auto", "important");
    panel.style.setProperty("max-width", `${availableWidth}px`, "important");
    panel.style.setProperty("max-height", `${availableHeight}px`, "important");
    panel.style.setProperty("overflow-y", "auto", "important");
    panel.style.setProperty("visibility", "hidden", "important");
    panel.style.setProperty("left", `${KANBAN_EDGE_GAP}px`, "important");
    panel.style.setProperty("top", `${KANBAN_EDGE_GAP}px`, "important");
    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const spaceBelow = viewportHeight - triggerRect.bottom - KANBAN_EDGE_GAP;
    const spaceAbove = triggerRect.top - KANBAN_EDGE_GAP;
    const openAbove = panelRect.height + KANBAN_TRIGGER_GAP > spaceBelow && spaceAbove > spaceBelow;
    const idealTop = openAbove ? triggerRect.top - panelRect.height - KANBAN_TRIGGER_GAP : triggerRect.bottom + KANBAN_TRIGGER_GAP;
    const top = clamp(idealTop, KANBAN_EDGE_GAP, viewportHeight - panelRect.height - KANBAN_EDGE_GAP);
    const idealLeft = triggerRect.right - panelRect.width;
    const left = clamp(idealLeft, KANBAN_EDGE_GAP, viewportWidth - panelRect.width - KANBAN_EDGE_GAP);
    panel.style.setProperty("left", `${Math.round(left)}px`, "important");
    panel.style.setProperty("top", `${Math.round(top)}px`, "important");
    panel.style.removeProperty("visibility");
    panel.dataset.viewportPlacement = openAbove ? "above" : "below";
  };

  function installKanbanColumnMenuViewportPositioning() {
    let frame = 0;
    const syncOpenMenus = () => {
      frame = 0;
      doc.querySelectorAll(".kanban-column-menu").forEach(menu => positionKanbanMenu(menu, doc, root));
    };
    const scheduleSync = () => {
      if (frame) root.cancelAnimationFrame?.(frame);
      frame = (root.requestAnimationFrame || (callback => root.setTimeout(callback, 0)))(syncOpenMenus);
    };
    const scheduleAfterMenuHandling = () => {
      const enqueue = root.queueMicrotask || (callback => Promise.resolve().then(callback));
      enqueue(scheduleSync);
    };
    const start = () => {
      if (!doc.body || doc.documentElement.dataset.kanbanViewportMenusReady === "true") return;
      doc.documentElement.dataset.kanbanViewportMenusReady = "true";
      doc.addEventListener("click", event => {
        if (event.target.closest?.(".kanban-column-menu") || doc.querySelector(".kanban-column-menu.is-open")) scheduleAfterMenuHandling();
      });
      doc.addEventListener("keydown", event => {
        if (event.target.closest?.(".kanban-column-menu") || event.key === "Escape") scheduleAfterMenuHandling();
      });
      doc.addEventListener("scroll", event => {
        const target = event.target;
        if (target?.matches?.(".finance-kanban-board") || target?.closest?.(".finance-kanban-board")) scheduleSync();
      }, true);
      root.addEventListener("resize", scheduleSync);
      const observer = new MutationObserver(mutations => {
        if (mutations.some(mutation => mutation.target?.closest?.(".kanban-column-menu") || mutation.target?.classList?.contains("kanban-column-menu"))) scheduleSync();
      });
      observer.observe(doc.body, { subtree:true, attributes:true, attributeFilter:["class", "hidden"] });
      root.FinanceKanbanMenuCompat = { reposition:scheduleSync };
      scheduleSync();
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once:true }); else start();
  }

  installQuickEntryToolsMenuRelocation();
  installHeaderToolsRelocation();
  installKanbanColumnMenuViewportPositioning();
})(typeof window !== "undefined" ? window : globalThis);
