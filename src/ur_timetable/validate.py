"""Stage 5: checks before a parsed timetable may be published.

Blocking (nothing is published, the site keeps the last good version and shows a warning):
- the PDF yields no day blocks, a block has no date, or no subject table was found
- a large change against the previous published version (needs a manual OK)

Not blocking, but published as a notice (decided 2026-10-14): events the parser couldn't resolve
(`errors`) are left out of the schedule and listed in `unresolved`, so the site can say
"1 class on 16.12 couldn't be read, see the PDF".

Reported only (shown in the report, not blocking):
- hours per subject and group vs the subject table
- double-bookings for real students (when the groups DOCX is available locally)
- rules applied (warnings on events)
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .changes import change_count, diff_events
from .pipeline import Timetable
from .schedule import student_schedule

# A new version that changes more than this share of events needs a manual OK.
LARGE_CHANGE_SHARE = 0.3
# Hours difference (academic hours, 45 min) reported when above both limits.
HOURS_TOLERANCE_ABS = 2.0
HOURS_TOLERANCE_REL = 0.1


@dataclass
class ValidationReport:
    blocking: list[str] = field(default_factory=list)
    needs_review: list[str] = field(default_factory=list)  # blocking unless approved
    notes: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.blocking and not self.needs_review

    def text(self) -> str:
        out = []
        for title, items in (("BLOCKING", self.blocking), ("NEEDS REVIEW", self.needs_review), ("notes", self.notes)):
            if items:
                out.append(f"{title} ({len(items)}):")
                out += [f"  - {i}" for i in items]
        return "\n".join(out) or "all checks passed"


def _minutes(hhmm: str) -> int:
    return int(hhmm[:2]) * 60 + int(hhmm[3:])


def hours_report(t: Timetable) -> list[str]:
    lecture: dict[str, float] = defaultdict(float)
    classes: dict[str, dict] = defaultdict(lambda: defaultdict(float))
    for e in t.result.events:
        if not e.subject or e.errors:
            continue
        hours = (_minutes(e.end) - _minutes(e.start)) / 45
        if e.kind == "lecture":
            lecture[e.subject] += hours
        else:
            classes[e.subject][(e.partition, e.group)] += hours

    def off(parsed: float, planned: float) -> bool:
        diff = abs(parsed - planned)
        return diff > HOURS_TOLERANCE_ABS and diff > planned * HOURS_TOLERANCE_REL

    out = []
    for s in t.subjects:
        planned_w = sum(lr.lecture_hours or 0 for lr in s.lecturers)
        planned_c = max([lr.class_hours or 0 for lr in s.lecturers] or [0])
        if not lecture[s.name] and not classes[s.name]:
            out.append(f"{s.name}: not scheduled in this PDF")
            continue
        if planned_w and off(lecture[s.name], planned_w):
            out.append(f"{s.name}: lectures {lecture[s.name]:.1f} h, subject table {planned_w} h")
        for (p, g), hours in sorted(classes[s.name].items(), key=str):
            if planned_c and off(hours, planned_c):
                who = f"group {g}/{p}" if p else "everyone"
                out.append(f"{s.name}: classes {who} {hours:.1f} h, subject table {planned_c} h")
    return out


def clash_report(t: Timetable) -> list[str]:
    """Double-bookings for real students (only with the groups DOCX, i.e. locally)."""
    clashes: Counter = Counter()
    for groups in t.profiles.values():
        events = student_schedule(t.result.events, groups, set(t.config.optional_subjects), set())
        for i, a in enumerate(events):
            for b in events[i + 1 :]:
                if b.date != a.date:
                    break
                if _minutes(b.start) < _minutes(a.end):
                    clashes[(a.date, a.start, a.title, b.start, b.title)] += 1
    return [f"{d} {s1} {t1} overlaps {s2} {t2}: {n} students" for (d, s1, t1, s2, t2), n in sorted(clashes.items())]


def validate(t: Timetable, previous: dict | None = None, new_events: list[dict] | None = None) -> ValidationReport:
    r = ValidationReport()
    if not t.blocks:
        r.blocking.append("no day blocks found (page format changed?)")
    missing_dates = [b.id for b in t.blocks if b.id not in t.result.block_dates]
    if missing_dates:
        r.blocking.append(f"{len(missing_dates)} day blocks without a usable date: {missing_dates[:5]}")
    if not t.subjects:
        r.blocking.append("no subject table found")
    for w in t.result.warnings:
        r.blocking.append(w)
    for e in t.result.events:
        if e.errors:
            r.notes.append(
                f"unresolved (left out, shown as a notice): {e.date} {e.start}-{e.end} {e.title}: {'; '.join(e.errors)}"
            )

    if previous and new_events is not None:
        d = diff_events(previous.get("events", []), new_events)
        n, base = change_count(d), max(len(previous.get("events", [])), 1)
        if n / base > LARGE_CHANGE_SHARE:
            r.needs_review.append(f"{n} of {base} events changed (> {LARGE_CHANGE_SHARE:.0%}); check before publishing")

    r.notes += hours_report(t)
    r.notes += [f"double-booking: {c}" for c in clash_report(t)]
    rules = Counter(w for e in t.result.events for w in e.warnings)
    r.notes += [f"rule applied {n}x: {w}" for w, n in rules.most_common()]
    return r
