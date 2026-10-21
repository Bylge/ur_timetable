"""Group assignments from the dean's office DOCX: album number -> group per partition.

    LP | Nr albumu | Zajęcia w 2 grupach | ... | Zajęcia w 5 grupach      (I st)
    LP | Nr albumu | Podział na 2 grupy  | Podział na 3 grupy | Podział ZP   (II st)

Partition keys are "2", "3", ... or "ZP". The album number is only a lookup key; students can
also pick groups by hand (groups change through the dean's office).
"""

from __future__ import annotations

import re
from pathlib import Path

import docx


def _partition_key(header: str) -> str | None:
    h = " ".join(header.split())
    if re.search(r"\bZP\b", h):
        return "ZP"
    m = re.search(r"(\d+)\s*grup", h)
    return m[1] if m else None


def parse_groups_docx(path: str | Path) -> dict[str, dict[str, int]]:
    document = docx.Document(str(path))
    profiles: dict[str, dict[str, int]] = {}
    for table in document.tables:
        rows = [[c.text.strip() for c in r.cells] for r in table.rows]
        if not rows:
            continue
        header = rows[0]
        album_col = next((i for i, h in enumerate(header) if "album" in h.lower()), None)
        if album_col is None:
            continue
        keys = {i: k for i, h in enumerate(header) if (k := _partition_key(h)) is not None}
        for row in rows[1:]:
            album = row[album_col]
            if not album.isdigit():
                continue
            profiles[album] = {k: int(row[i]) for i, k in keys.items() if row[i].isdigit()}
    return profiles
