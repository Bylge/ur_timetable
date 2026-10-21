"""Persisting parsed timetables. JSON for now; a database can implement the same interface later."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Protocol

from .extract import color_hex
from .pipeline import Timetable


def timetable_dict(t: Timetable) -> dict:
    r = t.result
    return {
        "name": t.name,
        "title": t.title,
        "source_pdf": t.pdf.name,
        "subjects": [
            {
                "name": s.name,
                "partition": s.partition,
                "module": s.module,
                "lecturers": [{**asdict(lr), "color": color_hex(lr.color)} for lr in s.lecturers],
            }
            for s in t.subjects
        ],
        "events": [asdict(e) for e in r.events],
        "day_notes": [asdict(n) for n in r.day_notes],
        "dropped": [{"reason": d.reason, "event": asdict(d.event)} for d in r.dropped],
        "skipped_cells": r.skipped_cells,
        "warnings": r.warnings,
    }


class TimetableStore(Protocol):
    def save(self, timetable: Timetable) -> None: ...


class JsonStore:
    """Writes `<root>/<name>/timetable.json`. Group profiles (album numbers) go to a separate file."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def save(self, timetable: Timetable) -> None:
        folder = self.root / timetable.name
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "timetable.json").write_text(
            json.dumps(timetable_dict(timetable), ensure_ascii=False, indent=1), encoding="utf-8"
        )
        if timetable.profiles:
            (folder / "groups.json").write_text(json.dumps(timetable.profiles, indent=1), encoding="utf-8")
