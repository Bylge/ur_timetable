import { describe, expect, it } from "vitest";
import { changeItems, myChangeCount, unseenChanges } from "./changes";
import { fold, icsEscape, icsFileName, toIcs } from "./ics";
import { plural } from "./labels";
import { dayDate } from "./time";
import type { ChangeSet, ClassEvent, Selection } from "./types";

function ev(over: Partial<ClassEvent>): ClassEvent {
  return {
    id: "abc123",
    date: "2026-11-05",
    start: "14:00",
    end: "15:30",
    title: "Chemia żywności",
    kind: "class",
    room: "D3.137",
    partition: 5,
    group: 1,
    color: "#ffcccc",
    notes: [],
    ...over,
  };
}

const sel: Selection = { timetable: "x", groups: { "2": 1, "5": 1 }, optional: [] };

function set(sha: string, prev: string, over: Partial<ChangeSet> = {}): ChangeSet {
  return { published_at: "2026-10-13T22:00:00Z", updated: "2026-10-13", sha256: sha, previous_sha256: prev, added: [], removed: [], changed: [], ...over };
}

describe("changes", () => {
  const history = [set("c", "b"), set("b", "a")];

  it("finds the updates published after the version seen", () => {
    expect(unseenChanges(history, undefined, "c")).toEqual([]); // first visit
    expect(unseenChanges(history, "c", "c")).toEqual([]);
    expect(unseenChanges(history, "b", "c").map((s) => s.sha256)).toEqual(["c"]);
    expect(unseenChanges(history, "a", "c").map((s) => s.sha256)).toEqual(["c", "b"]);
    expect(unseenChanges(history, "zzz", "c").map((s) => s.sha256)).toEqual(["c", "b"]); // older than history
  });

  it("classifies items and puts the student's own first", () => {
    const s = set("c", "b", {
      added: [ev({ id: "1", group: 2, date: "2026-11-01" })],
      removed: [ev({ id: "2", partition: null, group: null })],
      changed: [
        { before: ev({ id: "3", start: "16:15" }), after: ev({ id: "4", start: "14:00" }), fields: ["start", "end"] },
        { before: ev({ id: "5", room: "A" }), after: ev({ id: "5", room: "B" }), fields: ["room"] },
      ],
    });
    const items = changeItems(s, sel, []);
    expect(items.map((i) => [i.kind, i.mine])).toEqual([
      ["removed", true],
      ["moved", true],
      ["room", true],
      ["added", false],
    ]);
    expect(myChangeCount([s], sel, [])).toBe(3);
  });

  it("counts a class moved out of the student's group as theirs", () => {
    const s = set("c", "b", {
      changed: [{ before: ev({ partition: 2, group: 1 }), after: ev({ partition: 2, group: 2 }), fields: ["start"] }],
    });
    expect(myChangeCount([s], sel, [])).toBe(1);
  });
});

describe("ics", () => {
  it("escapes and folds by octets without splitting characters", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const line = `SUMMARY:${"ż".repeat(60)}`;
    const folded = fold(line).split("\r\n");
    for (const part of folded) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
  });

  it("writes events in Warsaw time with marks", () => {
    const text = toIcs([ev({}), ev({ id: "x2", kind: "lecture", partition: null, group: null, room: null })], {
      name: "Plan",
      sourceUrl: "https://example.org/plan.pdf",
      marks: { abc123: { cancelled: true, note: "choroba" } },
      noteText: (n) => n,
      at: new Date("2026-10-14T10:00:00Z"),
    });
    expect(text).toContain("DTSTART;TZID=Europe/Warsaw:20261105T140000");
    expect(text).toContain("UID:abc123@ur-timetable");
    expect(text).toContain("SUMMARY:ODWOŁANE: Chemia żywności (ćwiczenia)");
    expect(text).toContain("TRANSP:TRANSPARENT");
    expect(text).toContain("SUMMARY:Chemia żywności (wykład)");
    expect(text).toContain("DTSTAMP:20261014T100000Z");
    expect(text.split("BEGIN:VEVENT")).toHaveLength(3);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(icsFileName("dietetyka/I-st_ST_rok-1")).toBe("plan-dietetyka-I-st_ST_rok-1.ics");
  });
});

describe("Polish", () => {
  it("plurals", () => {
    expect([1, 2, 5, 12, 22, 25].map((n) => plural(n, "zmiana", "zmiany", "zmian"))).toEqual([
      "1 zmiana",
      "2 zmiany",
      "5 zmian",
      "12 zmian",
      "22 zmiany",
      "25 zmian",
    ]);
    expect(dayDate("2026-11-04")).toBe("śr. 4.11");
  });
});
