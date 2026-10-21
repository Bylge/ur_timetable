"""Parse the text of one grid cell: explicit times, type marker, room, subject text.

A cell can hold several events; a line that starts with a time begins a new one:

    16:15 spotkanie organizacyjne
    (17:00) Anatomia człowieka (w)
    G4.-101

Nothing here knows about subjects or groups; it only splits text into parts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_T = r"(\d{1,2})[:.;](\d{2})"
RANGE_RE = re.compile(rf"\(\s*{_T}\s*do\s*{_T}\s*\)", re.IGNORECASE)
UNTIL_RE = re.compile(rf"\(\s*do\s*{_T}\s*\)", re.IGNORECASE)
START_PAREN_RE = re.compile(rf"\(\s*{_T}\s*\)")
START_BARE_RE = re.compile(rf"^{_T}\b")
LINE_STARTS_WITH_TIME = re.compile(rf"^\(?\s*{_T}")

TYPE_RE = re.compile(r"\((w|W|ćw|ĆW|Ćw|k|K|L)\)")
TYPE_NAMES = {"w": "w", "ćw": "cw", "k": "k", "l": "L"}

ROOM_RES = [
    re.compile(r"MS\s*Teams", re.IGNORECASE),
    re.compile(r"ul\.\s?\S+"),
    re.compile(r"\b[A-Z]\d\.[A-ZĄĆĘŁŃÓŚŹŻ]+(?: [A-ZĄĆĘŁŃÓŚŹŻ]+)*\b"),  # A1.MAŁA AULA
    re.compile(r"\b[A-Z]{1,3}\d{0,2}\.-?\d+[a-z]?\b"),  # D3.137, G4.-101, CSM.212a, E7.3
]


@dataclass
class TextPart:
    raw: str
    title: str  # what remains after removing times, type marker and room
    start: str | None = None  # "HH:MM" from the text
    end: str | None = None
    type_marker: str | None = None  # "w", "cw", "k", "L"
    room: str | None = None


def _hhmm(h: str, m: str) -> str:
    return f"{int(h):02d}:{m}"


def split_events(lines: list[str]) -> list[list[str]]:
    """Group cell lines into events. Lines without a leading time stay with the current event."""
    groups: list[list[str]] = []
    for line in lines:
        if groups and LINE_STARTS_WITH_TIME.match(line):
            groups.append([line])
        elif groups:
            groups[-1].append(line)
        else:
            groups.append([line])
    return groups


def parse_part(lines: list[str]) -> TextPart:
    text = " ".join(ln.strip() for ln in lines)
    part = TextPart(raw=text, title="")

    if m := RANGE_RE.search(text):
        part.start, part.end = _hhmm(m[1], m[2]), _hhmm(m[3], m[4])
        text = text[: m.start()] + " " + text[m.end() :]
    else:
        if m := UNTIL_RE.search(text):
            part.end = _hhmm(m[1], m[2])
            text = text[: m.start()] + " " + text[m.end() :]
        if m := START_PAREN_RE.search(text):
            part.start = _hhmm(m[1], m[2])
            text = text[: m.start()] + " " + text[m.end() :]
        elif m := START_BARE_RE.match(text.strip()):
            part.start = _hhmm(m[1], m[2])
            text = text.strip()[m.end() :]

    if m := TYPE_RE.search(text):
        part.type_marker = TYPE_NAMES[m[1].lower()]
        text = text[: m.start()] + " " + text[m.end() :]

    for room_re in ROOM_RES:
        matches = list(room_re.finditer(text))
        if matches:
            m = matches[-1]
            part.room = re.sub(r"\s+", " ", m[0])
            text = text[: m.start()] + " " + text[m.end() :]
            break

    part.title = re.sub(r"\s+", " ", text).strip(" -–/")
    return part


def parse_cell_text(lines: list[str]) -> list[TextPart]:
    return [parse_part(group) for group in split_events(lines)]
