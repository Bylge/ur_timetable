// Human-readable names and status texts.

import type { IndexEntry, Kind, Selection, Timetable } from "./types";
import { ago, clockTime, daysBetween, nowInWarsaw, numericDate } from "./time";

export interface TimetableId {
  programme: string;
  cycle: number;
  mode: "ST" | "NST";
  year: number;
}

/** "dietetyka/I-st_ST_rok-1" -> parts; null for ids in another format. */
export function parseId(id: string): TimetableId | null {
  const m = /^([^/]+)\/(I{1,2})-st_(ST|NST)_rok-(\d+)$/.exec(id);
  if (!m) return null;
  return { programme: m[1], cycle: m[2].length, mode: m[3] as "ST" | "NST", year: Number(m[4]) };
}

export function programmeName(programme: string): string {
  return programme.charAt(0).toUpperCase() + programme.slice(1).replace(/-/g, " ");
}

/** "Studia I stopnia · stacjonarne · rok 1" */
export function timetableName(id: string): string {
  const p = parseId(id);
  if (!p) return id;
  return `Studia ${"I".repeat(p.cycle)} stopnia · ${p.mode === "ST" ? "stacjonarne" : "niestacjonarne"} · rok ${p.year}`;
}

/** "Dietetyka · I st. · stacj. · rok 1" (for tight spaces) */
export function timetableShort(id: string): string {
  const p = parseId(id);
  if (!p) return id;
  return `${programmeName(p.programme)} · ${"I".repeat(p.cycle)} st. · ${p.mode === "ST" ? "stacj." : "niestacj."} · rok ${p.year}`;
}

/** "1/2 · 3/3 · 1/4 · 2/5" — group / number of groups, for each split */
/** "1 z 2 · 3 z 3 · …": group and number of groups, for each split (where there's room). */
export function groupsSummary(tt: Timetable, sel: Selection): string {
  return tt.splits.map((p) => `${sel.groups[String(p)] ?? "–"} z ${p}`).join(" · ");
}

/** "1 · 3 · 2 · 4": just the groups, in the order of the splits (bottom bar; "2/2" read like "2 of 2"). */
export function groupsShort(tt: Timetable, sel: Selection): string {
  return tt.splits.map((p) => `${sel.groups[String(p)] ?? "–"}`).join(" · ");
}

export function kindLabel(kind: Kind): string {
  return kind === "lecture" ? "wykład" : kind === "class" ? "ćwiczenia" : "";
}

export function kindShort(kind: Kind): string {
  return kind === "lecture" ? "wykład" : kind === "class" ? "ćw." : "";
}

/** Polish plural: plural(n, "zmiana", "zmiany", "zmian") -> "1 zmiana", "3 zmiany", "5 zmian", "22 zmiany". */
export function plural(n: number, one: string, few: string, many: string): string {
  const last = n % 10;
  const lastTwo = n % 100;
  const word = n === 1 ? one : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
  return `${n} ${word}`;
}

export type StatusLevel = "ok" | "stale" | "problem";

// The job checks three times a day (Polish time about 5–6, 12:30–13:30 and 18:30–19:30, see
// .github/workflows/update.yml): the longest normal gap is the night, ~10.5 h, plus GitHub's scheduler delay.
// Older than this looks stale.
const STALE_AFTER_HOURS = 13;

export function sourceStatus(entry: IndexEntry, at: Date = new Date()): { level: StatusLevel; line: string } {
  const checkedHoursAgo = (at.getTime() - new Date(entry.checked_at).getTime()) / 3_600_000;
  const level: StatusLevel =
    entry.status === "failed" || entry.status === "needs_review" ? "problem" : checkedHoursAgo > STALE_AFTER_HOURS ? "stale" : "ok";
  const plan = entry.updated ? `Plan z ${numericDate(entry.updated).slice(0, 5)}` : "Plan";
  return { level, line: `${plan} · sprawdzono ${checkedLabel(entry.checked_at, at)}` };
}

/** "14:05" today, "wczoraj 14:05", otherwise the date. */
export function checkedLabel(isoDateTime: string, at: Date = new Date()): string {
  const then = nowInWarsaw(new Date(isoDateTime)).date;
  const today = nowInWarsaw(at).date;
  if (then === today) return clockTime(isoDateTime);
  if (daysBetween(then, today) === 1) return `wczoraj ${clockTime(isoDateTime)}`;
  return numericDate(then);
}

export { ago };

/** Subjects whose name the general rules in shortTitle can't shorten well. */
const SHORT_NAMES: Record<string, string> = {
  "wychowanie fizyczne": "WF",
  "podstawy opieki nad chorym": "Opieka",
};

/**
 * A name that fits a narrow week column (~55 px): an abbreviation the name has ("… (KPP)"), a known short name,
 * "Język angielski" -> "Angielski", else the first word, cut at 9 letters ("Mikrobiologia" -> "Mikrobio."),
 * with capitals only at the start ("SZKOLENIE …" -> "Szkolenie").
 */
export function shortTitle(title: string): string {
  const abbr = /\(([A-ZĄĆĘŁŃÓŚŹŻ]{2,})\)/.exec(title);
  if (abbr) return abbr[1];
  const known = SHORT_NAMES[title.trim().toLowerCase()];
  if (known) return known;
  const words = title.trim().split(/\s+/);
  const word = /^język$/i.test(words[0]) && words[1] ? words[1] : words[0];
  const cased = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  return cased.length > 10 ? `${cased.slice(0, 8)}.` : cased;
}
