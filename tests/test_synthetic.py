"""Layout and cell detection on a small hand-built page (no PDF needed)."""

from ur_timetable.cells import detect_cells
from ur_timetable.extract import Box, Char, Fill, PagePrimitives, Segment, Word
from ur_timetable.index import PageIndex
from ur_timetable.layout import detect_blocks

RED = (1.0, 0.8, 0.8)
SIZE = 3.0


def put_text(prims: PagePrimitives, text: str, x: float, top: float) -> None:
    """Add `text` as chars and as one word starting at (x, top)."""
    w = SIZE * 0.5
    for i, ch in enumerate(text):
        if ch != " ":
            prims.chars.append(Char(ch, Box(x + i * w, top, x + (i + 1) * w, top + SIZE), SIZE, (0, 0, 0)))
    prims.words.append(Word(text, Box(x, top, x + len(text) * w, top + SIZE)))


def build_page() -> PagePrimitives:
    """
    x:  0 ---- 20 ------ 40 ------ 60
        TYDZIEŃ 2 | PONIEDZIAŁEK          y 0-6
                  | 05.10.2026            y 6-12
                  |   1     |    2        y 12-18  (group row)
        8.00-8.45 | Chemia  |             y 18-24
        8.45-9.30 | D3.137  |             y 24-30  (merged with row above, underlined room)
        9.30-10.15|         |             y 30-36
    """
    p = PagePrimitives(number=1, width=100, height=100)
    for y in (0, 6, 12, 18, 30, 36):
        p.h_segments.append(Segment(y, 0, 60))
    # Row boundary at y=24 everywhere except inside the merged cell (x 20-40).
    p.h_segments += [Segment(24, 0, 20), Segment(24, 40, 60)]
    # Underline under "D3.137": short thin line, must not split the cell.
    p.h_segments.append(Segment(28.5, 23, 32))
    p.v_segments += [Segment(0, 0, 36), Segment(20, 0, 36), Segment(60, 0, 36), Segment(40, 12, 36)]
    p.fills.append(Fill(Box(20, 18, 40, 24), RED))
    p.fills.append(Fill(Box(20, 24, 40, 30), RED))

    put_text(p, "TYDZIEŃ 2", 2, 3)
    put_text(p, "PONIEDZIAŁEK", 25, 1.5)
    put_text(p, "05.10.2026", 28, 7.5)
    put_text(p, "1", 29, 13.5)
    put_text(p, "2", 49, 13.5)
    put_text(p, "8.00-8.45", 3, 19.5)
    put_text(p, "8.45-9.30", 3, 25.5)
    put_text(p, "9.30-10.15", 3, 31.5)
    put_text(p, "Chemia", 24, 19.5)
    put_text(p, "D3.137", 24, 25.0)
    return p


def test_block_structure():
    prims = build_page()
    [block] = detect_blocks(prims)
    assert block.warnings == []
    assert block.weekday == "PONIEDZIAŁEK"
    assert block.date_text == "05.10.2026"
    assert block.week_number == 2
    assert block.columns == [20, 40, 60]
    assert block.partitions == [2]
    assert [s.group for s in block.header_rows[0].spans] == [1, 2]
    assert [(r.start, r.end) for r in block.rows] == [("08:00", "08:45"), ("08:45", "09:30"), ("09:30", "10:15")]


def test_merged_cell_with_underline():
    prims = build_page()
    index = PageIndex(prims)
    [block] = detect_blocks(prims, index)
    [cell] = detect_cells(block, index)
    assert (cell.row_start, cell.row_end, cell.col_start, cell.col_end) == (0, 1, 0, 0)
    assert (cell.time_start, cell.time_end) == ("08:00", "09:30")
    assert cell.fill == RED
    assert cell.text == "Chemia / D3.137"
    assert cell.flags == []
