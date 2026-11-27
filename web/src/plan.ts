// The plan screen (0.7.0): a sticky header (status line, the date or month big, the day picker or the week's day
// names), the view under it (Dzień, Tydzień or Terminy), and the pill at the bottom to switch views (on a
// computer the switch sits in the header instead). Plus the menu and the Terminy sheets.
//
// Shared pieces (class blocks, sheets, pages) are in views.ts; this file only lays them out.

import type { ClassEvent, IndexEntry, Mark, Selection, Timetable } from "./types";
import type { RecentChange } from "./changes";
import { THEMES, type Tab, type Theme } from "./data";
import { eventsOn, holidayOn, nextClassDay, notesOn, sentenceCase, weekDays, weekStart } from "./schedule";
import { DAY_SHORT, addDays, longDate, numericDate, shortTime, toMinutes, weekday, weekdayShort, type Now } from "./time";
import { groupsShort, groupsSummary, parseId, plural, programmeName, shortTitle, sourceStatus, timetableShort } from "./labels";
import { TERM_LABEL, TERM_TYPES, pastTerms, soonCount, termsOn, untilText, upcomingTerms, type Term, type TermType } from "./terms";
import { VERSION } from "./version";
import { CONTACT_EMAIL, ICON, axis, dayColumn, esc, problemBanner, sheet, stripeColor, type AxisOptions } from "./views";

/** Day view: height of an hour (app.ts fills a short day to the screen with it). */
export const DAY_HOUR_PX = 54;
/** Phone week grid: usual height of an hour; it shrinks (to the least) or grows (to the most) to fill the screen. */
export const WEEK_HOUR_PX = 42;
export const WEEK_MIN_HOUR_PX = 32;
export const WEEK_MAX_HOUR_PX = 58;
const DESK_HOUR_PX = 54;

export interface PlanContext {
  tt: Timetable;
  entry: IndexEntry;
  sel: Selection;
  events: ClassEvent[]; // the student's classes
  now: Now;
  at: Date;
  date: string; // the day shown (day view), or a day in the week shown (week view)
  tab: Tab;
  wide: boolean; // computer layout (≥ 900 px)
  hours: { from: number; to: number };
  withWeekend: boolean;
  anim: string; // css class for the transition
  marks: Record<string, Mark>;
  unseen: { count: number; updated: string | null } | null; // changes in the student's classes since the last visit
  changed: Map<string, RecentChange>; // classes added or changed in recent updates (marked in the plan)
  terms: Term[];
  showPast: boolean; // Terminy: past entries unfolded
  offline: boolean;
  canInstall: boolean;
  theme: Theme;
  weekHourPx: number; // phone week grid, measured to fit (app.ts)
  fillHours: number; // day view: empty hours after the last class so the timeline reaches the bottom (app.ts)
}

const SVG = {
  today: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>',
  day: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 14h8M8 17h5"/></svg>',
  week: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M9 10v10M14.5 10v10"/></svg>',
  terms: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 12.5l2 2 3.5-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  empty:
    '<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="22" y="26" width="76" height="72" rx="12" fill="currentColor" fill-opacity=".08"/><rect x="22" y="26" width="76" height="72" rx="12"/><path d="M22 46h76M42 18v16M78 18v16"/><path d="M45 72l10 10 20-22" stroke-width="3"/><circle cx="96" cy="94" r="14" fill="var(--bg)"/><path d="M96 87v14M89 94h14" stroke-width="2.6"/></svg>',
};

const MONTHS = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
const month = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Each subject's colour as the plan shows it (the first one; lectures and classes can differ in the PDF). */
function subjectColors(c: PlanContext): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of c.tt.events) if (!map.has(e.title)) map.set(e.title, stripeColor(e.color));
  return map;
}

/** The subjects the student has, for the Terminy form: their classes and lectures (not one-off meetings), A–Z. */
export function mySubjects(events: ClassEvent[]): string[] {
  return [...new Set(events.filter((e) => e.kind !== "other").map((e) => e.title))].sort((a, b) => a.localeCompare(b, "pl"));
}

// ---------- header ----------

/** The small line on top: status dot, the name, the plan; tapping it opens "Skąd jest ten plan?". */
function kicker(c: PlanContext): string {
  const s = sourceStatus(c.entry, c.at);
  const level = c.offline ? "offline" : s.level;
  const p = parseId(c.tt.id);
  const plan = p ? `${programmeName(p.programme)}, rok ${p.year}` : timetableShort(c.tt.id);
  const label = `${c.offline ? "Offline. " : ""}${s.line}. Informacje o źródle planu`;
  return `<button class="kicker status-${level}" data-action="info" aria-label="${esc(label)}">
      <i class="dot" aria-hidden="true"></i><span class="kick-text">Plan UR · nieoficjalny · ${esc(plan)}</span><span class="demo-pill">demo</span></button>`;
}

/** Back to today (day view on another day) or to this week (week view on another week): a small calendar. */
function todayButton(c: PlanContext): string {
  const away =
    (c.tab === "day" && c.date !== c.now.date) ||
    (c.tab === "week" && weekStart(c.date, c.withWeekend) !== weekStart(c.now.date, c.withWeekend));
  if (!away) return "";
  const label = c.tab === "day" ? "Wróć do dziś" : "Wróć do tego tygodnia";
  return `<button class="iconbtn today-btn" data-action="today" aria-label="${label}" title="${label}">${SVG.today}<b>${Number(c.now.date.slice(8))}</b></button>`;
}

export function navButtons(c: PlanContext): string {
  const soon = soonCount(c.terms, c.now.date);
  const b = (tab: Tab, icon: string, label: string, extra = "") =>
    `<button class="${c.tab === tab ? "on" : ""}" data-action="tab" data-tab="${tab}" aria-pressed="${c.tab === tab}">${icon}<span>${label}</span>${extra}</button>`;
  // .ind: the highlight behind the chosen view; app.ts slides it from the old one to the new one
  return (
    '<span class="ind" aria-hidden="true"></span>' +
    b("day", SVG.day, "Dzień") +
    b("week", SVG.week, "Tydzień") +
    b("terms", SVG.terms, "Terminy", soon ? `<span class="badge" aria-label="${esc(plural(soon, "termin", "terminy", "terminów"))} w tym tygodniu">${soon}</span>` : "")
  );
}

function topRow(c: PlanContext): string {
  const menuLabel = `Menu${c.unseen ? " (są nowe zmiany)" : ""}`;
  return `<div class="top-row">${kicker(c)}${todayButton(c)}${c.wide ? `<nav class="navseg" aria-label="Widok">${navButtons(c)}</nav>` : ""}
    <button class="iconbtn menubtn${c.unseen ? " has-badge" : ""}" data-action="menu" aria-label="${menuLabel}">${ICON.menu}</button></div>`;
}

/** "Poniedziałek, 30 listopada", with "Pon." in reserve for when it doesn't fit (app.ts measures). */
function dayTitle(date: string): string {
  const [day, rest] = longDate(date).split(", ");
  const short = DAY_SHORT[weekday(date)].toLowerCase();
  return `<h1 class="title" aria-label="${esc(cap(longDate(date)))}"><span class="wd-full">${esc(cap(day))}</span><span class="wd-short">${esc(cap(short))}.</span>, ${esc(rest)}</h1>`;
}

/** "Listopad 2026", "Listopad – Grudzień 2026" for a week across two months. */
function weekTitle(days: string[]): string {
  const [first, last] = [days[0], days[days.length - 1]];
  const name = month(first) === month(last) ? month(first) : `${month(first)} – ${month(last)}`;
  return `<h1 class="title">${esc(name)} <small>${last.slice(0, 4)}</small></h1>`;
}

function picker(c: PlanContext): string {
  const tabs = weekDays(c.date, c.withWeekend)
    .map((d) => {
      const has = eventsOn(c.events, d).length > 0;
      const terms = termsOn(c.terms, d).length > 0;
      const cls = ["daytab", d === c.date && "on", d === c.now.date && "today", !has && "free"].filter(Boolean).join(" ");
      return `<button class="${cls}" data-action="pick-day" data-date="${d}" aria-pressed="${d === c.date}" aria-label="${esc(longDate(d))}${has ? "" : ", brak zajęć"}${terms ? ", termin" : ""}">
        <span class="dt-name">${DAY_SHORT[weekday(d)]}</span><span class="dt-num">${Number(d.slice(8))}</span>${terms ? '<i class="term-dot" aria-hidden="true"></i>' : ""}</button>`;
    })
    .join("");
  // the arrows go a day at a time (past Friday into the next week); the week view's arrows go a week
  return `<nav class="picker" aria-label="Dni tygodnia"><button class="iconbtn" data-action="prev-day" aria-label="Poprzedni dzień">${ICON.left}</button>
    <div class="daytabs">${tabs}</div><button class="iconbtn" data-action="next-day" aria-label="Następny dzień">${ICON.right}</button></nav>`;
}

/** Today, once its classes are over (or on a free day): the next day with classes, small, under the picker. */
function nextCard(c: PlanContext): string {
  if (c.date !== c.now.date) return "";
  const left = eventsOn(c.events, c.now.date).filter((e) => toMinutes(e.end) > c.now.minutes);
  if (left.length) return "";
  const day = nextClassDay(c.events, c.now.date);
  if (!day) return "";
  const list = eventsOn(c.events, day).filter((e) => !c.marks[e.id]?.cancelled);
  const when = `${weekdayShort(day)} ${numericDate(day).slice(0, 5)}`;
  const rows = list
    .slice(0, 2)
    .map(
      (e) => `<span class="nc-row"><i style="--c:${esc(stripeColor(e.color))}"></i><b>${esc(shortTime(e.start))}</b><span>${esc(shortTitle(e.title))}</span><em>${esc(e.room ?? "")}</em></span>`,
    )
    .join("");
  const more = list.length > 2 ? `<span class="nc-more">+ ${list.length - 2} więcej</span>` : "";
  return `<button class="next-card" data-action="pick-day" data-date="${day}" aria-label="Następne zajęcia: ${esc(longDate(day))}. Pokaż ten dzień">
    <span class="nc-label">Następne zajęcia · ${esc(when)}</span>${rows}${more}<span class="nc-go" aria-hidden="true">${SVG.chev}</span></button>`;
}

/** The week's day names in the header (they stay on top while the week scrolls), arrows at the sides. */
function weekHeads(c: PlanContext, days: string[]): string {
  const withTerms = c.terms.length > 0; // a row for entries, always there once the student has any (no jumping)
  const heads = days
    .map((d) => {
      const today = d === c.now.date;
      const list = termsOn(c.terms, d);
      const term = withTerms
        ? `<span class="wk-term${list.length ? ` t-${list[0].type}` : ""}">${
            list.length ? esc(list.length > 1 ? `${list.length} terminy` : TERM_LABEL[list[0].type]) : ""
          }</span>`
        : "";
      const name = c.wide ? cap(longDate(d).split(",")[0]) : DAY_SHORT[weekday(d)];
      const num = c.wide ? numericDate(d).slice(0, 5) : String(Number(d.slice(8)));
      return `<button class="wk-head${today ? " today" : ""}${d < c.now.date ? " gone" : ""}" data-action="pick-day" data-date="${d}" aria-label="${esc(longDate(d))}${list.length ? `, ${list.length} ${list.length > 1 ? "terminy" : "termin"}` : ""}">
        <span class="wk-day">${esc(name)}</span><span class="wk-num">${esc(num)}</span>${term}</button>`;
    })
    .join("");
  return `<div class="wk-heads" style="--days:${days.length}">
    <button class="wk-arrow" data-action="prev-week" aria-label="Poprzedni tydzień">${ICON.left}</button>${heads}
    <button class="wk-arrow wk-arrow-r" data-action="next-week" aria-label="Następny tydzień">${ICON.right}</button></div>`;
}

function header(c: PlanContext): string {
  let main = "";
  if (c.tab === "day") main = dayTitle(c.date) + picker(c) + nextCard(c);
  else if (c.tab === "week") {
    const days = weekDays(c.date, c.withWeekend);
    main = weekTitle(days) + weekHeads(c, days);
  } else main = `<div class="title-row"><h1 class="title">Terminy</h1>${c.terms.length ? addButton() : ""}</div>`;
  return `<header class="top"><div class="wrap">${topRow(c)}${main}</div></header>`;
}

function addButton(label = "Dodaj"): string {
  return `<button class="add-btn" data-action="term-new">${SVG.plus}<span>${label}</span></button>`;
}

// ---------- banners ----------

/** Shown when the timetable changed (in the student's classes) since their last visit. */
function changesBanner(c: PlanContext): string {
  if (!c.unseen) return "";
  const when = c.unseen.updated ? ` (aktualizacja ${numericDate(c.unseen.updated).slice(0, 5)})` : "";
  return `<div class="banner banner-changes" role="status">
    <button class="banner-main" data-action="changes"><strong>Plan się zmienił${esc(when)}</strong>
      <span>${esc(plural(c.unseen.count, "zmiana", "zmiany", "zmian"))} w Twoich zajęciach · Zobacz</span></button>
    <button class="iconbtn banner-close" data-action="dismiss-changes" aria-label="Ukryj powiadomienie o zmianach">${ICON.close}</button></div>`;
}

/** The holiday or break name once, plus cancellations and other notes from the PDF. */
function dayNotes(c: PlanContext, date: string): string {
  const holiday = holidayOn(c.tt.day_notes, date);
  const others = notesOn(c.tt.day_notes, date).filter((n) => n.kind !== "holiday");
  return [
    holiday ? `<div class="daynote daynote-holiday">${esc(holiday)}</div>` : "",
    ...others.map((n) => `<div class="daynote daynote-${n.kind}">${esc(sentenceCase(n.text))}</div>`),
  ].join("");
}

// ---------- day ----------

/** From about an hour before the first class (not before the usual start) to the last, plus `fill` empty hours. */
function dayHours(events: ClassEvent[], usual: { from: number; to: number }, fill: number): { from: number; to: number } {
  if (!events.length) return usual;
  const from = Math.max(usual.from, Math.floor((Math.min(...events.map((e) => toMinutes(e.start))) - 60) / 60));
  const last = Math.ceil(Math.max(...events.map((e) => toMinutes(e.end))) / 60);
  return { from, to: Math.min(Math.max(last, from + 1) + fill, 24) };
}

/** The day's own entries from Terminy, above the timeline. */
function dayTerms(c: PlanContext, date: string): string {
  const list = termsOn(c.terms, date);
  if (!list.length) return "";
  return `<div class="day-terms">${list
    .map(
      (t) => `<button class="day-term" data-action="term" data-id="${esc(t.id)}"><span class="tchip t-${t.type}">${TERM_LABEL[t.type]}</span>
        <span class="dt-sub">${esc(t.subject)}</span><span class="dt-meta">${esc([t.time && shortTime(t.time), t.room].filter(Boolean).join(" · "))}</span></button>`,
    )
    .join("")}</div>`;
}

function dayView(c: PlanContext): string {
  const list = eventsOn(c.events, c.date);
  const o: AxisOptions = { ...dayHours(list, c.hours, c.fillHours), hourPx: c.wide ? DESK_HOUR_PX : DAY_HOUR_PX, now: c.now, marks: c.marks, changed: c.changed };
  const holiday = holidayOn(c.tt.day_notes, c.date);
  const body = list.length
    ? `<div class="timeline">${axis(o)}${dayColumn(c.date, c.events, o)}</div>`
    : `<div class="empty-day">${esc(holiday ?? "Brak zajęć")}</div>`;
  return `<div class="day ${c.anim}">${dayNotes(c, c.date)}${dayTerms(c, c.date)}${body}</div>`;
}

// ---------- week ----------

function weekView(c: PlanContext): string {
  const days = weekDays(c.date, c.withWeekend);
  const compact = !c.wide;
  const o: AxisOptions = { ...c.hours, hourPx: compact ? c.weekHourPx : DESK_HOUR_PX, compact, now: c.now, marks: c.marks, changed: c.changed };
  const cols = days.map((d) => dayColumn(d, c.events, o)).join("");
  return `<div class="week${compact ? " week-compact" : ""} ${c.anim}" style="--days:${days.length}"><div class="wk-body">${axis(o)}${cols}</div></div>`;
}

// ---------- Terminy ----------

function termRow(t: Term, c: PlanContext, colors: Map<string, string>): string {
  const past = t.date < c.now.date;
  const soon = !past && t.date <= addDays(c.now.date, 7);
  const det = [t.time && shortTime(t.time), t.room, t.note].filter(Boolean).join(" · ");
  return `<button class="t-row${past ? " past" : ""}${soon ? " soon" : ""}" data-action="term" data-id="${esc(t.id)}" style="--c:${esc(colors.get(t.subject) ?? "var(--line-strong)")}">
    <span class="t-date"><b>${Number(t.date.slice(8))}</b><span>${weekdayShort(t.date)}</span></span>
    <span class="t-body"><span class="tchip t-${t.type}">${TERM_LABEL[t.type]}</span><span class="t-sub">${esc(t.subject)}</span>${det ? `<span class="t-det">${esc(det)}</span>` : ""}</span>
    <span class="t-left">${past ? "" : esc(untilText(t.date, c.now.date))}</span></button>`;
}

function termsView(c: PlanContext): string {
  if (!c.terms.length) {
    return `<div class="terms-empty">${SVG.empty}<h2>Brak terminów</h2>
      <p>Zapisz tu egzaminy, kolokwia, zaliczenia i zadania. Zobaczysz, ile zostało dni, a w planie pojawi się znacznik.</p>
      <div class="type-chips">${TERM_TYPES.map((t) => `<span class="tchip t-${t}">${TERM_LABEL[t]}</span>`).join("")}</div>
      ${addButton("Dodaj pierwszy termin")}<p class="fine">Widoczne tylko dla Ciebie, na tym urządzeniu.</p></div>`;
  }
  const colors = subjectColors(c);
  const upcoming = upcomingTerms(c.terms, c.now.date);
  const past = pastTerms(c.terms, c.now.date);
  const [first, ...rest] = upcoming;
  let lastMonth = "";
  const rows = rest
    .map((t) => {
      const m = `${month(t.date)} ${t.date.slice(0, 4)}`;
      const head = m !== lastMonth ? `<h2 class="t-sec">${esc((lastMonth = m))}</h2>` : "";
      return head + termRow(t, c, colors);
    })
    .join("");
  const hero = first
    ? `<button class="t-hero" data-action="term" data-id="${esc(first.id)}" style="--c:${esc(colors.get(first.subject) ?? "var(--accent)")}">
        <span class="th-top"><span class="th-label">Najbliższe</span><span class="tchip t-${first.type}">${TERM_LABEL[first.type]}</span></span>
        <span class="th-count">${esc(untilText(first.date, c.now.date))}</span><span class="th-sub">${esc(first.subject)}</span>
        <span class="th-det">${esc([longDate(first.date), first.time && shortTime(first.time), first.room].filter(Boolean).join(" · "))}</span>
        ${first.note ? `<span class="th-note">${esc(first.note)}</span>` : ""}</button>`
    : `<p class="t-none">Nic przed Tobą. Minione terminy są niżej.</p>`;
  const pastBlock = past.length
    ? `<h2 class="t-sec"><button class="t-fold${c.showPast ? " open" : ""}" data-action="toggle-past" aria-expanded="${c.showPast}">Minione (${past.length}) ${SVG.chev}</button></h2>
       ${c.showPast ? past.map((t) => termRow(t, c, colors)).join("") : ""}`
    : "";
  return `<div class="terms">${hero}${rows}${pastBlock}</div>`;
}

// ---------- the screen ----------

export function planScreen(c: PlanContext): string {
  const content = c.tab === "day" ? dayView(c) : c.tab === "week" ? weekView(c) : termsView(c);
  // the whole screen takes swipes (also an empty day's blank space), not only the plan itself
  const swipe = c.tab === "terms" ? "" : ` data-swipe="${c.tab}"`;
  return `<div class="app tab-${c.tab}${c.wide ? " wide" : ""}"${swipe}>
    ${header(c)}
    <main class="content"><div class="wrap">${problemBanner(c.entry, c.tt)}${changesBanner(c)}${content}</div></main>
    ${"" /* the phone's pill is kept outside the redrawn screen (app.ts, updatePill), so it never flickers */}
  </div>`;
}

// ---------- menu ----------

/** "Zgłoś błąd": an email with what's needed to check the report. */
function feedbackHref(c: PlanContext): string {
  const body = [
    `Plan: ${timetableShort(c.tt.id)}`,
    `Grupy: ${groupsSummary(c.tt, c.sel)}`,
    `Wersja: ${VERSION}, dane z ${c.tt.source.updated ? numericDate(c.tt.source.updated) : "—"}`,
    `Oglądany dzień: ${numericDate(c.date)}`,
    "",
    "Co się nie zgadza albo co poprawić:",
    "",
  ].join("\n");
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Plan UR ${VERSION}: uwaga`)}&body=${encodeURIComponent(body)}`;
}

export function menuSheet(c: PlanContext): string {
  const s = sourceStatus(c.entry, c.at);
  const wf = c.sel.wf ? ` · WF ${shortTime(c.sel.wf)}` : "";
  const themes = THEMES.map(
    (t) => `<button class="theme-tile${t.id === c.theme ? " on" : ""}" data-action="theme" data-theme="${t.id}" aria-pressed="${t.id === c.theme}">
      <span class="pv${t.id === "auto" ? " pv-auto" : ""}" style="--pbg:${t.bg};--psf:${t.surface};--pac:${t.accent}" aria-hidden="true"></span>${t.name}</button>`,
  ).join("");
  const item = (action: string, icon: string, label: string, extra = "") =>
    `<button class="m-item" data-action="${action}">${icon}<span>${label}</span>${extra}</button>`;
  const changesBadge = c.unseen ? `<span class="badge">${esc(plural(c.unseen.count, "nowa", "nowe", "nowych"))}</span>` : "";
  return sheet(
    "menu",
    "Menu",
    `<div class="plan-card">
       <button class="pc-main" data-action="groups"><b>${esc(timetableShort(c.tt.id))}</b>
         <span>Grupy ${esc(groupsShort(c.tt, c.sel))}${esc(wf)} · <span class="link">Zmień</span></span></button>
       <button class="pc-status status-${c.offline ? "offline" : s.level}" data-action="info"><i class="dot" aria-hidden="true"></i>${esc(c.offline ? `Offline · ${s.line}` : s.line)}</button>
     </div>
     <h3 class="m-sec">Motyw</h3><div class="themes">${themes}</div>
     <h3 class="m-sec">Aplikacja</h3>
     <nav class="m-list">
       ${item("changes", ICON.changes, "Zmiany w planie", changesBadge)}
       ${item("share", ICON.share, "Udostępnij stronę")}
       ${c.canInstall ? item("install", ICON.install, "Zainstaluj jako aplikację") : ""}
       ${item("ics", ICON.calendar, "Dodaj do kalendarza (.ics)")}
       ${CONTACT_EMAIL ? `<a class="m-item" href="${esc(feedbackHref(c))}">${ICON.mail}<span>Zgłoś błąd lub uwagę</span></a>` : ""}
     </nav>
     <div class="m-links"><button data-action="info">Skąd jest ten plan?</button><button data-action="page" data-page="about">O projekcie</button>
       <button data-action="page" data-page="privacy">Prywatność</button></div>
     <p class="m-version">Plan zajęć UR · nieoficjalny · wersja ${esc(VERSION)} (demo)</p>`,
  );
}

// ---------- Terminy: details and the form ----------

export function termSheet(t: Term, c: PlanContext, armed: boolean): string {
  const colors = subjectColors(c);
  const past = t.date < c.now.date;
  return sheet(
    "term",
    t.subject,
    `<div class="term-top"><span class="tchip t-${t.type}">${TERM_LABEL[t.type]}</span><span class="term-when">${esc(past ? "minęło" : untilText(t.date, c.now.date))}</span></div>
     <div class="sheet-swatch" style="--c:${esc(colors.get(t.subject) ?? "var(--line-strong)")}"></div>
     <dl class="facts">
       <dt>Kiedy</dt><dd>${esc(longDate(t.date))}${t.time ? `, ${esc(shortTime(t.time))}` : ""}</dd>
       <dt>Sala</dt><dd>${esc(t.room || "—")}</dd>
       <dt>Notatka</dt><dd>${esc(t.note || "—")}</dd>
     </dl>
     <button class="secondary goto" data-action="term-goto" data-date="${t.date}">Pokaż ten dzień w planie</button>
     <div class="term-actions">
       <button class="secondary" data-action="term-edit" data-id="${esc(t.id)}">Edytuj</button>
       <button class="secondary danger${armed ? " armed" : ""}" data-action="term-delete" data-id="${esc(t.id)}">${armed ? "Na pewno usunąć?" : "Usuń"}</button>
     </div>
     <p class="fine">Terminy są zapisane tylko na tym urządzeniu.</p>`,
  );
}

export interface TermDraft {
  id: string | null; // null: a new entry
  type: TermType;
  subject: string;
  custom: boolean; // the subject is the student's own text, not one from the plan
  date: string;
  time: string;
  room: string;
  note: string;
}

export function termForm(d: TermDraft, c: PlanContext): string {
  const colors = subjectColors(c);
  const subjects = mySubjects(c.events);
  const types = TERM_TYPES.map(
    (t) => `<button class="tf-type${d.type === t ? " on" : ""}" data-action="term-type" data-type="${t}" aria-pressed="${d.type === t}">${TERM_LABEL[t]}</button>`,
  ).join("");
  const chips = subjects
    .map(
      (s) => `<button class="tf-subject${!d.custom && d.subject === s ? " on" : ""}" data-action="term-subject" data-subject="${esc(s)}" style="--c:${esc(colors.get(s) ?? "")}" aria-pressed="${!d.custom && d.subject === s}"><i aria-hidden="true"></i>${esc(shortTitle(s))}</button>`,
    )
    .join("");
  const ok = Boolean(d.date && d.subject.trim());
  return sheet(
    "term-form",
    d.id ? "Edytuj termin" : "Dodaj termin",
    `<span class="field-label">Co to jest</span><div class="tf-types">${types}</div>
     <span class="field-label">Przedmiot</span>
     <div class="tf-subjects">${chips}<button class="tf-subject${d.custom ? " on" : ""}" data-action="term-subject" data-subject="" aria-pressed="${d.custom}">Inny…</button></div>
     ${d.custom ? `<input class="field tf-custom" data-field="subject" value="${esc(d.subject)}" placeholder="Nazwa przedmiotu" maxlength="80" autocomplete="off">` : ""}
     <div class="tf-row"><label><span class="field-label">Dzień</span><input class="field" type="date" data-field="date" value="${esc(d.date)}" required></label>
       <label><span class="field-label">Godzina (opcjonalnie)</span><input class="field" type="time" data-field="time" value="${esc(d.time)}"></label></div>
     <label><span class="field-label">Sala (opcjonalnie)</span><input class="field" data-field="room" value="${esc(d.room)}" placeholder="np. D3.136" maxlength="40" autocomplete="off"></label>
     <label><span class="field-label">Notatka</span><input class="field" data-field="note" value="${esc(d.note)}" placeholder="np. rozdziały 1–4" maxlength="160" autocomplete="off"></label>
     <button class="primary tf-save" data-action="term-save" ${ok ? "" : "disabled"}>Zapisz</button>
     <p class="fine">Widoczne tylko dla Ciebie, na tym urządzeniu.</p>`,
  );
}

