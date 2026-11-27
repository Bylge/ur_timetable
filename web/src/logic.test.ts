import { describe, expect, it } from "vitest";
import { attends, holidayOn, hourRange, myEvents, notesOn, placeDay, selectionComplete, todayState, validTime, weekDays, weekStart, wfPlanned } from "./schedule";
import { recentChanges } from "./changes";
import { newsFor } from "./news";
import { pastTerms, soonCount, sortTerms, termsOn, untilText, upcomingTerms, type Term } from "./terms";
import { groupsShort, groupsSummary, shortTitle } from "./labels";
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

describe("WF at the student's own hour", () => {
  const wf = (over: Partial<ClassEvent>) =>
    ev({ title: "Wychowanie fizyczne", start: "08:30", end: "10:15", notes: ["start 08:30 from cell text (grid: 08:45)"], ...over });
  const tt = {
    optional_subjects: [],
    events: [wf({ id: "a", date: "2026-10-06" }), wf({ id: "b", date: "2026-10-13" }), ev({ id: "c", date: "2026-10-13", start: "10:30", end: "12:00" })],
  } as unknown as Timetable;

  it("finds the PDF's WF time", () => {
    expect(wfPlanned(tt)).toEqual({ start: "08:30", minutes: 105 });
    expect(wfPlanned({ events: [ev({})] } as unknown as Timetable)).toBeNull();
  });

  it("moves every WF class, keeps its length, id and other classes", () => {
    const mine = myEvents(tt, { ...sel, wf: "11:45" });
    const moved = mine.filter((e) => e.title === "Wychowanie fizyczne");
    expect(moved.map((e) => [e.id, e.start, e.end])).toEqual([
      ["a", "11:45", "13:30"],
      ["b", "11:45", "13:30"],
    ]);
    expect(moved[0].planned).toEqual({ start: "08:30", end: "10:15" });
    expect(moved[0].notes).toEqual([]); // the PDF-time note no longer applies
    expect(mine.find((e) => e.id === "c")).toMatchObject({ start: "10:30", end: "12:00" });
    expect(mine.map((e) => e.id)).toEqual(["a", "c", "b"]); // sorted by the new time
    expect(tt.events[0].start).toBe("08:30"); // the timetable itself is untouched
  });

  it("leaves WF as in the PDF without a chosen hour", () => {
    const a = myEvents(tt, sel).find((e) => e.id === "a")!;
    expect(a.start).toBe("08:30");
    expect(a.planned).toBeUndefined();
  });

  it("widens the time axis for a late WF and checks times", () => {
    expect(hourRange(myEvents(tt, { ...sel, wf: "19:30" }))).toEqual({ from: 8, to: 22 });
    expect(validTime("07:05")).toBe(true);
    expect(validTime("7:05")).toBe(false);
    expect(validTime("24:00")).toBe(false);
    expect(validTime(undefined)).toBe(false);
  });
});

describe("recent changes and group labels", () => {
  const set = (published: string, added: ClassEvent[], changed: { before: ClassEvent; after: ClassEvent; fields: string[] }[] = []) => ({
    published_at: `${published}T12:00:00+00:00`,
    updated: published,
    sha256: published,
    previous_sha256: "",
    added,
    removed: [],
    changed,
  });

  it("marks classes from updates of the last 14 days, the newest update winning", () => {
    const old = set("2026-10-13", [ev({ id: "old" })]);
    const recent = set("2026-11-18", [ev({ id: "new" })], [{ before: ev({ id: "x", room: "A" }), after: ev({ id: "x", room: "B" }), fields: ["room"] }]);
    const latest = set("2026-11-23", [], [{ before: ev({ id: "x", start: "08:00" }), after: ev({ id: "x" }), fields: ["start"] }]);
    const map = recentChanges([latest, recent, old], "2026-11-25");
    expect([...map.keys()].sort()).toEqual(["new", "x"]);
    expect(map.get("new")).toMatchObject({ kind: "added", updated: "2026-11-18" });
    expect(map.get("x")).toMatchObject({ kind: "moved", updated: "2026-11-23" });
    expect(recentChanges([recent], "2026-12-03").size).toBe(0); // 15 days later
  });

  it("writes groups short and spelled out", () => {
    const tt = { splits: [2, 3, 5] } as unknown as Timetable;
    const s = { timetable: "x", groups: { "2": 1, "3": 3 }, optional: [] };
    expect(groupsShort(tt, s)).toBe("1 · 3 · –");
    expect(groupsSummary(tt, s)).toBe("1 z 2 · 3 z 3 · – z 5");
  });
});

describe("short subject names for the week columns", () => {
  it("shortens the year-1 subjects", () => {
    const names: Record<string, string> = {
      "Anatomia człowieka": "Anatomia",
      "Biochemia ogólna i żywności": "Biochemia",
      "Chemia żywności": "Chemia",
      "Fizjologia człowieka": "Fizjologia",
      "Genetyka z elementami nutrigenomiki": "Genetyka",
      "Język angielski": "Angielski",
      "Kwalifikowana I pomoc (KPP)": "KPP",
      "Mikrobiologia ogólna i żywności": "Mikrobio.",
      "Parazytologia": "Parazyto.",
      "Podstawy opieki nad chorym": "Opieka",
      "SZKOLENIE - obowiązkowe z zakresu praw i obowiązków": "Szkolenie",
      "Wychowanie fizyczne": "WF",
      "spotkanie organizacyjne": "Spotkanie",
    };
    for (const [title, short] of Object.entries(names)) expect(shortTitle(title)).toBe(short);
  });
});

describe("Co nowego: which notes to show", () => {
  it("shows the newest unseen notes, also after a fix release without its own", () => {
    expect(newsFor("0.6.1", "0.5.0")?.version).toBe("0.6.0"); // skipped 0.6.0: still sees its notes
    expect(newsFor("0.6.1", "0.6.0")).toBeNull(); // saw them already
    expect(newsFor("0.6.0", "0.6.0")).toBeNull();
    expect(newsFor("0.6.1", "0.6.0", true)?.version).toBe("0.6.0"); // ?nowosci
    expect(newsFor("0.5.0", "0.4.2")).toBeNull(); // nothing that old
  });
});

describe("Terminy", () => {
  const term = (over: Partial<Term>): Term => ({ id: Math.random().toString(36).slice(2), type: "kolokwium", subject: "Chemia", date: "2026-12-03", time: "", room: "", note: "", ...over });
  const today = "2026-11-25";
  const list = [
    term({ id: "late", date: "2027-01-28" }),
    term({ id: "past", date: "2026-11-18" }),
    term({ id: "pm", date: "2026-12-03", time: "13:00" }),
    term({ id: "am", date: "2026-12-03", time: "08:45" }),
    term({ id: "today", date: today }),
  ];

  it("sorts by day and time; splits upcoming (from today) and past (newest first)", () => {
    expect(sortTerms(list).map((t) => t.id)).toEqual(["past", "today", "am", "pm", "late"]);
    expect(upcomingTerms(list, today).map((t) => t.id)).toEqual(["today", "am", "pm", "late"]);
    expect(pastTerms([...list, term({ id: "older", date: "2026-11-01" })], today).map((t) => t.id)).toEqual(["past", "older"]);
    expect(termsOn(list, "2026-12-03").map((t) => t.id)).toEqual(["am", "pm"]);
  });

  it("says how long is left, and counts the coming week for the badge", () => {
    expect(untilText(today, today)).toBe("dziś");
    expect(untilText("2026-11-26", today)).toBe("jutro");
    expect(untilText("2026-11-27", today)).toBe("pojutrze");
    expect(untilText("2026-12-03", today)).toBe("za 8 dni");
    expect(untilText("2026-11-18", today)).toBe("minęło");
    expect(soonCount(list, today)).toBe(1); // only today's; 03.12 is 8 days away
    expect(soonCount(list, "2026-11-26")).toBe(2);
  });
});

