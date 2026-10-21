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
