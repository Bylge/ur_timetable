"""Stage 4: turn raw cells into events.

For each cell: split its text into events, match the subject (text first, colour as a check and
tie-breaker), work out who attends (partition + group) from the cell's columns, and apply day
notes (cancellations, holidays). Every rule applied is recorded on the event:

- `warnings`: a rule changed or filled in something (logged, publishable)
- `errors`: the parser couldn't decide; the event must not be published as is
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from datetime import date

from .cells import RawCell
from .dates import WEEKDAY_INDEX, academic_year_start, correct_year, parse_date, public_holiday
from .extract import Color, color_hex
from .layout import DayBlock, GroupHeaderRow
from .legend import LecturerRow, Subject
from .textparse import parse_cell_text

# Cell texts that mark a day rather than an event.
HOLIDAY_MARKERS = ("ŚWIĘTO", "PRZERWA ŚWI", "WSZYSTKICH ŚWIĘTYCH")
# Decision 2026-10-09: practical-class blocks are left out until there's more information.
SKIPPED_MARKERS = ("ZAJĘCIA PRAKTYCZNE",)
CANCELLATION_RE = re.compile(r"godziny rektorskie\s*(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})", re.IGNORECASE)
COLOR_TOLERANCE = 0.02


@dataclass
class Event:
    id: str
    date: str  # ISO
    start: str
    end: str
    title: str  # subject name if matched, else the cell text
    subject: str | None
    kind: str  # "lecture" | "class" | "other"
    type_marker: str | None
    room: str | None
    partition: int | None  # None = everyone
    group: int | None
    lecturer: str | None
    color: str  # cell fill, e.g. "#ffcccc"
    notes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    source: dict = field(default_factory=dict)


@dataclass
class DayNote:
    date: str
    kind: str  # "holiday" | "cancellation" | "info"
    text: str
    source: str


@dataclass
class Dropped:
    event: Event
    reason: str


@dataclass
class Interpretation:
    events: list[Event] = field(default_factory=list)
    day_notes: list[DayNote] = field(default_factory=list)
    dropped: list[Dropped] = field(default_factory=list)
    skipped_cells: list[dict] = field(default_factory=list)
    block_dates: dict[str, str | None] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)  # document-level


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFC", text).casefold()
    text = re.sub(r"[.…]+$", "", text.strip())
    return re.sub(r"\s+", " ", text).strip()


def _close(a: Color, b: Color) -> bool:
    return all(abs(x - y) <= COLOR_TOLERANCE for x, y in zip(a, b, strict=True))


def match_subject(title: str, fill: Color, subjects: list[Subject]) -> tuple[Subject | None, list[str]]:
    """Text decides; colour only breaks ties. Returns (subject, warnings)."""
    t = _norm(title)
    if not t:
        return None, []
    exact = [s for s in subjects if _norm(s.name) == t]
    if exact:
        candidates = exact
    else:
        first_token = re.split(r"[-\s]", title.strip())[0]
        candidates = [s for s in subjects if s.abbreviation and s.abbreviation == first_token]
        if not candidates:
            candidates = [s for s in subjects if _norm(s.name).startswith(t)]
    if len(candidates) > 1:
        by_color = [s for s in candidates if any(_close(lr.color, fill) for lr in s.lecturers)]
        if len(by_color) == 1:
            return by_color[0], [f"subject text {title!r} is ambiguous; chosen by colour"]
        return None, [f"subject text {title!r} matches several subjects: {[s.name for s in candidates]}"]
    return (candidates[0], []) if candidates else (None, [])


def _color_rows(subject: Subject, fill: Color) -> list[LecturerRow]:
    """Lecturer rows of the subject whose legend colour matches the cell (several can share one)."""
    return [lr for lr in subject.lecturers if _close(lr.color, fill)]


def _kind(type_marker: str | None, subject: Subject | None, rows: list[LecturerRow]) -> str | None:
    """Lecture or class, from the marker, else from the lecturers the colour points to."""
    if type_marker == "w":
        return "lecture"
    if type_marker in ("cw", "k", "L"):
        return "class"
    if subject is None:
        return "other"
    teaches_lectures = any(lr.lecture_hours for lr in rows)
    teaches_classes = any(lr.class_hours for lr in rows)
    if teaches_lectures and not teaches_classes:
        return "lecture"
    if teaches_classes and not teaches_lectures:
        return "class"
    return None


def _signature(b: DayBlock) -> tuple:
    return (b.n_columns, tuple(tuple((s.group, s.col_start, s.col_end) for s in r.spans) for r in b.header_rows))


def usual_headers(blocks: list[DayBlock]) -> dict[str, tuple[tuple, list[GroupHeaderRow]]]:
    """Most common header layout per weekday."""
    by_day: dict[str, Counter] = {}
    example: dict[tuple, list[GroupHeaderRow]] = {}
    for b in blocks:
        sig = _signature(b)
        by_day.setdefault(b.weekday or "?", Counter())[sig] += 1
        example.setdefault(sig, b.header_rows)
    return {day: (c.most_common(1)[0][0], example[c.most_common(1)[0][0]]) for day, c in by_day.items()}


def resolve_audience(
    col_start: int, col_end: int, n_columns: int, header_rows: list[GroupHeaderRow], partition: int | None
) -> tuple[int | None, int | None, list[str], list[str]]:
    """Return (partition, group, warnings, errors). partition None = everyone."""
    if col_start == 0 and col_end == n_columns - 1:
        return None, None, [], []
    if partition == 1:
        return 1, 1, [], []
    if partition is not None:
        row = next((r for r in header_rows if len(r.spans) == partition), None)
        if row is not None:
            span = next((s for s in row.spans if (s.col_start, s.col_end) == (col_start, col_end)), None)
            if span is None:
                return (
                    partition,
                    None,
                    [],
                    [f"columns {col_start + 1}-{col_end + 1} don't match a group of the {partition}-group split"],
                )
            if span.group is None:
                return partition, None, [], ["group header cell has no number"]
            return partition, span.group, [], []
        # No header row for this split (year 1, 3-group subjects): column N = group N. Confirmed working rule.
        if col_start == col_end and col_start < partition:
            return partition, col_start + 1, [f"no {partition}-group header row; group taken from column number"], []
        return (
            partition,
            None,
            [],
            [f"no {partition}-group header row and columns {col_start + 1}-{col_end + 1} can't be mapped"],
        )
    matches = [
        (len(r.spans), s.group)
        for r in header_rows
        for s in r.spans
        if (s.col_start, s.col_end) == (col_start, col_end) and s.group is not None
    ]
    if len(matches) == 1:
        p, g = matches[0]
        return p, g, ["subject has no group count in the legend; split taken from the layout"], []
    return None, None, [], [f"can't tell which groups attend (columns {col_start + 1}-{col_end + 1}, unknown split)"]


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


@dataclass(frozen=True)
class GroupOverride:
    """A manual answer for a cell the rules can't resolve. Columns are 1-based, as seen in the PDF."""

    date: str  # ISO
    subject: str
    columns: tuple[int, int]
    group: int
    reason: str


def _find_override(
    overrides: list[GroupOverride], iso: str, subject: str | None, cell: RawCell
) -> GroupOverride | None:
    cols = (cell.col_start + 1, cell.col_end + 1)
    return next((o for o in overrides if (o.date, o.subject, o.columns) == (iso, subject, cols)), None)


def interpret(
    blocks: list[DayBlock],
    cells: list[RawCell],
    subjects: list[Subject],
    overrides: list[GroupOverride] | None = None,
) -> Interpretation:
    overrides = overrides or []
    result = Interpretation()
    cells_by_block: dict[str, list[RawCell]] = {}
    for c in cells:
        cells_by_block.setdefault(c.block_id, []).append(c)

    # Dates, with the wrong-year rule.
    printed = {b.id: parse_date(b.date_text or "") for b in blocks}
    valid = [d for d in printed.values() if d]
    start_year = academic_year_start(valid) if valid else None
    dates: dict[str, date | None] = {}
    date_warnings: dict[str, list[str]] = {}
    for b in blocks:
        d = printed[b.id]
        date_warnings[b.id] = []
        if d is None:
            result.warnings.append(f"{b.id}: no date ({b.date_text!r}); block skipped")
            dates[b.id] = None
            continue
        if start_year is not None and (fixed := correct_year(d, b.weekday, start_year)) is not None:
            date_warnings[b.id].append(f"date {b.date_text} corrected to {fixed:%d.%m.%Y} (wrong-year typo rule)")
            d = fixed
        if b.weekday and d.weekday() != WEEKDAY_INDEX.get(b.weekday):
            result.warnings.append(f"{b.id}: date {d} is not a {b.weekday}; block skipped")
            dates[b.id] = None
            continue
        dates[b.id] = d
        result.block_dates[b.id] = d.isoformat()

    usual = usual_headers(blocks)

    for b in blocks:
        d = dates[b.id]
        if d is None:
            continue
        iso = d.isoformat()

        # Header: use the usual layout for this weekday if this day's differs (rule confirmed 2026-10-09).
        header_rows = b.header_rows
        header_warnings: list[str] = []
        usual_sig, usual_rows = usual.get(b.weekday or "?", (None, b.header_rows))
        if _signature(b) != usual_sig:
            if usual_sig is not None and usual_sig[0] == b.n_columns:
                header_rows = usual_rows
                header_warnings.append("this day's group header differs from the usual layout; usual layout used")
            else:
                header_warnings.append(
                    "this day's group header differs from the usual layout and has a different column count"
                )

        # Day notes from the header.
        cancellation: tuple[int, int] | None = None
        for note in b.header_notes:
            if m := CANCELLATION_RE.search(note):
                cancellation = (int(m[1]) * 60 + int(m[2]), int(m[3]) * 60 + int(m[4]))
                result.day_notes.append(DayNote(iso, "cancellation", note, b.id))
            else:
                result.day_notes.append(DayNote(iso, "info", note, b.id))
        if (name := public_holiday(d)) is not None:
            result.day_notes.append(DayNote(iso, "holiday", f"public holiday: {name}", "calendar"))

        for cell in cells_by_block.get(b.id, []):
            lines = [ln.text for ln in cell.lines]
            text = " ".join(lines)
            if not lines:
                is_grey = len(set(cell.fill)) == 1
                if not is_grey:
                    result.skipped_cells.append(
                        {"cell": cell.id, "reason": f"coloured cell {color_hex(cell.fill)} without text"}
                    )
                continue
            if any(m in text.upper() for m in HOLIDAY_MARKERS):
                result.day_notes.append(DayNote(iso, "holiday", text, cell.id))
                continue
            if any(m in text.upper() for m in SKIPPED_MARKERS):
                result.skipped_cells.append({"cell": cell.id, "reason": "practical classes left out for now"})
                continue

            parts = parse_cell_text(lines)
            for i, part in enumerate(parts):
                warnings = list(date_warnings[b.id]) + list(header_warnings)
                errors: list[str] = []
                notes: list[str] = []

                start = part.start or cell.time_start
                if part.end:
                    end = part.end
                elif i + 1 < len(parts) and parts[i + 1].start:
                    end = parts[i + 1].start
                    warnings.append("end time taken from the next event in the same cell")
                else:
                    end = cell.time_end
                if part.start and part.start != cell.time_start:
                    notes.append(f"start {part.start} from cell text (grid: {cell.time_start})")
                if part.end and part.end != cell.time_end:
                    notes.append(f"end {part.end} from cell text (grid: {cell.time_end})")
                if _minutes(end) <= _minutes(start):
                    errors.append(f"end {end} is not after start {start}")

                subject, match_warnings = match_subject(part.title, cell.fill, subjects)
                warnings += match_warnings
                color_rows = _color_rows(subject, cell.fill) if subject else []
                if subject and not color_rows:
                    warnings.append(
                        f"cell colour {color_hex(cell.fill)} doesn't match a lecturer colour of {subject.name!r}"
                    )
                if subject is None:
                    warnings.append("not matched to a subject; treated as a non-class event")

                spans_all = (cell.col_start, cell.col_end) == (0, b.n_columns - 1)
                kind = _kind(part.type_marker, subject, color_rows)
                if kind is None:
                    kind = "class"
                    if spans_all:
                        warnings.append("no type marker and colour doesn't tell lecture from class; assumed class")
                # The lecturer is known only if the colour points to exactly one person teaching this kind.
                teaching = [lr for lr in color_rows if (lr.lecture_hours if kind == "lecture" else lr.class_hours)]
                lecturer = teaching[0].lecturer if len(teaching) == 1 and teaching[0].lecturer else None

                if kind == "lecture":
                    if not spans_all:
                        errors.append("lecture that doesn't span all columns")
                    partition, group = None, None
                else:
                    partition, group, w, e = resolve_audience(
                        cell.col_start, cell.col_end, b.n_columns, header_rows, subject.partition if subject else None
                    )
                    warnings += w
                    errors += e
                    override = _find_override(overrides, iso, subject.name if subject else None, cell)
                    if override is not None:
                        partition = subject.partition if subject else partition
                        group = override.group
                        errors = []
                        warnings.append(f"group {group} set by manual override ({override.reason})")

                event = Event(
                    id=f"{cell.id}-e{i}",
                    date=iso,
                    start=start,
                    end=end,
                    title=subject.name if subject else part.title,
                    subject=subject.name if subject else None,
                    kind=kind,
                    type_marker=part.type_marker,
                    room=part.room,
                    partition=partition,
                    group=group,
                    lecturer=lecturer,
                    color=color_hex(cell.fill),
                    notes=notes,
                    warnings=warnings,
                    errors=errors,
                    source={
                        "page": b.page,
                        "block": b.id,
                        "cell": cell.id,
                        "text": part.raw,
                        "columns": [cell.col_start, cell.col_end],
                    },
                )
                if (name := public_holiday(d)) is not None:
                    event.notes.append(f"scheduled on a public holiday ({name})")

                if cancellation is not None:
                    s, e_ = _minutes(start), _minutes(end)
                    if cancellation[0] <= s and e_ <= cancellation[1]:
                        result.dropped.append(Dropped(event, "inside a cancellation window (godziny rektorskie)"))
                        continue
                    if s < cancellation[1] and e_ > cancellation[0]:
                        event.errors.append("partly overlaps a cancellation window")
                result.events.append(event)

    assign_stable_ids(result.events + [d.event for d in result.dropped])
    return result


def stable_id(e: Event) -> str:
    """Same class in a new PDF version -> same id; a moved or changed class -> a new id."""
    key = "|".join(str(v) for v in (e.date, e.start, e.end, e.title, e.kind, e.partition, e.group))
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


def assign_stable_ids(events: list[Event]) -> None:
    """Replace position-based ids with stable ones. Exact duplicates get a numeric suffix."""
    seen: Counter[str] = Counter()
    for e in sorted(events, key=lambda e: e.id):
        base = stable_id(e)
        seen[base] += 1
        e.id = base if seen[base] == 1 else f"{base}-{seen[base]}"
