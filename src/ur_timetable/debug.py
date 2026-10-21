"""Debug output: page images with detected structure drawn on top, and a JSON dump."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageDraw

from .cells import RawCell
from .extract import color_hex
from .layout import DayBlock

SCALE = 3.0  # pixels per PDF point

BLOCK_COLOR = (0, 90, 255)
COLUMN_COLOR = (0, 170, 0)
HEADER_COLOR = (160, 0, 200)
CELL_COLOR = (230, 0, 0)
WARN_COLOR = (255, 140, 0)


def render_page(pdf_path: Path, page_number: int, blocks: list[DayBlock], cells: list[RawCell]) -> Image.Image:
    pdf = pdfium.PdfDocument(str(pdf_path))
    img = pdf[page_number - 1].render(scale=SCALE).to_pil().convert("RGB")
    draw = ImageDraw.Draw(img)

    def px(*vals: float) -> list[float]:
        return [v * SCALE for v in vals]

    for b in blocks:
        g = b.grid_box
        color = WARN_COLOR if b.warnings else BLOCK_COLOR
        draw.rectangle(px(b.label_box.x0, b.header_top or g.top, g.x1, g.bottom), outline=color, width=3)
        for x in b.columns[1:-1]:
            draw.line(px(x, g.top, x, g.bottom), fill=COLUMN_COLOR, width=1)
        for hr in b.header_rows:
            for s in hr.spans:
                draw.rectangle(px(s.x0 + 0.6, hr.top + 0.6, s.x1 - 0.6, hr.bottom - 0.6), outline=HEADER_COLOR, width=2)
        label = f"{b.weekday or '?'} {b.date_text or '?'} cols={b.n_columns} {b.partitions}"
        draw.text(px(g.x0 + 1, (b.header_top or g.top) - 4), label, fill=color)

    for c in cells:
        color = WARN_COLOR if c.flags else CELL_COLOR
        draw.rectangle(px(c.box.x0 + 0.4, c.box.top + 0.4, c.box.x1 - 0.4, c.box.bottom - 0.4), outline=color, width=2)
    return img


def to_json(blocks: list[DayBlock], cells: list[RawCell]) -> dict:
    def block_dict(b: DayBlock) -> dict:
        d = asdict(b)
        d["n_columns"] = b.n_columns
        d["partitions"] = b.partitions
        return d

    def cell_dict(c: RawCell) -> dict:
        d = asdict(c)
        d["fill"] = color_hex(c.fill)
        d["text"] = c.text
        d["lines"] = [{"text": ln.text, "color": color_hex(ln.color)} for ln in c.lines]
        return d

    return {"blocks": [block_dict(b) for b in blocks], "cells": [cell_dict(c) for c in cells]}


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
