"""The subject table ("legend") at the end of a timetable.

    PRZEDMIOT | WYKŁADOWCA (cell colour = colour used in the grid) | W/K | ĆW/LAB | GR

One subject can have several lecturer rows. The subject and GR cells can span several rows; a
GR value spanning rows is shared by those lecturers. The subject's number of groups is the sum
of its distinct GR cells (Podstawy opieki: GR 1 + GR 2 = 3 groups).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .extract import Box, Color, PagePrimitives
from .index import PageIndex, text_lines

HEADER_NAMES = {"PRZEDMIOT": "subject", "WYKŁADOWCA": "lecturer", "W/K": "lecture_hours"}


@dataclass
class LecturerRow:
    lecturer: str
    color: Color
    lecture_hours: int | None
    class_hours: int | None
    groups: int | None  # GR value of the GR cell this row belongs to


@dataclass
class Subject:
    name: str
    lecturers: list[LecturerRow] = field(default_factory=list)
    partition: int | None = None  # total number of groups; None if GR is empty
    module: str | None = None  # elective module heading, e.g. "Moduł 3 student wybiera 5 z 6 przedmiotów"

    @property
    def abbreviation(self) -> str | None:
        m = re.search(r"\(([A-ZĄĆĘŁŃÓŚŹŻ]{2,})\)", self.name)
        return m[1] if m else None


def _int(text: str) -> int | None:
    text = text.strip()
    return int(text) if text.isdigit() else None


def _column_name(header: str) -> str | None:
    h = header.upper().replace(" ", "")
    if h.startswith("PRZEDMIOT"):
        return "subject"
    if h.startswith("WYKŁADOWCA"):
        return "lecturer"
    if h.startswith("W/K"):
        return "lecture_hours"
    if h.startswith("ĆW"):
        return "class_hours"
    if h.startswith("GR"):
        return "groups"
    return None


def parse_legend(prims: PagePrimitives, index: PageIndex | None = None) -> list[Subject] | None:
    """Return the subjects, or None if the page has no subject table."""
    index = index or PageIndex(prims)
    header_word = next((w for w in prims.words if w.text.upper() == "PRZEDMIOT"), None)
    if header_word is None:
        return None
    hy = header_word.box.cy
    h_top = max(index.h.positions_crossing(header_word.box.cx, 0, hy))
    h_bottom = min(index.h.positions_crossing(header_word.box.cx, hy, prims.height))

    edges = index.v.positions_crossing(hy, 0, prims.width)
    columns: dict[str, tuple[float, float]] = {}
    for x0, x1 in zip(edges, edges[1:], strict=False):
        text = " ".join(ln.text for ln in text_lines(index.chars_in(Box(x0, h_top, x1, h_bottom))))
        if (name := _column_name(text)) is not None:
            columns[name] = (x0, x1)
    if not {"subject", "lecturer"} <= columns.keys():
        return None
    table_x0, table_x1 = edges[0], edges[-1]

    def cell_text(col: str, top: float, bottom: float) -> str:
        if col not in columns:
            return ""
        x0, x1 = columns[col]
        return " ".join(ln.text for ln in text_lines(index.chars_in(Box(x0, top, x1, bottom))))

    def bands(col: str) -> list[tuple[float, float]]:
        x0, x1 = columns[col]
        ys = [y for y in index.h.positions_crossing((x0 + x1) / 2, h_bottom, prims.height) if y >= h_bottom - 1]
        return list(zip(ys, ys[1:], strict=False))

    def band_of(bs: list[tuple[float, float]], y: float) -> tuple[float, float] | None:
        return next((b for b in bs if b[0] <= y <= b[1]), None)

    lecturer_rows = bands("lecturer")
    subject_bands = bands("subject")
    group_bands = bands("groups") if "groups" in columns else []

    subjects: dict[tuple[float, float], Subject] = {}
    # GR cell of each lecturer row, per subject: {subject band: {GR band: value}}
    group_cells: dict[tuple[float, float], dict[tuple[float, float] | None, int | None]] = {}
    module: str | None = None
    for top, bottom in lecturer_rows:
        cy = (top + bottom) / 2
        lx0, lx1 = columns["lecturer"]
        # A row without the subject/lecturer split is a section heading (elective module).
        if not index.has_v_border(lx0, top + 0.5, bottom - 0.5):
            heading = " ".join(ln.text for ln in text_lines(index.chars_in(Box(table_x0, top, table_x1, bottom))))
            module = heading or module
            continue
        sband = band_of(subject_bands, cy)
        if sband is None:
            continue
        if sband not in subjects:
            subjects[sband] = Subject(name=cell_text("subject", *sband).strip(), module=module)
        gband = band_of(group_bands, cy)
        groups = _int(cell_text("groups", *gband)) if gband else None
        group_cells.setdefault(sband, {})[gband] = groups
        subjects[sband].lecturers.append(
            LecturerRow(
                lecturer=cell_text("lecturer", top, bottom).strip(),
                color=index.color_at((lx0 + lx1) / 2, cy),
                lecture_hours=_int(cell_text("lecture_hours", top, bottom)),
                class_hours=_int(cell_text("class_hours", top, bottom)),
                groups=groups,
            )
        )

    for sband, s in subjects.items():
        values = [g for g in group_cells[sband].values() if g is not None]
        s.partition = sum(values) if values else None
    return list(subjects.values())
