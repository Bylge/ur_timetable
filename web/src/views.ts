// Rendering: functions that return HTML strings. Interactive elements carry data-action attributes,
// handled in app.ts. Every interpolated value goes through esc().

import type { ChangeSet, ClassEvent, IndexEntry, Mark, Selection, Timetable } from "./types";
import { changeItems, type ChangeItem } from "./changes";
import { BUILD_DATE, VERSION } from "./version";
import type { Theme } from "./data";
import {
  eventsOn,
  holidayOn,
  notesOn,
  placeDay,
  selectionComplete,
  sentenceCase,
  todayState,
  weekDays,
  weekStart,
  type Placed,
} from "./schedule";
import {
  DAY_SHORT,
  addDays,
  dayDate,
  ago,
  longDate,
  mondayOf,
  numericDate,
  relativeDay,
  shortTime,
  toMinutes,
  weekRange,
  weekday,
  weekdayShort,
  type Now,
} from "./time";
import { groupsSummary, kindLabel, kindShort, plural, programmeName, parseId, sourceStatus, timetableName, timetableShort } from "./labels";

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const ICON = {
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  changes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h11M4 12h7M4 17h9M17 10l3 3-3 3M20 13h-6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M12 13v4M10 15h4"/></svg>',
  groups: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15 14.6c2.6-.3 4.6 1 5.2 3.9"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/></svg>',
  theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/></svg>',
  install: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
};

export function textColorOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5 ? "#ffffff" : "#16181d";
}

/** Polish plural of "zajęcia": 2 zajęcia, 5 zajęć, 22 zajęcia, 117 zajęć. */
export function zajecia(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  return `${n} ${last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "zajęcia" : "zajęć"}`;
}

/** Short title for narrow week columns: the abbreviation if the name has one, else whole words per line. */
function compactTitle(title: string): string {
  const abbr = /\(([A-ZĄĆĘŁŃÓŚŹŻ]{2,})\)/.exec(title);
  if (abbr) return `<span class="b-word">${esc(abbr[1])}</span>`;
  const words: string[] = [];
  for (const w of title.split(/\s+/)) {
    if (words.length && words[words.length - 1].length <= 2) words[words.length - 1] += ` ${w}`;
    else words.push(w);
  }
  return words.map((w) => `<span class="b-word">${esc(w)}</span>`).join("");
}

function groupText(e: ClassEvent): string {
  return e.partition && e.partition > 1 ? `gr. ${e.group}/${e.partition}` : "";
}

// ---------- shared pieces ----------

/** The name; the "demo" pill goes elsewhere where space is tight (the phone plan has it in the status line). */
export function brand(demo = true): string {
  return `<div class="brand"><span class="brand-name">Plan zajęć UR</span><span class="brand-tag">nieoficjalny</span>${demo ? demoPill() : ""}</div>`;
}

function demoPill(): string {
  return `<span class="demo-pill" title="Wersja demonstracyjna ${esc(VERSION)}">demo</span>`;
}

export function statusButton(entry: IndexEntry, at: Date, offline = false, demo = false): string {
  const s = sourceStatus(entry, at);
  const line = offline ? `Offline · ${s.line.replace(/ · sprawdzono .*$/, "")}` : s.line;
  const level = offline ? "offline" : s.level;
  return `<button class="status status-${level}" data-action="info" aria-label="Informacje o źródle planu: ${esc(line)}">
    <span class="dot" aria-hidden="true"></span><span class="status-text">${esc(line)}</span>${demo ? demoPill() : ""}</button>`;
}

/** Shown on the plan when the timetable changed (in the student's classes) since their last visit. */
function changesBanner(c: PlanContext): string {
  if (!c.unseen) return "";
  const when = c.unseen.updated ? ` (aktualizacja ${numericDate(c.unseen.updated).slice(0, 5)})` : "";
  return `<div class="banner banner-changes" role="status">
    <button class="banner-main" data-action="changes"><strong>Plan się zmienił${esc(when)}</strong>
      <span>${esc(plural(c.unseen.count, "zmiana", "zmiany", "zmian"))} w Twoich zajęciach · Zobacz</span></button>
    <button class="iconbtn banner-close" data-action="dismiss-changes" aria-label="Ukryj powiadomienie o zmianach">${ICON.close}</button></div>`;
}

export function problemBanner(entry: IndexEntry, tt: Timetable): string {
  const parts: string[] = [];
  if (entry.status === "failed" || entry.status === "needs_review") {
    parts.push(
      `<div class="banner banner-problem" role="status">Uczelnia opublikowała nową wersję planu, której nie udało się jeszcze automatycznie przetworzyć. Sprawdź <a href="${esc(entry.url)}" target="_blank" rel="noopener">PDF na stronie UR</a>.</div>`,
    );
  }
  if (tt.unresolved.length) {
    const n = tt.unresolved.length;
    parts.push(
      `<button class="banner banner-warn" data-action="info">${n === 1 ? "1 zajęć nie udało się odczytać" : `${n} zajęć nie udało się odczytać`} — sprawdź PDF. Szczegóły ›</button>`,
    );
  }
  return parts.join("");
}

// ---------- picker ----------

export function pickerView(entries: IndexEntry[], current: string | null): string {
  const byProgramme = new Map<string, IndexEntry[]>();
  for (const e of entries) {
    const programme = parseId(e.id)?.programme ?? e.id.split("/")[0];
    byProgramme.set(programme, [...(byProgramme.get(programme) ?? []), e]);
  }
  const sections = [...byProgramme.entries()]
    .map(
      ([programme, list]) => `<section class="list-section">
        <h2>${esc(programmeName(programme))}</h2>
        <div class="list">${list
          .map(
            (e) => `<button class="row${e.id === current ? " row-current" : ""}" data-action="pick-timetable" data-id="${esc(e.id)}">
              <span class="row-main">${esc(timetableName(e.id))}</span>
              <span class="row-sub">${e.updated ? `aktualizacja planu ${esc(numericDate(e.updated))}` : ""}</span>
              <span class="row-chevron" aria-hidden="true">${ICON.right}</span></button>`,
          )
          .join("")}</div></section>`,
    )
    .join("");
  return `<div class="page">
    <header class="pagebar">${current ? `<button class="iconbtn" data-action="back" aria-label="Wróć">${ICON.back}</button>` : ""}${brand()}</header>
    <main class="page-body">
      <h1 class="page-title">Wybierz swój plan</h1>
      ${sections || `<p class="muted">Brak dostępnych planów.</p>`}
      <p class="fine">Na razie dostępne są tylko plany, które zostały sprawdzone. Kolejne lata i kierunki będą dodawane.</p>
    </main></div>`;
}

// ---------- groups ----------

export function groupsView(tt: Timetable, draft: Selection, count: number, canGoBack: boolean): string {
  const splits = tt.splits
    .map((p) => {
      const chosen = draft.groups[String(p)];
      const buttons = Array.from({ length: p }, (_, i) => i + 1)
        .map(
          (g) => `<button class="seg-btn${chosen === g ? " on" : ""}" data-action="set-group" data-split="${p}" data-group="${g}"
            aria-pressed="${chosen === g}">${g}</button>`,
        )
        .join("");
      return `<fieldset class="split"><legend>Zajęcia w ${p} grupach</legend><div class="seg seg-groups" role="group">${buttons}</div></fieldset>`;
    })
    .join("");
  const optional = tt.optional_subjects
    .map(
      (s) => `<label class="toggle"><input type="checkbox" data-action="toggle-optional" data-subject="${esc(s)}" ${
        draft.optional.includes(s) ? "checked" : ""
      }><span class="toggle-track" aria-hidden="true"></span><span>${esc(s)}</span></label>`,
    )
    .join("");
  const complete = selectionComplete(tt, draft);
  const missing = tt.splits.filter((p) => !draft.groups[String(p)]);
  return `<div class="page">
    <header class="pagebar">${canGoBack ? `<button class="iconbtn" data-action="back" aria-label="Wróć">${ICON.back}</button>` : ""}${brand()}</header>
    <main class="page-body">
      <h1 class="page-title">Twoje grupy</h1>
      <button class="plan-chip" data-action="picker">${esc(timetableShort(tt.id))}<span class="link">zmień</span></button>
      <p class="hint">Wybierz numer swojej grupy w każdym podziale. Zajęcia wspólne dla całego roku pokażą się zawsze.</p>
      ${splits}
      ${optional ? `<fieldset class="split"><legend>Przedmioty do wyboru</legend>${optional}</fieldset>` : ""}
      <div class="groups-footer">
        <p class="preview" aria-live="polite">${
          complete ? `${zajecia(count)} w semestrze` : `Wybierz grupę: ${missing.map((p) => `podział na ${p}`).join(", ")}`
        }</p>
        <button class="primary" data-action="save-groups" ${complete ? "" : "disabled"}>Pokaż plan</button>
        <p class="fine">Plan nieoficjalny, tworzony automatycznie z PDF na stronie Uniwersytetu Rzeszowskiego. W razie wątpliwości obowiązuje PDF. Twój wybór zostaje tylko na tym urządzeniu.</p>
      </div>
    </main></div>`;
}

// ---------- time axis ----------

interface AxisOptions {
  from: number; // hour
  to: number;
  hourPx: number;
  compact?: boolean; // narrow week columns on a phone
  now?: Now;
  marks?: Record<string, Mark>;
}

function block(p: Placed, o: AxisOptions, now?: Now): string {
  const e = p.event;
  const top = ((toMinutes(e.start) - o.from * 60) / 60) * o.hourPx;
  const height = Math.max(((toMinutes(e.end) - toMinutes(e.start)) / 60) * o.hourPx - 2, 14);
  const width = 100 / p.lanes;
  const past = now && e.date === now.date && toMinutes(e.end) <= now.minutes;
  const short = height < 46;
  const mark = o.marks?.[e.id];
  const cancelled = Boolean(mark?.cancelled);
  const meta = [kindShort(e.kind), groupText(e)].filter(Boolean).join(" · ");
  const label = `${cancelled ? "Odwołane: " : ""}${e.title}, ${shortTime(e.start)}–${shortTime(e.end)}${meta ? `, ${meta}` : ""}${e.room ? `, sala ${e.room}` : ""}${mark?.note ? `, notatka: ${mark.note}` : ""}`;
  const badge = cancelled
    ? `<span class="b-cancel"><span class="b-badge">Odwołane</span>${mark?.note ? `<span class="b-note">${esc(mark.note)}</span>` : ""}</span>`
    : "";
  const inner = o.compact
    ? `<span class="b-title">${compactTitle(e.title)}</span>`
    : `<span class="b-title">${esc(e.title)}</span>
       ${short && cancelled ? badge : `<span class="b-meta">${esc(shortTime(e.start))}–${esc(shortTime(e.end))}${meta ? ` · ${esc(meta)}` : ""}</span>`}
       ${short ? "" : cancelled ? badge : `<span class="b-room">${esc(e.room ?? "")}</span>`}`;
  const cls = ["block", o.compact && "compact", short && "short", past && "past", cancelled && "cancelled", mark?.note && !cancelled && "noted"];
  return `<button class="${cls.filter(Boolean).join(" ")}" data-action="event" data-id="${esc(e.id)}"
    style="top:${top}px;height:${height}px;left:calc(${p.lane * width}% + 2px);width:calc(${width}% - 4px);--c:${esc(e.color)};--t:${textColorOn(e.color)}"
    aria-label="${esc(label)}">${inner}</button>`;
}

export function axis(o: AxisOptions): string {
  const hours = Array.from({ length: o.to - o.from + 1 }, (_, i) => o.from + i);
  return `<div class="axis" style="height:${(o.to - o.from) * o.hourPx}px">${hours
    .map((h) => `<span style="top:${(h - o.from) * o.hourPx}px">${h}:00</span>`)
    .join("")}</div>`;
}

export function dayColumn(date: string, events: ClassEvent[], o: AxisOptions): string {
  const lines = Array.from({ length: o.to - o.from }, (_, i) => `<div class="hline" style="top:${i * o.hourPx}px"></div>`).join("");
  const nowLine =
    o.now && o.now.date === date && o.now.minutes >= o.from * 60 && o.now.minutes <= o.to * 60
      ? `<div class="nowline" style="top:${((o.now.minutes - o.from * 60) / 60) * o.hourPx}px" aria-hidden="true"></div>`
      : "";
  const blocks = placeDay(eventsOn(events, date))
    .map((p) => block(p, o, o.now))
    .join("");
  return `<div class="col${o.now?.date === date ? " col-today" : ""}" data-date="${date}" style="height:${(o.to - o.from) * o.hourPx}px">${lines}${blocks}${nowLine}</div>`;
}

// ---------- plan: day (phone) ----------

export interface PlanContext {
  tt: Timetable;
  entry: IndexEntry;
  sel: Selection;
  events: ClassEvent[]; // the student's events
  now: Now;
  at: Date;
  date: string; // selected day
  hours: { from: number; to: number };
  withWeekend: boolean;
  anim: string; // css class for the transition
  marks: Record<string, Mark>;
  unseen: { count: number; updated: string | null } | null; // changes in the student's classes since the last visit
  offline: boolean;
  canInstall: boolean;
  theme: Theme;
}

function nextCard(c: PlanContext, state: "finished" | "none", next: string | null): string {
  const holiday = holidayOn(c.tt.day_notes, c.now.date);
  const status =
    state === "finished"
      ? "Zajęcia na dziś zakończone"
      : holiday
        ? `Dziś: ${holiday}`
        : `Dziś brak zajęć · ${longDate(c.now.date).split(",")[0]}`;
  if (!next) {
    return `<section class="nextcard"><div class="nc-status">${esc(status)}</div><div class="nc-label">Brak kolejnych zajęć w tym planie.</div></section>`;
  }
  const dayEvents = eventsOn(c.events, next);
  const shown = dayEvents.slice(0, 5);
  const rows = shown
    .map(
      (e) => `<div class="nc-row${c.marks[e.id]?.cancelled ? " cancelled" : ""}"><span class="swatch" style="--c:${esc(e.color)}"></span>
        <span class="nc-time">${esc(shortTime(e.start))}–${esc(shortTime(e.end))}</span>
        <span class="nc-title">${esc(e.title)}</span>${e.room ? `<span class="nc-room">${esc(e.room)}</span>` : ""}</div>`,
    )
    .join("");
  const total = dayEvents.length === 1 ? "Jedyne zajęcia tego dnia" : `Razem ${zajecia(dayEvents.length)} tego dnia`;
  return `<section class="nextcard" data-action="show-day" data-date="${next}" role="button" tabindex="0" aria-label="Pokaż najbliższy dzień z zajęciami: ${esc(longDate(next))}">
    <div class="nc-status">${esc(status)}</div>
    <div class="nc-label">Najbliższe zajęcia <span class="nc-when">${esc(longDate(next))} · ${esc(relativeDay(next, c.now.date).toLowerCase())}</span></div>
    <div class="nc-list">${rows}</div>
    <div class="nc-more"><span>${esc(total)}${dayEvents.length > shown.length ? ` (pokazano ${shown.length})` : ""}</span>
      <span class="nc-open">Pokaż dzień ${ICON.up}</span></div>
  </section>`;
}

/** Notes shown above a day: the holiday/break name once, plus cancellations and other notes. */
function dayNotes(c: PlanContext, date: string): string {
  const holiday = holidayOn(c.tt.day_notes, date);
  const others = notesOn(c.tt.day_notes, date).filter((n) => n.kind !== "holiday");
  return [
    holiday ? `<div class="daynote daynote-holiday">${esc(holiday)}</div>` : "",
    ...others.map((n) => `<div class="daynote daynote-${n.kind}">${esc(sentenceCase(n.text))}</div>`),
  ].join("");
}

/** "Poniedziałek, 26 października", with a short weekday ("Pon.") for when the header doesn't fit in one line. */
function dayTitle(date: string): string {
  const [day, rest] = longDate(date).split(", ");
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return `<span class="wd-full">${esc(cap(day))}</span><span class="wd-short">${esc(cap(weekdayShort(date)))}</span>, ${esc(rest)}`;
}

export function dayContent(c: PlanContext): string {
  const isToday = c.date === c.now.date;
  const dayEvents = eventsOn(c.events, c.date);
  const o: AxisOptions = { ...c.hours, hourPx: 52, now: c.now, marks: c.marks };
  let top = "";
  let showAxis = dayEvents.length > 0;
  if (isToday) {
    const t = todayState(c.events, c.now);
    if (t.state !== "classes") top = nextCard(c, t.state, t.next);
  } else if (!dayEvents.length) {
    const holiday = holidayOn(c.tt.day_notes, c.date);
    top = `<div class="empty-day">${esc(holiday ? holiday : "Brak zajęć")}</div>`;
    showAxis = false;
  }
  return `<div class="day ${c.anim}">
    <div class="dayhead">
      <h1 aria-label="${esc(longDate(c.date).replace(/^./, (ch) => ch.toUpperCase()))}">${dayTitle(c.date)}</h1>
      <span class="rel${isToday ? " rel-today" : ""}">${esc(relativeDay(c.date, c.now.date))}</span>
      ${isToday ? "" : `<button class="chip" data-action="today">Dziś</button>`}
    </div>
    ${dayNotes(c, c.date)}
    ${top}
    ${showAxis ? `<div class="timeline" data-swipe="day">${axis(o)}${dayColumn(c.date, c.events, o)}</div>` : `<div class="swipe-area" data-swipe="day"></div>`}
  </div>`;
}

function dayTabs(c: PlanContext): string {
  const days = weekDays(c.date, c.withWeekend);
  return days
    .map((d) => {
      const has = eventsOn(c.events, d).length > 0;
      const cls = ["daytab", d === c.date ? "on" : "", d === c.now.date ? "today" : "", has ? "" : "free"].filter(Boolean).join(" ");
      return `<button class="${cls}" data-action="pick-day" data-date="${d}" aria-pressed="${d === c.date}" aria-label="${esc(longDate(d))}${has ? "" : ", brak zajęć"}">
        <span class="dt-name">${DAY_SHORT[weekday(d)]}</span><span class="dt-num">${Number(d.slice(8))}</span></button>`;
    })
    .join("");
}

// ---------- plan: week ----------

function weekGrid(c: PlanContext, compact: boolean): string {
  const days = weekDays(c.date, c.withWeekend);
  const o: AxisOptions = { ...c.hours, hourPx: compact ? 40 : 52, compact, now: c.now, marks: c.marks };
  const heads = days
    .map((d) => {
      const isToday = d === c.now.date;
      const notes = compact ? "" : dayNotes(c, d);
      return `<button class="wk-head${isToday ? " today" : ""}" data-action="open-day" data-date="${d}">
        <span class="wk-day">${compact ? DAY_SHORT[weekday(d)] : esc(longDate(d).split(",")[0])}</span>
        <span class="wk-date">${compact ? Number(d.slice(8)) : esc(numericDate(d).slice(0, 5))}${isToday ? (compact ? "" : " · dziś") : ""}</span>${notes}</button>`;
    })
    .join("");
  const cols = days.map((d) => dayColumn(d, c.events, o)).join("");
  return `<div class="week${compact ? " week-compact" : ""} ${c.anim}" style="--days:${days.length}">
    <div class="wk-heads"><span></span>${heads}</div>
    <div class="wk-body" data-swipe="week">${axis(o)}${cols}</div>
  </div>`;
}

function todayStrip(c: PlanContext): string {
  const t = todayState(c.events, c.now);
  if (t.state === "classes") return "";
  const days = weekDays(c.date, c.withWeekend);
  if (!days.includes(c.now.date) && !(t.next && days.includes(t.next))) return "";
  const holiday = holidayOn(c.tt.day_notes, c.now.date);
  const status = t.state === "finished" ? "Zajęcia na dziś zakończone" : holiday ? `Dziś: ${holiday}` : "Dziś brak zajęć";
  if (!t.next) return `<div class="strip">${esc(status)} · brak kolejnych zajęć w tym planie</div>`;
  const first = eventsOn(c.events, t.next)[0];
  return `<button class="strip" data-action="show-day" data-date="${t.next}">${esc(status)} · najbliższe: <strong>${esc(longDate(t.next))}</strong>, ${esc(
    shortTime(first.start),
  )} ${esc(first.title)}</button>`;
}

// ---------- plan: layouts ----------

/** "ten tydzień" / "najbliższy tydzień" (at the weekend) / "" for other weeks. */
function weekTag(c: PlanContext, monday: string): string {
  if (weekStart(c.now.date, c.withWeekend) !== monday) return "";
  return mondayOf(c.now.date) === monday ? "ten tydzień" : "najbliższy tydzień";
}

export function phonePlan(c: PlanContext, mode: "day" | "week"): string {
  const monday = weekStart(c.date, c.withWeekend);
  const tag = weekTag(c, monday);
  const days = c.withWeekend ? 7 : 5;
  const bar =
    mode === "day"
      ? `<nav class="weekbar"><button class="iconbtn" data-action="prev-week" aria-label="Poprzedni tydzień">${ICON.left}</button>
          <div class="daytabs">${dayTabs(c)}</div>
          <button class="iconbtn" data-action="next-week" aria-label="Następny tydzień">${ICON.right}</button></nav>`
      : `<nav class="weekbar"><button class="iconbtn" data-action="prev-week" aria-label="Poprzedni tydzień">${ICON.left}</button>
          <div class="weeklabel">${esc(weekRange(monday, days))}${tag ? ` · <span class="rel-today">${tag}</span>` : ""}</div>
          <button class="iconbtn" data-action="next-week" aria-label="Następny tydzień">${ICON.right}</button></nav>`;
  return `<div class="app phone">
    <header class="topbar">${brand(false)}
      <div class="seg seg-mode" role="group" aria-label="Widok">
        <button class="seg-btn${mode === "day" ? " on" : ""}" data-action="mode" data-mode="day" aria-pressed="${mode === "day"}">Dzień</button>
        <button class="seg-btn${mode === "week" ? " on" : ""}" data-action="mode" data-mode="week" aria-pressed="${mode === "week"}">Tydzień</button>
      </div>
      <button class="iconbtn menubtn${c.unseen ? " has-badge" : ""}" data-action="menu" aria-label="Menu${c.unseen ? " (są nowe zmiany)" : ""}">${ICON.menu}</button></header>
    ${bar}
    <main class="content">${problemBanner(c.entry, c.tt)}${changesBanner(c)}${mode === "day" ? dayContent(c) : todayStrip(c) + weekGrid(c, true)}</main>
    <footer class="bottombar">
      <button class="selection" data-action="groups" aria-label="Zmień plan lub grupy">
        <span class="sel-name">${esc(timetableShort(c.tt.id))}</span>
        <span class="sel-groups">Grupy ${esc(groupsSummary(c.tt, c.sel))}</span></button>
      ${statusButton(c.entry, c.at, c.offline, true)}
    </footer>
  </div>`;
}

export function desktopPlan(c: PlanContext): string {
  const monday = weekStart(c.date, c.withWeekend);
  const days = c.withWeekend ? 7 : 5;
  const tag = weekTag(c, monday);
  return `<div class="app desktop">
    <aside class="sidebar">
      ${brand()}
      <section class="sel-card">
        <div class="sel-programme">${esc(programmeName(parseId(c.tt.id)?.programme ?? ""))}</div>
        <div class="sel-plan">${esc(timetableName(c.tt.id))}</div>
        <div class="sel-groups-label">Twoje grupy</div>
        <div class="sel-groups-value">${esc(groupsSummary(c.tt, c.sel))}</div>
        ${c.sel.optional.length ? `<div class="sel-optional">+ ${esc(c.sel.optional.join(", "))}</div>` : ""}
        <button class="secondary" data-action="groups">Zmień grupy</button>
      </section>
      <nav class="sidenav" aria-label="Więcej">${menuItems(c, false)}</nav>
      <div class="spacer"></div>
      ${statusButton(c.entry, c.at, c.offline)}
      <p class="fine">Plan nieoficjalny, tworzony automatycznie z PDF na stronie UR. Obowiązuje PDF.</p>
    </aside>
    <main class="main">
      ${problemBanner(c.entry, c.tt)}${changesBanner(c)}
      <div class="weekhead">
        <button class="iconbtn" data-action="prev-week" aria-label="Poprzedni tydzień">${ICON.left}</button>
        <h1>${esc(weekRange(monday, days))} ${esc(monday.slice(0, 4))}</h1>
        <button class="iconbtn" data-action="next-week" aria-label="Następny tydzień">${ICON.right}</button>
        ${tag ? `<span class="rel rel-today">${tag}</span>` : `<button class="chip" data-action="today">Dziś</button>`}
      </div>
      ${todayStrip(c)}
      ${weekGrid(c, false)}
    </main>
  </div>`;
}

// ---------- sheets ----------

export function eventSheet(e: ClassEvent, now: Now, mark: Mark | undefined, sourceUrl: string): string {
  const rows: [string, string][] = [
    ["Kiedy", `${longDate(e.date)} (${relativeDay(e.date, now.date).toLowerCase()})`],
    ["Godziny", `${shortTime(e.start)}–${shortTime(e.end)}`],
    ["Rodzaj", kindLabel(e.kind) || "inne"],
    ["Kto", e.partition && e.partition > 1 ? `grupa ${e.group} z ${e.partition}` : "cały rok"],
    ["Sala", e.room ?? "—"],
  ];
  const cancelled = Boolean(mark?.cancelled);
  return sheet(
    "event",
    e.title,
    `<div class="sheet-swatch" style="--c:${esc(e.color)}"></div>
     <dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
     ${e.notes.length ? `<ul class="notes">${e.notes.map((n) => `<li>${esc(noteText(n))}</li>`).join("")}</ul>` : ""}
     <section class="mark${cancelled ? " is-cancelled" : ""}" aria-label="Twoje oznaczenie">
       <label class="toggle"><input type="checkbox" data-action="toggle-cancelled" data-id="${esc(e.id)}" ${cancelled ? "checked" : ""}>
         <span class="toggle-track" aria-hidden="true"></span><span class="toggle-text"><strong>Odwołane</strong><span class="toggle-sub">np. prowadzący odwołał zajęcia</span></span></label>
       <label class="field-label" for="mark-note">Notatka</label>
       <input class="field" id="mark-note" type="text" maxlength="120" data-action="mark-note" data-id="${esc(e.id)}"
         value="${esc(mark?.note ?? "")}" placeholder="${cancelled ? "Powód, np. choroba prowadzącego" : "np. przynieść fartuch"}" autocomplete="off">
       <p class="fine">Oznaczenie i notatka są widoczne tylko dla Ciebie, na tym urządzeniu.</p>
     </section>
     <p class="fine">Coś się nie zgadza? Sprawdź <a href="${esc(sourceUrl)}" target="_blank" rel="noopener">PDF na stronie UR</a> — on obowiązuje.</p>`,
  );
}

/** Parser notes are in English internally; show them in Polish. */
export function noteText(note: string): string {
  return note
    .replace(/^scheduled on a public holiday \((.+)\)$/, "Zajęcia zaplanowane w dzień ustawowo wolny ($1)")
    .replace(/^start (\S+) from cell text \(grid: (\S+)\)$/, "Początek $1 według opisu w PDF (w siatce: $2)")
    .replace(/^end (\S+) from cell text \(grid: (\S+)\)$/, "Koniec $1 według opisu w PDF (w siatce: $2)");
}

export function infoSheet(entry: IndexEntry, tt: Timetable, at: Date): string {
  const s = sourceStatus(entry, at);
  const unresolved = tt.unresolved.length
    ? `<div class="info-block warn"><strong>Nie udało się odczytać ${tt.unresolved.length} zajęć.</strong> Sprawdź je w PDF:<ul>${tt.unresolved
        .map((u) => `<li>${esc(numericDate(u.date))}, ${esc(shortTime(u.start))}–${esc(shortTime(u.end))}: „${esc(u.text)}”</li>`)
        .join("")}</ul></div>`
    : "";
  const problem =
    s.level === "problem"
      ? `<div class="info-block problem">Uczelnia opublikowała nową wersję planu, której nie udało się jeszcze automatycznie przetworzyć. Do czasu poprawki widzisz poprzednią wersję — sprawdź PDF.</div>`
      : s.level === "stale"
        ? `<div class="info-block warn">Plan nie był sprawdzany od dłuższego czasu. Możliwe, że na stronie UR jest nowsza wersja.</div>`
        : "";
  return sheet(
    "info",
    "Skąd jest ten plan?",
    `${problem}${unresolved}
     <p>To <strong>nieoficjalny</strong> plan. Jest tworzony automatycznie z planu w PDF publikowanego na stronie Uniwersytetu Rzeszowskiego i może zawierać błędy. <strong>W razie wątpliwości obowiązuje PDF.</strong> Strona nie jest związana z uczelnią.</p>
     <dl class="facts">
       <dt>Źródło</dt><dd><a href="${esc(entry.url)}" target="_blank" rel="noopener">PDF na stronie UR</a></dd>
       <dt>Aktualizacja planu</dt><dd>${entry.updated ? esc(numericDate(entry.updated)) : "—"} (data podana przez uczelnię)</dd>
       <dt>Sprawdzono</dt><dd>${esc(ago(entry.checked_at, at))}</dd>
     </dl>
     <p class="fine">Plan jest sprawdzany trzy razy dziennie: rano, po południu i wieczorem. Twoje grupy i ustawienia są zapisane tylko na tym urządzeniu — nic nie jest wysyłane na serwer.</p>
     <div class="linkrow"><button class="link-btn" data-action="page" data-page="about">O projekcie</button>
       <button class="link-btn" data-action="page" data-page="privacy">Prywatność</button></div>
     <p class="fine version">${versionText()}</p>`,
  );
}

function sheet(kind: string, title: string, body: string): string {
  return `<div class="sheet-layer" data-sheet="${kind}">
    <div class="backdrop" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1"><div class="sheet-scroll">
      <div class="grabber" aria-hidden="true"></div>
      <div class="sheet-head"><h2 id="sheet-title">${esc(title)}</h2>
        <button class="iconbtn" data-action="close-sheet" aria-label="Zamknij">${ICON.close}</button></div>
      <div class="sheet-body">${body}</div>
    </div></div></div>`;
}

// ---------- menu ----------

type MenuContext = PlanContext;

/** "Zgłoś błąd": an email with what's needed to check the report (shown once there's a contact address). */
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

const THEMES: [Theme, string][] = [
  ["auto", "Auto"],
  ["light", "Jasny"],
  ["dark", "Ciemny"],
];

function themeRow(theme: Theme): string {
  const buttons = THEMES.map(
    ([t, label]) =>
      `<button class="seg-btn${t === theme ? " on" : ""}" data-action="theme" data-theme="${t}" aria-pressed="${t === theme}"${
        t === "auto" ? ' title="Jak w ustawieniach telefonu lub komputera"' : ""
      }>${label}</button>`,
  ).join("");
  return `<div class="theme-row"><span class="mi-icon">${ICON.theme}</span><span class="mi-label" id="theme-label">Motyw</span>
    <div class="seg" role="group" aria-labelledby="theme-label">${buttons}</div></div>`;
}

/** Links to everything beyond the plan: a sheet on the phone, the sidebar on desktop. */
export function menuItems(c: MenuContext, phone: boolean): string {
  const item = (action: string, icon: string, label: string, sub = "", extra = "") =>
    `<button class="menu-item" data-action="${action}" ${extra}><span class="mi-icon">${icon}</span>
      <span class="mi-text"><span class="mi-label">${label}</span>${sub ? `<span class="mi-sub">${sub}</span>` : ""}</span></button>`;
  const changesSub = c.unseen
    ? `<span class="badge">${esc(plural(c.unseen.count, "nowa zmiana", "nowe zmiany", "nowych zmian"))}</span>`
    : phone
      ? "Co uczelnia zmieniła w kolejnych wersjach"
      : "";
  return [
    item("changes", ICON.changes, "Zmiany w planie", changesSub),
    item("ics", ICON.calendar, "Dodaj do kalendarza", phone ? "Plik .ics z Twoimi zajęciami" : ""),
    phone ? item("groups", ICON.groups, "Zmień plan lub grupy") : "",
    c.canInstall ? item("install", ICON.install, "Zainstaluj jako aplikację", phone ? "Ikona na ekranie, działa bez internetu" : "") : "",
    CONTACT_EMAIL
      ? `<a class="menu-item" href="${esc(feedbackHref(c))}"><span class="mi-icon">${ICON.mail}</span>
          <span class="mi-text"><span class="mi-label">Zgłoś błąd lub uwagę</span>${phone ? `<span class="mi-sub">E-mail z informacją o Twoim planie i grupach</span>` : ""}</span></a>`
      : "",
    item("info", ICON.file, "Skąd jest ten plan?"),
    item("page", ICON.info, "O projekcie", "", 'data-page="about"'),
    item("page", ICON.shield, "Prywatność", "", 'data-page="privacy"'),
    themeRow(c.theme),
  ].join("");
}

export function menuSheet(c: MenuContext): string {
  return sheet("menu", "Menu", `<nav class="menu" aria-label="Menu">${menuItems(c, true)}</nav>`);
}

export interface IcsSummary {
  count: number;
  first: string | null;
  last: string | null;
  groups: string;
  cancelled: number; // classes the student marked as cancelled
}

/** Before downloading the .ics: what will be in the file, and that it won't update itself. */
export function icsConfirmSheet(s: IcsSummary): string {
  const range = s.first && s.last ? `${numericDate(s.first).slice(0, 5)} – ${numericDate(s.last)}` : "—";
  return sheet(
    "ics-confirm",
    "Pobrać plik kalendarza?",
    `<p>Plik <strong>.ics</strong> z Twoimi zajęciami do dodania w kalendarzu (Google, Apple, Outlook).</p>
     <dl class="facts confirm-facts">
       <dt>Zajęcia</dt><dd>${esc(zajecia(s.count))}</dd>
       <dt>Okres</dt><dd>${esc(range)}</dd>
       <dt>Grupy</dt><dd>${esc(s.groups)}</dd>
       ${s.cancelled ? `<dt>Odwołane</dt><dd>${esc(s.cancelled)} (oznaczone w nazwie jako „ODWOŁANE”)</dd>` : ""}
     </dl>
     <div class="info-block warn">To jednorazowa kopia. Gdy uczelnia zmieni plan, kalendarz sam się nie zaktualizuje — trzeba pobrać plik ponownie.</div>
     <div class="sheet-actions">
       <button class="primary" data-action="ics-download">Pobierz plik</button>
       <button class="secondary" data-action="close-sheet">Anuluj</button>
     </div>`,
  );
}

/** After downloading the .ics: how to add it. */
export function icsSheet(count: number, fileName: string): string {
  return sheet(
    "ics",
    "Plik kalendarza pobrany",
    `<p><strong>${esc(fileName)}</strong>: ${esc(zajecia(count))} z Twoich grup.</p>
     <ul class="steps">
       <li><strong>Telefon:</strong> otwórz pobrany plik i wybierz kalendarz, do którego dodać zajęcia.</li>
       <li><strong>Kalendarz Google:</strong> na komputerze <em>Ustawienia → Importuj i eksportuj → Importuj</em>.</li>
       <li><strong>Outlook, Apple:</strong> otwórz plik albo przeciągnij go do kalendarza.</li>
     </ul>
     <p class="fine">Gdy plan się zmieni, pobierz plik ponownie. Kalendarze, które rozpoznają te same zajęcia, zaktualizują je zamiast dublować.</p>`,
  );
}

// ---------- pages ----------

function page(title: string, body: string): string {
  return `<div class="page page-text">
    <header class="pagebar"><button class="iconbtn" data-action="close-page" aria-label="Wróć">${ICON.back}</button>${brand()}</header>
    <main class="page-body anim-fade"><h1 class="page-title">${esc(title)}</h1>${body}</main></div>`;
}

const CHANGE_LABEL: Record<ChangeItem["kind"], string> = {
  added: "Nowe",
  removed: "Usunięte",
  moved: "Nowa godzina",
  room: "Nowa sala",
  other: "Zmiana",
};

function changeRow(i: ChangeItem): string {
  const e = i.event;
  const b = i.before;
  const time = (x: ClassEvent) => `${shortTime(x.start)}–${shortTime(x.end)}`;
  let what: string;
  if (i.kind === "moved" && b) what = `${esc(dayDate(e.date))}, <s>${esc(time(b))}</s> → <strong>${esc(time(e))}</strong>`;
  else if (i.kind === "room" && b)
    what = `${esc(dayDate(e.date))}, ${esc(time(e))} · sala <s>${esc(b.room ?? "—")}</s> → <strong>${esc(e.room ?? "—")}</strong>`;
  else what = `${esc(dayDate(e.date))}, ${esc(time(e))}${e.room ? ` · ${esc(e.room)}` : ""}`;
  const meta = [kindShort(e.kind), groupText(e)].filter(Boolean).join(" · ");
  const inner = `<span class="swatch" style="--c:${esc(e.color)}"></span>
    <span class="ch-tag ch-${i.kind}">${CHANGE_LABEL[i.kind]}</span>
    <span class="ch-title">${esc(e.title)}${meta ? ` <span class="muted">· ${esc(meta)}</span>` : ""}</span>
    <span class="ch-what">${what}</span>`;
  return i.kind === "removed"
    ? `<li><div class="ch-row ch-removed-row">${inner}</div></li>`
    : `<li><button class="ch-row" data-action="goto-day" data-date="${e.date}" aria-label="${esc(
        `${CHANGE_LABEL[i.kind]}: ${e.title}, ${longDate(e.date)}. Pokaż dzień`,
      )}">${inner}<span class="ch-go" aria-hidden="true">${ICON.right}</span></button></li>`;
}

export function changesView(changes: ChangeSet[], sel: Selection, tt: Timetable, newShas: string[]): string {
  if (!changes.length) {
    const since = tt.source.updated ? ` (wersja z ${numericDate(tt.source.updated)})` : "";
    return page(
      "Zmiany w planie",
      `<div class="empty-card"><strong>Brak zmian</strong><span>Od kiedy strona śledzi ten plan${esc(since)}, uczelnia go nie zmieniła.</span></div>
       <p class="fine">Gdy na stronie UR pojawi się nowa wersja, zobaczysz tu, co się zmieniło: nowe, usunięte i przeniesione zajęcia oraz zmiany sal — najpierw te z Twoich grup.</p>`,
    );
  }
  const sections = changes
    .map((set) => {
      const items = changeItems(set, sel, tt.optional_subjects);
      const mine = items.filter((i) => i.mine);
      const others = items.filter((i) => !i.mine);
      const isNew = newShas.includes(set.sha256);
      const date = numericDate(set.updated ?? set.published_at.slice(0, 10));
      const summary = mine.length
        ? `${plural(mine.length, "zmiana", "zmiany", "zmian")} w Twoich zajęciach`
        : "Żadna zmiana nie dotyczy Twoich zajęć";
      return `<section class="ch-set">
        <h2>Aktualizacja z ${esc(date)}${isNew ? ` <span class="badge">nowa</span>` : ""}</h2>
        <p class="ch-summary">${esc(summary)}</p>
        ${mine.length ? `<ul class="ch-list">${mine.map(changeRow).join("")}</ul>` : ""}
        ${
          others.length
            ? `<details class="ch-others"><summary>Inne grupy: ${esc(plural(others.length, "zmiana", "zmiany", "zmian"))}</summary><ul class="ch-list">${others
                .map(changeRow)
                .join("")}</ul></details>`
            : ""
        }
      </section>`;
    })
    .join("");
  return page(
    "Zmiany w planie",
    `<p class="hint">Co uczelnia zmieniła w kolejnych wersjach planu. Najnowsze na górze.</p>${sections}
     <p class="fine">Zmiany są wyliczane automatycznie przez porównanie wersji PDF. Zajęcia przeniesione na inny dzień są pokazane jako usunięte i nowe.</p>`,
  );
}

/** "Wersja 0.4.0 (demo) z 21.10.2026" */
export function versionText(): string {
  return `Wersja ${esc(VERSION)} (demo)${BUILD_DATE ? ` z ${esc(numericDate(BUILD_DATE))}` : ""}`;
}

const REPO_URL = "https://github.com/Bylge/ur_timetable";
// The project's contact address (also in src/ur_timetable/fetch.py, for the User-Agent). Empty: no contact
// section and no "Zgłoś błąd" link yet.
export const CONTACT_EMAIL = "";

export function aboutView(sourceUrl: string | null): string {
  const pdf = sourceUrl ? ` (<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">otwórz PDF</a>)` : "";
  return page(
    "O projekcie",
    `<p><strong>Plan zajęć UR · nieoficjalny</strong> pokazuje plan z PDF publikowanych przez Uniwersytet Rzeszowski w wygodniejszej formie: wybierasz swoje grupy i widzisz tylko swoje zajęcia — na dziś i na cały tydzień, z godzinami i salami.</p>
     <div class="info-block warn"><strong>To nie jest strona uczelni.</strong> Projekt jest niezależny i niezwiązany z Uniwersytetem Rzeszowskim. Plan jest odczytywany automatycznie i może zawierać błędy. W razie wątpliwości obowiązuje plan w PDF${pdf}.</div>
     <h2>Jak to działa</h2>
     <ol class="steps">
       <li>Trzy razy dziennie (rano, po południu i wieczorem) automat sprawdza stronę z planami na ur.edu.pl.</li>
       <li>Gdy pojawi się nowa wersja PDF, odczytuje z niej zajęcia: daty, godziny, sale i grupy.</li>
       <li>Sprawdza wynik. Gdy coś poważnie się nie zgadza, nowa wersja <strong>nie jest</strong> publikowana — strona pokazuje poprzednią z ostrzeżeniem i linkiem do PDF. Pojedyncze zajęcia, których nie da się pewnie odczytać, są pominięte i wypisane w ostrzeżeniu.</li>
       <li>Porównuje wersje i pokazuje, co się zmieniło.</li>
     </ol>
     <h2>Czego tu nie ma</h2>
     <ul class="steps">
       <li>Nazwisk prowadzących.</li>
       <li>Zajęć praktycznych (bloków „ZAJĘCIA PRAKTYCZNE”).</li>
       <li>Języka niemieckiego (przedmiot do wyboru) — na razie pominięty.</li>
       <li>Odwołań ogłaszanych poza planem w PDF. Takie zajęcia możesz oznaczyć jako odwołane — kliknij zajęcia i włącz „Odwołane”.</li>
       <li>Planów, które nie zostały jeszcze sprawdzone. Kolejne kierunki i lata będą dodawane.</li>
     </ul>
     <h2>Jak aplikacja na telefonie</h2>
     <p>Stronę można dodać do ekranu głównego. Działa wtedy jak aplikacja, także bez internetu (pokazuje ostatnio pobrany plan).</p>
     <ul class="steps">
       <li><strong>Android (Chrome):</strong> menu ⋮ → <em>Zainstaluj aplikację</em> albo <em>Dodaj do ekranu głównego</em>.</li>
       <li><strong>iPhone (Safari):</strong> przycisk udostępniania → <em>Do ekranu początkowego</em>. Po instalacji może być potrzebny ponowny wybór grup.</li>
     </ul>
     <h2>Kontakt</h2>
     <p>${CONTACT_EMAIL ? `Błąd w planie albo pomysł? Napisz: <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.` : "Adres kontaktowy pojawi się wkrótce."}</p>
     <h2>Wersja</h2>
     <p>${versionText()}. To wersja demonstracyjna: wygląd i funkcje mogą się jeszcze zmieniać, a plan może zawierać błędy.</p>
     <p class="fine">Kod źródłowy: <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>, licencja MIT.</p>`,
  );
}

export function privacyView(): string {
  return page(
    "Prywatność",
    `<p>Ta strona nie ma kont, nie używa plików cookie i nie zbiera Twoich danych osobowych.</p>
     <h2>Co jest zapisane na Twoim urządzeniu</h2>
     <p>W pamięci przeglądarki (<em>localStorage</em>), tylko po to, żeby strona działała tak, jak ją ustawisz:</p>
     <ul class="steps">
       <li>wybrany plan i numery grup,</li>
       <li>widok (dzień albo tydzień) i motyw, jeśli go wybierzesz,</li>
       <li>Twoje oznaczenia „Odwołane” i notatki,</li>
       <li>ostatnio widziana wersja planu (żeby pokazać, co się zmieniło).</li>
     </ul>
     <p>Te dane nie są nigdzie wysyłane. Żeby strona działała bez internetu, przeglądarka przechowuje też kopię strony i planu.</p>
     <p>Wybrany plan i grupy są również w adresie strony (<code>?t=…&amp;gr=…</code>), żeby można było zapisać zakładkę. Kto dostanie od Ciebie ten link, zobaczy plan dla tych samych grup (bez Twoich oznaczeń i notatek).</p>
     <button class="secondary danger" data-action="clear-data">Usuń moje dane z tego urządzenia</button>
     <h2>Hosting</h2>
     <p>Strona jest hostowana na GitHub Pages. Jak każdy serwer, GitHub może zapisywać w logach dane techniczne połączeń (np. adres IP) w celach bezpieczeństwa — zobacz <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">politykę prywatności GitHub</a>.</p>
     <h2>Uczelnia</h2>
     <p>Plany pobiera ze strony ur.edu.pl automat, nie Twoja przeglądarka, więc uczelnia nie dostaje informacji o tym, że korzystasz z tej strony (chyba że otworzysz link do PDF).</p>`,
  );
}

export function errorView(message: string): string {
  return `<div class="page"><header class="pagebar">${brand()}</header><main class="page-body">
    <h1 class="page-title">Nie udało się wczytać planu</h1><p class="muted">${esc(message)}</p>
    <button class="primary" data-action="reload">Spróbuj ponownie</button></main></div>`;
}

export { addDays };
