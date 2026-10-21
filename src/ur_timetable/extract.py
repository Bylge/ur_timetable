"""Stage 1: read raw drawing primitives from a PDF page.

The timetables are Excel exports: every cell border and every fill is a rectangle, and text
has exact positions. Thin rectangles are treated as border segments, the rest as fills.
Nothing here interprets the timetable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pdfplumber

Color = tuple[float, float, float]

WHITE: Color = (1.0, 1.0, 1.0)
BLACK: Color = (0.0, 0.0, 0.0)

# A rectangle thinner than this (in points) is a border line, not a fill.
BORDER_MAX_THICKNESS = 1.5


@dataclass(frozen=True)
class Box:
    x0: float
    top: float
    x1: float
    bottom: float

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.top + self.bottom) / 2

    def contains(self, x: float, y: float) -> bool:
        return self.x0 <= x <= self.x1 and self.top <= y <= self.bottom


@dataclass(frozen=True)
class Char:
    text: str
    box: Box
    size: float
    color: Color


@dataclass(frozen=True)
class Word:
    text: str
    box: Box


@dataclass(frozen=True)
class Fill:
    box: Box
    color: Color


@dataclass(frozen=True)
class Segment:
    """A border line. `pos` is y for horizontal segments, x for vertical ones."""

    pos: float
    start: float
    end: float


@dataclass
class PagePrimitives:
    number: int  # 1-based
    width: float
    height: float
    chars: list[Char] = field(default_factory=list)
    words: list[Word] = field(default_factory=list)
    fills: list[Fill] = field(default_factory=list)  # in drawing order
    h_segments: list[Segment] = field(default_factory=list)
    v_segments: list[Segment] = field(default_factory=list)


def normalize_color(value: object) -> Color:
    """Convert a pdfplumber colour (grey, RGB or CMYK) to an RGB tuple."""
    if value is None:
        return BLACK
    if isinstance(value, int | float):
        g = float(value)
        return (round(g, 3), round(g, 3), round(g, 3))
    comps = [float(v) for v in value]  # type: ignore[union-attr]
    if len(comps) == 1:
        return normalize_color(comps[0])
    if len(comps) == 3:
        return (round(comps[0], 3), round(comps[1], 3), round(comps[2], 3))
    if len(comps) == 4:
        c, m, y, k = comps
        return (
            round((1 - c) * (1 - k), 3),
            round((1 - m) * (1 - k), 3),
            round((1 - y) * (1 - k), 3),
        )
    return BLACK


def color_hex(color: Color) -> str:
    return "#" + "".join(f"{round(c * 255):02x}" for c in color)


def extract_page(page: pdfplumber.page.Page) -> PagePrimitives:
    prims = PagePrimitives(number=page.page_number, width=float(page.width), height=float(page.height))

    for c in page.chars:
        if not c["text"].strip():
            continue
        prims.chars.append(
            Char(
                text=c["text"],
                box=Box(c["x0"], c["top"], c["x1"], c["bottom"]),
                size=float(c["size"]),
                color=normalize_color(c.get("non_stroking_color")),
            )
        )

    # Small x_tolerance: the font is tiny (~3.7 pt) and neighbouring cells are close.
    for w in page.extract_words(x_tolerance=1, y_tolerance=1):
        prims.words.append(Word(text=w["text"], box=Box(w["x0"], w["top"], w["x1"], w["bottom"])))

    for r in page.rects:
        box = Box(r["x0"], r["top"], r["x1"], r["bottom"])
        thin_h = r["height"] < BORDER_MAX_THICKNESS
        thin_w = r["width"] < BORDER_MAX_THICKNESS
        if thin_h and not thin_w:
            prims.h_segments.append(Segment(box.cy, box.x0, box.x1))
        elif thin_w and not thin_h:
            prims.v_segments.append(Segment(box.cx, box.top, box.bottom))
        elif r.get("fill"):
            prims.fills.append(Fill(box, normalize_color(r.get("non_stroking_color"))))
        if r.get("stroke") and not (thin_h or thin_w):
            prims.h_segments += [Segment(box.top, box.x0, box.x1), Segment(box.bottom, box.x0, box.x1)]
            prims.v_segments += [Segment(box.x0, box.top, box.bottom), Segment(box.x1, box.top, box.bottom)]

    for ln in page.lines:
        if abs(ln["top"] - ln["bottom"]) < BORDER_MAX_THICKNESS:
            prims.h_segments.append(Segment((ln["top"] + ln["bottom"]) / 2, ln["x0"], ln["x1"]))
        elif abs(ln["x0"] - ln["x1"]) < BORDER_MAX_THICKNESS:
            prims.v_segments.append(Segment((ln["x0"] + ln["x1"]) / 2, ln["top"], ln["bottom"]))

    return prims


def extract_pdf(path: str | Path) -> list[PagePrimitives]:
    with pdfplumber.open(path) as pdf:
        return [extract_page(p) for p in pdf.pages]
