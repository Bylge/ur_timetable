// App state and events. One state object; render() redraws from it. Clicks are handled in one place
// through data-action attributes (see plan.ts and views.ts).
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
  hasStoredSelection,
  loadSeenVersion,
  saveSeenVersion,
  selectionParams,
  syncUrl,
  loadTab,
  saveTab,
  THEMES,
  type Tab,
  type Theme,
} from "./data";
import { loadTerms, newTermId, saveTerms, type Term, type TermType } from "./terms";
import { DAY_HOUR_PX, WEEK_HOUR_PX, WEEK_MAX_HOUR_PX, WEEK_MIN_HOUR_PX, menuSheet, navButtons, planScreen, termForm, termSheet, type PlanContext, type TermDraft } from "./plan";
import { endAfter, hasWeekendClasses, hourRange, myEvents, selectionComplete, validTime, weekStart, wfPlanned } from "./schedule";
import { cachedQr, qrPng, qrSvg } from "./qr";
import { newsFor, type News } from "./news";
import { VERSION } from "./version";
import { myChangeCount, recentChanges, unseenChanges } from "./changes";
import { download, icsFileName, toIcs } from "./ics";
import { groupsSummary, timetableShort } from "./labels";
import { addDays, nowInWarsaw, shortTime, weekday, type Now } from "./time";
import {
  aboutView,
  changesView,
  errorView,
  eventSheet,
  groupsView,
  hoursText,
  icsConfirmSheet,
  icsSheet,
  infoSheet,
  iosInstallSheet,
  noteText,
  pickerView,
  privacyView,
  newsPopup,
  shareSheet,
  SITE_URL,
} from "./views";

type Page = "changes" | "about" | "privacy";
type View = "loading" | "error" | "picker" | "groups" | "plan" | Page;
type Sheet =
  | { kind: "event"; id: string }
  | { kind: "info" }
  | { kind: "menu" }
  | { kind: "ics-confirm" }
  | { kind: "ics"; count: number; file: string }
  | { kind: "ios-install" }
  | { kind: "share"; withGroups: boolean }
  | { kind: "news"; version: string; news: News }
  | { kind: "term"; id: string; armed: boolean }
  | { kind: "term-form" }
  | null;

const PAGE_HASH: Record<Page, string> = { changes: "zmiany", about: "o-projekcie", privacy: "prywatnosc" };
const wide = window.matchMedia("(min-width: 900px)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const REFRESH_AFTER_MS = 5 * 60_000; // an app brought back from the background checks for a new version

/** iOS has no install prompt: there the install item explains "Do ekranu początkowego" (iPadOS reports a Mac). */
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const installed =
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

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
  tab: loadTab() ?? (window.matchMedia("(min-width: 900px)").matches ? "week" : "day"),
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
  fill: { key: "", hours: 0 }, // day view: empty hours that fill the screen below a short day (see fitDay)
  weekFit: { key: 0, px: 0 }, // phone week grid: hour height that fits the screen (see fitWeek)
  terms: loadTerms(),
  showPast: false, // Terminy: past entries unfolded
  termDraft: null as TermDraft | null, // the add/edit form
};

// The skeleton from index.html, shown until the data is ready.
let skeleton = "";

let root: HTMLElement;


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
  const anim = state.anim;
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
    const events = myEvents(cur.tt, cur.sel);
    const c: PlanContext = {
      ...cur,
      events,
      now: now(),
      at,
      date: state.date,
      hours: hourRange([...cur.tt.events, ...events]),
      withWeekend: hasWeekendClasses(cur.tt),
      anim: state.anim,
      marks: state.marks,
      unseen: unseenSummary(),
      changed: recentChanges(state.changes.get(cur.tt.id) ?? [], now().date),
      offline: !navigator.onLine,
      canInstall: Boolean(state.install) || (ios && !installed),
      theme: state.theme,
      tab: state.tab,
      wide: wide.matches,
      terms: state.terms,
      showPast: state.showPast,
      weekHourPx: state.weekFit.key === window.innerHeight ? state.weekFit.px : WEEK_HOUR_PX,
      fillHours: state.fill.key === fillKey() ? state.fill.hours : 0,
    };
    html = planScreen(c);
    pillContext = c;
    const s = state.sheet;
    if (s?.kind === "event") {
      const e = events.find((x) => x.id === s.id) ?? cur.tt.events.find((x) => x.id === s.id);
      const wf = wfPlanned(cur.tt);
      if (e) html += eventSheet(e, c.now, state.marks[e.id], cur.entry.url, wf ? { own: cur.sel.wf, planned: wf.start } : null, c.changed.get(e.id));
    } else if (s?.kind === "info") html += infoSheet(cur.entry, cur.tt, at);
    else if (s?.kind === "menu") html += menuSheet(c);
    else if (s?.kind === "ics-confirm") html += icsConfirmSheet(icsSummary());
    else if (s?.kind === "ics") html += icsSheet(s.count, s.file);
    else if (s?.kind === "ios-install") html += iosInstallSheet();
    else if (s?.kind === "share") html += renderShare(s.withGroups);
    else if (s?.kind === "news") html += newsPopup(s.version, s.news);
    else if (s?.kind === "term") {
      const t = state.terms.find((x) => x.id === s.id);
      if (t) html += termSheet(t, c, s.armed);
    } else if (s?.kind === "term-form" && state.termDraft) html += termForm(state.termDraft, c);
  }
  const pills = pillPositions();
  root.innerHTML = html;
  slidePills(pills);
  updatePill(state.view === "plan" ? pillContext : null);
  pillContext = null;
  state.anim = "";
  if (state.sheetEnter) root.querySelector(".sheet-layer")?.classList.add("enter");
  state.sheetEnter = false;
  document.documentElement.classList.toggle("sheet-open", Boolean(state.sheet));
  fitTitle();
  if (state.sheetEnter || !state.sheet) root.querySelector<HTMLElement>(".sheet, .news-card")?.focus();
  // at most one second pass: a measurement that keeps changing (a layout bug) mustn't redraw forever
  if (!refitting && (fitDay() || fitWeek())) {
    state.anim = anim; // the second pass replaces the first before it's painted: keep its transition
    refitting = true;
    try {
      render();
    } finally {
      refitting = false;
    }
  }
}

/** Set during the second, fitted pass of render(). */
let refitting = false;

/** Which day view the measured fill belongs to (another day or screen size is measured again). */
function fillKey(): string {
  return `${state.date}|${window.innerHeight}`;
}

/**
 * Phone day view: a short day leaves empty space under its timeline. Add whole empty hours after the last class
 * until the timeline reaches the bottom bar, never past it (that would make the page scroll for nothing).
 * Returns true when the hours changed and the view needs drawing again.
 */
function fitDay(): boolean {
  const timeline = root.querySelector<HTMLElement>(".day .timeline");
  if (!timeline || state.view !== "plan" || state.tab !== "day") return false;
  const key = fillKey();
  const current = state.fill.key === key ? state.fill.hours : 0;
  const bottom = timeline.getBoundingClientRect().bottom + window.scrollY;
  const free = bottomLimit() - bottom;
  let hours = current;
  if (free >= DAY_HOUR_PX) hours += Math.floor(free / DAY_HOUR_PX);
  else if (free < 0 && current > 0) hours = Math.max(0, current - Math.ceil(-free / DAY_HOUR_PX));
  const changed = state.fill.key !== key || hours !== current;
  state.fill = { key, hours };
  return changed && hours !== current;
}

/**
 * Phone week grid: the hours are as tall as fits above the pill. A week that sticks out a little gets shorter hours
 * (down to WEEK_MIN_HOUR_PX; beyond that it scrolls); on a tall phone they grow to fill the screen (up to
 * WEEK_MAX_HOUR_PX). Returns true when the height changed and the view needs drawing again.
 */
function fitWeek(): boolean {
  const body = root.querySelector<HTMLElement>(".week-compact .wk-body");
  const axis = body?.querySelector<HTMLElement>(".axis");
  if (!body || !axis || state.view !== "plan" || state.tab !== "week" || wide.matches) return false;
  const key = window.innerHeight;
  const current = state.weekFit.key === key ? state.weekFit.px : WEEK_HOUR_PX;
  const hours = Math.round(axis.offsetHeight / current);
  const bottom = body.getBoundingClientRect().bottom + window.scrollY;
  const free = bottomLimit() - bottom; // < 0: it scrolls
  const wanted = Math.floor(current + free / hours);
  const px = Math.max(WEEK_MIN_HOUR_PX, Math.min(WEEK_MAX_HOUR_PX, wanted));
  state.weekFit = { key, px };
  return px !== current;
}

// ---------- the pill (phone): made once, kept between redraws ----------
// Rebuilding it on every redraw (a new day, the menu, the minute's update) made it flicker; now only its chosen
// button and badge change, and the highlight moves only when the view does.

let pillHost: HTMLElement;
let pillContext: PlanContext | null = null; // the context of the redraw in progress
let pillKey = "";

function updatePill(c: PlanContext | null): void {
  if (!c || c.wide) {
    pillHost.innerHTML = "";
    pillKey = "";
    return;
  }
  const markup = navButtons(c);
  if (markup === pillKey) return; // nothing changed: leave it alone
  const first = !pillHost.firstElementChild;
  if (first) pillHost.innerHTML = `<nav class="pill" aria-label="Widok">${markup}</nav>`;
  else {
    const nav = pillHost.firstElementChild!;
    const ind = nav.querySelector(".ind")!;
    nav.innerHTML = markup;
    nav.querySelector(".ind")!.replaceWith(ind); // the same highlight element, so it can slide
  }
  pillKey = markup;
  const ind = pillHost.querySelector<HTMLElement>(".ind")!;
  const on = pillHost.querySelector<HTMLElement>("button.on")!;
  if (first || reducedMotion.matches) ind.style.transition = "none";
  ind.style.transform = `translateX(${on.offsetLeft}px)`;
  ind.style.width = `${on.offsetWidth}px`;
  if (first) {
    void ind.offsetWidth;
    ind.style.transition = "";
  }
}

// ---------- the switch in the header (computer): its highlight slides to the chosen view ----------

type PillPos = Map<string, { left: number; width: number }>;

/** Where the highlight sits in the pill (phone) and the header switch (computer), before a redraw. */
function pillPositions(): PillPos {
  const out: PillPos = new Map();
  for (const kind of ["navseg"]) {
    const on = root?.querySelector<HTMLElement>(`.${kind} button.on`);
    if (on) out.set(kind, { left: on.offsetLeft, width: on.offsetWidth });
  }
  return out;
}

/**
 * After a redraw the highlight is a new element: place it without animation where it was (or, if the view didn't
 * change, where it belongs), and only then let it slide to the chosen view. Placing it with the transition on would
 * slide it in from the first button on every redraw (opening the menu, a new day, the minute's update).
 */
function slidePills(before: PillPos): void {
  for (const kind of ["navseg"]) {
    const ind = root.querySelector<HTMLElement>(`.${kind} .ind`);
    const on = root.querySelector<HTMLElement>(`.${kind} button.on`);
    if (!ind || !on) continue;
    const to = { left: on.offsetLeft, width: on.offsetWidth };
    const from = before.get(kind) ?? to;
    ind.style.transition = "none";
    ind.style.transform = `translateX(${from.left}px)`;
    ind.style.width = `${from.width}px`;
    if (from.left === to.left && from.width === to.width) continue; // stays: no transition at all
    if (reducedMotion.matches) {
      ind.style.transform = `translateX(${to.left}px)`;
      ind.style.width = `${to.width}px`;
      continue;
    }
    void ind.offsetWidth; // the start is applied before the transition comes back
    ind.style.transition = "";
    ind.style.transform = `translateX(${to.left}px)`;
    ind.style.width = `${to.width}px`;
  }
}

/** Where the plan may end without scrolling: above the pill (phone), the bottom of the window (computer). */
function bottomLimit(): number {
  const pill = pillHost.querySelector<HTMLElement>(".pill");
  return pill ? pill.getBoundingClientRect().top - 14 : window.innerHeight - 24;
}

/** The big date stays on one line: "Poniedziałek, 30 listopada" becomes "Pon., 30 listopada" when it doesn't fit. */
function fitTitle(): void {
  const title = root.querySelector<HTMLElement>(".top .title");
  if (!title || !title.querySelector(".wd-full")) return;
  title.classList.remove("tight");
  if (title.scrollWidth > title.clientWidth + 1) title.classList.add("tight");
}

// ---------- theme ----------

function applyTheme(theme: Theme): void {
  state.theme = theme;
  saveTheme(theme);
  const html = document.documentElement;
  if (theme === "auto") delete html.dataset.theme;
  else html.dataset.theme = theme;
  // the phone's status bar colour follows the page background
  const bg = THEMES.find((t) => t.id === theme)?.bg;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.content = bg || (m.media.includes("dark") ? "#0f1115" : "#f5f6f8");
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

/** Set when the app itself goes back in history (after "Pokaż plan"): the screen is already the right one. */
let ownBack = false;

function onPopState(): void {
  if (ownBack) {
    ownBack = false;
    if (state.selection && state.view === "plan") syncUrl(state.selection);
    render();
    return;
  }
  void closeTop();
}

/** Leave a screen that has its own history entry without showing anything else (the caller sets the view). */
function dropLayer(): void {
  if (!history.state?.layer) return;
  ownBack = true;
  history.back();
}

/** "Twoje grupy" and the plan picker are history entries, so the back gesture returns from them. */
function openScreen(view: "groups" | "picker"): void {
  if (state.sheet) {
    // the sheet's entry becomes the screen's
    state.sheet = null;
    history.replaceState({ layer: true }, "", location.href);
  } else pushLayer();
  state.view = view;
  render();
  window.scrollTo(0, 0);
}

async function closeTop(): Promise<void> {
  if (state.sheet) {
    // closed right away (a tap during the animation already sees no sheet); only the old element animates out
    state.sheet = null;
    await sheetOut();
  } else if (isPage(state.view)) leavePage();
  else if (state.view === "picker") state.view = state.draft ? "groups" : current() ? "plan" : "picker";
  else if (state.view === "groups") state.view = current() ? "plan" : "picker";
  if (state.selection && state.view === "plan") syncUrl(state.selection);
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

/** The next (or previous) day the picker shows: past Friday to Monday when there are no weekend classes. */
function nextDay(date: string, direction: 1 | -1): string {
  const cur = current();
  const withWeekend = cur ? hasWeekendClasses(cur.tt) : false;
  let d = addDays(date, direction);
  while (!withWeekend && weekday(d) >= 5) d = addDays(d, direction);
  return d;
}

function stepDay(direction: 1 | -1): void {
  go(nextDay(state.date, direction), direction > 0 ? "anim-left" : "anim-right");
}

/** Week view: the week before or after. */
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

function setTab(tab: Tab, anim = "anim-fade"): void {
  if (state.tab === tab) {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
    return;
  }
  state.tab = tab;
  saveTab(tab);
  state.anim = anim;
  render();
  window.scrollTo(0, 0);
}

/** A day from the week, a change or an entry: show it in the day view. */
function showDay(date: string): void {
  state.date = date;
  if (state.tab !== "day") {
    state.tab = "day";
    saveTab("day");
  }
  state.anim = "anim-fade";
  render();
  window.scrollTo(0, 0);
}

// ---------- Terminy ----------

function openTermForm(term: Term | null): void {
  const today = now().date;
  state.termDraft = term
    ? { id: term.id, type: term.type, subject: term.subject, custom: !myEventTitles().includes(term.subject), date: term.date, time: term.time, room: term.room, note: term.note }
    : { id: null, type: "kolokwium", subject: "", custom: false, date: state.date >= today ? state.date : today, time: "", room: "", note: "" };
  if (state.sheet) {
    state.sheet = { kind: "term-form" };
    render();
  } else openSheet({ kind: "term-form" });
}

function myEventTitles(): string[] {
  const cur = current();
  return cur ? [...new Set(myEvents(cur.tt, cur.sel).map((e) => e.title))] : [];
}

function saveTermDraft(): void {
  const d = state.termDraft;
  if (!d || !d.date || !d.subject.trim()) return;
  const term: Term = { id: d.id ?? newTermId(), type: d.type, subject: d.subject.trim(), date: d.date, time: d.time, room: d.room.trim(), note: d.note.trim() };
  state.terms = d.id ? state.terms.map((t) => (t.id === d.id ? term : t)) : [...state.terms, term];
  saveTerms(state.terms);
  state.termDraft = null;
  closeLayer();
}

function deleteTerm(id: string): void {
  if (state.sheet?.kind !== "term") return;
  if (!state.sheet.armed) {
    state.sheet = { ...state.sheet, armed: true }; // a second tap deletes
    render();
    return;
  }
  state.terms = state.terms.filter((t) => t.id !== id);
  saveTerms(state.terms);
  closeLayer();
}

/** The save button follows the form without redrawing it (that would lose the cursor in a field). */
function updateTermSave(): void {
  const d = state.termDraft;
  const button = root.querySelector<HTMLButtonElement>(".tf-save");
  if (d && button) button.disabled = !(d.date && d.subject.trim());
}

async function pickTimetable(id: string): Promise<void> {
  try {
    await timetable(id);
    const keep = state.selection?.timetable === id ? state.selection : null;
    state.draft = keep ? structuredClone(keep) : { timetable: id, groups: {}, optional: [] };
    if (history.state?.layer) {
      // picker opened from "Twoje grupy": back to that entry, showing the groups of the picked plan
      dropLayer();
      state.view = "groups";
      render();
    } else openScreen("groups"); // first visit: the picker is the start, the groups screen goes on top
    window.scrollTo(0, 0);
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
  if (state.tab === "terms") state.tab = wide.matches ? "week" : "day";
  dropLayer(); // the screen's history entry is used up: back from the plan leaves the app, as on any first screen
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

// ---------- sharing ----------

/** The public address, alone or with the student's choice (?t=…&gr=…; kept readable, so the QR code stays small). */
function shareUrl(withGroups: boolean): string {
  const cur = current();
  if (!withGroups || !cur) return SITE_URL;
  const query = selectionParams(cur.sel).toString().replace(/%2F/gi, "/").replace(/%3A/gi, ":").replace(/%2C/gi, ",");
  return `${SITE_URL}?${query}`;
}

let qrFailed = false;

function renderShare(withGroups: boolean): string {
  const cur = current()!;
  const url = shareUrl(withGroups);
  const qr = cachedQr(url);
  if (!qr && !qrFailed) {
    qrSvg(url).then(
      () => state.sheet?.kind === "share" && render(),
      () => {
        qrFailed = true; // offline before the generator was ever loaded: the link buttons still work
        if (state.sheet?.kind === "share") render();
      },
    );
  }
  const wf = cur.sel.wf ? `, WF od ${shortTime(cur.sel.wf)}` : "";
  return shareSheet({
    withGroups,
    url,
    groups: groupsSummary(cur.tt, cur.sel) + wf,
    qr: qr ?? (qrFailed ? `<span class="qr-wait">Kod QR pojawi się po połączeniu z internetem.</span>` : null),
    canShare: typeof navigator.share === "function",
  });
}

async function shareLink(): Promise<void> {
  if (state.sheet?.kind !== "share") return;
  try {
    await navigator.share({ title: "Plan zajęć UR (nieoficjalny)", url: shareUrl(state.sheet.withGroups) });
  } catch {
    // closed without sharing
  }
}

async function copyLink(button: HTMLElement): Promise<void> {
  if (state.sheet?.kind !== "share") return;
  const url = shareUrl(state.sheet.withGroups);
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // no clipboard API (plain http, older browsers): the old way
    const area = document.createElement("textarea");
    area.value = url;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  button.textContent = "Skopiowano ✓";
}

async function downloadQr(): Promise<void> {
  if (state.sheet?.kind !== "share") return;
  try {
    const a = document.createElement("a");
    a.href = await qrPng(shareUrl(state.sheet.withGroups));
    a.download = state.sheet.withGroups ? "plan-zajec-ur-moje-grupy-qr.png" : "plan-zajec-ur-qr.png";
    document.body.append(a);
    a.click();
    a.remove();
  } catch {
    // offline before the generator was loaded
  }
}

// ---------- WF: the student's own hour ----------

/** Set (or clear, for the PDF's time) the WF start on the groups draft or on the saved choice. */
function setWf(target: string | undefined, value: string, planned: string): string | undefined {
  const own = validTime(value) && value !== planned ? value : undefined;
  const sel = target === "draft" ? state.draft : state.selection;
  if (!sel) return own;
  if (own) sel.wf = own;
  else delete sel.wf;
  if (target !== "draft") saveSelection(sel);
  return own;
}

/**
 * While the student edits the time, update the text around the field instead of redrawing (a redraw would
 * throw away a half-typed time on a computer). The plan behind the sheet is redrawn when the sheet closes.
 */
function showWf(input: HTMLInputElement, own: string | undefined): void {
  const start = own ?? input.dataset.planned!;
  if (!own && input.value !== start) input.value = start;
  const row = input.closest(".wf-row")!;
  row.querySelector(".wf-end")!.textContent = `do ${shortTime(endAfter(start, Number(input.dataset.minutes)))}`;
  row.querySelector<HTMLElement>(".wf-reset")!.hidden = !own;
  const cur = current();
  const hours = root.querySelector("[data-wf-hours]");
  if (cur && hours && state.sheet?.kind === "event") {
    const id = state.sheet.id;
    const e = myEvents(cur.tt, cur.sel).find((x) => x.id === id);
    if (e) hours.textContent = hoursText(e.start, e.end, e.planned);
  }
}

/**
 * "Co nowego" once per version, only to students who used the site before (a first visit has nothing to compare).
 * `?nowosci` in the link shows it anyway (for checking how it looks).
 */
function showNews(returning: boolean): void {
  const forced = new URLSearchParams(location.search).has("nowosci");
  const seen = loadSeenVersion();
  saveSeenVersion(VERSION);
  if (state.view !== "plan" || !(forced || returning)) return;
  const found = newsFor(VERSION, seen, forced);
  if (found) openSheet({ kind: "news", ...found });
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
      state.draft = structuredClone(state.selection!);
      openScreen("groups");
      break;
    case "picker":
      openScreen("picker");
      break;
    case "back":
      if (history.state?.layer) closeLayer();
      else {
        if (state.view === "picker" && state.draft) state.view = "groups";
        else state.view = current() ? "plan" : "picker";
        render();
      }
      break;
    case "tab":
      setTab(d.tab as Tab);
      break;
    case "prev-day":
      stepDay(-1);
      break;
    case "next-day":
      stepDay(1);
      break;
    case "prev-week":
      stepWeek(-1);
      break;
    case "next-week":
      stepWeek(1);
      break;
    case "pick-day":
      if (state.tab !== "day") showDay(d.date!);
      else go(d.date!, d.date! > state.date ? "anim-left" : d.date! < state.date ? "anim-right" : "");
      break;
    case "today":
      go(openingDate(), "anim-fade");
      break;
    case "goto-day":
      // from the Zmiany page: back to the plan on that day
      state.tab = "day";
      saveTab("day");
      state.date = d.date!;
      state.anim = "anim-fade";
      closeLayer();
      break;
    case "term":
      openSheet({ kind: "term", id: d.id!, armed: false });
      break;
    case "term-new":
      openTermForm(null);
      break;
    case "term-edit": {
      const t = state.terms.find((x) => x.id === d.id);
      if (t) openTermForm(t);
      break;
    }
    case "term-delete":
      deleteTerm(d.id!);
      break;
    case "term-save":
      saveTermDraft();
      break;
    case "term-type":
      if (state.termDraft) state.termDraft.type = d.type as TermType;
      render();
      break;
    case "term-subject":
      if (state.termDraft) {
        state.termDraft.custom = !d.subject;
        state.termDraft.subject = d.subject ?? "";
      }
      render();
      if (!d.subject) root.querySelector<HTMLInputElement>(".tf-custom")?.focus();
      break;
    case "term-goto":
      // from an entry's details: its day in the plan
      state.tab = "day";
      saveTab("day");
      state.date = d.date!;
      state.anim = "anim-fade";
      closeLayer();
      break;
    case "toggle-past":
      state.showPast = !state.showPast;
      render();
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
    case "share":
      if (state.sheet) {
        state.sheet = { kind: "share", withGroups: false };
        render();
      } else openSheet({ kind: "share", withGroups: false });
      break;
    case "share-mode":
      state.sheet = { kind: "share", withGroups: d.groups === "true" };
      render();
      break;
    case "share-link":
      void shareLink();
      break;
    case "copy-link":
      void copyLink(el);
      break;
    case "qr-download":
      void downloadQr();
      break;
    case "wf-reset": {
      const input = root.querySelector<HTMLInputElement>("#wf-start");
      if (input) showWf(input, setWf(d.target, "", input.dataset.planned!));
      break;
    }
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
      if (state.install) {
        void state.install.prompt();
        state.install = null;
        closeLayer();
      } else if (state.sheet) {
        state.sheet = { kind: "ios-install" };
        render();
      } else openSheet({ kind: "ios-install" });
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
      if (confirm("Usunąć z tego urządzenia wybrane grupy, oznaczenia, notatki, terminy i ustawienia?")) {
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
  } else if (el.dataset.action === "wf-start") {
    showWf(el, setWf(el.dataset.target, el.value, el.dataset.planned!));
  } else if (el.dataset.action === "toggle-cancelled") {
    updateMark(el.dataset.id!, { cancelled: el.checked });
    render();
  }
}

/** The note is saved as the student types, without redrawing (that would lose the cursor). */
function onInput(ev: Event): void {
  const el = ev.target as HTMLInputElement;
  if (el.dataset.action === "mark-note") updateMark(el.dataset.id!, { note: el.value });
  const field = el.dataset.field as keyof TermDraft | undefined;
  if (field && state.termDraft && field in state.termDraft) {
    (state.termDraft as unknown as Record<string, string>)[field] = el.value;
    updateTermSave();
  }
}

function onKey(ev: KeyboardEvent): void {
  if (ev.key === "Escape" && (state.sheet || isPage(state.view) || ((state.view === "groups" || state.view === "picker") && history.state?.layer))) {
    closeLayer();
    return;
  }
  if (state.view !== "plan" || state.sheet || state.tab === "terms" || (ev.target as HTMLElement).closest("input, textarea")) return;
  if (ev.key === "ArrowLeft") state.tab === "day" ? stepDay(-1) : stepWeek(-1);
  if (ev.key === "ArrowRight") state.tab === "day" ? stepDay(1) : stepWeek(1);
}

// Swipe anywhere on the plan screen: left/right changes the day (or week). The plan follows the finger (a little
// slower, so it feels elastic); let go early and it bounces back, far enough and the next day slides in.
const SWIPE_PX = 60;
let touch: { x: number; y: number; target: HTMLElement; axis: "" | "x" | "y"; el: HTMLElement | null } | null = null;

function onTouchStart(ev: TouchEvent): void {
  const t = ev.touches[0];
  const target = ev.target as HTMLElement;
  const el = target.closest("[data-swipe]") ? root.querySelector<HTMLElement>(".content .day, .content .week") : null;
  touch = { x: t.clientX, y: t.clientY, target, axis: "", el };
}

function onTouchMove(ev: TouchEvent): void {
  if (!touch?.el || state.sheet) return;
  const t = ev.touches[0];
  const dx = t.clientX - touch.x;
  const dy = t.clientY - touch.y;
  if (!touch.axis) {
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) touch.axis = "x";
    else if (Math.abs(dy) > 8) touch.axis = "y";
  }
  if (touch.axis !== "x" || reducedMotion.matches) return;
  // elastic: follows at 45 %, and less the further it goes
  const pull = Math.sign(dx) * Math.min(Math.abs(dx) * 0.45, 40 + Math.abs(dx) * 0.15);
  touch.el.style.transition = "none";
  touch.el.style.transform = `translateX(${pull}px)`;
}

function onTouchEnd(ev: TouchEvent): void {
  if (!touch || state.view !== "plan" || state.sheet) return;
  const t = ev.changedTouches[0];
  const dx = t.clientX - touch.x;
  const dy = t.clientY - touch.y;
  const area = touch.target.closest<HTMLElement>("[data-swipe]");
  const { el } = touch;
  // the direction, if the moves didn't settle it (a quick flick can end before a move arrives)
  const axis = touch.axis || (Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y");
  touch = null;
  if (area && axis === "x" && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
    const direction = dx < 0 ? 1 : -1;
    const next = () => (area.dataset.swipe === "day" ? stepDay(direction) : stepWeek(direction));
    if (!el || reducedMotion.matches) return next();
    // the old day keeps going the way the finger went and fades, then the new one comes in from the other side
    el.style.transition = "transform .16s ease-in, opacity .16s ease-in";
    el.style.transform = `translateX(${-direction * 90}px)`;
    el.style.opacity = "0";
    setTimeout(next, 150);
  } else if (el) {
    // not far enough: back into place with a small overshoot
    el.style.transition = "transform .42s cubic-bezier(.2, 1.5, .4, 1)";
    el.style.transform = "";
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
  pillHost = document.createElement("div");
  document.body.append(pillHost);
  pillHost.addEventListener("click", onClick);
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  root.addEventListener("input", onInput);
  root.addEventListener("touchstart", onTouchStart, { passive: true });
  root.addEventListener("touchmove", onTouchMove, { passive: true });
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
  window.addEventListener("resize", () => {
    fitTitle();
    if (fitDay() || fitWeek()) render();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - state.loadedAt > REFRESH_AFTER_MS) void refresh();
  });
  skeleton = root.innerHTML; // index.html's skeleton stays on screen until the first real render
  const returning = hasStoredSelection(); // read before this visit saves a choice

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
    showNews(returning);
  } catch (err) {
    fail(err);
  }

  // Keep "now" fresh (current-time line, past classes, "finished" card).
  setInterval(() => {
    if (state.view === "plan" && !document.hidden && !state.sheet) render();
  }, 60_000);
}
