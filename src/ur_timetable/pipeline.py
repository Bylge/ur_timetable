"""Run all stages for one timetable source (a PDF, optionally with a groups DOCX next to it)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from .cells import RawCell, detect_cells
from .config import TimetableConfig, load_config
from .extract import extract_pdf
from .index import PageIndex, text_lines
from .interpret import Interpretation, interpret
from .layout import DayBlock, detect_blocks
from .legend import Subject, parse_legend
from .profiles import parse_groups_docx


@dataclass
class Timetable:
    name: str
    pdf: Path
    title: str | None
    blocks: list[DayBlock]
    cells: list[RawCell]
    subjects: list[Subject]
    result: Interpretation
    config: TimetableConfig = field(default_factory=TimetableConfig)
    profiles: dict[str, dict[str, int]] = field(default_factory=dict)  # album -> groups (local validation only)


def resolve_source(source: Path) -> tuple[Path, Path | None, str]:
    """Return (pdf, groups docx or None, timetable id) for a PDF path or a folder with one PDF.

    The id is "<programme>/<folder>" for the layout data/sources/<programme>/<folder>/ (and the
    download layout data/downloads/<programme>/<folder>/<hash>.pdf), e.g. "dietetyka/I-st_ST_rok-1".
    """
    if source.is_dir():
        pdfs = sorted(source.glob("*.pdf"))
        if len(pdfs) != 1:
            raise ValueError(f"expected exactly one PDF in {source}, found {len(pdfs)}")
        docxs = sorted(source.glob("*.docx"))
        return pdfs[0], docxs[0] if len(docxs) == 1 else None, f"{source.parent.name}/{source.name}"
    if source.is_file():
        docxs = sorted(source.parent.glob("*.docx"))
        folder = source.parent
        return source, docxs[0] if len(docxs) == 1 else None, f"{folder.parent.name}/{folder.name}"
    raise FileNotFoundError(source)


def parse_pdf(pdf: Path, timetable_id: str, groups_docx: Path | None = None) -> Timetable:
    blocks: list[DayBlock] = []
    cells: list[RawCell] = []
    subjects: list[Subject] = []
    title = None
    for prims in extract_pdf(pdf):
        index = PageIndex(prims)
        page_blocks = detect_blocks(prims, index)
        blocks += page_blocks
        cells += [c for b in page_blocks for c in detect_cells(b, index)]
        subjects += parse_legend(prims, index) or []
        if title is None:
            title = next((ln.text for ln in text_lines(prims.chars) if "ROZKŁAD" in ln.text.upper()), None)
    config = load_config(timetable_id)
    result = interpret(blocks, cells, subjects, config.group_overrides)
    profiles = parse_groups_docx(groups_docx) if groups_docx else {}
    return Timetable(timetable_id, pdf, title, blocks, cells, subjects, result, config, profiles)


def parse_timetable(source: Path) -> Timetable:
    pdf, groups_docx, timetable_id = resolve_source(source)
    return parse_pdf(pdf, timetable_id, groups_docx)
