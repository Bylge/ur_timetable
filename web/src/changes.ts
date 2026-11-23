// What changed in the timetable: which updates the student hasn't seen, and each change as one item.

import type { ChangeSet, ClassEvent, Selection } from "./types";
import { attends } from "./schedule";

export type ChangeKind = "added" | "removed" | "moved" | "room" | "other";

export interface ChangeItem {
  kind: ChangeKind;
  event: ClassEvent; // the class as it is now (for "removed": as it was)
  before?: ClassEvent; // for changed classes
  mine: boolean; // the student attends it (before or after the change)
}

/**
 * Updates published after the version the student last saw, newest first. No version seen yet (first
 * visit) or the current one seen: nothing. A seen version older than the kept history: all of it.
 */
export function unseenChanges(changes: ChangeSet[], seen: string | undefined, current: string): ChangeSet[] {
  if (!seen || seen === current) return [];
  const out: ChangeSet[] = [];
  for (const c of changes) {
    if (c.sha256 === seen) break;
    out.push(c);
    if (c.previous_sha256 === seen) break;
  }
  return out;
}

/** The items of one update, the student's own first, each group sorted by date and time. */
export function changeItems(set: ChangeSet, sel: Selection, optionalSubjects: string[]): ChangeItem[] {
  const mine = (e: ClassEvent) => attends(e, sel, optionalSubjects);
  const items: ChangeItem[] = [
    ...set.added.map((e) => ({ kind: "added" as const, event: e, mine: mine(e) })),
    ...set.removed.map((e) => ({ kind: "removed" as const, event: e, mine: mine(e) })),
    ...set.changed.map((c) => ({
      kind: (c.fields.includes("start") || c.fields.includes("end")
        ? "moved"
        : c.fields.includes("room")
          ? "room"
          : "other") as ChangeKind,
      event: c.after,
      before: c.before,
      mine: mine(c.before) || mine(c.after),
    })),
  ];
  const key = (i: ChangeItem) => `${i.mine ? 0 : 1}${i.event.date}${i.event.start}`;
  return items.sort((a, b) => key(a).localeCompare(key(b)));
}

export function myChangeCount(sets: ChangeSet[], sel: Selection, optionalSubjects: string[]): number {
  return sets.reduce((n, s) => n + changeItems(s, sel, optionalSubjects).filter((i) => i.mine).length, 0);
}

/** How a class changed in a recent update, for the mark on the class itself. */
export interface RecentChange {
  kind: "added" | "moved" | "room" | "other";
  before?: ClassEvent;
  updated: string; // the update's date (university's "aktualizacja", else publication), ISO
}

/** Updates this recent (days) mark their classes in the plan. */
export const RECENT_DAYS = 14;

/**
 * Classes added or changed in updates published in the last RECENT_DAYS days, by event id (as it is now).
 * Newer updates win. Removed classes aren't in the plan, so they're only on the Zmiany page.
 */
export function recentChanges(changes: ChangeSet[], today: string): Map<string, RecentChange> {
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - RECENT_DAYS);
  const from = since.toISOString().slice(0, 10);
  const out = new Map<string, RecentChange>();
  for (const set of [...changes].reverse()) {
    if (set.published_at.slice(0, 10) < from) continue;
    const updated = set.updated ?? set.published_at.slice(0, 10);
    for (const e of set.added) out.set(e.id, { kind: "added", updated });
    for (const c of set.changed) {
      const kind = c.fields.includes("start") || c.fields.includes("end") ? "moved" : c.fields.includes("room") ? "room" : "other";
      out.set(c.after.id, { kind, before: c.before, updated });
    }
  }
  return out;
}
