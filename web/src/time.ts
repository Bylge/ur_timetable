// Dates as "YYYY-MM-DD" strings and times as "HH:MM", always in Polish time (Europe/Warsaw).

const ZONE = "Europe/Warsaw";

export const DAY_NAMES = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"];
export const DAY_SHORT = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
const DAY_ABBR = ["pon.", "wt.", "śr.", "czw.", "pt.", "sob.", "niedz."];
const MONTHS_GENITIVE = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];
const MONTHS_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

export interface Now {
  date: string; // today in Warsaw
  minutes: number; // minutes since midnight in Warsaw
}

export function nowInWarsaw(at: Date = new Date()): Now {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function hhmm(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "08:45" -> "8:45" (how Polish timetables usually write it). */
export function shortTime(t: string): string {
  return t.replace(/^0/, "");
}

function utc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
}

/** 0 = Monday ... 6 = Sunday */
export function weekday(iso: string): number {
  return (utc(iso).getUTCDay() + 6) % 7;
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekday(iso));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
}

/** "środa, 14 października" */
export function longDate(iso: string): string {
  const d = utc(iso);
  return `${DAY_NAMES[weekday(iso)]}, ${d.getUTCDate()} ${MONTHS_GENITIVE[d.getUTCMonth()]}`;
}

/** "pon." */
export function weekdayShort(iso: string): string {
  return DAY_ABBR[weekday(iso)];
}

/** "śr. 4.11" */
export function dayDate(iso: string): string {
  const d = utc(iso);
  return `${DAY_ABBR[weekday(iso)]} ${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "14 paź" */
export function shortDate(iso: string): string {
  const d = utc(iso);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "14.10.2026" */
export function numericDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** "12–16 paź" or "28 wrz – 2 paź" */
export function weekRange(monday: string, days: number): string {
  const end = addDays(monday, days - 1);
  const a = utc(monday);
  const b = utc(end);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS_SHORT[b.getUTCMonth()]}`;
  return `${shortDate(monday)} – ${shortDate(end)}`;
}

/** "Dziś", "Jutro", "Wczoraj", "za 3 dni", "3 dni temu" */
export function relativeDay(iso: string, today: string): string {
  const n = daysBetween(today, iso);
  if (n === 0) return "Dziś";
  if (n === 1) return "Jutro";
  if (n === -1) return "Wczoraj";
  return n > 0 ? `za ${n} dni` : `${-n} dni temu`;
}

/** Relative time of a past moment: "przed chwilą", "25 min temu", "3 godz. temu", "wczoraj, 14:05", "12.10.2026". */
export function ago(isoDateTime: string, at: Date = new Date()): string {
  const then = new Date(isoDateTime);
  const minutes = Math.round((at.getTime() - then.getTime()) / 60_000);
  if (minutes < 2) return "przed chwilą";
  if (minutes < 60) return `${minutes} min temu`;
  if (minutes < 12 * 60) return `${Math.round(minutes / 60)} godz. temu`;
  const day = nowInWarsaw(then);
  const today = nowInWarsaw(at);
  const time = hhmm(day.minutes);
  if (day.date === today.date) return `dziś, ${time}`;
  if (daysBetween(day.date, today.date) === 1) return `wczoraj, ${time}`;
  return numericDate(day.date);
}

/** Clock time of a moment in Warsaw: "14:05" */
export function clockTime(isoDateTime: string): string {
  return hhmm(nowInWarsaw(new Date(isoDateTime)).minutes);
}
