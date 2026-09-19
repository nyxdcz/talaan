"use strict";
(() => {
  let overflowMenusReady = false;

  function closeOverflowMenu(menu, returnFocus = false) {
    if (!menu) return;
    const trigger = menu.querySelector(":scope > .overflow-menu-trigger, :scope > .topbar-tools-trigger");
    const panel = trigger ? document.getElementById(trigger.getAttribute("aria-controls")) : null;
    if (panel) panel.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    menu.classList.remove("is-open");
    if (returnFocus) trigger?.focus();
  }

  function closeAllOverflowMenus(except = null) {
    document.querySelectorAll(".overflow-menu.is-open, .topbar-tools-menu.is-open").forEach(menu => {
      if (menu !== except) closeOverflowMenu(menu);
    });
  }

  function openOverflowMenu(menu, focusFirst = false) {
    if (!menu) return;
    const trigger = menu.querySelector(":scope > .overflow-menu-trigger, :scope > .topbar-tools-trigger");
    const panel = trigger ? document.getElementById(trigger.getAttribute("aria-controls")) : null;
    if (!trigger || !panel) return;
    closeAllOverflowMenus(menu);
    panel.querySelectorAll(":scope > button").forEach(item => item.setAttribute("role", "menuitem"));
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    menu.classList.add("is-open");
    if (focusFirst) panel.querySelector('[role="menuitem"]:not([disabled])')?.focus();
  }

  function setupOverflowMenus() {
    if (overflowMenusReady) return;
    overflowMenusReady = true;
    document.addEventListener("click", event => {
      const trigger = event.target.closest(".overflow-menu-trigger, .topbar-tools-trigger");
      if (trigger) {
        event.preventDefault();
        event.stopPropagation();
        const menu = trigger.parentElement;
        if (menu.classList.contains("is-open")) closeOverflowMenu(menu);
        else openOverflowMenu(menu);
        return;
      }
      const menuItem = event.target.closest('[role="menuitem"]');
      if (menuItem) closeOverflowMenu(menuItem.closest(".overflow-menu, .topbar-tools-menu"));
      else closeAllOverflowMenus();
    });
    document.addEventListener("keydown", event => {
      const trigger = event.target.closest?.(".overflow-menu-trigger, .topbar-tools-trigger");
      if (trigger && ["ArrowDown", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openOverflowMenu(trigger.parentElement, true);
        return;
      }
      const item = event.target.closest?.('[role="menuitem"]');
      const menu = event.target.closest?.(".overflow-menu, .topbar-tools-menu");
      if (event.key === "Escape" && menu?.classList.contains("is-open")) {
        event.preventDefault();
        closeOverflowMenu(menu, true);
        return;
      }
      if (!item || !menu || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const items = [...menu.querySelectorAll('[role="menuitem"]:not([disabled])')].filter(node => !node.hidden);
      if (!items.length) return;
      const current = Math.max(0, items.indexOf(item));
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    });
  }

  function renderDuplicatedMarquee(track, groupContent) {
    track.innerHTML = `<div class="dashboard-week-marquee-group">${groupContent}</div><div class="dashboard-week-marquee-group" aria-hidden="true">${groupContent}</div>`;
  }

  function renderActiveFilterChips(container, filters, onRemove) {
    if (!container) return;
    const active = filters.filter(Boolean);
    container.hidden = active.length === 0;
    container.innerHTML = active.map(({ key, label }) => `<span class="ui-chip"><span>${String(label).replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character])}</span><button class="ui-chip-remove" type="button" data-remove-filter="${key}" aria-label="Remove ${String(label).replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character])} filter">×</button></span>`).join("");
    container.onclick = event => {
      const button = event.target.closest("[data-remove-filter]");
      if (button) onRemove(button.dataset.removeFilter);
    };
  }

  function middleTruncateFilename(filename, maxLength = 34) {
    const value = String(filename || "");
    if (value.length <= maxLength) return value;
    const dotIndex = value.lastIndexOf(".");
    const extension = dotIndex > 0 ? value.slice(dotIndex) : "";
    const basename = extension ? value.slice(0, dotIndex) : value;
    const available = Math.max(8, maxLength - extension.length - 1);
    const left = Math.ceil(available / 2);
    const right = Math.floor(available / 2);
    return `${basename.slice(0, left)}…${basename.slice(-right)}${extension}`;
  }

  function createDashboardDragController({ dashboard, grid, labels, getOrder, commitMove, announcer }) {
    let draggedKey = "", dropSignature = "", keyboardDrag = null;
    const announce = message => { if (!announcer) return; announcer.textContent = ""; requestAnimationFrame(() => { announcer.textContent = message; }); };
    const clearTargets = () => {
      grid.querySelectorAll(".dashboard-drop-before, .dashboard-drop-after").forEach(card => card.classList.remove("dashboard-drop-before", "dashboard-drop-after"));
      dropSignature = "";
    };
    const dropPosition = (card, clientX, clientY) => {
      const rect = card.getBoundingClientRect();
      const horizontal = rect.width < grid.getBoundingClientRect().width * .8;
      return horizontal ? (clientX > rect.left + rect.width / 2 ? "after" : "before") : (clientY > rect.top + rect.height / 2 ? "after" : "before");
    };
    const cancel = () => { keyboardDrag = null; clearTargets(); };
    const handleKey = event => {
      const handle = event.currentTarget, key = handle.dataset.dashboardDrag;
      if (![" ", "Enter", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) || !dashboard.classList.contains("dashboard-customizing")) return;
      if (!keyboardDrag && [" ", "Enter"].includes(event.key)) {
        event.preventDefault(); keyboardDrag = { key, targetIndex:getOrder().indexOf(key) };
        announce(`${labels[key]} picked up. Use arrow keys to choose a destination, then press Enter to drop or Escape to cancel.`); return;
      }
      if (!keyboardDrag || keyboardDrag.key !== key) return;
      event.preventDefault();
      if (event.key === "Escape") { cancel(); announce(`${labels[key]} drag cancelled.`); return; }
      if ([" ", "Enter"].includes(event.key)) {
        const order = getOrder(), currentIndex = order.indexOf(key), targetKey = order[keyboardDrag.targetIndex];
        const position = keyboardDrag.targetIndex > currentIndex ? "after" : "before";
        cancel();
        if (targetKey === key) announce(`${labels[key]} returned to its original position.`); else commitMove(key, targetKey, position);
        requestAnimationFrame(() => grid.querySelector(`[data-dashboard-drag="${CSS.escape(key)}"]`)?.focus()); return;
      }
      const delta = ["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1, order = getOrder();
      keyboardDrag.targetIndex = Math.max(0, Math.min(order.length - 1, keyboardDrag.targetIndex + delta)); clearTargets();
      const targetKey = order[keyboardDrag.targetIndex], target = grid.querySelector(`[data-dashboard-card="${CSS.escape(targetKey)}"]`), position = delta > 0 ? "after" : "before";
      if (target && targetKey !== key) target.classList.add(position === "after" ? "dashboard-drop-after" : "dashboard-drop-before");
      announce(`Destination ${keyboardDrag.targetIndex + 1} of ${order.length}: ${labels[targetKey]}.`);
    };
    const createHandle = (card, key) => {
      if (card.querySelector(".dashboard-drag-handle")) return;
      const button = document.createElement("button");
      button.type = "button"; button.className = "dashboard-drag-handle"; button.draggable = true; button.dataset.dashboardDrag = key; button.innerHTML = "⠿";
      button.setAttribute("aria-label", `Reorder ${labels[key]}. Press Space, then use arrow keys.`); button.title = "Drag to reorder; keyboard controls are also available";
      button.addEventListener("keydown", handleKey); card.appendChild(button);
    };
    document.addEventListener("dragstart", event => {
      const handle = event.target.closest?.("[data-dashboard-drag]");
      if (!handle || !dashboard.classList.contains("dashboard-customizing")) return;
      const card = handle.closest("[data-dashboard-card]"); draggedKey = handle.dataset.dashboardDrag;
      event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-dashboard-card", draggedKey); event.dataTransfer.setData("text/plain", draggedKey);
      card?.classList.add("is-dashboard-dragging");
      const preview = document.createElement("div"); preview.className = "dashboard-drag-preview"; preview.textContent = `Move ${labels[draggedKey]}`; document.body.appendChild(preview);
      event.dataTransfer.setDragImage(preview, 24, 18); requestAnimationFrame(() => preview.remove());
      announce(`${labels[draggedKey]} picked up. Move over another Dashboard card to choose a destination.`);
    });
    document.addEventListener("dragover", event => {
      if (!draggedKey) return; const card = event.target.closest?.("#dashboardCardGrid [data-dashboard-card]");
      if (!card || card.dataset.dashboardCard === draggedKey) return; event.preventDefault();
      const position = dropPosition(card, event.clientX, event.clientY), signature = `${card.dataset.dashboardCard}:${position}`;
      if (signature !== dropSignature) { clearTargets(); dropSignature = signature; card.classList.add(position === "after" ? "dashboard-drop-after" : "dashboard-drop-before"); announce(`Available destination: ${position} ${labels[card.dataset.dashboardCard]}.`); }
      event.dataTransfer.dropEffect = "move";
    });
    document.addEventListener("drop", event => {
      if (!draggedKey) return; const card = event.target.closest?.("#dashboardCardGrid [data-dashboard-card]");
      if (!card || card.dataset.dashboardCard === draggedKey) return; event.preventDefault();
      const source = event.dataTransfer.getData("application/x-dashboard-card") || draggedKey, position = dropPosition(card, event.clientX, event.clientY);
      clearTargets(); commitMove(source, card.dataset.dashboardCard, position); draggedKey = "";
    });
    document.addEventListener("dragend", () => {
      const cancelledKey = draggedKey; grid.querySelectorAll(".is-dashboard-dragging").forEach(card => card.classList.remove("is-dashboard-dragging")); clearTargets(); draggedKey = "";
      if (cancelledKey) announce(`${labels[cancelledKey]} drag ended. The saved order is unchanged unless a drop was completed.`);
    });
    return { announce, cancel, createHandle };
  }

  function createStructuredDragToastController({ toast, toastMessage, toastUndo, toastDismiss, announce }) {
    let toastTimer = 0;
    let toastDeadline = 0;
    let toastRemaining = 5000;
    let undoAction = null;

    const hideUndoToast = () => {
      clearTimeout(toastTimer);
      toastTimer = 0;
      undoAction = null;
      if (toast) toast.hidden = true;
    };

    const scheduleUndoDismiss = (delay = 5000) => {
      clearTimeout(toastTimer);
      toastRemaining = Math.max(250, Number(delay) || 5000);
      toastDeadline = Date.now() + toastRemaining;
      toastTimer = setTimeout(hideUndoToast, toastRemaining);
    };

    const pauseUndoDismiss = () => {
      if (!toastTimer) return;
      toastRemaining = Math.max(250, toastDeadline - Date.now());
      clearTimeout(toastTimer);
      toastTimer = 0;
    };

    const resumeUndoDismiss = () => {
      if (!toast || toast.hidden || toast.matches(":hover") || toast.contains(document.activeElement)) return;
      scheduleUndoDismiss(toastRemaining);
    };

    const showUndoToast = result => {
      if (!toast || !toastMessage || !toastUndo) return;
      clearTimeout(toastTimer);
      undoAction = typeof result.undo === "function" ? result.undo : null;
      toastMessage.textContent = result.message || "Item moved.";
      toastUndo.hidden = !undoAction;
      toast.hidden = false;
      scheduleUndoDismiss(5000);
    };

    toastUndo?.addEventListener("click", async () => {
      if (!undoAction) return;
      const action = undoAction;
      toastUndo.disabled = true;
      const restored = await action();
      toastUndo.disabled = false;
      undoAction = null;
      toastUndo.hidden = true;
      toastMessage.textContent = restored ? "Move undone. The item was restored." : "Undo is no longer available because another change was made.";
      announce(toastMessage.textContent);
      scheduleUndoDismiss(restored ? 2600 : 4200);
    });
    toastDismiss?.addEventListener("click", hideUndoToast);
    toast?.addEventListener("mouseenter", pauseUndoDismiss);
    toast?.addEventListener("mouseleave", resumeUndoDismiss);
    toast?.addEventListener("focusin", pauseUndoDismiss);
    toast?.addEventListener("focusout", () => requestAnimationFrame(resumeUndoDismiss));

    return { showUndoToast };
  }

  function createStructuredDragToastController({ toast, toastMessage, toastUndo, toastDismiss, announce }) {
    let toastTimer = 0;
    let toastDeadline = 0;
    let toastRemaining = 5000;
    let undoAction = null;

    const hideUndoToast = () => {
      clearTimeout(toastTimer);
      toastTimer = 0;
      undoAction = null;
      if (toast) toast.hidden = true;
    };

    const scheduleUndoDismiss = (delay = 5000) => {
      clearTimeout(toastTimer);
      toastRemaining = Math.max(250, Number(delay) || 5000);
      toastDeadline = Date.now() + toastRemaining;
      toastTimer = setTimeout(hideUndoToast, toastRemaining);
    };

    const pauseUndoDismiss = () => {
      if (!toastTimer) return;
      toastRemaining = Math.max(250, toastDeadline - Date.now());
      clearTimeout(toastTimer);
      toastTimer = 0;
    };

    const resumeUndoDismiss = () => {
      if (!toast || toast.hidden || toast.matches(":hover") || toast.contains(document.activeElement)) return;
      scheduleUndoDismiss(toastRemaining);
    };

    const showUndoToast = result => {
      if (!toast || !toastMessage || !toastUndo) return;
      clearTimeout(toastTimer);
      undoAction = typeof result.undo === "function" ? result.undo : null;
      toastMessage.textContent = result.message || "Item moved.";
      toastUndo.hidden = !undoAction;
      toast.hidden = false;
      scheduleUndoDismiss(5000);
    };

    toastUndo?.addEventListener("click", async () => {
      if (!undoAction) return;
      const action = undoAction;
      toastUndo.disabled = true;
      const restored = await action();
      toastUndo.disabled = false;
      undoAction = null;
      toastUndo.hidden = true;
      toastMessage.textContent = restored ? "Move undone. The item was restored." : "Undo is no longer available because another change was made.";
      announce(toastMessage.textContent);
      scheduleUndoDismiss(restored ? 2600 : 4200);
    });
    toastDismiss?.addEventListener("click", hideUndoToast);
    toast?.addEventListener("mouseenter", pauseUndoDismiss);
    toast?.addEventListener("mouseleave", resumeUndoDismiss);
    toast?.addEventListener("focusin", pauseUndoDismiss);
    toast?.addEventListener("focusout", () => requestAnimationFrame(resumeUndoDismiss));

    return { showUndoToast };
  }

  function setupStructuredDragTransitions() {
    if (document.documentElement.dataset.structuredDragReady === "true") return;
    document.documentElement.dataset.structuredDragReady = "true";
    const announcer = document.getElementById("structuredDragAnnouncer");
    const toast = document.getElementById("structuredDragToast");
    const toastMessage = toast?.querySelector("[data-structured-toast-message]");
    const toastUndo = toast?.querySelector("[data-structured-toast-undo]");
    const toastDismiss = toast?.querySelector("[data-structured-toast-dismiss]");
    let active = null;
    let pointerPending = null;
    const interactiveSelector = "button,a,input,select,textarea,summary,[contenteditable=true]";
    const dragActor = target => {
      const handle = target?.closest?.("[data-structured-drag-handle]");
      if (handle) return handle;
      const card = target?.closest?.("[data-structured-card-draggable]");
      if (!card || (target !== card && target?.closest?.(interactiveSelector))) return null;
      return card;
    };

    const announce = message => {
      if (!announcer) return;
      announcer.textContent = "";
      requestAnimationFrame(() => { announcer.textContent = String(message || ""); });
    };
    const zoneLabel = zone => zone?.dataset.structuredDropLabel || zone?.querySelector("h3,h4")?.textContent?.trim() || "destination";
    const zonesFor = kind => [...(active?.card?.closest?.(".finance-kanban-board") || document).querySelectorAll(`[data-structured-drop-kind="${CSS.escape(kind)}"]`)];
    const autoScrollBoard = clientX => {
      const board = active?.card?.closest?.(".finance-kanban-board");
      if (!board || !Number.isFinite(clientX) || board.scrollWidth <= board.clientWidth) return;
      const bounds = board.getBoundingClientRect();
      const edge = Math.min(72, Math.max(40, bounds.width * .16));
      const leftStrength = Math.max(0, Math.min(1, (bounds.left + edge - clientX) / edge));
      const rightStrength = Math.max(0, Math.min(1, (clientX - (bounds.right - edge)) / edge));
      const delta = Math.round((rightStrength - leftStrength) * 18);
      if (delta) board.scrollLeft += delta;
    };
    const isValidZone = (zone, state = active) => Boolean(zone && state && zone.dataset.structuredDropKind === state.kind && zone.dataset.structuredDropDestination !== state.origin);
    const clearZoneState = () => document.querySelectorAll(".is-structured-drop-available,.is-structured-drop-target,.is-structured-drop-origin").forEach(zone => {
      zone.classList.remove("is-structured-drop-available", "is-structured-drop-target", "is-structured-drop-origin");
    });
    const setTarget = zone => {
      if (!active) return;
      document.querySelectorAll(".is-structured-drop-target").forEach(node => node.classList.remove("is-structured-drop-target"));
      active.target = isValidZone(zone) ? zone : null;
      if (active.target) {
        active.target.classList.add("is-structured-drop-target");
        announce(`${zoneLabel(active.target)} is ready. Drop to move ${active.label}.`);
      }
    };
    const expandCompletedProjects = state => {
      if (state.kind !== "project") return;
      const section = document.getElementById("completedProjectsCard");
      const toggle = section?.querySelector('[data-collapse-toggle="completed-projects"]');
      if (!section?.classList.contains("is-collapsed") || !toggle) return;
      state.openedCompleted = true;
      toggle.click();
    };
    const restoreCompletedProjects = state => {
      if (!state?.openedCompleted) return;
      const section = document.getElementById("completedProjectsCard");
      const toggle = section?.querySelector('[data-collapse-toggle="completed-projects"]');
      if (section && !section.classList.contains("is-collapsed") && toggle) toggle.click();
    };
    const clearActiveVisuals = (state, { restoreCollapsed = false } = {}) => {
      state?.card?.classList.remove("is-structured-dragging", "is-pointer-dragging");
      state?.card?.style.removeProperty("--structured-drag-x");
      state?.card?.style.removeProperty("--structured-drag-y");
      document.body.classList.remove("structured-drag-active");
      clearZoneState();
      if (restoreCollapsed) restoreCompletedProjects(state);
    };
    const begin = (handle, input = "pointer") => {
      const card = handle?.closest?.("[data-structured-card]");
      const kind = card?.dataset.structuredCard;
      const id = card?.dataset.structuredId;
      if (!card || !kind || !id || !window.FinanceStructuredDropActions?.[kind]?.move) return null;
      if (active) clearActiveVisuals(active, { restoreCollapsed:true });
      active = { handle, card, kind, id, input, label:card.dataset.structuredLabel || "item", origin:card.dataset.structuredOrigin || "", target:null, openedCompleted:false, keyboardIndex:0 };
      expandCompletedProjects(active);
      card.classList.add("is-structured-dragging");
      document.body.classList.add("structured-drag-active");
      zonesFor(kind).forEach(zone => {
        if (zone.dataset.structuredDropDestination === active.origin) zone.classList.add("is-structured-drop-origin");
        else zone.classList.add("is-structured-drop-available");
      });
      announce(`${active.label} picked up. Choose a highlighted destination, then drop or press Escape to cancel.`);
      return active;
    };
    const cancel = (message = "Move cancelled.") => {
      const state = active;
      if (!state) return;
      active = null;
      clearActiveVisuals(state, { restoreCollapsed:true });
      state.card?.classList.add("is-structured-returning");
      setTimeout(() => state.card?.classList.remove("is-structured-returning"), 240);
      announce(message);
      requestAnimationFrame(() => state.handle?.focus?.());
    };
    const { showUndoToast } = createStructuredDragToastController({ toast, toastMessage, toastUndo, toastDismiss, announce });

    const commit = async zone => {
      const state = active;
      if (!state || !isValidZone(zone, state)) return cancel(`${state?.label || "Item"} returned to its original position.`);
      active = null;
      clearActiveVisuals(state);
      const destination = zone.dataset.structuredDropDestination;
      try {
        const result = await window.FinanceStructuredDropActions[state.kind].move(state.id, destination);
        if (!result?.success) {
          restoreCompletedProjects(state);
          announce(result?.message || `${state.label} move cancelled.`);
          requestAnimationFrame(() => document.querySelector(`[data-structured-id="${CSS.escape(state.id)}"] [data-structured-drag-handle], [data-structured-id="${CSS.escape(state.id)}"][data-structured-card-draggable]`)?.focus());
          return;
        }
        announce(result.message || `${state.label} moved to ${zoneLabel(zone)}.`);
        showUndoToast(result);
      } catch (error) {
        restoreCompletedProjects(state);
        announce(`${state.label} could not be moved.`);
        window.showToast?.(error?.message || "The item could not be moved.", "error");
      }
    };

    document.addEventListener("dragstart", event => {
      const handle = dragActor(event.target);
      const state = handle ? begin(handle, "mouse") : null;
      if (!state) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-finance-structured-item", `${state.kind}:${state.id}`);
      event.dataTransfer.setData("text/plain", state.label);
      event.dataTransfer.setDragImage(state.card, 28, 22);
    });
    document.addEventListener("dragover", event => {
      if (!active || active.input !== "mouse") return;
      autoScrollBoard(event.clientX);
      const zone = event.target.closest?.("[data-structured-drop-zone]");
      if (!isValidZone(zone)) return setTarget(null);
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setTarget(zone);
    });
    document.addEventListener("drop", event => {
      if (!active || active.input !== "mouse") return;
      const zone = event.target.closest?.("[data-structured-drop-zone]");
      if (!isValidZone(zone)) return;
      event.preventDefault();
      commit(zone);
    });
    document.addEventListener("dragend", () => {
      if (active?.input === "mouse") cancel(`${active.label} returned to its original position.`);
    });
    document.addEventListener("pointerdown", event => {
      const handle = dragActor(event.target);
      if (!handle || event.pointerType === "mouse" || event.button !== 0) return;
      pointerPending = { handle, pointerId:event.pointerId, startX:event.clientX, startY:event.clientY };
    });
    document.addEventListener("pointermove", event => {
      if (!pointerPending || pointerPending.pointerId !== event.pointerId) return;
      const dx = event.clientX - pointerPending.startX, dy = event.clientY - pointerPending.startY;
      if (!active && Math.hypot(dx, dy) < 7) return;
      if (!active) {
        const state = begin(pointerPending.handle, "touch");
        if (!state) { pointerPending = null; return; }
        state.card.classList.add("is-pointer-dragging");
        pointerPending.handle.setPointerCapture?.(event.pointerId);
      }
      event.preventDefault();
      active.card.style.setProperty("--structured-drag-x", `${dx}px`);
      active.card.style.setProperty("--structured-drag-y", `${dy}px`);
      autoScrollBoard(event.clientX);
      const zone = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-structured-drop-zone]");
      setTarget(isValidZone(zone) ? zone : null);
    });
    document.addEventListener("pointerup", event => {
      if (!pointerPending || pointerPending.pointerId !== event.pointerId) return;
      const zone = active?.target;
      pointerPending = null;
      if (active && zone) commit(zone);
      else if (active) cancel(`${active.label} returned to its original position.`);
    });
    document.addEventListener("pointercancel", event => {
      if (!pointerPending || pointerPending.pointerId !== event.pointerId) return;
      pointerPending = null;
      if (active) cancel(`${active.label} move cancelled.`);
    });
    document.addEventListener("keydown", event => {
      const handle = dragActor(event.target);
      if (!handle || ![" ", "Enter", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      if (!active && [" ", "Enter"].includes(event.key)) {
        event.preventDefault();
        const state = begin(handle, "keyboard");
        if (!state) return;
        const zones = zonesFor(state.kind).filter(zone => isValidZone(zone, state));
        if (zones.length) { state.keyboardIndex = 0; setTarget(zones[0]); }
        return;
      }
      if (!active || active.input !== "keyboard" || active.handle !== handle) return;
      event.preventDefault();
      if (event.key === "Escape") return cancel(`${active.label} move cancelled.`);
      if ([" ", "Enter"].includes(event.key)) return active.target ? commit(active.target) : cancel(`${active.label} returned to its original position.`);
      const zones = zonesFor(active.kind).filter(zone => isValidZone(zone));
      if (!zones.length) return;
      const delta = ["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1;
      active.keyboardIndex = (active.keyboardIndex + delta + zones.length) % zones.length;
      setTarget(zones[active.keyboardIndex]);
    });

  }

  function emptyStateHtml(title, text, action = null) {
    const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]);
    const label = String(action?.label || "");
    const actionHtml = label ? `<div class="empty-state-actions"><button class="button button-secondary button-small" type="button"${action?.go ? ` data-go="${escape(action.go)}"` : ""}${action?.action ? ` data-empty-action="${escape(action.action)}"` : ""}>${escape(label)}</button></div>` : "";
    return `<div class="empty-state"><strong>${escape(title)}</strong>${escape(text)}${actionHtml}</div>`;
  }

  function renderIncomeFilterChips() {
    const container = document.getElementById("incomeActiveFilterChips");
    const searchInput = document.getElementById("incomeSearch");
    const categoryInput = document.getElementById("incomeCategoryFilter");
    if (!container || !searchInput || !categoryInput) return;
    const search = searchInput.value.trim();
    const category = categoryInput.value;
    renderActiveFilterChips(container, [
      search ? { key:"search", label:`Search: ${search}` } : null,
      category ? { key:"category", label:`Category: ${category}` } : null
    ], key => {
      if (key === "search") searchInput.value = "";
      if (key === "category") categoryInput.value = "";
      globalThis.renderIncomePage?.();
    });
  }

  function setupEmptyStateActions() {
    if (document.documentElement.dataset.emptyStateActionsReady === "true") return;
    document.documentElement.dataset.emptyStateActionsReady = "true";
    document.addEventListener("click", event => {
      const button = event.target.closest?.("[data-empty-action]");
      if (!button) return;
      const action = button.dataset.emptyAction;
      if (action === "clear-income-filters") {
        const search = document.getElementById("incomeSearch"), category = document.getElementById("incomeCategoryFilter");
        if (search) search.value = ""; if (category) category.value = ""; globalThis.renderIncomePage?.(); return;
      }
      if (action === "add-income") { globalThis.openIncomeDialog?.(); return; }
      if (action === "clear-expense-filters") {
        const search = document.getElementById("expenseSearch"), category = document.getElementById("expenseCategoryFilter");
        if (search) search.value = ""; if (category) category.value = ""; globalThis.renderMoneyPage?.(); return;
      }
      if (action === "add-expense") { globalThis.openExpenseDialog?.(); return; }
      if (action === "clear-project-filters") {
        ["projectSearch", "projectStatusFilter", "projectTypeFilter", "projectSourceFilter"].forEach(id => { const node = document.getElementById(id); if (node) node.value = ""; });
        globalThis.renderProjects?.(); return;
      }
      if (action === "add-project") globalThis.openProjectDialog?.();
    });
  }

  const FIRST_HALF_COMPLETE_LIGHT_ICON = "./icons/heart-smile-light.png";
  const FIRST_HALF_COMPLETE_DARK_ICON = "./icons/heart-smile-dark.png";
  let firstHalfCompletionObserver = null;

  function selectedFinanceMonth() {
    try {
      const value = typeof globalThis.selectedMonth === "function" ? globalThis.selectedMonth() : "";
      if (/^\d{4}-\d{2}$/.test(String(value || ""))) return String(value);
    } catch (error) {}
    const picker = document.getElementById("monthPicker")?.value;
    if (/^\d{4}-\d{2}$/.test(String(picker || ""))) return String(picker);
    const shortValue = document.getElementById("monthDisplayShort")?.textContent?.trim();
    return /^\d{4}-\d{2}$/.test(String(shortValue || "")) ? String(shortValue) : "";
  }

  function manilaTodayKey() {
    const override = String(globalThis.FINANCE_FIRST_HALF_TODAY_OVERRIDE || "");
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

  function firstHalfFinished(month = selectedFinanceMonth()) {
    if (!/^\d{4}-\d{2}$/.test(month)) return false;
    const today = manilaTodayKey();
    const currentMonth = today.slice(0, 7);
    if (month < currentMonth) return true;
    if (month > currentMonth) return false;
    return Number(today.slice(8, 10)) > 15;
  }

  function moneyTextValue(text) {
    const parsed = Number(String(text || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function firstHalfCompletionIconSource() {
    return document.documentElement.dataset.theme === "dark" ? FIRST_HALF_COMPLETE_DARK_ICON : FIRST_HALF_COMPLETE_LIGHT_ICON;
  }

  function ensureFirstHalfCompletionStyles() {
    if (document.getElementById("firstHalfCompletionIconStyles")) return;
    const style = document.createElement("style");
    style.id = "firstHalfCompletionIconStyles";
    style.textContent = `.first-half-complete-value{display:inline-flex!important;align-items:center;justify-content:center;min-width:34px;line-height:1}.first-half-complete-icon{display:block;width:32px;height:32px;object-fit:contain;flex:0 0 auto}@media(max-width:700px){.first-half-complete-icon{width:30px;height:30px}}`;
    document.head.appendChild(style);
  }

  function renderFirstHalfCompleteIcon(value) {
    if (!value) return;
    const existing = value.querySelector("img[data-first-half-complete-icon]");
    if (!existing) {
      value.dataset.firstHalfOriginalText = value.textContent || "";
      value.textContent = "";
      const icon = document.createElement("img");
      icon.className = "first-half-complete-icon";
      icon.dataset.firstHalfCompleteIcon = "true";
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
      value.appendChild(icon);
    }
    const icon = value.querySelector("img[data-first-half-complete-icon]");
    const dark = document.documentElement.dataset.theme === "dark";
    if (icon && icon.dataset.themeVariant !== (dark ? "dark" : "light")) {
      icon.src = firstHalfCompletionIconSource();
      icon.dataset.themeVariant = dark ? "dark" : "light";
    }
    value.classList.add("first-half-complete-value");
    value.setAttribute("aria-label", "First half completed");
    value.title = "First half completed";
  }

  function restoreFirstHalfAmount(value) {
    if (!value) return;
    const icon = value.querySelector("img[data-first-half-complete-icon]");
    if (icon) value.textContent = value.dataset.firstHalfOriginalText || "";
    delete value.dataset.firstHalfOriginalText;
    value.classList.remove("first-half-complete-value");
    value.removeAttribute("aria-label");
    if (value.title === "First half completed") value.removeAttribute("title");
  }

  function renderOtherExpensesCompleteIcon(value) {
    if (!value) return;
    const existing = value.querySelector("img[data-other-expenses-complete-icon]");
    if (!existing) {
      value.dataset.otherExpensesOriginalText = value.textContent || "";
      value.textContent = "";
      const icon = document.createElement("img");
      icon.className = "first-half-complete-icon";
      icon.dataset.otherExpensesCompleteIcon = "true";
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
      value.appendChild(icon);
    }
    const icon = value.querySelector("img[data-other-expenses-complete-icon]");
    const dark = document.documentElement.dataset.theme === "dark";
    if (icon && icon.dataset.themeVariant !== (dark ? "dark" : "light")) {
      icon.src = firstHalfCompletionIconSource();
      icon.dataset.themeVariant = dark ? "dark" : "light";
    }
    value.classList.add("first-half-complete-value");
    value.setAttribute("aria-label", "No other expenses");
    value.title = "No other expenses";
  }

  function restoreOtherExpensesAmount(value) {
    if (!value) return;
    const icon = value.querySelector("img[data-other-expenses-complete-icon]");
    if (icon) value.textContent = value.dataset.otherExpensesOriginalText || "";
    delete value.dataset.otherExpensesOriginalText;
    value.classList.remove("first-half-complete-value");
    value.removeAttribute("aria-label");
    if (value.title === "No other expenses") value.removeAttribute("title");
  }

  function updateFirstHalfCompletionIcons() {
    ensureFirstHalfCompletionStyles();
    const month = selectedFinanceMonth();
    const finished = firstHalfFinished(month);
    const firstHalfValue = document.getElementById("legendEarlyTotal");
    const firstDifferenceValue = document.querySelector("#moneySummary > .summary-item:nth-child(2) .summary-card-value");
    const otherExpensesValue = document.getElementById("legendOtherTotal");

    const currentOtherAmount = otherExpensesValue?.querySelector("img[data-other-expenses-complete-icon]")
      ? moneyTextValue(otherExpensesValue.dataset.otherExpensesOriginalText)
      : moneyTextValue(otherExpensesValue?.textContent);
    if (currentOtherAmount === 0) renderOtherExpensesCompleteIcon(otherExpensesValue);
    else restoreOtherExpensesAmount(otherExpensesValue);

    if (!finished) {
      restoreFirstHalfAmount(firstHalfValue);
      restoreFirstHalfAmount(firstDifferenceValue);
      return;
    }

    const currentFirstHalfAmount = firstHalfValue?.querySelector("img[data-first-half-complete-icon]")
      ? moneyTextValue(firstHalfValue.dataset.firstHalfOriginalText)
      : moneyTextValue(firstHalfValue?.textContent);
    if (currentFirstHalfAmount === 0) renderFirstHalfCompleteIcon(firstHalfValue);
    else restoreFirstHalfAmount(firstHalfValue);
    renderFirstHalfCompleteIcon(firstDifferenceValue);
  }

  function setupFirstHalfCompletionIcons() {
    ensureFirstHalfCompletionStyles();
    updateFirstHalfCompletionIcons();
    const moneyPage = document.getElementById("money");
    if (moneyPage && !firstHalfCompletionObserver) {
      let scheduled = false;
      firstHalfCompletionObserver = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          updateFirstHalfCompletionIcons();
        });
      });
      firstHalfCompletionObserver.observe(moneyPage, { childList:true, subtree:true, characterData:true });
    }
    if (document.documentElement.dataset.firstHalfThemeObserverReady !== "true") {
      document.documentElement.dataset.firstHalfThemeObserverReady = "true";
      new MutationObserver(updateFirstHalfCompletionIcons).observe(document.documentElement, { attributes:true, attributeFilter:["data-theme"] });
    }
    if (document.documentElement.dataset.firstHalfEventsReady !== "true") {
      document.documentElement.dataset.firstHalfEventsReady = "true";
      window.addEventListener("finance:page-changed", updateFirstHalfCompletionIcons);
      document.addEventListener("change", event => {
        if (event.target?.id === "monthPicker") updateFirstHalfCompletionIcons();
      });
    }
  }

  function setupInteractionPatterns() {
    setupOverflowMenus();
    setupEmptyStateActions();
    setupFirstHalfCompletionIcons();
    setupStructuredDragTransitions();
  }

  window.FinanceInteractionPatterns = { closeOverflowMenu, setupOverflowMenus, renderDuplicatedMarquee, renderActiveFilterChips, emptyStateHtml, renderIncomeFilterChips, setupEmptyStateActions, setupStructuredDragTransitions, middleTruncateFilename, createDashboardDragController, updateFirstHalfCompletionIcons, firstHalfFinished };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupInteractionPatterns, { once:true });
  else setupInteractionPatterns();
})();

/* V15.2.5 · Expose Available Money account types for scoped contrast styling. */
(() => {
  let observer = null;
  function syncAvailableMoneyAccountTypes() {
    document.querySelectorAll("#money #moneyAccounts .account-card").forEach(card => {
      const type = card.querySelector(".account-card-label > small")?.textContent?.trim() || "";
      if (card.dataset.accountType !== type) card.dataset.accountType = type;
    });
  }
  function setupAvailableMoneyAccountTypeTags() {
    syncAvailableMoneyAccountTypes();
    const root = document.getElementById("moneyAccounts");
    if (root && !observer) {
      observer = new MutationObserver(syncAvailableMoneyAccountTypes);
      observer.observe(root, { childList:true, subtree:true, characterData:true });
    }
    window.addEventListener("finance:page-changed", syncAvailableMoneyAccountTypes);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupAvailableMoneyAccountTypeTags, { once:true });
  else setupAvailableMoneyAccountTypeTags();
})();
