// A student's schedule: filtering by groups, which day to open, laying out overlapping classes.

import type { ClassEvent, DayNote, Selection, Timetable } from "./types";
import { addDays, mondayOf, toMinutes, weekday, type Now } from "./time";

export function attends(e: ClassEvent, sel: Selection, optionalSubjects: string[]): boolean {
  if (optionalSubjects.includes(e.title) && !sel.optional.includes(e.title)) return false;
  if (e.partition === null || e.partition === 1) return true;
  return sel.groups[String(e.partition)] === e.group;
}

export function myEvents(tt: Timetable, sel: Selection): ClassEvent[] {
  return tt.events
    .filter((e) => attends(e, sel, tt.optional_subjects))
    .map((e) => (sel.wf && isWf(e) ? movedTo(e, sel.wf) : e))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

// ---------- Wychowanie fizyczne: the student's own hour ----------
// Students sign up for a WF slot themselves, so the hour in the PDF isn't everyone's. A student can set their
// own start time; every WF class moves there and keeps its length from the PDF. The event id stays, so marks
// and notes still apply (and a calendar re-import updates the entry instead of adding a second one).

const WF = /^wychowanie fizyczne/i;
/** The parser's notes about the PDF's times say nothing about a class the student moved. */
const TIME_NOTE = /^(start|end) \S+ from cell text/;

export function isWf(e: ClassEvent): boolean {
  return WF.test(e.title);
}

/** "HH:MM" between 00:00 and 23:59. */
export function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function pad(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The class at a new start time, same length (ending at 23:59 at the latest). */
export function movedTo(e: ClassEvent, start: string): ClassEvent {
  if (start === e.start) return e;
  return {
    ...e,
    start,
    end: endAfter(start, toMinutes(e.end) - toMinutes(e.start)),
    planned: { start: e.start, end: e.end },
    notes: e.notes.filter((n) => !TIME_NOTE.test(n)),
  };
}

/** WF as the PDF has it: the most common start and length, or null if the timetable has no WF. */
export function wfPlanned(tt: Timetable): { start: string; minutes: number } | null {
  const counts = new Map<string, number>();
  for (const e of tt.events.filter(isWf)) {
    const key = `${e.start}|${toMinutes(e.end) - toMinutes(e.start)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const [start, minutes] = top[0].split("|");
  return { start, minutes: Number(minutes) };
}

/** End of a class that starts at `start` and lasts `minutes`, as "HH:MM". */
export function endAfter(start: string, minutes: number): string {
  return pad(Math.min(toMinutes(start) + minutes, 23 * 60 + 59));
}

export function eventsOn(events: ClassEvent[], date: string): ClassEvent[] {
  return events.filter((e) => e.date === date);
}

/** Day notes for a date, without repeated texts (the PDF and the calendar can both mark a holiday). */
export function notesOn(notes: DayNote[], date: string): DayNote[] {
  const seen = new Set<string>();
  return notes.filter((n) => {
    if (n.date !== date) return false;
    const key = n.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** "ŚWIĘTO NIEPODLEGŁOŚCI" -> "Święto niepodległości"; text that isn't all capitals stays as it is. */
export function sentenceCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Name of a holiday or break on that date. A break from the timetable ("PRZERWA ŚWIĄTECZNA ...") says
 * more than the calendar name, so it wins; otherwise the calendar's proper name ("Narodowe Święto
 * Niepodległości"); otherwise the timetable's wording.
 */
export function holidayOn(notes: DayNote[], date: string): string | null {
  const day = notes.filter((n) => n.date === date && n.kind === "holiday");
  const fromPdf = day.find((n) => !n.text.startsWith("public holiday"));
  const calendar = day.find((n) => n.text.startsWith("public holiday"));
  if (fromPdf && /PRZERWA/i.test(fromPdf.text)) return sentenceCase(fromPdf.text);
  if (calendar) return calendar.text.replace(/^public holiday:\s*/, "");
  return fromPdf ? sentenceCase(fromPdf.text) : null;
}

export function nextClassDay(events: ClassEvent[], after: string): string | null {
  const next = events.find((e) => e.date > after);
  return next ? next.date : null;
}

export type TodayState = "classes" | "finished" | "none";

/**
 * How the plan opens: always on today. If today has no classes or they've all ended, the view shows
 * a card pointing to the next class day.
 */
export function todayState(events: ClassEvent[], now: Now): { state: TodayState; next: string | null } {
  const today = eventsOn(events, now.date);
  const next = nextClassDay(events, now.date);
  if (today.length === 0) return { state: "none", next };
  const lastEnd = Math.max(...today.map((e) => toMinutes(e.end)));
  return { state: now.minutes >= lastEnd ? "finished" : "classes", next };
}

export interface Placed {
  event: ClassEvent;
  lane: number;
  lanes: number;
}

/** Side-by-side placement for overlapping classes within one day. */
export function placeDay(events: ClassEvent[]): Placed[] {
  const sorted = [...events].sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(b.end) - toMinutes(a.end));
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const e of sorted) {
    const start = toMinutes(e.start);
    if (cluster.length && start >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = toMinutes(e.end);
    const p = { event: e, lane, lanes: 1 };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, toMinutes(e.end));
  }
  close();
  return placed;
}

/** Monday of the week shown for a date. At the weekend (no weekend classes) that's the coming week. */
export function weekStart(date: string, withWeekend: boolean): string {
  const monday = mondayOf(date);
  return !withWeekend && weekday(date) >= 5 ? addDays(monday, 7) : monday;
}

/** Days shown for a week: Mon–Fri, or Mon–Sun if the timetable has weekend classes. */
export function weekDays(date: string, withWeekend: boolean): string[] {
  const monday = weekStart(date, withWeekend);
  return Array.from({ length: withWeekend ? 7 : 5 }, (_, i) => addDays(monday, i));
}

export function hasWeekendClasses(tt: Timetable): boolean {
  return tt.events.some((e) => {
    const d = new Date(`${e.date}T12:00:00Z`).getUTCDay();
    return d === 0 || d === 6;
  });
}

/** Hours shown on the time axis: at least 8:00–20:00, wider if the classes need it (pass the student's own too: WF can move). */
export function hourRange(events: ClassEvent[]): { from: number; to: number } {
  let from = 8;
  let to = 20;
  for (const e of events) {
    from = Math.min(from, Math.floor(toMinutes(e.start) / 60));
    to = Math.max(to, Math.ceil(toMinutes(e.end) / 60));
  }
  return { from, to: Math.min(to, 24) };
}

export function semesterRange(tt: Timetable): { first: string; last: string } | null {
  if (!tt.events.length) return null;
  return { first: tt.events[0].date, last: tt.events[tt.events.length - 1].date };
}

export function selectionComplete(tt: Timetable, sel: Selection): boolean {
  return tt.splits.every((p) => sel.groups[String(p)] >= 1 && sel.groups[String(p)] <= p);
}
