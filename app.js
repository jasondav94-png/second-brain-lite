const storageKey = "second-brain-lite-v1";
const todayISO = new Date().toISOString().slice(0, 10);
const makeId = () => {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const defaultState = {
  notes: [
    {
      id: makeId(),
      title: "Weekly reset",
      body: "Review bills, grocery list, workouts, and one thing to make the week lighter.",
      createdAt: new Date().toISOString(),
    },
  ],
  reminders: [
    {
      id: makeId(),
      title: "Plan tomorrow morning",
      date: todayISO,
      time: "18:00",
      priority: "Normal",
      done: false,
    },
  ],
  goals: [
    {
      id: makeId(),
      title: "Build a calmer daily routine",
      why: "Less mental clutter, fewer missed little things.",
      progress: 35,
      createdAt: new Date().toISOString(),
    },
  ],
  expenses: [
    {
      id: makeId(),
      name: "Groceries",
      amount: 42.35,
      category: "Food",
      date: todayISO,
    },
  ],
  events: [
    {
      id: makeId(),
      title: "Personal admin block",
      date: todayISO,
      time: "17:30",
      place: "Home",
    },
  ],
};

let state = loadState();
let activeView = "dashboard";
let reminderFilter = "open";
let searchTerm = "";
let deferredInstallPrompt = null;
let toastTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  viewTitle: $("#viewTitle"),
  todayLabel: $("#todayLabel"),
  globalSearch: $("#globalSearch"),
  installApp: $("#installApp"),
  quickCaptureBtn: $("#quickCaptureBtn"),
  quickCaptureDialog: $("#quickCaptureDialog"),
  quickCaptureForm: $("#quickCaptureForm"),
  quickCaptureText: $("#quickCaptureText"),
  saveStatus: $("#saveStatus"),
  exportData: $("#exportData"),
  importData: $("#importData"),
  resetData: $("#resetData"),
  toast: $("#toast"),
  generateSummary: $("#generateSummary"),
  noteForm: $("#noteForm"),
  noteTitle: $("#noteTitle"),
  noteBody: $("#noteBody"),
  notesList: $("#notesList"),
  notesResultCount: $("#notesResultCount"),
  reminderForm: $("#reminderForm"),
  reminderTitle: $("#reminderTitle"),
  reminderDate: $("#reminderDate"),
  reminderTime: $("#reminderTime"),
  reminderPriority: $("#reminderPriority"),
  remindersList: $("#remindersList"),
  goalForm: $("#goalForm"),
  goalTitle: $("#goalTitle"),
  goalWhy: $("#goalWhy"),
  goalProgress: $("#goalProgress"),
  goalProgressValue: $("#goalProgressValue"),
  goalsList: $("#goalsList"),
  expenseForm: $("#expenseForm"),
  expenseName: $("#expenseName"),
  expenseAmount: $("#expenseAmount"),
  expenseDate: $("#expenseDate"),
  expenseCategory: $("#expenseCategory"),
  expensesList: $("#expensesList"),
  expenseBars: $("#expenseBars"),
  expenseTotal: $("#expenseTotal"),
  eventForm: $("#eventForm"),
  eventTitle: $("#eventTitle"),
  eventDate: $("#eventDate"),
  eventTime: $("#eventTime"),
  eventPlace: $("#eventPlace"),
  calendarList: $("#calendarList"),
  noteCount: $("#noteCount"),
  dueCount: $("#dueCount"),
  goalScore: $("#goalScore"),
  monthSpend: $("#monthSpend"),
  focusLine: $("#focusLine"),
  dailyBrief: $("#dailyBrief"),
  briefChips: $("#briefChips"),
  upcomingList: $("#upcomingList"),
  goalListMini: $("#goalListMini"),
  todayEvents: $("#todayEvents"),
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);

  try {
    return { ...structuredClone(defaultState), ...JSON.parse(saved) };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  updateSaveStatus();
}

function updateSaveStatus() {
  if (!els.saveStatus) return;
  const time = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  els.saveStatus.textContent = `Saved ${time}`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 2600);
}

function formatDate(value) {
  if (!value) return "No date";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value || 0);
}

function sortByDateTime(a, b) {
  return `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`);
}

function daysUntil(value) {
  const start = new Date(`${todayISO}T00:00:00`);
  const end = new Date(`${value}T00:00:00`);
  return Math.round((end - start) / 86400000);
}

function dueBadge(item) {
  const delta = daysUntil(item.date);
  if (Number.isNaN(delta)) return { text: "No date", tone: "" };
  if (delta < 0) return { text: "Overdue", tone: "warning" };
  if (delta === 0) return { text: "Today", tone: "good" };
  if (delta === 1) return { text: "Tomorrow", tone: "good" };
  if (delta <= 7) return { text: `${delta} days`, tone: "" };
  return { text: formatDate(item.date), tone: "" };
}

function matchesSearch(item, fields) {
  if (!searchTerm) return true;
  return fields.some((field) => String(item[field] || "").toLowerCase().includes(searchTerm));
}

function emptyNode() {
  return $("#emptyTemplate").content.firstElementChild.cloneNode(true);
}

function clearAndEmpty(container, items) {
  container.replaceChildren();
  if (!items.length) {
    container.append(emptyNode());
    return true;
  }
  return false;
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function makeItem({ title, meta, body, badges = [], actions = [], done = false }) {
  const item = document.createElement("article");
  item.className = `item${done ? " done" : ""}`;

  const top = document.createElement("div");
  top.className = "item-top";
  const titleWrap = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = title;
  titleWrap.append(heading);

  if (meta) {
    const metaEl = document.createElement("p");
    metaEl.className = "meta";
    metaEl.textContent = meta;
    titleWrap.append(metaEl);
  }

  const badgeWrap = document.createElement("div");
  badgeWrap.className = "chip-row";
  badges.forEach((badge) => {
    const span = document.createElement("span");
    span.className = `badge ${badge.tone || ""}`.trim();
    span.textContent = badge.text || badge;
    badgeWrap.append(span);
  });

  top.append(titleWrap, badgeWrap);
  item.append(top);

  if (body) {
    const bodyEl = document.createElement("p");
    bodyEl.textContent = body;
    item.append(bodyEl);
  }

  if (actions.length) {
    const actionsEl = document.createElement("div");
    actionsEl.className = "item-actions";
    actions.forEach((action) => actionsEl.append(action));
    item.append(actionsEl);
  }

  return item;
}

function deleteById(collection, id) {
  state[collection] = state[collection].filter((item) => item.id !== id);
  saveState();
  render();
  showToast("Deleted");
}

function setView(view) {
  activeView = view;
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  els.viewTitle.textContent = view.charAt(0).toUpperCase() + view.slice(1);
}

function renderDashboard() {
  const openReminders = state.reminders.filter((item) => !item.done);
  const dueSoon = openReminders.filter((item) => daysUntil(item.date) <= 7);
  const goalAverage = state.goals.length
    ? Math.round(state.goals.reduce((sum, goal) => sum + Number(goal.progress), 0) / state.goals.length)
    : 0;
  const month = todayISO.slice(0, 7);
  const monthSpend = state.expenses
    .filter((expense) => expense.date?.startsWith(month))
    .reduce((sum, expense) => sum + Number(expense.amount), 0);

  els.noteCount.textContent = state.notes.length;
  els.dueCount.textContent = dueSoon.length;
  els.goalScore.textContent = `${goalAverage}%`;
  els.monthSpend.textContent = formatMoney(monthSpend);

  const highestGoal = [...state.goals].sort((a, b) => b.progress - a.progress)[0];
  els.focusLine.textContent = highestGoal
    ? `Protect time for “${highestGoal.title}” today.`
    : "A calm place for the useful stuff.";

  const summary = buildSummary({ openReminders, dueSoon, goalAverage, monthSpend });
  els.dailyBrief.textContent = summary.text;
  els.briefChips.replaceChildren(...summary.chips.map((chip) => {
    const span = document.createElement("span");
    span.className = "chip";
    span.textContent = chip;
    return span;
  }));

  renderCompactList(
    els.upcomingList,
    openReminders.sort(sortByDateTime).slice(0, 4),
    (item) => makeItem({
      title: item.title,
      meta: `${formatDate(item.date)}${item.time ? ` at ${item.time}` : ""}`,
      badges: [dueBadge(item), item.priority],
    }),
  );

  renderCompactList(
    els.goalListMini,
    [...state.goals].sort((a, b) => a.progress - b.progress).slice(0, 4),
    (goal) => {
      const item = makeItem({
        title: goal.title,
        meta: `${goal.progress}% complete`,
      });
      item.append(progressBar(goal.progress));
      return item;
    },
  );

  renderCompactList(
    els.todayEvents,
    state.events.filter((event) => event.date === todayISO).sort(sortByDateTime),
    (event) => makeItem({
      title: event.title,
      meta: `${event.time || "Anytime"}${event.place ? ` · ${event.place}` : ""}`,
    }),
  );
}

function buildSummary({ openReminders, dueSoon, goalAverage, monthSpend }) {
  const chips = [];
  const parts = [];

  if (dueSoon.length) {
    parts.push(`You have ${dueSoon.length} reminder${dueSoon.length === 1 ? "" : "s"} due within a week`);
    chips.push(`${dueSoon.length} due soon`);
  } else {
    parts.push("No urgent reminders are crowding the next week");
    chips.push("clear week");
  }

  if (state.goals.length) {
    parts.push(`your goals are averaging ${goalAverage}% progress`);
    chips.push(`${goalAverage}% goals`);
  } else {
    parts.push("you have room to choose one small goal");
    chips.push("choose a goal");
  }

  if (state.expenses.length) {
    parts.push(`this month’s logged spending is ${formatMoney(monthSpend)}`);
    chips.push(formatMoney(monthSpend));
  }

  if (state.notes.length) {
    const latest = state.notes[0];
    parts.push(`your latest note is “${latest.title}”`);
    chips.push("notes ready");
  }

  return {
    text: `${parts.join(", ")}. Pick one next action, keep it small, and let the rest wait its turn.`,
    chips,
  };
}

function progressBar(value) {
  const track = document.createElement("div");
  track.className = "progress-track";
  const fill = document.createElement("div");
  fill.className = "progress-fill";
  fill.style.width = `${Math.min(100, Math.max(0, Number(value)))}%`;
  track.append(fill);
  return track;
}

function renderCompactList(container, items, mapItem) {
  if (clearAndEmpty(container, items)) return;
  container.replaceChildren(...items.map(mapItem));
}

function renderNotes() {
  const notes = state.notes
    .filter((note) => matchesSearch(note, ["title", "body"]))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  els.notesResultCount.textContent = `${notes.length} shown`;
  if (clearAndEmpty(els.notesList, notes)) return;

  els.notesList.replaceChildren(...notes.map((note) => makeItem({
    title: note.title,
    meta: new Date(note.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    body: note.body,
    actions: [
      makeButton("Delete", "tiny-btn danger", () => deleteById("notes", note.id)),
    ],
  })));
}

function renderReminders() {
  const reminders = state.reminders
    .filter((reminder) => reminder.done === (reminderFilter === "done"))
    .filter((reminder) => matchesSearch(reminder, ["title", "priority"]))
    .sort(sortByDateTime);

  if (clearAndEmpty(els.remindersList, reminders)) return;

  els.remindersList.replaceChildren(...reminders.map((reminder) => makeItem({
    title: reminder.title,
    meta: `${formatDate(reminder.date)}${reminder.time ? ` at ${reminder.time}` : ""}`,
    badges: [dueBadge(reminder), reminder.priority],
    done: reminder.done,
    actions: [
      makeButton(reminder.done ? "Reopen" : "Done", "tiny-btn", () => {
        reminder.done = !reminder.done;
        saveState();
        render();
        showToast(reminder.done ? "Reminder completed" : "Reminder reopened");
      }),
      makeButton("Delete", "tiny-btn danger", () => deleteById("reminders", reminder.id)),
    ],
  })));
}

function renderGoals() {
  const goals = state.goals
    .filter((goal) => matchesSearch(goal, ["title", "why"]))
    .sort((a, b) => a.progress - b.progress);

  if (clearAndEmpty(els.goalsList, goals)) return;

  els.goalsList.replaceChildren(...goals.map((goal) => {
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.value = goal.progress;
    input.addEventListener("input", () => {
      goal.progress = Number(input.value);
      saveState();
      renderDashboard();
      progressText.textContent = `${goal.progress}% complete`;
      item.querySelector(".progress-fill").style.width = `${goal.progress}%`;
    });

    const progressText = document.createElement("p");
    progressText.className = "meta";
    progressText.textContent = `${goal.progress}% complete`;

    const item = makeItem({
      title: goal.title,
      body: goal.why,
      actions: [makeButton("Delete", "tiny-btn danger", () => deleteById("goals", goal.id))],
    });
    item.append(progressText, progressBar(goal.progress), input);
    return item;
  }));
}

function renderExpenses() {
  const expenses = state.expenses
    .filter((expense) => matchesSearch(expense, ["name", "category"]))
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  els.expenseTotal.textContent = formatMoney(total);
  renderExpenseBars(expenses);

  if (clearAndEmpty(els.expensesList, expenses)) return;

  els.expensesList.replaceChildren(...expenses.map((expense) => makeItem({
    title: expense.name,
    meta: `${expense.category} · ${formatDate(expense.date)}`,
    badges: [formatMoney(Number(expense.amount))],
    actions: [makeButton("Delete", "tiny-btn danger", () => deleteById("expenses", expense.id))],
  })));
}

function renderExpenseBars(expenses) {
  const totals = expenses.reduce((map, expense) => {
    map[expense.category] = (map[expense.category] || 0) + Number(expense.amount);
    return map;
  }, {});

  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (clearAndEmpty(els.expenseBars, entries)) return;

  const max = Math.max(...entries.map(([, amount]) => amount), 1);
  els.expenseBars.replaceChildren(...entries.map(([category, amount]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const label = document.createElement("span");
    label.textContent = category;
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(amount / max) * 100}%`;
    const value = document.createElement("span");
    value.textContent = formatMoney(amount);
    track.append(fill);
    row.append(label, track, value);
    return row;
  }));
}

function renderCalendar() {
  const events = state.events
    .filter((event) => matchesSearch(event, ["title", "place"]))
    .sort(sortByDateTime);

  if (clearAndEmpty(els.calendarList, events)) return;

  els.calendarList.replaceChildren(...events.map((event) => makeItem({
    title: event.title,
    meta: `${formatDate(event.date)}${event.time ? ` at ${event.time}` : ""}`,
    body: event.place,
    actions: [makeButton("Delete", "tiny-btn danger", () => deleteById("events", event.id))],
  })));
}

function render() {
  renderDashboard();
  renderNotes();
  renderReminders();
  renderGoals();
  renderExpenses();
  renderCalendar();
}

function bindEvents() {
  els.todayLabel.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  [els.reminderDate, els.expenseDate, els.eventDate].forEach((input) => {
    input.value = todayISO;
  });

  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  els.globalSearch.addEventListener("input", () => {
    searchTerm = els.globalSearch.value.trim().toLowerCase();
    render();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installApp.classList.remove("hidden");
  });

  els.installApp.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      showToast("Use your browser menu to add this app to your home screen.");
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installApp.classList.add("hidden");
  });

  els.quickCaptureBtn.addEventListener("click", () => {
    els.quickCaptureText.value = "";
    els.quickCaptureDialog.showModal();
    els.quickCaptureText.focus();
  });

  els.quickCaptureForm.addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    const body = els.quickCaptureText.value.trim();
    if (!body) return;

    state.notes.unshift({
      id: makeId(),
      title: body.split("\n")[0].slice(0, 70),
      body,
      createdAt: new Date().toISOString(),
    });
    saveState();
    render();
    setView("notes");
    showToast("Captured as a note");
  });

  els.exportData.addEventListener("click", () => {
    const backup = {
      app: "Second Brain Lite",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `second-brain-lite-backup-${todayISO}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Backup downloaded");
  });

  els.importData.addEventListener("change", async () => {
    const file = els.importData.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed.data || parsed;
      const required = ["notes", "reminders", "goals", "expenses", "events"];
      if (!required.every((key) => Array.isArray(incoming[key]))) {
        throw new Error("Backup is missing app data.");
      }

      state = {
        notes: incoming.notes,
        reminders: incoming.reminders,
        goals: incoming.goals,
        expenses: incoming.expenses,
        events: incoming.events,
      };
      saveState();
      render();
      showToast("Backup restored");
    } catch {
      showToast("That backup file could not be imported.");
    } finally {
      els.importData.value = "";
    }
  });

  els.resetData.addEventListener("click", () => {
    const ok = confirm("Clear all saved notes, reminders, goals, expenses, and events?");
    if (!ok) return;
    state = structuredClone(defaultState);
    saveState();
    render();
    showToast("Sample data restored");
  });

  els.generateSummary.addEventListener("click", renderDashboard);

  els.noteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.notes.unshift({
      id: makeId(),
      title: els.noteTitle.value.trim(),
      body: els.noteBody.value.trim(),
      createdAt: new Date().toISOString(),
    });
    els.noteForm.reset();
    saveState();
    render();
    showToast("Note saved");
  });

  els.reminderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.reminders.push({
      id: makeId(),
      title: els.reminderTitle.value.trim(),
      date: els.reminderDate.value,
      time: els.reminderTime.value,
      priority: els.reminderPriority.value,
      done: false,
    });
    els.reminderForm.reset();
    els.reminderDate.value = todayISO;
    saveState();
    render();
    showToast("Reminder added");
  });

  $$(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      reminderFilter = button.dataset.reminderFilter;
      $$(".segment").forEach((segment) => segment.classList.toggle("active", segment === button));
      renderReminders();
    });
  });

  els.goalProgress.addEventListener("input", () => {
    els.goalProgressValue.textContent = `${els.goalProgress.value}%`;
  });

  els.goalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.goals.push({
      id: makeId(),
      title: els.goalTitle.value.trim(),
      why: els.goalWhy.value.trim(),
      progress: Number(els.goalProgress.value),
      createdAt: new Date().toISOString(),
    });
    els.goalForm.reset();
    els.goalProgress.value = 0;
    els.goalProgressValue.textContent = "0%";
    saveState();
    render();
    showToast("Goal added");
  });

  els.expenseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.expenses.push({
      id: makeId(),
      name: els.expenseName.value.trim(),
      amount: Number(els.expenseAmount.value),
      date: els.expenseDate.value,
      category: els.expenseCategory.value,
    });
    els.expenseForm.reset();
    els.expenseDate.value = todayISO;
    saveState();
    render();
    showToast("Expense added");
  });

  els.eventForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.events.push({
      id: makeId(),
      title: els.eventTitle.value.trim(),
      date: els.eventDate.value,
      time: els.eventTime.value,
      place: els.eventPlace.value.trim(),
    });
    els.eventForm.reset();
    els.eventDate.value = todayISO;
    saveState();
    render();
    showToast("Event added");
  });
}

bindEvents();
render();
updateSaveStatus();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
