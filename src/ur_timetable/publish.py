"""The data the website reads: one JSON file per timetable plus an index.

    data/published/index.json                  every timetable: source, dates, status
    data/published/<id>/timetable.json         events for the site (format below)
    data/published/<id>/changes.json           what changed between published versions

Only what a student needs is published: no lecturer names, no parser warnings. Free text copied from
the PDF (the title, day notes, unresolved cells) goes through `without_names`: the year supervisor
("opiekun: …") and names after academic titles ("dr Jan Kowalski") are removed. Events the parser
couldn't resolve are never in `events`; they're listed in `unresolved` (date, time, PDF text) so the
site can point students to the PDF for those.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from .interpret import Event
from .pipeline import Timetable

SCHEMA_VERSION = 1
PUBLISHED_DIR = Path(__file__).parents[2] / "data" / "published"


@dataclass
class SourceInfo:
    url: str | None
    updated: str | None  # "aktualizacja" date from the university page (ISO)
    sha256: str
    label: str | None = None


# "opiekun: mgr Jan Kowalski" to the end of the title
SUPERVISOR = re.compile(r",?\s*opiekun(?:\s+roku)?\s*:.*$", re.IGNORECASE)
# an academic title (with its extensions) followed by one or two capitalized words
PERSON = re.compile(
    r"\b(?i:prof|dr|hab|mgr|inż|lek|doc)\.?(?:\s+(?i:hab|inż|n\.\s*med|n\.\s*o\s*zdr|prof)\.?)*"
    r"\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+)?"
)
# the position that may follow a name: ", prof. UR"
POSITION = re.compile(r",?\s*\bprof\.?\s*UR\b", re.IGNORECASE)


def without_names(text: str | None) -> str | None:
    """'Seminarium dyplomowe dr Jan Kowalski MS Teams' -> 'Seminarium dyplomowe MS Teams'."""
    if not text:
        return text
    text = POSITION.sub("", PERSON.sub("", SUPERVISOR.sub("", text)))
    return re.sub(r"\s{2,}", " ", text).strip(" ,")


def public_event(e: Event) -> dict:
    return {
        "id": e.id,
        "date": e.date,
        "start": e.start,
        "end": e.end,
        "title": e.title,
        "kind": e.kind,
        "room": e.room,
        "partition": e.partition,
        "group": e.group,
        "color": e.color,
        "notes": e.notes,
    }


def published_timetable(t: Timetable, source: SourceInfo, published_at: str) -> dict:
    skipped = t.config.skipped_subjects
    events = [e for e in t.result.events if not e.errors and e.subject not in skipped]
    splits = sorted({e.partition for e in events if e.partition and e.partition > 1})
    return {
        "schema": SCHEMA_VERSION,
        "id": t.name,
        "label": source.label,
        "title": without_names(t.title),
        "source": {**asdict(source), "published_at": published_at},
        "splits": splits,
        "optional_subjects": [s for s in t.config.optional_subjects if any(e.subject == s for e in events)],
        "subjects": [{"name": s.name, "partition": s.partition} for s in t.subjects if s.name not in skipped],
        "day_notes": [{"date": n.date, "kind": n.kind, "text": without_names(n.text)} for n in t.result.day_notes],
        "events": [public_event(e) for e in sorted(events, key=lambda e: (e.date, e.start, e.id))],
        "unresolved": [
            {"date": e.date, "start": e.start, "end": e.end, "text": without_names(e.source.get("text", ""))}
            for e in sorted(t.result.events, key=lambda e: (e.date, e.start))
            if e.errors
        ],
    }


def read_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
