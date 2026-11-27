// Terminy: the student's own exams, tests, credits and assignments. Stored only on their device (localStorage),
// never sent anywhere; the plan shows them as a dot in the day picker, a row on the day and a line in the week.

import { daysBetween } from "./time";

export type TermType = "egzamin" | "kolokwium" | "zaliczenie" | "zadanie";

export const TERM_TYPES: TermType[] = ["egzamin", "kolokwium", "zaliczenie", "zadanie"];
export const TERM_LABEL: Record<TermType, string> = {
  egzamin: "Egzamin",
  kolokwium: "Kolokwium",
  zaliczenie: "Zaliczenie",
  zadanie: "Zadanie",
};

export interface Term {
  id: string;
  type: TermType;
  subject: string; // a subject from the plan, or the student's own text
  date: string; // YYYY-MM-DD
  time: string; // "HH:MM" or ""
  room: string;
  note: string;
}

const KEY = "planur:terms:v1";

function valid(t: unknown): t is Term {
  const x = t as Term;
  return (
    !!x &&
    typeof x.id === "string" &&
    TERM_TYPES.includes(x.type) &&
    typeof x.subject === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
    typeof x.time === "string" &&
    typeof x.room === "string" &&
    typeof x.note === "string"
  );
}

export function loadTerms(): Term[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown[];
    return Array.isArray(list) ? list.filter(valid) : [];
  } catch {
    return [];
  }
}

export function saveTerms(terms: Term[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(terms));
  } catch {
    // private mode or storage full: kept for this visit only
  }
}

export function newTermId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** By date, then time (entries without a time first that day). */
export function sortTerms(terms: Term[]): Term[] {
  return [...terms].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export function termsOn(terms: Term[], date: string): Term[] {
  return sortTerms(terms.filter((t) => t.date === date));
}

/** Today and later, soonest first. */
export function upcomingTerms(terms: Term[], today: string): Term[] {
  return sortTerms(terms.filter((t) => t.date >= today));
}

/** Before today, most recent first. */
export function pastTerms(terms: Term[], today: string): Term[] {
  return sortTerms(terms.filter((t) => t.date < today)).reverse();
}

/** "dziś", "jutro", "pojutrze", "za 8 dni" (Polish plural: "za 2 dni" and "za 5 dni" alike). */
export function untilText(date: string, today: string): string {
  const n = daysBetween(today, date);
  if (n <= 0) return n === 0 ? "dziś" : "minęło";
  return n === 1 ? "jutro" : n === 2 ? "pojutrze" : `za ${n} dni`;
}

/** Entries within the coming week (the badge on the Terminy tab). */
export function soonCount(terms: Term[], today: string): number {
  return terms.filter((t) => {
    const n = daysBetween(today, t.date);
    return n >= 0 && n <= 7;
  }).length;
}
