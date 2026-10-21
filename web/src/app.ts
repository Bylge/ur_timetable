// App state and events. One state object; render() redraws from it. Clicks are handled in one place
// through data-action attributes (see views.ts).
//
// Sheets and pages (Zmiany, O projekcie, Prywatność) add a browser history entry, so the phone's back
// gesture closes them instead of leaving the site.

import type { ChangeSet, IndexEntry, IndexFile, Mark, Selection, Timetable } from "./types";
import {
  available,
  clearAllStored,
  clearSelection,
  loadChanges,
  loadIndex,
  loadMarks,
  loadSeen,
  loadSelection,
  loadTheme,
  loadTimetable,
  saveMark,
  saveTheme,
  saveSeen,
  saveSelection,
  type Theme,
} from "./data";
import { hasWeekendClasses, hourRange, myEvents, selectionComplete, weekStart } from "./schedule";
import { myChangeCount, unseenChanges } from "./changes";
import { download, icsFileName, toIcs } from "./ics";
import { groupsSummary, timetableShort } from "./labels";
import { addDays, nowInWarsaw, weekday, type Now } from "./time";
import {
  aboutView,
  changesView,
  desktopPlan,
  errorView,
  eventSheet,
  groupsView,
  icsConfirmSheet,
  icsSheet,
  infoSheet,
  menuSheet,
  noteText,
  phonePlan,
  pickerView,
  privacyView,
  type PlanContext,
} from "./views";

type Page = "changes" | "about" | "privacy";
type View = "loading" | "error" | "picker" | "groups" | "plan" | Page;
type Sheet =
  | { kind: "event"; id: string }
  | { kind: "info" }
  | { kind: "menu" }
  | { kind: "ics-confirm" }
  | { kind: "ics"; count: number; file: string }
  | null;

const PAGE_HASH: Record<Page, string> = { changes: "zmiany", about: "o-projekcie", privacy: "prywatnosc" };
const MODE_KEY = "planur:mode:v1";
const wide = window.matchMedia("(min-width: 900px)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const REFRESH_AFTER_MS = 5 * 60_000; // an app brought back from the background checks for a new version

/** Chrome's install prompt, kept until the student asks to install. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
}

const state = {
  view: "loading" as View,
  returnTo: "plan" as View, // where a page goes back to
  error: "",
  index: null as IndexFile | null,
  timetables: new Map<string, Timetable>(),
  changes: new Map<string, ChangeSet[]>(),
  selection: null as Selection | null,
  draft: null as Selection | null,
  mode: (readMode() ?? "day") as "day" | "week",
  date: "",
  sheet: null as Sheet,
  anim: "",
  marks: loadMarks(),
  seen: loadSeen(),
  changesNew: [] as string[], // versions that were new when the Zmiany page was opened
  install: null as InstallPrompt | null,
  theme: loadTheme(),
  sheetEnter: false, // the sheet was just opened: play its entry animation (not on every redraw)
  leaving: false, // a sheet is animating out
  loadedAt: Date.now(),
  openedOn: "", // "today" when the plan was opened, to follow the date if the app stays open overnight
};

// The skeleton from index.html, shown until the data is ready.
let skeleton = "";

let root: HTMLElement;

function readMode(): "day" | "week" | null {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === "day" || m === "week" ? m : null;
  } catch {
    return null;
  }
}

function now(): Now {
  return nowInWarsaw();
}

function entryFor(id: string): IndexEntry | undefined {
  return state.index?.timetables[id];
}

function current(): { tt: Timetable; entry: IndexEntry; sel: Selection } | null {
  const sel = state.selection;
  if (!sel) return null;
  const tt = state.timetables.get(sel.timetable);
  const entry = entryFor(sel.timetable);
  return tt && entry ? { tt, entry, sel } : null;
}

/** The plan always opens on today (at the weekend the week shown is the coming one, see weekStart). */
function openingDate(): string {
  return now().date;
}

async function timetable(id: string): Promise<Timetable> {
  let tt = state.timetables.get(id);
  if (!tt) {
    const [loaded, changes] = await Promise.all([loadTimetable(id), loadChanges(id)]);
    tt = loaded;
    state.timetables.set(id, tt);
    state.changes.set(id, changes);
  }
  return tt;
}

// ---------- changes since the last visit ----------

function currentVersion(id: string): string | undefined {
  return state.timetables.get(id)?.source.sha256;
}

/** Updates the student hasn't seen. The first visit counts as having seen the current version. */
function unseen(): ChangeSet[] {
  const cur = current();
  if (!cur) return [];
  const id = cur.tt.id;
  const version = cur.tt.source.sha256;
  if (!state.seen[id]) markSeen(id);
  return unseenChanges(state.changes.get(id) ?? [], state.seen[id], version);
}

function markSeen(id: string): void {
  const version = currentVersion(id);
  if (!version || state.seen[id] === version) return;
  state.seen[id] = version;
  saveSeen(state.seen);
}

/** Changes in the student's own classes since their last visit; changes only in other groups are marked seen quietly. */
function unseenSummary(): PlanContext["unseen"] {
  const cur = current();
  const sets = unseen();
  if (!cur || !sets.length) return null;
  const count = myChangeCount(sets, cur.sel, cur.tt.optional_subjects);
  if (!count) {
    markSeen(cur.tt.id);
    return null;
  }
  return { count, updated: sets[0].updated };
}

// ---------- rendering ----------

function render(): void {
  const at = new Date();
  let html = "";
  const cur = current();
  if (state.view === "loading") html = skeleton;
  else if (state.view === "error") html = errorView(state.error);
  else if (state.view === "picker") html = pickerView(available(state.index!), state.selection?.timetable ?? null);
  else if (state.view === "groups") {
    const tt = state.timetables.get(state.draft!.timetable)!;
    const count = selectionComplete(tt, state.draft!) ? myEvents(tt, state.draft!).length : 0;
    html = groupsView(tt, state.draft!, count, Boolean(state.selection && selectionComplete(tt, state.selection)));
  } else if (state.view === "about") html = aboutView(cur?.entry.url ?? null);
  else if (state.view === "privacy") html = privacyView();
  else if (state.view === "changes" && cur) html = changesView(state.changes.get(cur.tt.id) ?? [], cur.sel, cur.tt, state.changesNew);
  else {
    if (!cur) {
      state.view = "picker";
      return render();
    }
    const c: PlanContext = {
      ...cur,
      events: myEvents(cur.tt, cur.sel),
      now: now(),
      at,
      date: state.date,
      hours: hourRange(cur.tt),
      withWeekend: hasWeekendClasses(cur.tt),
      anim: state.anim,
      marks: state.marks,
      unseen: unseenSummary(),
      offline: !navigator.onLine,
      canInstall: Boolean(state.install),
      theme: state.theme,
    };
    html = wide.matches ? desktopPlan(c) : phonePlan(c, state.mode);
    const s = state.sheet;
    if (s?.kind === "event") {
      const e = cur.tt.events.find((x) => x.id === s.id);
      if (e) html += eventSheet(e, c.now, state.marks[e.id], cur.entry.url);
    } else if (s?.kind === "info") html += infoSheet(cur.entry, cur.tt, at);
    else if (s?.kind === "menu") html += menuSheet(c);
    else if (s?.kind === "ics-confirm") html += icsConfirmSheet(icsSummary());
    else if (s?.kind === "ics") html += icsSheet(s.count, s.file);
  }
  root.innerHTML = html;
  state.anim = "";
  if (state.sheetEnter) root.querySelector(".sheet-layer")?.classList.add("enter");
  state.sheetEnter = false;
  document.documentElement.classList.toggle("sheet-open", Boolean(state.sheet));
  fitDayhead();
  root.querySelector<HTMLElement>(".sheet")?.focus();
}

/** The day header stays on one line: if "Poniedziałek, 26 października · za 5 dni · Dziś" wraps, use "Pon.". */
function fitDayhead(): void {
  const head = root.querySelector<HTMLElement>(".dayhead");
  if (!head) return;
  head.classList.remove("tight");
  const first = head.firstElementChild as HTMLElement;
  const last = head.lastElementChild as HTMLElement;
  if (last.offsetTop > first.offsetTop + first.offsetHeight / 2) head.classList.add("tight");
}

// ---------- theme ----------

function applyTheme(theme: Theme): void {
  state.theme = theme;
  saveTheme(theme);
  const html = document.documentElement;
  if (theme === "auto") delete html.dataset.theme;
  else html.dataset.theme = theme;
  // the phone's status bar colour follows the page background
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m) => {
    const dark = m.media.includes("dark");
    m.content = theme === "auto" ? (dark ? "#0f1115" : "#f5f6f8") : theme === "dark" ? "#0f1115" : "#f5f6f8";
  });
  render();
}

// ---------- history: sheets and pages close with the back button ----------

function pushLayer(hash = ""): void {
  history.pushState({ layer: true }, "", hash ? `#${hash}` : location.href);
}

/** Close the top sheet or page through history, so the entry we pushed is used up. */
function closeLayer(): void {
  if (state.leaving) return;
  if (history.state?.layer) history.back();
  else void closeTop(); // opened from a link (#o-projekcie) or the entry is gone: close directly
}

function onPopState(): void {
  void closeTop();
}

async function closeTop(): Promise<void> {
  if (state.sheet) {
    // closed right away (a tap during the animation already sees no sheet); only the old element animates out
    state.sheet = null;
    await sheetOut();
  } else if (isPage(state.view)) leavePage();
  render();
}

/** Let the sheet slide down (phone) or fade (desktop) before it's removed. */
function sheetOut(): Promise<void> {
  const layer = root.querySelector<HTMLElement>(".sheet-layer");
  if (!layer || reducedMotion.matches) return Promise.resolve();
  state.leaving = true;
  layer.classList.remove("enter");
  layer.classList.add("leaving");
  return new Promise((resolve) =>
    setTimeout(() => {
      state.leaving = false;
      resolve();
    }, 200),
  );
}

function isPage(view: View): view is Page {
  return view === "changes" || view === "about" || view === "privacy";
}

function leavePage(): void {
  state.view = state.returnTo;
  if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
}

function openSheet(sheet: NonNullable<Sheet>): void {
  if (!state.sheet) {
    pushLayer();
    state.sheetEnter = true;
  }
  state.sheet = sheet;
  render();
}

function openPage(page: Page): void {
  if (page === "changes" && state.selection) {
    state.changesNew = unseen().map((c) => c.sha256);
    markSeen(state.selection.timetable);
  }
  if (state.sheet) {
    // replace the sheet's history entry with the page
    state.sheet = null;
    history.replaceState({ layer: true }, "", `#${PAGE_HASH[page]}`);
  } else pushLayer(PAGE_HASH[page]);
  if (!isPage(state.view)) state.returnTo = state.view;
  state.view = page;
  render();
  window.scrollTo(0, 0);
}

// ---------- navigation ----------

function go(date: string, anim = ""): void {
  state.anim = anim;
  state.date = date;
  render();
}

function step(days: number): void {
  go(addDays(state.date, days), days > 0 ? "anim-left" : "anim-right");
}

function stepWeek(direction: 1 | -1): void {
  const cur = current();
  const withWeekend = cur ? hasWeekendClasses(cur.tt) : false;
  // From a weekend day (shown as the coming week) go to the Monday of the next/previous shown week.
  if (!withWeekend && weekday(state.date) >= 5) {
    go(addDays(weekStart(state.date, withWeekend), 7 * direction), direction > 0 ? "anim-left" : "anim-right");
    return;
  }
  step(7 * direction);
}

function setMode(mode: "day" | "week"): void {
  state.mode = mode;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // ignore
  }
  render();
}

async function pickTimetable(id: string): Promise<void> {
  try {
    await timetable(id);
    const keep = state.selection?.timetable === id ? state.selection : null;
    state.draft = keep ? structuredClone(keep) : { timetable: id, groups: {}, optional: [] };
    state.view = "groups";
    render();
  } catch (err) {
    fail(err);
  }
}

function saveGroups(): void {
  const tt = state.timetables.get(state.draft!.timetable)!;
  if (!selectionComplete(tt, state.draft!)) return;
  state.selection = structuredClone(state.draft!);
  saveSelection(state.selection);
  state.view = "plan";
  state.date = openingDate();
  render();
}

function icsSummary() {
  const cur = current()!;
  const events = myEvents(cur.tt, cur.sel);
  return {
    count: events.length,
    first: events[0]?.date ?? null,
    last: events[events.length - 1]?.date ?? null,
    groups: groupsSummary(cur.tt, cur.sel) + (cur.sel.optional.length ? ` + ${cur.sel.optional.join(", ")}` : ""),
    cancelled: events.filter((e) => state.marks[e.id]?.cancelled).length,
  };
}

function downloadIcs(): void {
  const cur = current();
  if (!cur) return;
  const events = myEvents(cur.tt, cur.sel);
  const file = icsFileName(cur.tt.id);
  const text = toIcs(events, { name: `Plan UR: ${timetableShort(cur.tt.id)}`, sourceUrl: cur.entry.url, marks: state.marks, noteText });
  download(text, file);
  state.sheet = { kind: "ics", count: events.length, file };
  render();
}

function updateMark(id: string, change: Partial<Mark>): void {
  const mark: Mark = { ...(state.marks[id] ?? { cancelled: false, note: "" }), ...change };
  saveMark(state.marks, id, mark);
}

function fail(err: unknown): void {
  state.view = "error";
  state.error = err instanceof Error ? err.message : String(err);
  render();
}

// ---------- events ----------

function onClick(ev: MouseEvent): void {
  const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!el || el.tagName === "INPUT") return;
  const d = el.dataset;
  switch (d.action) {
    case "pick-timetable":
      void pickTimetable(d.id!);
      break;
    case "set-group":
      state.draft!.groups[d.split!] = Number(d.group);
      render();
      break;
    case "save-groups":
      saveGroups();
      break;
    case "groups":
      if (state.sheet) {
        state.sheet = null;
        history.replaceState(null, "", location.href);
      }
      state.draft = structuredClone(state.selection!);
      state.view = "groups";
      render();
      break;
    case "picker":
      state.view = "picker";
      render();
      break;
    case "back":
      if (state.view === "picker" && state.draft) state.view = "groups";
      else state.view = current() ? "plan" : "picker";
      render();
      break;
    case "mode":
      setMode(d.mode as "day" | "week");
      break;
    case "prev-week":
      stepWeek(-1);
      break;
    case "next-week":
      stepWeek(1);
      break;
    case "pick-day":
      go(d.date!, d.date! > state.date ? "anim-left" : d.date! < state.date ? "anim-right" : "");
      break;
    case "today":
      go(openingDate(), "anim-fade");
      break;
    case "show-day":
      if (!wide.matches) state.mode = "day";
      go(d.date!, "anim-up");
      break;
    case "open-day":
      if (!wide.matches) {
        state.mode = "day";
        go(d.date!, "anim-fade");
      }
      break;
    case "goto-day":
      // from the Zmiany page: back to the plan on that day
      if (!wide.matches) state.mode = "day";
      state.date = d.date!;
      state.anim = "anim-fade";
      closeLayer();
      break;
    case "event":
      openSheet({ kind: "event", id: d.id! });
      break;
    case "info":
      if (state.sheet) {
        state.sheet = { kind: "info" };
        render();
      } else openSheet({ kind: "info" });
      break;
    case "menu":
      openSheet({ kind: "menu" });
      break;
    case "ics":
      if (state.sheet) {
        state.sheet = { kind: "ics-confirm" };
        render();
      } else openSheet({ kind: "ics-confirm" });
      break;
    case "ics-download":
      downloadIcs();
      break;
    case "theme":
      applyTheme(d.theme as Theme);
      break;
    case "install":
      void state.install?.prompt();
      state.install = null;
      closeLayer();
      break;
    case "changes":
      openPage("changes");
      break;
    case "dismiss-changes":
      if (state.selection) markSeen(state.selection.timetable);
      render();
      break;
    case "page":
      openPage(d.page as Page);
      break;
    case "close-sheet":
    case "close-page":
      closeLayer();
      break;
    case "clear-data":
      if (confirm("Usunąć z tego urządzenia wybrane grupy, oznaczenia, notatki i ustawienia?")) {
        clearAllStored();
        location.href = location.pathname;
      }
      break;
    case "reload":
      location.reload();
      break;
  }
}

function onChange(ev: Event): void {
  const el = ev.target as HTMLInputElement;
  if (el.dataset.action === "toggle-optional" && state.draft) {
    const s = el.dataset.subject!;
    state.draft.optional = el.checked ? [...state.draft.optional, s] : state.draft.optional.filter((x) => x !== s);
    render();
  } else if (el.dataset.action === "toggle-cancelled") {
    updateMark(el.dataset.id!, { cancelled: el.checked });
    render();
  }
}

/** The note is saved as the student types, without redrawing (that would lose the cursor). */
function onInput(ev: Event): void {
  const el = ev.target as HTMLInputElement;
  if (el.dataset.action === "mark-note") updateMark(el.dataset.id!, { note: el.value });
}

function onKey(ev: KeyboardEvent): void {
  if (ev.key === "Escape" && (state.sheet || isPage(state.view))) {
    closeLayer();
    return;
  }
  if (state.view !== "plan" || state.sheet || (ev.target as HTMLElement).closest("input, textarea")) return;
  const dayMode = !wide.matches && state.mode === "day";
  if (ev.key === "ArrowLeft") dayMode ? step(-1) : stepWeek(-1);
  if (ev.key === "ArrowRight") dayMode ? step(1) : stepWeek(1);
  if ((ev.key === "Enter" || ev.key === " ") && (ev.target as HTMLElement).classList.contains("nextcard")) {
    ev.preventDefault();
    (ev.target as HTMLElement).click();
  }
}

// Swipe: left/right on the timeline changes day (or week); up on the "next classes" card opens that day.
let touch: { x: number; y: number; target: HTMLElement } | null = null;

function onTouchStart(ev: TouchEvent): void {
  const t = ev.touches[0];
  touch = { x: t.clientX, y: t.clientY, target: ev.target as HTMLElement };
}

function onTouchEnd(ev: TouchEvent): void {
  if (!touch || state.view !== "plan" || state.sheet) return;
  const t = ev.changedTouches[0];
  const dx = t.clientX - touch.x;
  const dy = t.clientY - touch.y;
  const card = touch.target.closest<HTMLElement>(".nextcard");
  const area = touch.target.closest<HTMLElement>("[data-swipe]");
  touch = null;
  if (card && dy < -40 && Math.abs(dy) > Math.abs(dx)) {
    card.click();
    return;
  }
  if (area && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (area.dataset.swipe === "day") step(dx < 0 ? 1 : -1);
    else stepWeek(dx < 0 ? 1 : -1);
  }
}

// ---------- coming back to the app ----------

/**
 * An installed app can sit in the background for days: when it comes back, check for a new version of the
 * plan (and a new check time for the status line), and move "today" on if the date has changed.
 */
async function refresh(): Promise<void> {
  state.loadedAt = Date.now();
  const today = now().date;
  if (state.view === "plan" && state.openedOn && state.openedOn !== today && state.date === state.openedOn) state.date = today;
  state.openedOn = today;
  try {
    state.index = await loadIndex();
    const id = state.selection?.timetable;
    const published = id ? state.index.timetables[id]?.published_sha256 : undefined;
    if (id && published && published !== currentVersion(id)) {
      // load first, replace after: if the download fails, the plan on screen stays
      const [tt, changes] = await Promise.all([loadTimetable(id), loadChanges(id)]);
      state.timetables.set(id, tt);
      state.changes.set(id, changes);
    }
  } catch {
    // offline: keep what we have
  }
  if (!state.sheet && state.view === "plan") render();
}

// ---------- start ----------

export async function start(el: HTMLElement): Promise<void> {
  root = el;
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  root.addEventListener("input", onInput);
  root.addEventListener("touchstart", onTouchStart, { passive: true });
  root.addEventListener("touchend", onTouchEnd, { passive: true });
  document.addEventListener("keydown", onKey);
  window.addEventListener("popstate", onPopState);
  window.addEventListener("online", () => render());
  window.addEventListener("offline", () => render());
  window.addEventListener("beforeinstallprompt", (ev) => {
    ev.preventDefault();
    state.install = ev as InstallPrompt;
    if (state.view === "plan") render();
  });
  wide.addEventListener("change", () => render());
  window.addEventListener("resize", fitDayhead);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - state.loadedAt > REFRESH_AFTER_MS) void refresh();
  });
  skeleton = root.innerHTML; // index.html's skeleton stays on screen until the first real render

  try {
    state.index = await loadIndex();
    const entries = available(state.index);
    const saved = loadSelection();
    if (saved && entries.some((e) => e.id === saved.timetable)) {
      const tt = await timetable(saved.timetable);
      saved.optional = saved.optional.filter((s) => tt.optional_subjects.includes(s));
      if (selectionComplete(tt, saved)) {
        state.selection = saved;
        saveSelection(saved);
        state.view = "plan";
        state.date = openingDate();
        state.openedOn = state.date;
      } else {
        state.draft = saved;
        state.view = "groups";
      }
    } else {
      if (saved) clearSelection();
      state.view = "picker";
    }
    // A link straight to a page (#o-projekcie, #prywatnosc, #zmiany).
    const linked = (Object.keys(PAGE_HASH) as Page[]).find((p) => location.hash === `#${PAGE_HASH[p]}`);
    if (linked && (linked !== "changes" || state.view === "plan")) {
      state.returnTo = state.view;
      if (linked === "changes") {
        state.changesNew = unseen().map((c) => c.sha256);
        markSeen(state.selection!.timetable);
      }
      state.view = linked;
    }
    render();
  } catch (err) {
    fail(err);
  }

  // Keep "now" fresh (current-time line, past classes, "finished" card).
  setInterval(() => {
    if (state.view === "plan" && !document.hidden && !state.sheet) render();
  }, 60_000);
}
