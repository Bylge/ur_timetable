import { describe, expect, it } from "vitest";
import { attends, holidayOn, myEvents, notesOn, placeDay, selectionComplete, todayState, weekDays, weekStart } from "./schedule";
import { addDays, ago, longDate, mondayOf, nowInWarsaw, relativeDay, weekRange, weekday } from "./time";
import type { ClassEvent, Selection, Timetable } from "./types";

function ev(over: Partial<ClassEvent>): ClassEvent {
  return {
    id: Math.random().toString(36).slice(2),
    date: "2026-10-14",
    start: "08:00",
    end: "09:30",
    title: "Chemia żywności",
    kind: "class",
    room: "D3.137",
    partition: null,
    group: null,
    color: "#ffcccc",
    notes: [],
    ...over,
  };
}

const sel: Selection = { timetable: "x", groups: { "2": 1, "5": 3 }, optional: [] };

describe("time", () => {
  it("reads Warsaw time in summer and winter", () => {
    expect(nowInWarsaw(new Date("2026-10-14T06:30:00Z"))).toEqual({ date: "2026-10-14", minutes: 8 * 60 + 30 }); // CEST
    expect(nowInWarsaw(new Date("2026-12-01T23:30:00Z"))).toEqual({ date: "2026-12-02", minutes: 30 }); // CET, next day
  });

  it("does date arithmetic on ISO strings", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(weekday("2026-10-14")).toBe(2); // Wednesday
    expect(mondayOf("2026-10-18")).toBe("2026-10-12"); // Sunday -> its Monday
  });

  it("formats in Polish", () => {
    expect(longDate("2026-10-14")).toBe("środa, 14 października");
    expect(weekRange("2026-10-12", 5)).toBe("12–16 paź");
    expect(weekRange("2026-09-28", 5)).toBe("28 wrz – 2 paź");
    expect(relativeDay("2026-10-15", "2026-10-14")).toBe("Jutro");
    expect(relativeDay("2026-10-19", "2026-10-14")).toBe("za 5 dni");
    expect(ago("2026-10-14T10:00:00Z", new Date("2026-10-14T12:10:00Z"))).toBe("2 godz. temu");
    expect(ago("2026-10-13T12:05:00Z", new Date("2026-10-14T13:00:00Z"))).toBe("wczoraj, 14:05");
  });
});

describe("schedule", () => {
  it("filters by groups and optional subjects", () => {
    expect(attends(ev({}), sel, [])).toBe(true); // everyone
    expect(attends(ev({ partition: 2, group: 1 }), sel, [])).toBe(true);
    expect(attends(ev({ partition: 2, group: 2 }), sel, [])).toBe(false);
    expect(attends(ev({ partition: 3, group: 1 }), sel, [])).toBe(false); // split not chosen
    const german = ev({ title: "Język niemiecki", partition: 1, group: 1 });
    expect(attends(german, sel, ["Język niemiecki"])).toBe(false);
    expect(attends(german, { ...sel, optional: ["Język niemiecki"] }, ["Język niemiecki"])).toBe(true);
  });

  it("knows when a selection is complete", () => {
    const tt = { splits: [2, 5] } as Timetable;
    expect(selectionComplete(tt, sel)).toBe(true);
    expect(selectionComplete(tt, { ...sel, groups: { "2": 1 } })).toBe(false);
    expect(selectionComplete(tt, { ...sel, groups: { "2": 3, "5": 1 } })).toBe(false); // group 3 of 2
  });

  it("decides how today opens", () => {
    const events = [ev({ date: "2026-10-14", start: "08:00", end: "09:30" }), ev({ date: "2026-10-19", start: "10:00" })];
    expect(todayState(events, { date: "2026-10-14", minutes: 8 * 60 })).toEqual({ state: "classes", next: "2026-10-19" });
    expect(todayState(events, { date: "2026-10-14", minutes: 9 * 60 + 30 })).toEqual({ state: "finished", next: "2026-10-19" });
    expect(todayState(events, { date: "2026-10-17", minutes: 600 })).toEqual({ state: "none", next: "2026-10-19" });
    expect(todayState(events, { date: "2026-10-20", minutes: 600 })).toEqual({ state: "none", next: null });
  });

  it("places overlapping classes side by side", () => {
    const a = ev({ start: "08:00", end: "10:00" });
    const b = ev({ start: "09:00", end: "11:00" });
    const c = ev({ start: "12:00", end: "13:00" });
    const placed = placeDay([c, b, a]);
    const by = (e: ClassEvent) => placed.find((p) => p.event === e)!;
    expect([by(a).lane, by(b).lane, by(a).lanes, by(b).lanes]).toEqual([0, 1, 2, 2]);
    expect([by(c).lane, by(c).lanes]).toEqual([0, 1]);
  });

  it("dedupes day notes and prefers the timetable's holiday name", () => {
    const notes = [
      { date: "2026-12-24", kind: "holiday" as const, text: "public holiday: Wigilia" },
      { date: "2026-12-24", kind: "holiday" as const, text: "PRZERWA ŚWIATECZNA 24.12.2026-3.01.2027" },
      { date: "2026-12-24", kind: "holiday" as const, text: "PRZERWA ŚWIATECZNA 24.12.2026-3.01.2027" },
    ];
    expect(notesOn(notes, "2026-12-24")).toHaveLength(2);
    expect(holidayOn(notes, "2026-12-24")).toBe("Przerwa świateczna 24.12.2026-3.01.2027"); // typo kept as printed
    expect(holidayOn([notes[0]], "2026-12-24")).toBe("Wigilia");
    const nov11 = [
      { date: "2026-11-11", kind: "holiday" as const, text: "public holiday: Narodowe Święto Niepodległości" },
      { date: "2026-11-11", kind: "holiday" as const, text: "ŚWIĘTO NIEPODLEGŁOŚCI" },
    ];
    expect(holidayOn(nov11, "2026-11-11")).toBe("Narodowe Święto Niepodległości");
  });

  it("sorts my events and builds week days", () => {
    const tt = {
      optional_subjects: [],
      events: [ev({ date: "2026-10-15" }), ev({ date: "2026-10-14", start: "10:00" }), ev({ date: "2026-10-14" })],
    } as unknown as Timetable;
    expect(myEvents(tt, sel).map((e) => e.date + e.start)).toEqual(["2026-10-1408:00", "2026-10-1410:00", "2026-10-1508:00"]);
    expect(weekDays("2026-10-14", false)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(weekStart("2026-10-17", false)).toBe("2026-10-19"); // Saturday shows the coming week
    expect(weekStart("2026-10-17", true)).toBe("2026-10-12"); // ... unless the timetable has weekend classes
  });
});
