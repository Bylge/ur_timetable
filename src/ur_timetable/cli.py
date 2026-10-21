"""Command line.

    ur-timetable inspect SOURCE    layout JSON + debug images (stages 1-3)
    ur-timetable parse SOURCE      events JSON + report (stages 1-4)
    ur-timetable demo SOURCE       local HTML week calendar
    ur-timetable ics SOURCE --groups 2=1,3=2 [--album N] [--optional "Język niemiecki"]
    ur-timetable validate SOURCE   validation report (stage 5)
    ur-timetable update [--programme P] [--only ID] [--approve] [--republish]
                                   check ur.edu.pl, publish new versions to data/published/

SOURCE is a timetable PDF or a folder containing exactly one PDF (and optionally the groups DOCX).
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from .cells import RawCell, detect_cells
from .debug import render_page, to_json, write_json
from .demo import write_demo
from .extract import extract_pdf
from .fetch import PROGRAMME_PAGES
from .index import PageIndex
from .layout import DayBlock, detect_blocks
from .pipeline import Timetable, parse_timetable, resolve_source
from .publish import without_names
from .schedule import student_schedule, to_ics
from .store import JsonStore
from .update import run_update
from .validate import validate


def inspect(pdf_path: Path, out_dir: Path, render: bool = True) -> tuple[list[DayBlock], list[RawCell]]:
    out_dir.mkdir(parents=True, exist_ok=True)
    all_blocks: list[DayBlock] = []
    all_cells: list[RawCell] = []
    for prims in extract_pdf(pdf_path):
        index = PageIndex(prims)
        blocks = detect_blocks(prims, index)
        cells = [c for b in blocks for c in detect_cells(b, index)]
        all_blocks += blocks
        all_cells += cells
        if render and blocks:
            render_page(pdf_path, prims.number, blocks, cells).save(out_dir / f"page-{prims.number}.png")
    write_json(out_dir / "layout.json", to_json(all_blocks, all_cells))
    return all_blocks, all_cells


def summarize(blocks: list[DayBlock], cells: list[RawCell]) -> str:
    out = []
    per_page = Counter(b.page for b in blocks)
    out.append(f"day blocks: {len(blocks)} ({', '.join(f'p{p}: {n}' for p, n in sorted(per_page.items()))})")
    out.append(f"rows per block: {dict(Counter(len(b.rows) for b in blocks))}")
    layouts = Counter((b.weekday, b.n_columns, tuple(b.partitions)) for b in blocks)
    out.append(
        "layouts (weekday, columns, partitions): " + ", ".join(f"{k}x{v}" for k, v in sorted(layouts.items(), key=str))
    )
    out.append(f"raw cells: {len(cells)} (with text: {sum(1 for c in cells if c.lines)})")
    warned = [b for b in blocks if b.warnings]
    out.append(f"blocks with warnings: {len(warned)}")
    for b in warned:
        out.append(f"  {b.id} {b.weekday} {b.date_text}: {'; '.join(b.warnings)}")
    flagged = [c for c in cells if c.flags]
    out.append(f"cells with flags: {len(flagged)}")
    for c in flagged:
        out.append(f"  {c.id} {c.time_start}-{c.time_end} cols {c.col_start}-{c.col_end}: {c.flags} {c.text!r}")
    return "\n".join(out)


def report(t: Timetable) -> str:
    r = t.result
    out = [f"{t.title or t.name}"]
    out.append(f"subjects in legend: {len(t.subjects)}; group profiles: {len(t.profiles)}")
    out.append(f"events: {len(r.events)} ({dict(Counter(e.kind for e in r.events))})")
    out.append(f"dropped: {len(r.dropped)}")
    for d in r.dropped:
        out.append(f"  {d.event.date} {d.event.start}-{d.event.end} {d.event.title}: {d.reason}")
    out.append(f"day notes: {len(r.day_notes)}; skipped cells: {len(r.skipped_cells)}")
    warnings = Counter(w for e in r.events for w in e.warnings)
    out.append(f"warnings ({sum(warnings.values())}):")
    for w, n in warnings.most_common():
        out.append(f"  {n:4d} x {w}")
    errors = [e for e in r.events if e.errors]
    out.append(f"ERRORS - not published ({len(errors)}):")
    for e in errors:
        out.append(f"  {e.date} {e.start}-{e.end} {e.title} {e.source['columns']}: {'; '.join(e.errors)}")
    for w in r.warnings:
        out.append(f"document: {w}")
    return "\n".join(out)


def _parse_groups(text: str) -> dict[str, int]:
    groups = {}
    for item in filter(None, text.split(",")):
        key, _, value = item.partition("=")
        groups[key.strip()] = int(value)
    return groups


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ur-timetable")
    sub = parser.add_subparsers(dest="command", required=True)
    source_help = "a timetable PDF, or a folder containing exactly one PDF"

    p = sub.add_parser("inspect", help="detect layout and write debug output")
    p.add_argument("source", type=Path, help=source_help)
    p.add_argument("--out", type=Path, default=None, help="output directory (default: out/<name>)")
    p.add_argument("--no-render", action="store_true", help="skip debug images")

    p = sub.add_parser("parse", help="parse into events and print a report")
    p.add_argument("source", type=Path, help=source_help)
    p.add_argument("--out", type=Path, default=Path("out"), help="output root (default: out)")

    p = sub.add_parser("demo", help="write a local HTML week calendar")
    p.add_argument("source", type=Path, help=source_help)
    p.add_argument("--out", type=Path, default=Path("out"), help="output root (default: out)")

    p = sub.add_parser("ics", help="write an .ics calendar for one set of groups")
    p.add_argument("source", type=Path, help=source_help)
    p.add_argument("--groups", default="", help="e.g. 2=1,3=2,4=2,5=3 (overrides --album)")
    p.add_argument("--album", default=None, help="pre-fill groups from the groups DOCX")
    p.add_argument(
        "--optional", action="append", default=[], help="optional subject to include, e.g. 'Język niemiecki'"
    )
    p.add_argument("--out", type=Path, default=None, help="output file (default: out/<name>/plan.ics)")

    p = sub.add_parser("validate", help="print the validation report for a local source")
    p.add_argument("source", type=Path, help=source_help)

    p = sub.add_parser("update", help="check the university pages and publish new versions")
    p.add_argument("--programme", action="append", choices=sorted(PROGRAMME_PAGES), help="default: all")
    p.add_argument("--only", action="append", default=[], help="timetable id, e.g. dietetyka/I-st_ST_rok-1")
    p.add_argument("--approve", action="store_true", help="publish even if the change is large (after checking)")
    p.add_argument("--republish", action="store_true", help="regenerate published files even if the PDF is unchanged")

    args = parser.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

    if args.command == "update":
        result = run_update(
            args.programme or sorted(PROGRAMME_PAGES), set(args.only) or None, args.approve, args.republish
        )
        # The scheduled job's log is public (GitHub Actions): no names, even if a report quotes PDF text.
        print("\n".join(without_names(line) or "" for line in "\n".join(result.lines).splitlines()))
        print(f"published: {result.published or 'none'}; failed: {result.failed or 'none'}")
        return 1 if result.failed else 0

    try:
        pdf, _, name = resolve_source(args.source)
    except (FileNotFoundError, ValueError) as exc:
        parser.error(f"{exc if isinstance(exc, ValueError) else f'not found: {args.source}'}")

    if args.command == "inspect":
        out = args.out or Path("out") / name
        blocks, cells = inspect(pdf, out, render=not args.no_render)
        print(summarize(blocks, cells))
        print(f"output: {out}")
        return 0

    t = parse_timetable(args.source)

    if args.command == "validate":
        checks = validate(t)
        print(checks.text())
        return 0 if checks.ok else 1
    if args.command == "parse":
        JsonStore(args.out).save(t)
        print(report(t))
        print(f"output: {args.out / t.name / 'timetable.json'}")
    elif args.command == "demo":
        folder = args.out / t.name
        folder.mkdir(parents=True, exist_ok=True)
        write_demo(t, folder / "calendar.html")
        print(f"output: {folder / 'calendar.html'} (open it in a browser)")
    elif args.command == "ics":
        groups: dict[str, int] = {}
        if args.album:
            if args.album not in t.profiles:
                parser.error(f"album {args.album} not in the groups list")
            groups = dict(t.profiles[args.album])
        groups.update(_parse_groups(args.groups))
        events = student_schedule(t.result.events, groups, set(t.config.optional_subjects), set(args.optional))
        out = args.out or Path("out") / t.name / "plan.ics"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(to_ics(events, f"Plan zajęć – {t.name}"), encoding="utf-8", newline="")
        print(f"groups: {groups}; events: {len(events)}")
        print(f"output: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
