// The student's schedule as an iCalendar file (RFC 5545), built in the browser. Same event UIDs as the
// Python export (src/ur_timetable/schedule.py), so importing again updates instead of duplicating.

import type { ClassEvent, Mark } from "./types";
import { kindLabel } from "./labels";

const VTIMEZONE_WARSAW = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Warsaw",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets, never inside a character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (enc.encode(current + ch).length > 75) {
      out.push(current);
      current = ` ${ch}`;
    } else current += ch;
  }
  out.push(current);
  return out.join("\r\n");
}

function local(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function stamp(at: Date): string {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
}

export interface IcsOptions {
  name: string; // calendar name
  sourceUrl: string;
  marks: Record<string, Mark>;
  noteText: (note: string) => string; // parser notes in Polish
  at?: Date;
}

export function toIcs(events: ClassEvent[], o: IcsOptions): string {
  const dtstamp = stamp(o.at ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Plan zajec UR nieoficjalny//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(o.name)}`,
    "X-WR-TIMEZONE:Europe/Warsaw",
    ...VTIMEZONE_WARSAW,
  ];
  for (const e of events) {
    const mark = o.marks[e.id];
    const kind = kindLabel(e.kind);
    const summary = `${mark?.cancelled ? "ODWOŁANE: " : ""}${e.title}${kind ? ` (${kind})` : ""}`;
    const details = [
      mark?.cancelled ? `Odwołane (Twoje oznaczenie)${mark.note ? `: ${mark.note}` : ""}` : mark?.note ? `Notatka: ${mark.note}` : "",
      e.partition && e.partition > 1 ? `Grupa ${e.group}/${e.partition}` : "",
      ...e.notes.map(o.noteText),
      `Plan nieoficjalny, w razie wątpliwości obowiązuje PDF: ${o.sourceUrl}`,
    ].filter(Boolean);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@ur-timetable`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Warsaw:${local(e.date, e.start)}`,
      `DTEND;TZID=Europe/Warsaw:${local(e.date, e.end)}`,
      `SUMMARY:${icsEscape(summary)}`,
      ...(e.room ? [`LOCATION:${icsEscape(e.room)}`] : []),
      `DESCRIPTION:${icsEscape(details.join("\n"))}`,
      // Not STATUS:CANCELLED: some calendars then hide the event, and the student should still see it.
      ...(mark?.cancelled ? ["TRANSP:TRANSPARENT"] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** "dietetyka/I-st_ST_rok-1" -> "plan-dietetyka-I-st_ST_rok-1.ics" */
export function icsFileName(timetableId: string): string {
  return `plan-${timetableId.replace(/[^\w-]+/g, "-")}.ics`;
}

export function download(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
