"""A student's schedule: filter events by group profile, export to iCalendar."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime

from .interpret import Event


def attends(event: Event, groups: dict[str, int], optional_subjects: set[str], chosen_optional: set[str]) -> bool:
    if event.errors:
        return False  # unresolved events are never published
    if event.subject in optional_subjects and event.subject not in chosen_optional:
        return False
    if event.partition is None or event.partition == 1:
        return True
    return groups.get(str(event.partition)) == event.group


def student_schedule(
    events: Iterable[Event],
    groups: dict[str, int],
    optional_subjects: set[str] = frozenset(),  # type: ignore[assignment]
    chosen_optional: set[str] = frozenset(),  # type: ignore[assignment]
) -> list[Event]:
    chosen = [e for e in events if attends(e, groups, optional_subjects, chosen_optional)]
    return sorted(chosen, key=lambda e: (e.date, e.start))


KIND_LABEL = {"lecture": "wykład", "class": "ćwiczenia"}

VTIMEZONE_WARSAW = """BEGIN:VTIMEZONE
TZID:Europe/Warsaw
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE"""


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    """Fold lines longer than 75 octets (RFC 5545)."""
    out, current = [], ""
    for ch in line:
        if len((current + ch).encode()) > 75:
            out.append(current)
            current = " " + ch
        else:
            current += ch
    out.append(current)
    return "\r\n".join(out)


def _local(date_iso: str, hhmm: str) -> str:
    return date_iso.replace("-", "") + "T" + hhmm.replace(":", "") + "00"


def to_ics(events: Iterable[Event], calendar_name: str) -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ur-timetable//EN",
        "CALSCALE:GREGORIAN",
        f"X-WR-CALNAME:{_escape(calendar_name)}",
        "X-WR-TIMEZONE:Europe/Warsaw",
        *VTIMEZONE_WARSAW.splitlines(),
    ]
    for e in events:
        summary = e.title
        if e.kind in KIND_LABEL:
            summary += f" ({KIND_LABEL[e.kind]})"
        details = []
        if e.partition and e.partition > 1:
            details.append(f"Grupa {e.group}/{e.partition}")
        if e.lecturer:
            details.append(e.lecturer)
        details += e.notes
        details.append(f"Źródło: {e.source.get('text', '')}")
        lines += [
            "BEGIN:VEVENT",
            f"UID:{e.id}@ur-timetable",
            f"DTSTAMP:{stamp}",
            f"DTSTART;TZID=Europe/Warsaw:{_local(e.date, e.start)}",
            f"DTEND;TZID=Europe/Warsaw:{_local(e.date, e.end)}",
            f"SUMMARY:{_escape(summary)}",
        ]
        if e.room:
            lines.append(f"LOCATION:{_escape(e.room)}")
        lines += [f"DESCRIPTION:{_escape(chr(10).join(details))}", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(ln) for ln in lines) + "\r\n"
