"""Stage 2: find day blocks and their grid structure on a page.

A day block is one weekday of one week:

    label column | header: weekday, date (+ notes), 1-3 group-number rows
                 | grid: time rows x atomic columns

Each day block has its own label column with the time-slot labels ("8.00-8.45"). We anchor on
those labels, because their positions are the most regular thing in the document. Group-header
rows define the atomic columns: every span edge in any group row is a column boundary.

Nothing here decides what a cell means. Problems are recorded as warnings and never guessed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .extract import Box, PagePrimitives, Word
from .index import POS_TOLERANCE, PageIndex, dedupe_positions, text_lines

TIME_LABEL_RE = re.compile(r"^(\d{1,2})[.:](\d{2})-(\d{1,2})[.:](\d{2})$")
DATE_RE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b")
WEEK_RE = re.compile(r"TYDZIE[ŃN]\s*(\d+)", re.IGNORECASE)
WEEKDAYS = ("PONIEDZIAŁEK", "WTOREK", "ŚRODA", "CZWARTEK", "PIĄTEK", "SOBOTA", "NIEDZIELA")

# How far (points) around a label column to look for its left/right borders.
LABEL_BORDER_SEARCH = 40.0
# Labels further apart than this horizontally belong to different label columns.
LABEL_COLUMN_GAP = 15.0
# The weekday name must be at most this far above the first time row.
HEADER_MAX_HEIGHT = 60.0


@dataclass
class TimeRow:
    index: int
    start: str  # "HH:MM"
    end: str
    top: float
    bottom: float


@dataclass
class GroupSpan:
    group: int | None  # number printed in the header cell; None if blank/unreadable
    col_start: int
    col_end: int  # inclusive
    x0: float
    x1: float


@dataclass
class GroupHeaderRow:
    top: float
    bottom: float
    spans: list[GroupSpan]


@dataclass
class DayBlock:
    id: str
    page: int
    label_box: Box
    grid_box: Box
    rows: list[TimeRow]
    columns: list[float] = field(default_factory=list)  # boundaries, len = n_columns + 1
    header_rows: list[GroupHeaderRow] = field(default_factory=list)
    header_top: float | None = None
    week_text: str | None = None
    week_number: int | None = None
    weekday: str | None = None
    date_text: str | None = None
    header_notes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def n_columns(self) -> int:
        return len(self.columns) - 1

    @property
    def partitions(self) -> list[int]:
        """Number of groups in each header row, e.g. [4, 2]."""
        return [len(r.spans) for r in self.header_rows]


def _hhmm(h: str, m: str) -> str:
    return f"{int(h):02d}:{m}"


def _parse_label(word: Word) -> tuple[str, str] | None:
    m = TIME_LABEL_RE.match(word.text)
    if not m:
        return None
    return _hhmm(m[1], m[2]), _hhmm(m[3], m[4])


def _label_runs(words: list[Word]) -> list[list[tuple[Word, str, str]]]:
    """Group time labels into vertical runs; each run is the time axis of one day block."""
    labels = [(w, *t) for w in words if (t := _parse_label(w))]
    labels.sort(key=lambda t: t[0].box.cx)
    columns: list[list[tuple[Word, str, str]]] = []
    for item in labels:
        if columns and item[0].box.cx - columns[-1][-1][0].box.cx <= LABEL_COLUMN_GAP:
            columns[-1].append(item)
        else:
            columns.append([item])

    runs = []
    for col in columns:
        col.sort(key=lambda t: t[0].box.top)
        run = [col[0]]
        for prev, cur in zip(col, col[1:], strict=False):
            row_h = prev[0].box.bottom - prev[0].box.top
            contiguous = cur[1] == prev[2] and cur[0].box.top - prev[0].box.bottom < row_h * 3
            if contiguous:
                run.append(cur)
            else:
                runs.append(run)
                run = [cur]
        runs.append(run)
    return [r for r in runs if len(r) >= 2]


def _nearest(values: list[float], *, below: bool) -> float | None:
    if not values:
        return None
    return max(values) if below else min(values)


def detect_blocks(prims: PagePrimitives, index: PageIndex | None = None) -> list[DayBlock]:
    index = index or PageIndex(prims)
    runs = _label_runs(prims.words)

    # First pass: label columns and time rows.
    blocks: list[DayBlock] = []
    for run in runs:
        words = [w for w, _, _ in run]
        x0 = min(w.box.x0 for w in words)
        x1 = max(w.box.x1 for w in words)
        mid_y = (words[0].box.cy + words[-1].box.cy) / 2
        left = _nearest(index.v.positions_crossing(mid_y, x0 - LABEL_BORDER_SEARCH, x0), below=True)
        right = _nearest(index.v.positions_crossing(mid_y, x1, x1 + LABEL_BORDER_SEARCH), below=False)
        warnings = []
        if left is None or right is None:
            warnings.append("label column borders not found")
            left = x0 if left is None else left
            right = x1 if right is None else right
        cx = (left + right) / 2

        rows = []
        for i, (w, start, end) in enumerate(run):
            h = w.box.bottom - w.box.top
            top = _nearest(index.h.positions_crossing(cx, w.box.top - h * 2, w.box.cy), below=True)
            bottom = _nearest(index.h.positions_crossing(cx, w.box.cy, w.box.bottom + h * 2), below=False)
            if top is None or bottom is None:
                warnings.append(f"row borders not found for label {w.text}")
                top = w.box.top if top is None else top
                bottom = w.box.bottom if bottom is None else bottom
            rows.append(TimeRow(i, start, end, top, bottom))
        for a, b in zip(rows, rows[1:], strict=False):
            if abs(a.bottom - b.top) > POS_TOLERANCE:
                warnings.append(f"gap between rows {a.start} and {b.start}")

        label_box = Box(left, rows[0].top, right, rows[-1].bottom)
        blocks.append(
            DayBlock(
                id="",
                page=prims.number,
                label_box=label_box,
                grid_box=label_box,  # replaced below
                rows=rows,
                warnings=warnings,
            )
        )

    # Second pass: grid extent. A grid ends where the next label column in the same band begins,
    # or at the table's outer border.
    for b in blocks:
        same_band = [
            o
            for o in blocks
            if o is not b
            and o.label_box.x0 > b.label_box.x1 - POS_TOLERANCE
            and o.label_box.top < b.label_box.bottom
            and o.label_box.bottom > b.label_box.top
        ]
        mid_y = b.label_box.cy
        if same_band:
            right = min(o.label_box.x0 for o in same_band)
        else:
            edges = index.v.positions_crossing(mid_y, b.label_box.x1 + 5, prims.width)
            right = max(edges) if edges else None
            if right is None:
                b.warnings.append("grid right edge not found")
                right = b.label_box.x1
        b.grid_box = Box(b.label_box.x1, b.label_box.top, right, b.label_box.bottom)

    for b in blocks:
        _read_header(b, prims, index)
        _check_body_borders(b, index)

    blocks.sort(key=lambda b: (round(b.label_box.top), b.label_box.x0))
    for i, b in enumerate(blocks):
        b.id = f"p{b.page}-b{i:02d}"
    return blocks


def _read_header(b: DayBlock, prims: PagePrimitives, index: PageIndex) -> None:
    g = b.grid_box
    weekday_words = [
        w
        for w in prims.words
        if w.text.upper() in WEEKDAYS
        and g.x0 <= w.box.cx <= g.x1
        and w.box.bottom <= g.top + POS_TOLERANCE
        and g.top - w.box.top <= HEADER_MAX_HEIGHT
    ]
    if not weekday_words:
        b.warnings.append("weekday name not found above grid")
        b.columns = [g.x0, g.x1]
        return
    wd = max(weekday_words, key=lambda w: w.box.top)
    b.weekday = wd.text.upper()

    band_top = _nearest(index.h.positions_crossing(wd.box.cx, wd.box.top - 10, wd.box.cy), below=True)
    if band_top is None:
        b.warnings.append("header top border not found")
        band_top = wd.box.top
    b.header_top = band_top

    bounds = index.h.positions_overlapping(band_top, g.top, g.x0, g.x1)
    bounds = dedupe_positions([band_top, *bounds, g.top])

    group_rows: list[tuple[float, float]] = []
    for top, bottom in zip(bounds, bounds[1:], strict=False):
        if bottom - top < 2:
            continue
        lines = text_lines(index.chars_in(Box(g.x0, top, g.x1, bottom)))
        text = " ".join(ln.text for ln in lines).strip()
        tokens = text.split()
        # Mostly digits = group row. Not "all digits": one source has an Excel artifact
        # ("1+C131:AA132") in a group cell; that cell gets a warning below.
        if tokens and sum(t.isdigit() for t in tokens) * 2 > len(tokens):
            group_rows.append((top, bottom))
        elif any(t.upper() in WEEKDAYS for t in tokens):
            continue
        elif (m := DATE_RE.search(text)) is not None:
            b.date_text = m[0]
            note = (text[: m.start()] + text[m.end() :]).strip(" -")
            if note:
                b.header_notes.append(note)
        elif text:
            b.header_notes.append(text)

    if b.date_text is None:
        b.warnings.append("date not found in header")

    # Group rows -> spans -> atomic columns.
    raw_spans: list[list[tuple[float, float, int | None]]] = []
    for top, bottom in group_rows:
        cy = (top + bottom) / 2
        cuts = [
            x for x in index.v.positions_crossing(cy, g.x0, g.x1) if g.x0 + POS_TOLERANCE < x < g.x1 - POS_TOLERANCE
        ]
        edges = [g.x0, *cuts, g.x1]
        spans = []
        for x0, x1 in zip(edges, edges[1:], strict=False):
            digits = "".join(ln.text for ln in text_lines(index.chars_in(Box(x0, top, x1, bottom)))).split()
            number = int(digits[0]) if len(digits) == 1 and digits[0].isdigit() else None
            if number is None:
                what = f"unreadable text {' '.join(digits)!r}" if digits else "no number"
                b.warnings.append(f"group header row {len(raw_spans) + 1}: cell at x={x0:.1f} has {what}")
            spans.append((x0, x1, number))
        raw_spans.append(spans)

    if not raw_spans:
        b.warnings.append("no group header rows")
    columns = dedupe_positions([g.x0, g.x1, *(x for spans in raw_spans for s in spans for x in s[:2])])
    b.columns = columns

    def col_index(x: float) -> int:
        return min(range(len(columns)), key=lambda i: abs(columns[i] - x))

    for (top, bottom), spans in zip(group_rows, raw_spans, strict=True):
        b.header_rows.append(
            GroupHeaderRow(
                top,
                bottom,
                [GroupSpan(n, col_index(x0), col_index(x1) - 1, x0, x1) for x0, x1, n in spans],
            )
        )

    # Week label lives in the label column above the time rows.
    if b.header_top is not None:
        lb = b.label_box
        lines = text_lines(index.chars_in(Box(lb.x0, b.header_top, lb.x1, lb.top)))
        b.week_text = " ".join(ln.text for ln in lines) or None
        if b.week_text and (m := WEEK_RE.search(b.week_text)):
            b.week_number = int(m[1])
        else:
            b.warnings.append(f"week label not found (label column text: {b.week_text!r})")


def _check_body_borders(b: DayBlock, index: PageIndex) -> None:
    """Vertical borders inside the grid should sit on header column boundaries."""
    g = b.grid_box
    stray = set()
    for row in b.rows:
        cy = (row.top + row.bottom) / 2
        for x in index.v.positions_crossing(cy, g.x0 + POS_TOLERANCE * 2, g.x1 - POS_TOLERANCE * 2):
            if all(abs(x - c) > POS_TOLERANCE * 1.5 for c in b.columns):
                stray.add(round(x, 1))
    if stray:
        b.warnings.append(f"grid borders not matching header columns at x={sorted(stray)}")
