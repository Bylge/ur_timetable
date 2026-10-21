"""Stage 3: split each day block's grid into raw cells.

The grid is rows x atomic columns. Two neighbouring grid squares belong to the same cell when
there is no border between them and they have the same fill colour. Fill rectangles alone
aren't reliable (some cover one row, some cover a whole area), so borders define structure
and the fill colour is sampled at each square's centre.

A raw cell is anything with a non-white fill or with text. Interpretation (subject, group,
times from text, notes) happens later.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .extract import WHITE, Box, Color
from .index import PageIndex, TextLine, text_lines
from .layout import DayBlock


@dataclass
class RawCell:
    id: str
    block_id: str
    row_start: int
    row_end: int  # inclusive
    col_start: int
    col_end: int  # inclusive
    time_start: str
    time_end: str
    fill: Color
    box: Box
    lines: list[TextLine] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " / ".join(ln.text for ln in self.lines)


class _UnionFind:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))

    def find(self, a: int) -> int:
        while self.parent[a] != a:
            self.parent[a] = self.parent[self.parent[a]]
            a = self.parent[a]
        return a

    def union(self, a: int, b: int) -> None:
        self.parent[self.find(a)] = self.find(b)


def detect_cells(block: DayBlock, index: PageIndex) -> list[RawCell]:
    rows, cols = block.rows, block.columns
    n_rows, n_cols = len(rows), len(cols) - 1
    if n_cols < 1:
        return []

    def sq(r: int, c: int) -> int:
        return r * n_cols + c

    centers = {
        (r, c): ((cols[c] + cols[c + 1]) / 2, (rows[r].top + rows[r].bottom) / 2)
        for r in range(n_rows)
        for c in range(n_cols)
    }
    colors = {rc: index.color_at(*xy) for rc, xy in centers.items()}

    uf = _UnionFind(n_rows * n_cols)
    for r in range(n_rows):
        for c in range(n_cols):
            if c + 1 < n_cols and colors[(r, c)] == colors[(r, c + 1)]:
                if not index.has_v_border(cols[c + 1], rows[r].top, rows[r].bottom):
                    uf.union(sq(r, c), sq(r, c + 1))
            if r + 1 < n_rows and colors[(r, c)] == colors[(r + 1, c)]:
                if not index.has_h_border(rows[r].bottom, cols[c], cols[c + 1]):
                    uf.union(sq(r, c), sq(r + 1, c))

    groups: dict[int, list[tuple[int, int]]] = {}
    for r in range(n_rows):
        for c in range(n_cols):
            groups.setdefault(uf.find(sq(r, c)), []).append((r, c))

    # Assign each character to the grid square containing its centre.
    g = block.grid_box
    square_chars: dict[tuple[int, int], list] = {}
    for ch in index.chars_in(g):
        r = next((i for i, row in enumerate(rows) if row.top <= ch.box.cy <= row.bottom), None)
        c = next((i for i in range(n_cols) if cols[i] <= ch.box.cx <= cols[i + 1]), None)
        if r is not None and c is not None:
            square_chars.setdefault((r, c), []).append(ch)

    cells: list[RawCell] = []
    for squares in groups.values():
        r0 = min(r for r, _ in squares)
        r1 = max(r for r, _ in squares)
        c0 = min(c for _, c in squares)
        c1 = max(c for _, c in squares)
        fill = colors[squares[0]]
        chars = [ch for s in squares for ch in square_chars.get(s, [])]
        if fill == WHITE and not chars:
            continue
        flags = []
        if len(squares) != (r1 - r0 + 1) * (c1 - c0 + 1):
            flags.append("non-rectangular")
        cells.append(
            RawCell(
                id="",
                block_id=block.id,
                row_start=r0,
                row_end=r1,
                col_start=c0,
                col_end=c1,
                time_start=rows[r0].start,
                time_end=rows[r1].end,
                fill=fill,
                box=Box(cols[c0], rows[r0].top, cols[c1 + 1], rows[r1].bottom),
                lines=text_lines(chars),
                flags=flags,
            )
        )

    cells.sort(key=lambda c: (c.row_start, c.col_start))
    for i, cell in enumerate(cells):
        cell.id = f"{block.id}-c{i:02d}"
    return cells
