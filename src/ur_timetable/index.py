"""Spatial queries over page primitives: borders, fill colour at a point, text in a region."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from .extract import WHITE, Box, Char, Color, PagePrimitives, Segment

# Borders are ~0.5 pt thick and drawn at slightly different offsets; positions closer than
# this are the same line.
POS_TOLERANCE = 1.0
# A line counts as a cell border only if it covers this fraction of the grid square's side.
BORDER_MIN_COVERAGE = 0.8


class _SegmentIndex:
    def __init__(self, segments: Iterable[Segment]) -> None:
        self._buckets: dict[int, list[Segment]] = defaultdict(list)
        for s in segments:
            self._buckets[round(s.pos)].append(s)

    def covers(self, pos: float, at: float, tol: float = POS_TOLERANCE) -> bool:
        """Is there a segment at `pos` (±tol) whose extent includes `at`?"""
        return any(s.start - tol <= at <= s.end + tol for s in self._near(pos, tol))

    def coverage(self, pos: float, a: float, b: float, tol: float = POS_TOLERANCE) -> float:
        """Fraction of the interval [a, b] covered by segments at `pos` (±tol)."""
        pieces = sorted((max(s.start, a), min(s.end, b)) for s in self._near(pos, tol))
        covered, reach = 0.0, a
        for lo, hi in pieces:
            lo = max(lo, reach)
            if hi > lo:
                covered += hi - lo
                reach = hi
        return covered / (b - a) if b > a else 0.0

    def _near(self, pos: float, tol: float) -> list[Segment]:
        return [
            s
            for key in (round(pos) - 1, round(pos), round(pos) + 1)
            for s in self._buckets.get(key, ())
            if abs(s.pos - pos) <= tol
        ]

    def positions_crossing(self, at: float, lo: float, hi: float) -> list[float]:
        """Positions in [lo, hi] of segments whose extent includes `at`, deduplicated."""
        found = sorted(
            s.pos
            for bucket in self._buckets.values()
            for s in bucket
            if lo - POS_TOLERANCE <= s.pos <= hi + POS_TOLERANCE
            and s.start - POS_TOLERANCE <= at <= s.end + POS_TOLERANCE
        )
        return dedupe_positions(found)

    def positions_overlapping(self, lo: float, hi: float, a: float, b: float) -> list[float]:
        """Positions in [lo, hi] of segments that overlap the interval [a, b] at all."""
        found = sorted(
            s.pos
            for bucket in self._buckets.values()
            for s in bucket
            if lo - POS_TOLERANCE <= s.pos <= hi + POS_TOLERANCE
            and s.end > a + POS_TOLERANCE
            and s.start < b - POS_TOLERANCE
        )
        return dedupe_positions(found)


def dedupe_positions(values: list[float], tol: float = POS_TOLERANCE) -> list[float]:
    out: list[float] = []
    for v in sorted(values):
        if out and v - out[-1] <= tol:
            continue
        out.append(v)
    return out


class PageIndex:
    def __init__(self, prims: PagePrimitives) -> None:
        self.prims = prims
        self.h = _SegmentIndex(prims.h_segments)
        self.v = _SegmentIndex(prims.v_segments)

    def has_h_border(self, y: float, x0: float, x1: float) -> bool:
        """Border along y between x0 and x1. Underlines under text are thin rectangles too,
        but they don't span most of a grid square, so partial coverage doesn't count."""
        return self.h.coverage(y, x0, x1) >= BORDER_MIN_COVERAGE

    def has_v_border(self, x: float, top: float, bottom: float) -> bool:
        return self.v.coverage(x, top, bottom) >= BORDER_MIN_COVERAGE

    def color_at(self, x: float, y: float) -> Color:
        """Fill colour visible at a point: the last fill drawn there, white if none."""
        color = WHITE
        for f in self.prims.fills:
            if f.box.contains(x, y):
                color = f.color
        return color

    def chars_in(self, box: Box) -> list[Char]:
        return [c for c in self.prims.chars if box.contains(c.box.cx, c.box.cy)]


@dataclass(frozen=True)
class TextLine:
    text: str
    box: Box
    color: Color  # colour of the first character


def text_lines(chars: Iterable[Char]) -> list[TextLine]:
    """Group characters into lines (top to bottom) and words (left to right)."""
    chars = sorted(chars, key=lambda c: (c.box.cy, c.box.x0))
    rows: list[list[Char]] = []
    for c in chars:
        if rows and abs(rows[-1][0].box.cy - c.box.cy) <= max(c.size, rows[-1][0].size) * 0.5:
            rows[-1].append(c)
        else:
            rows.append([c])
    lines = []
    for row in rows:
        row.sort(key=lambda c: c.box.x0)
        parts = [row[0].text]
        for prev, cur in zip(row, row[1:], strict=False):
            gap = cur.box.x0 - prev.box.x1
            parts.append((" " if gap > cur.size * 0.15 else "") + cur.text)
        box = Box(
            min(c.box.x0 for c in row),
            min(c.box.top for c in row),
            max(c.box.x1 for c in row),
            max(c.box.bottom for c in row),
        )
        lines.append(TextLine("".join(parts), box, row[0].color))
    return lines
