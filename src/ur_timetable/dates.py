"""Dates: parsing day headers, the wrong-year typo rule, and Polish public holidays."""

from __future__ import annotations

import re
from collections import Counter
from datetime import date, timedelta

DATE_RE = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})")
WEEKDAY_INDEX = {
    "PONIEDZIAŁEK": 0,
    "WTOREK": 1,
    "ŚRODA": 2,
    "CZWARTEK": 3,
    "PIĄTEK": 4,
    "SOBOTA": 5,
    "NIEDZIELA": 6,
}


def parse_date(text: str) -> date | None:
    m = DATE_RE.search(text)
    if not m:
        return None
    try:
        return date(int(m[3]), int(m[2]), int(m[1]))
    except ValueError:
        return None


def academic_year_start(dates: list[date]) -> int:
    """Year Y such that most dates fall in the academic year Y/Y+1 (1 Sep - 31 Aug)."""
    years = Counter(d.year if d.month >= 9 else d.year - 1 for d in dates)
    return years.most_common(1)[0][0]


def correct_year(d: date, weekday: str | None, start_year: int) -> date | None:
    """Wrong-year typo rule (confirmed by the maintainer: the typo appears in all timetables).

    If `d` lies outside the academic year but the same day/month inside it falls on the printed
    weekday, return the corrected date. Otherwise None (no correction possible).
    """
    first, last = date(start_year, 9, 1), date(start_year + 1, 8, 31)
    if first <= d <= last:
        return None
    year = start_year if d.month >= 9 else start_year + 1
    try:
        candidate = d.replace(year=year)
    except ValueError:
        return None
    if weekday is not None and WEEKDAY_INDEX.get(weekday) != candidate.weekday():
        return None
    return candidate


def _easter(year: int) -> date:
    """Gregorian Easter Sunday (anonymous Gregorian algorithm)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    m = (32 + 2 * e + 2 * i - h - k) % 7
    n = (a + 11 * h + 22 * m) // 451
    month = (h + m - 7 * n + 114) // 31
    day = (h + m - 7 * n + 114) % 31 + 1
    return date(year, month, day)


def polish_public_holidays(year: int) -> dict[date, str]:
    easter = _easter(year)
    holidays = {
        date(year, 1, 1): "Nowy Rok",
        date(year, 1, 6): "Trzech Króli",
        date(year, 5, 1): "Święto Pracy",
        date(year, 5, 3): "Święto Konstytucji 3 Maja",
        date(year, 8, 15): "Wniebowzięcie NMP",
        date(year, 11, 1): "Wszystkich Świętych",
        date(year, 11, 11): "Narodowe Święto Niepodległości",
        date(year, 12, 25): "Boże Narodzenie",
        date(year, 12, 26): "Drugi dzień Bożego Narodzenia",
        easter: "Wielkanoc",
        easter + timedelta(days=1): "Poniedziałek Wielkanocny",
        easter + timedelta(days=49): "Zielone Świątki",
        easter + timedelta(days=60): "Boże Ciało",
    }
    if year >= 2025:
        holidays[date(year, 12, 24)] = "Wigilia"
    return holidays


def public_holiday(d: date) -> str | None:
    return polish_public_holidays(d.year).get(d)
