"use strict";

/* Talaan V14.0.12 · Project Agenda
   Adds meeting, presentation, site-visit, deadline, and other project events.
   Agenda entries are stored separately from finance records so schedule changes never
   alter account balances, expenses, payments, or project financial values. */
(() => {
  const EVENTS_KEY = "simple-finance-project-calendar-v13.0.20";
  const EVENT_TYPES = [
    ["meeting", "Meeting"],
    ["presentation", "Presentation"],
    ["site-visit", "Site visit"],
    ["deadline", "Deadline"],
    ["other", "Other"]
  ];
  const REMINDERS = [
    ["none", "No reminder"],
    ["PT0M", "At event time"],
    ["PT15M", "15 minutes before"],
    ["PT1H", "1 hour before"],
    ["P1D", "1 day before"],
    ["P3D", "3 days before"],
    ["P1W", "1 week before"]
  ];

  let events = [];
  let editingId = "";

  const pad = value => String(value).padStart(2, "0");
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
  const safeExternalUrl = value => {
    try {
      const url = new URL(String(value || ""), location.href);
      return ["http:", "https:"].includes(url.protocol) ? escapeHtml(url.href) : "";
    } catch (error) {
      return "";
    }
  };
  const uid = () => `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  function safeRead() {
    try {
      const raw = localStorage.getItem(EVENTS_KEY);
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === "object") : [];
    } catch (error) {
      return [];
    }
  }

  // Read through storage every time so the Dashboard never receives a stale
  // in-memory agenda after another tab changes the shared browser record.
  window.getProjectAgendaEvents = () => safeRead();
  window.getProjectCalendarEvents = window.getProjectAgendaEvents;

  function safeWrite(next) {
    try {
      localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
      return true;
    } catch (error) {
      showCalendarMessage("Agenda storage is full. Export an ICS file or remove old events.", "error");
      return false;
    }
  }

  function projectRecords() {
    try {
      return Array.isArray(data?.projects) ? data.projects : [];
    } catch (error) {
      return [];
    }
  }

  function projectOptions(selected = "") {
    return `<option value="">No project</option>` + projectRecords()
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      .map(project => `<option value="${escapeHtml(project.id)}" ${project.id === selected ? "selected" : ""}>${escapeHtml(project.name || "Unnamed project")}</option>`)
      .join("");
  }

  function projectName(id) {
    return projectRecords().find(project => project.id === id)?.name || "General";
  }

  function typeLabel(type) {
    return EVENT_TYPES.find(([value]) => value === type)?.[1] || "Other";
  }

  function reminderLabel(value) {
    return REMINDERS.find(([key]) => key === value)?.[1] || "No reminder";
  }

  function formatEventDate(event) {
    const date = new Date(`${event.date}T00:00:00`);
    const dateText = Number.isNaN(date.getTime()) ? event.date : new Intl.DateTimeFormat("en-PH", { month:"short", day:"numeric", year:"numeric" }).format(date);
    if (!event.startTime) return dateText;
    return `${dateText} · ${event.startTime}${event.endTime ? `–${event.endTime}` : ""}`;
  }

  function sortedEvents(list = events) {
    return [...list].sort((a, b) =>
      String(a.date || "").localeCompare(String(b.date || "")) ||
      String(a.startTime || "99:99").localeCompare(String(b.startTime || "99:99")) ||
      String(a.title || "").localeCompare(String(b.title || ""))
    );
  }

  function agendaDateState(event) {
    if (event.completedAt) return { key:"completed", label:"Completed" };
    const eventDate = new Date(`${event.date || ""}T00:00:00`);
    if (Number.isNaN(eventDate.getTime())) return { key:"later", label:"Scheduled" };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    eventDate.setHours(0, 0, 0, 0);
    const days = Math.round((eventDate - today) / 86400000);
    if (days < 0) return { key:"overdue", label:`Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}` };
    if (days === 0) return { key:"near", label:"Today" };
    if (days <= 3) return { key:"near", label:`In ${days} day${days === 1 ? "" : "s"}` };
    if (days <= 7) return { key:"soon", label:`In ${days} days` };
    return { key:"later", label:"Scheduled" };
  }

  function agendaCustomColumns() {
    return window.FinanceKanbanPreferences?.columns?.("agenda") || [];
  }

  function agendaColumnId(event) {
    if (event.completedAt) return "completed";
    const id = String(event.kanbanColumnId || "");
    return agendaCustomColumns().some(column => column.id === id) ? id : "upcoming";
  }

  function eventCard(event, { compact = false } = {}) {
    const dateState = agendaDateState(event);
    const completed = Boolean(event.completedAt);
    const title = escapeHtml(event.title || "Untitled agenda event");
    const project = event.projectId ? ` · ${escapeHtml(projectName(event.projectId))}` : "";
    const externalUrl = safeExternalUrl(event.link);
    const mainTag = "div";
    const mainAttributes = "";
    const eventTitle = compact ? `<span class="pc-event-title">${title}</span>` : `<h4>${title}</h4>`;
    const eventMeta = compact ? `<span class="pc-event-meta">${escapeHtml(formatEventDate(event))}${project}</span>` : `<p>${escapeHtml(formatEventDate(event))}${project}</p>`;
    const origin = agendaColumnId(event);
    const structuredAttributes = completed ? "" : ` draggable="true" tabindex="0" aria-roledescription="draggable agenda card" data-structured-card="agenda" data-structured-card-draggable data-structured-id="${escapeHtml(event.id)}" data-structured-label="${title}" data-structured-origin="${escapeHtml(origin)}" aria-label="${title}. Drag or press Space to move between agenda columns."`;
    const dragHandle = completed ? "" : `<span class="finance-kanban-card-grip pc-event-drag-handle" aria-hidden="true">⠿</span>`;
    const details = compact ? "" : `
      ${event.location ? `<small>Location · ${escapeHtml(event.location)}</small>` : ""}
      ${event.attendees ? `<small>Attendees · ${escapeHtml(event.attendees)}</small>` : ""}
      ${event.reminder && event.reminder !== "none" ? `<small>Reminder · ${escapeHtml(reminderLabel(event.reminder))}</small>` : ""}
      ${externalUrl ? `<small><a href="${externalUrl}" target="_blank" rel="noopener noreferrer">Open meeting link</a></small>` : ""}
      ${event.notes ? `<small class="pc-event-notes">${escapeHtml(event.notes)}</small>` : ""}`;
    return `
      <article class="pc-event-card finance-kanban-card pc-type-${escapeHtml(event.type)} pc-date-${dateState.key} ${compact ? "pc-event-compact" : ""}" data-pc-event-card="${escapeHtml(event.id)}"${structuredAttributes}>
        ${dragHandle}
        <${mainTag} class="pc-event-main" ${mainAttributes}>
          <span class="pc-event-topline"><span class="pc-event-type">${escapeHtml(typeLabel(event.type))}</span><span class="pc-event-date-state">${escapeHtml(dateState.label)}</span></span>
          ${eventTitle}
          ${eventMeta}
          ${details}
        </${mainTag}>
        <div class="pc-event-actions">
          <button type="button" class="button ${completed ? "button-secondary" : "button-primary"} button-small" data-pc-complete="${escapeHtml(event.id)}">${completed ? "Reopen" : "Complete"}</button>
          <button type="button" class="button button-secondary button-small" data-pc-edit="${escapeHtml(event.id)}">Edit</button>${compact ? "" : `<div class="record-more-menu overflow-menu pc-event-more-menu"><button type="button" class="button button-secondary button-small overflow-menu-trigger" aria-label="More actions for ${title}" title="More actions" aria-haspopup="menu" aria-controls="pc-event-more-${escapeHtml(event.id)}" aria-expanded="false"><span class="kebab-icon" aria-hidden="true">&#8942;</span><span class="sr-only">More actions</span></button><div class="record-more-panel pc-event-more-panel" id="pc-event-more-${escapeHtml(event.id)}" role="menu" aria-label="More actions for ${title}" hidden><button type="button" class="button button-secondary" role="menuitem" data-pc-ics="${escapeHtml(event.id)}">Export ICS</button><button type="button" class="button button-danger" role="menuitem" data-pc-delete="${escapeHtml(event.id)}">Delete event</button></div></div>`}
        </div>
      </article>`;
  }

  function render() {
    const root = document.getElementById("projectCalendarV13020");
    if (!root) return;
    const agendaEvents = sortedEvents(events);
    const upcoming = agendaEvents.filter(event => !event.completedAt);
    const completed = agendaEvents.filter(event => event.completedAt).sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
    const customColumns = agendaCustomColumns();
    const validColumns = new Set(customColumns.map(column => column.id));
    const grouped = new Map([["upcoming", upcoming.filter(event => !validColumns.has(event.kanbanColumnId))], ["completed", completed]]);
    customColumns.forEach(column => grouped.set(column.id, upcoming.filter(event => event.kanbanColumnId === column.id)));
    const emptyColumn = (name, completedColumn = false) => `<div class="finance-kanban-empty"><strong>No ${escapeHtml(name.toLowerCase())} events</strong><span>${completedColumn ? "Drag an upcoming event here to complete it." : "Schedule an event or drag one into this column."}</span></div>`;
    const columnMarkup = (id, name, color, items, { compact = false, custom = null, index = 0, completedColumn = false, manage = false } = {}) => {
      const shown = compact ? items.slice(0, 3) : items;
      const menu = manage && custom ? window.FinanceKanbanPreferences?.menu?.("agenda", custom, index, customColumns.length) || "" : "";
      return `<section class="finance-kanban-column ${completedColumn ? "finance-kanban-column-completed" : ""}" data-kanban-color="${color}" data-structured-drop-zone data-structured-drop-kind="agenda" data-structured-drop-destination="${escapeHtml(id)}" data-structured-drop-label="${escapeHtml(name)} agenda"><div class="finance-kanban-column-header"><div><h4>${escapeHtml(name)}</h4><small>${items.length} ${items.length === 1 ? "event" : "events"}</small></div>${menu || `<strong>${items.length}</strong>`}</div><div class="finance-kanban-card-list">${shown.length ? shown.map(event => eventCard(event, { compact })).join("") : emptyColumn(name, completedColumn)}</div>${compact && items.length > shown.length ? `<button type="button" class="pc-agenda-more" data-pc-view>+${items.length - shown.length} more</button>` : ""}</section>`;
    };
    const boardColumns = options => [
      columnMarkup("upcoming", "Upcoming", "blue", grouped.get("upcoming"), options),
      ...customColumns.map((column, index) => columnMarkup(column.id, column.name, column.color, grouped.get(column.id), { ...options, custom:column, index })),
      columnMarkup("completed", "Completed", "teal", grouped.get("completed"), { ...options, completedColumn:true })
    ].join("");
    const previewBoard = root.querySelector("[data-pc-board]");
    if (previewBoard) previewBoard.innerHTML = boardColumns({ compact:true, manage:true });
    root.querySelector("[data-pc-count]").textContent = `${upcoming.length} upcoming · ${completed.length} completed`;
    const fullBoard = document.querySelector("[data-pc-full-board]");
    if (fullBoard) fullBoard.innerHTML = boardColumns({ compact:false, manage:false });
    document.querySelectorAll("[data-pc-full-count]").forEach(node => { node.textContent = `${agendaEvents.length} total`; });
  }

  function showCalendarMessage(message, type = "info") {
    const node = document.querySelector("[data-pc-message]");
    if (!node) return;
    node.textContent = message;
    node.className = `pc-message ${type}`;
    clearTimeout(showCalendarMessage.timer);
    showCalendarMessage.timer = setTimeout(() => {
      node.textContent = "";
      node.className = "pc-message";
    }, 4200);
  }

  function eventFieldErrorNode(input) {
    if (!input) return null;
    const field = input.closest(".field");
    if (!field) return null;
    let error = field.querySelector("[data-pc-field-error]");
    if (!error) {
      error = document.createElement("small");
      error.className = "field-error";
      error.dataset.pcFieldError = "";
      error.id = `${input.id}Error`;
      error.hidden = true;
      field.appendChild(error);
    }
    return error;
  }

  function clearEventFieldError(input) {
    const error = eventFieldErrorNode(input);
    if (error) { error.hidden = true; error.textContent = ""; }
    input?.removeAttribute("aria-invalid");
    if (input?.getAttribute("aria-describedby") === error?.id) input.removeAttribute("aria-describedby");
  }

  function setEventFieldError(input, message) {
    const error = eventFieldErrorNode(input);
    if (!input || !error) return;
    error.textContent = message;
    error.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", error.id);
  }

  function clearEventFormErrors() {
    ["pcEventTitle", "pcEventDate", "pcEventStart", "pcEventEnd"].forEach(id => clearEventFieldError(document.getElementById(id)));
  }

  function openDialog(projectId = "", eventId = "") {
    const dialog = document.getElementById("projectCalendarEventDialog");
    if (!dialog) return;
    clearEventFormErrors();
    editingId = eventId;
    const event = eventId ? events.find(item => item.id === eventId) : null;
    document.getElementById("pcEventId").value = event?.id || "";
    document.getElementById("pcEventProject").innerHTML = projectOptions(event?.projectId || projectId);
    document.getElementById("pcEventType").value = event?.type || "meeting";
    document.getElementById("pcEventTitle").value = event?.title || "";
    document.getElementById("pcEventDate").value = event?.date || dateKey(new Date());
    document.getElementById("pcEventStart").value = event?.startTime || "09:00";
    document.getElementById("pcEventEnd").value = event?.endTime || "10:00";
    document.getElementById("pcEventLocation").value = event?.location || "";
    document.getElementById("pcEventLink").value = event?.link || "";
    document.getElementById("pcEventAttendees").value = event?.attendees || "";
    document.getElementById("pcEventReminder").value = event?.reminder || "P1D";
    document.getElementById("pcEventNotes").value = event?.notes || "";
    document.getElementById("projectCalendarEventDialogTitle").textContent = event ? "Edit agenda event" : "Schedule project event";
    dialog.showModal();
  }

  function closeDialog() {
    document.getElementById("projectCalendarEventDialog")?.close();
    editingId = "";
  }

  function saveEvent(event) {
    event.preventDefault();
    const titleInput = document.getElementById("pcEventTitle");
    const dateInput = document.getElementById("pcEventDate");
    const startInput = document.getElementById("pcEventStart");
    const endInput = document.getElementById("pcEventEnd");
    clearEventFormErrors();
    const title = titleInput.value.trim();
    const date = dateInput.value;
    if (!title) {
      setEventFieldError(titleInput, "Enter an event title.");
      titleInput.focus();
      return;
    }
    if (!date) {
      setEventFieldError(dateInput, "Choose an event date.");
      dateInput.focus();
      return;
    }
    const startTime = startInput.value;
    const endTime = endInput.value;
    if (startTime && endTime && endTime <= startTime) {
      setEventFieldError(endInput, "End time must be after the start time.");
      endInput.focus();
      return;
    }

    const id = document.getElementById("pcEventId").value || uid();
    const existing = events.find(item => item.id === id);
    const record = {
      id,
      projectId: document.getElementById("pcEventProject").value,
      type: document.getElementById("pcEventType").value,
      title,
      date,
      startTime,
      endTime,
      location: document.getElementById("pcEventLocation").value.trim().slice(0, 180),
      link: document.getElementById("pcEventLink").value.trim().slice(0, 500),
      attendees: document.getElementById("pcEventAttendees").value.trim().slice(0, 240),
      reminder: document.getElementById("pcEventReminder").value,
      notes: document.getElementById("pcEventNotes").value.trim().slice(0, 1000),
      completedAt: existing?.completedAt || "",
      kanbanColumnId: existing?.completedAt ? "" : (existing?.kanbanColumnId || ""),
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    const next = existing ? events.map(item => item.id === id ? record : item) : [...events, record];
    if (!safeWrite(next)) return;
    events = next;
    closeDialog();
    render();
    notifyAgendaChanged(existing ? "updated" : "created", id);
    showCalendarMessage(existing ? "Agenda event updated." : "Agenda event scheduled.", "success");
  }

  async function deleteEvent(id) {
    const event = events.find(item => item.id === id);
    if (!event) return;
    if (typeof openAppConfirmation !== "function") {
      showCalendarMessage("Delete confirmation is unavailable. Reload the latest app version and try again.", "error");
      return;
    }
    const confirmed = await openAppConfirmation({
      title:"Delete agenda event?",
      message:`Delete “${event.title}”?`,
      details:"This removes the agenda entry from the Project Agenda and Dashboard calendar. Project financial records are unchanged.",
      confirmLabel:"Delete event",
      danger:true
    });
    if (!confirmed) return;
    const next = events.filter(item => item.id !== id);
    if (!safeWrite(next)) return;
    events = next;
    render();
    notifyAgendaChanged("deleted", id);
    showCalendarMessage("Agenda event deleted.", "success");
  }

  async function toggleEventCompleted(id) {
    const event = events.find(item => item.id === id);
    if (!event) return;
    const completing = !event.completedAt;
    if (completing && event.projectId && typeof window.completeProjectFromAgenda === "function") {
      const accepted = await window.completeProjectFromAgenda(event.projectId, event.title);
      if (!accepted) return;
    }
    const timestamp = new Date().toISOString();
    const next = events.map(item => item.id === id ? { ...item, completedAt:completing ? timestamp : "", kanbanColumnId:"", updatedAt:timestamp } : item);
    if (!safeWrite(next)) return;
    events = next;
    render();
    notifyAgendaChanged(completing ? "completed" : "reopened", id);
    showCalendarMessage(completing ? "Agenda event completed." : "Agenda event reopened.", "success");
  }

  async function moveAgendaEventByDrop(id, destination) {
    const event = events.find(item => item.id === id);
    const completing = destination === "completed";
    const custom = agendaCustomColumns().find(column => column.id === destination);
    if (!event || (!["upcoming", "completed"].includes(destination) && !custom)) return { success:false, message:"Agenda event is no longer available." };
    if (agendaColumnId(event) === destination) return { success:false, message:`${event.title || "Agenda event"} is already in that column.` };

    const original = { ...event };
    let linkedProjectAction = null;
    if (completing && event.projectId && window.FinanceProjectDropActions?.completeLinkedAgenda) {
      linkedProjectAction = await window.FinanceProjectDropActions.completeLinkedAgenda(event.projectId, event.title);
      if (!linkedProjectAction?.success) return { success:false, message:linkedProjectAction?.message || "Agenda move cancelled." };
    }

    const timestamp = new Date().toISOString();
    const next = events.map(item => item.id === id ? { ...item, completedAt:completing ? timestamp : "", kanbanColumnId:custom ? custom.id : "", updatedAt:timestamp } : item);
    if (!safeWrite(next)) {
      if (linkedProjectAction?.undo) await linkedProjectAction.undo();
      return { success:false, message:"Agenda event could not be saved." };
    }
    events = next;
    render();
    notifyAgendaChanged(completing ? "drop-completed" : "drop-reopened", id);
    const title = event.title || "Agenda event";
    const destinationName = completing ? "Completed" : custom?.name || "Upcoming";
    return {
      success:true,
      message:`${title} moved to ${destinationName}.`,
      undo:async () => {
        const current = events.find(item => item.id === id);
        if (!current) return false;
        const currentSnapshot = { ...current };
        const restored = events.map(item => item.id === id ? { ...original } : item);
        if (!safeWrite(restored)) return false;
        if (linkedProjectAction?.undo && !await linkedProjectAction.undo()) {
          safeWrite(events.map(item => item.id === id ? currentSnapshot : item));
          return false;
        }
        events = restored;
        render();
        notifyAgendaChanged("drop-undone", id);
        return true;
      }
    };
  }

  function openFullAgenda() {
    const dialog = document.getElementById("projectAgendaFullDialog");
    if (!dialog) return;
    render();
    dialog.showModal();
  }

  function closeFullAgenda() {
    document.getElementById("projectAgendaFullDialog")?.close();
  }

  function notifyAgendaChanged(action, id = "") {
    window.dispatchEvent(new CustomEvent("finance:project-agenda-changed", {
      detail: { action, id, count:events.length }
    }));
  }

  function icsEscape(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  }

  function icsDateTime(date, time) {
    const clean = `${date}T${time || "00:00"}`;
    const value = new Date(clean);
    if (Number.isNaN(value.getTime())) return "";
    const y = value.getFullYear(), m = pad(value.getMonth() + 1), d = pad(value.getDate());
    const h = pad(value.getHours()), min = pad(value.getMinutes());
    return `${y}${m}${d}T${h}${min}00`;
  }

  function downloadIcs(event) {
    const start = icsDateTime(event.date, event.startTime);
    const end = icsDateTime(event.date, event.endTime || event.startTime || "10:00");
    const description = [
      event.projectId ? `Project: ${projectName(event.projectId)}` : "",
      event.attendees ? `Attendees: ${event.attendees}` : "",
      event.location ? `Location: ${event.location}` : "",
      event.link ? `Meeting link: ${event.link}` : "",
      event.notes ? `Notes: ${event.notes}` : ""
    ].filter(Boolean).join("\n");
    const alarm = event.reminder === "none" ? [] : [
      "BEGIN:VALARM",
      `TRIGGER:-${event.reminder}`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(event.title)}`,
      "END:VALARM"
    ];
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Talaan//Projects Calendar//EN",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
      `UID:${icsEscape(event.id)}@my-finance-records.local`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
      `DTSTART;TZID=Asia/Manila:${start}`,
      `DTEND;TZID=Asia/Manila:${end}`,
      `SUMMARY:${icsEscape(event.title)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      event.location ? `LOCATION:${icsEscape(event.location)}` : "",
      event.link ? `URL:${icsEscape(event.link)}` : "",
      ...alarm,
      "END:VEVENT", "END:VCALENDAR"
    ].filter(Boolean);
    const blob = new Blob([lines.join("\r\n") + "\r\n"], { type:"text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${String(event.title).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "calendar-event"}.ics`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function createAgendaCard() {
    const card = document.createElement("article");
    card.className = "card project-calendar-v13020";
    card.id = "projectCalendarV13020";
    card.innerHTML = `
      <div class="card-header pc-header">
        <div>
          <h3>Project Agenda</h3>
          <p>Schedule project dates here and review them on the Dashboard monthly calendar.</p>
        </div>
        <div class="pc-header-actions">
          <span class="pc-count" data-pc-count>0 events</span>
          <button type="button" class="button button-secondary button-small" data-pc-view>View full agenda</button>
          <button type="button" class="button button-secondary button-small" data-kanban-add-column="agenda">+ Add column</button>
          <button type="button" class="button button-primary button-small" data-pc-add>+ Schedule event</button>
        </div>
      </div>
      <div class="pc-agenda pc-agenda-preview"><div class="finance-kanban-board agenda-kanban-board" data-pc-board aria-label="Project Agenda workflow columns"></div></div>
      <p class="pc-message" data-pc-message aria-live="polite"></p>
    `;
    return card;
  }

  function createEventDialog() {
    const dialog = document.createElement("dialog");
    dialog.id = "projectCalendarEventDialog";
    dialog.className = "app-dialog dialog-form dialog-standard";
    dialog.innerHTML = `
      <form id="projectCalendarEventForm">
        <div class="modal-header"><h3 id="projectCalendarEventDialogTitle">Schedule project event</h3><button type="button" class="button button-secondary button-small" data-pc-close>Close</button></div>
        <div class="modal-body">
          <input type="hidden" id="pcEventId">
          <div class="dialog-context-note">This agenda is separate from project financial records. Its date appears on the Dashboard monthly calendar.</div>
          <div class="form-grid two-column">
            <div class="field"><label for="pcEventProject">Project</label><select class="select" id="pcEventProject">${projectOptions()}</select></div>
            <div class="field"><label for="pcEventType">Event type</label><select class="select" id="pcEventType">${EVENT_TYPES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>
            <div class="field field-full"><label for="pcEventTitle">Title <span class="required-mark">*</span></label><input class="input" id="pcEventTitle" maxlength="120" required placeholder="Example: Client presentation"><small class="field-error" id="pcEventTitleError" data-pc-field-error hidden></small></div>
            <div class="field"><label for="pcEventDate">Date <span class="required-mark">*</span></label><input class="input" id="pcEventDate" type="date" required><small class="field-error" id="pcEventDateError" data-pc-field-error hidden></small></div>
            <div class="field"><label for="pcEventReminder">Reminder</label><select class="select" id="pcEventReminder">${REMINDERS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>
            <div class="field"><label for="pcEventStart">Start time</label><input class="input" id="pcEventStart" type="time"></div>
            <div class="field"><label for="pcEventEnd">End time</label><input class="input" id="pcEventEnd" type="time"><small class="field-error" id="pcEventEndError" data-pc-field-error hidden></small></div>
            <div class="field field-full"><label for="pcEventLocation">Location</label><input class="input" id="pcEventLocation" maxlength="180" placeholder="Office, site, café, or online"></div>
            <div class="field field-full"><label for="pcEventLink">Meeting / presentation link</label><input class="input" id="pcEventLink" type="url" maxlength="500" placeholder="https://..."></div>
            <div class="field field-full"><label for="pcEventAttendees">Client / attendees</label><input class="input" id="pcEventAttendees" maxlength="240" placeholder="Client name, team, or attendees"></div>
            <div class="field field-full"><label for="pcEventNotes">Notes</label><textarea class="textarea" id="pcEventNotes" rows="3" maxlength="1000" placeholder="Agenda, presentation notes, site instructions, or reminders"></textarea></div>
          </div>
        </div>
        <div class="modal-footer form-action-footer"><span class="footer-spacer"></span><button type="button" class="button button-secondary" data-pc-close>Cancel</button><button type="submit" class="button button-primary">Save event</button></div>
      </form>
    `;
    return dialog;
  }

  function createFullAgendaDialog() {
    const fullDialog = document.createElement("dialog");
    fullDialog.id = "projectAgendaFullDialog";
    fullDialog.className = "app-dialog dialog-utility dialog-extended pc-full-dialog";
    fullDialog.setAttribute("aria-labelledby", "projectAgendaFullDialogTitle");
    fullDialog.innerHTML = `
      <div class="modal-header pc-full-header"><div><h3 id="projectAgendaFullDialogTitle">Project Agenda</h3><small data-pc-full-count>0 total</small></div><div><button type="button" class="button button-primary button-small" data-pc-full-add>+ Schedule event</button><button type="button" class="button button-secondary button-small" data-pc-full-close>Close</button></div></div>
      <div class="modal-body pc-full-body"><div class="finance-kanban-board agenda-kanban-board agenda-kanban-board-full" data-pc-full-board aria-label="Full Project Agenda workflow columns"></div></div>
      <div class="modal-footer"><button type="button" class="button button-secondary" data-pc-full-close>Close</button></div>`;
    return fullDialog;
  }

  function attachAgendaEventListeners(card, fullDialog) {
    const handleAgendaAction = event => {
      const add = event.target.closest("[data-pc-add], [data-pc-full-add]");
      if (add) { closeFullAgenda(); return openDialog(); }
      const view = event.target.closest("[data-pc-view]");
      if (view) return openFullAgenda();
      const edit = event.target.closest("[data-pc-edit]");
      if (edit) { closeFullAgenda(); return openDialog("", edit.dataset.pcEdit); }
      const complete = event.target.closest("[data-pc-complete]");
      if (complete) return toggleEventCompleted(complete.dataset.pcComplete);
      const remove = event.target.closest("[data-pc-delete]");
      if (remove) return deleteEvent(remove.dataset.pcDelete);
      const ics = event.target.closest("[data-pc-ics]");
      if (ics) {
        const item = events.find(eventItem => eventItem.id === ics.dataset.pcIcs);
        if (item) downloadIcs(item);
      }
    };

    card.addEventListener("click", handleAgendaAction);
    fullDialog.addEventListener("click", handleAgendaAction);
    fullDialog.querySelectorAll("[data-pc-full-close]").forEach(button => button.addEventListener("click", closeFullAgenda));
  }

  function attachEventDialogListeners(dialog) {
    dialog.querySelector("#projectCalendarEventForm").addEventListener("submit", saveEvent);
    ["pcEventTitle", "pcEventDate", "pcEventStart", "pcEventEnd"].forEach(id => {
      const input = dialog.querySelector(`#${id}`);
      ["input", "change"].forEach(type => input?.addEventListener(type, () => clearEventFieldError(input)));
    });
    dialog.querySelectorAll("[data-pc-close]").forEach(button => button.addEventListener("click", closeDialog));
  }

  function observeProjectListScheduleButtons() {
    const observeProjects = () => {
      document.querySelectorAll("#projectKanbanBoard .project-record").forEach(row => {
        if (row.querySelector("[data-pc-project-schedule]")) return;
        const projectId = row.querySelector("[data-edit-project]")?.dataset.editProject;
        if (!projectId) return;
        const actions = row.querySelector(".project-row-actions, .desktop-record-actions");
        if (!actions) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button-secondary button-small project-compact-action";
        button.dataset.pcProjectSchedule = projectId;
        button.textContent = "Schedule";
        button.addEventListener("click", () => openDialog(projectId));
        actions.prepend(button);
      });
    };
    new MutationObserver(observeProjects).observe(document.getElementById("projects"), { subtree:true, childList:true });
    observeProjects();
  }

  function setupProjectSelectorSync() {
    document.addEventListener("click", () => {
      const select = document.getElementById("pcEventProject");
      if (select && !document.getElementById("projectCalendarEventDialog")?.open) select.innerHTML = projectOptions(select.value);
    });
  }

  function buildUi() {
    const projectsPage = document.getElementById("projects");
    const heading = projectsPage?.querySelector(".page-heading");
    if (!projectsPage || !heading || document.getElementById("projectCalendarV13020")) return;

    const card = createAgendaCard();
    heading.insertAdjacentElement("afterend", card);

    const dialog = createEventDialog();
    document.body.appendChild(dialog);

    const fullDialog = createFullAgendaDialog();
    document.body.appendChild(fullDialog);

    attachAgendaEventListeners(card, fullDialog);
    attachEventDialogListeners(dialog);
    observeProjectListScheduleButtons();
    setupProjectSelectorSync();

    events = safeRead();
    render();
  }

  function bootWhenAuthenticated() {
    if (document.documentElement.dataset.financeAuth === "signed-in" && !document.body.classList.contains("finance-signed-out")) {
      buildUi();
    }
  }

  window.addEventListener("finance:privacy-auth-change", bootWhenAuthenticated);

  window.FinanceStructuredDropActions = window.FinanceStructuredDropActions || {};
  window.FinanceStructuredDropActions.agenda = { move:moveAgendaEventByDrop };
  window.FinanceAgendaKanban = { columnHasItems:id => events.some(event => !event.completedAt && event.kanbanColumnId === id) };

  window.addEventListener("finance:kanban-columns-changed", event => {
    if (event.detail?.board !== "agenda") return;
    const valid = new Set(agendaCustomColumns().map(column => column.id));
    let changed = false;
    events = events.map(item => {
      if (!item.kanbanColumnId || valid.has(item.kanbanColumnId)) return item;
      changed = true;
      return { ...item, kanbanColumnId:"", updatedAt:new Date().toISOString() };
    });
    if (changed) safeWrite(events);
    render();
  });

  window.addEventListener("finance:page-changed", event => {
    if (event.detail?.pageId === "projects") {
      bootWhenAuthenticated();
    }
  });

  window.addEventListener("storage", event => {
    if (event.key !== EVENTS_KEY) return;
    events = safeRead();
    render();
    notifyAgendaChanged("external-refresh");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootWhenAuthenticated, { once:true });
  } else {
    bootWhenAuthenticated();
  }
})();
