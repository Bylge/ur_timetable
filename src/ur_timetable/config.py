"""Per-timetable settings: answers to questions the documents can't answer.

`data/config/<id>.json`, where <id> is the timetable id (e.g. `dietetyka/I-st_ST_rok-1`):

    {
      "publish": true,
      "optional_subjects": ["Język niemiecki"],
      "skipped_subjects": {"Język niemiecki": "why it's left out"},
      "group_overrides": [
        {"date": "2026-12-10", "subject": "Anatomia człowieka", "columns": [5, 5], "group": 4,
         "reason": "maintainer's judgement, 2026-10-12"}
      ]
    }

`publish` must be true for a timetable to reach the website: passing validation isn't enough, a
person must have reviewed the parsed result. Every override is logged as a warning on the event.
`skipped_subjects` are parsed and validated like any other subject but never published (a known
subject that is deliberately left out for now, with the reason).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from .interpret import GroupOverride

CONFIG_DIR = Path(__file__).parents[2] / "data" / "config"


@dataclass
class TimetableConfig:
    publish: bool = False
    optional_subjects: list[str] = field(default_factory=list)
    skipped_subjects: dict[str, str] = field(default_factory=dict)  # subject -> reason
    group_overrides: list[GroupOverride] = field(default_factory=list)


def load_config(timetable_id: str, config_dir: Path = CONFIG_DIR) -> TimetableConfig:
    path = config_dir / f"{timetable_id}.json"
    if not path.exists():
        return TimetableConfig()
    raw = json.loads(path.read_text(encoding="utf-8"))
    return TimetableConfig(
        publish=bool(raw.get("publish", False)),
        optional_subjects=list(raw.get("optional_subjects", [])),
        skipped_subjects=dict(raw.get("skipped_subjects", {})),
        group_overrides=[
            GroupOverride(o["date"], o["subject"], tuple(o["columns"]), int(o["group"]), o.get("reason", ""))
            for o in raw.get("group_overrides", [])
        ],
    )
