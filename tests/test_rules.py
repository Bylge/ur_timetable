"""Text parsing, date rules, group resolution and filtering (no PDF needed)."""

from datetime import date

from ur_timetable.dates import correct_year, public_holiday
from ur_timetable.interpret import Event, resolve_audience
from ur_timetable.layout import GroupHeaderRow, GroupSpan
from ur_timetable.schedule import student_schedule, to_ics
from ur_timetable.textparse import parse_cell_text, parse_part


def test_explicit_start_and_room():
    p = parse_part(["Wychowanie fizyczne (8:30) ul.Kasprowicza1"])
    assert (p.title, p.start, p.end, p.room) == ("Wychowanie fizyczne", "08:30", None, "ul.Kasprowicza1")


def test_explicit_range_and_lecture_marker():
    p = parse_part(["(14:15 do 17:45) Anatomia człowieka (w)", "G4.-104"])
    assert (p.title, p.start, p.end, p.type_marker, p.room) == ("Anatomia człowieka", "14:15", "17:45", "w", "G4.-104")


def test_end_only_variants():
    assert parse_part(["Żywienie (ćw)", "G4.417 (do 10;45)"]).end == "10:45"
    assert parse_part(["Fizjologia (L)", "G5.224 (do12:15)"]).end == "12:15"
    assert parse_part(["Dieta (w)", "G5.224 (DO 16:00)"]).end == "16:00"


def test_two_events_in_one_cell():
    parts = parse_cell_text(["16:15 spotkanie organizacyjne", "(17:00) Anatomia człowieka (w)", "G4.-101"])
    assert [(p.title, p.start, p.room) for p in parts] == [
        ("spotkanie organizacyjne", "16:15", None),
        ("Anatomia człowieka", "17:00", "G4.-101"),
    ]


def test_room_formats():
    assert parse_part(["KPP-CSM", "C2.106"]).title == "KPP-CSM"
    assert parse_part(["(12:15) Fizjologia człowieka (w)", "A1.MAŁA AULA"]).room == "A1.MAŁA AULA"
    assert parse_part(["Mikrobiologia", "MS Teams"]).room == "MS Teams"
    p = parse_part(["(13:45) SZKOLENIE - obowiązkowe", "z zakresu praw i obowiązków - A2.46"])
    assert (p.room, p.title) == ("A2.46", "SZKOLENIE - obowiązkowe z zakresu praw i obowiązków")


def test_wrong_year_rule():
    assert correct_year(date(2025, 12, 22), "WTOREK", 2026) == date(2026, 12, 22)
    assert correct_year(date(2025, 9, 28), "PONIEDZIAŁEK", 2026) == date(2026, 9, 28)
    assert correct_year(date(2026, 1, 22), "PIĄTEK", 2026) == date(2027, 1, 22)
    assert correct_year(date(2025, 12, 22), "ŚRODA", 2026) is None  # weekday doesn't fit: no fix
    assert correct_year(date(2026, 12, 22), "WTOREK", 2026) is None  # already fine


def test_public_holidays():
    assert public_holiday(date(2027, 1, 6)) == "Trzech Króli"
    assert public_holiday(date(2027, 3, 29)) == "Poniedziałek Wielkanocny"
    assert public_holiday(date(2026, 10, 7)) is None


HEADER_4_2 = [
    GroupHeaderRow(0, 1, [GroupSpan(i + 1, i, i, 0, 0) for i in range(4)]),
    GroupHeaderRow(1, 2, [GroupSpan(1, 0, 1, 0, 0), GroupSpan(2, 2, 3, 0, 0)]),
]


def test_audience_rules():
    assert resolve_audience(0, 3, 4, HEADER_4_2, 3)[:2] == (None, None)  # spans everything
    assert resolve_audience(2, 3, 4, HEADER_4_2, 2)[:2] == (2, 2)
    assert resolve_audience(1, 1, 4, HEADER_4_2, 4)[:2] == (4, 2)
    p, g, warnings, errors = resolve_audience(2, 2, 4, HEADER_4_2, 3)  # no 3-group row: column rule
    assert (p, g, errors) == (3, 3, []) and warnings
    assert resolve_audience(3, 3, 4, HEADER_4_2, 3)[3]  # column 4 can't be group 4 of 3
    assert resolve_audience(1, 2, 4, HEADER_4_2, 2)[3]  # columns 2-3 aren't a 2-group span


def ev(id_, partition, group, subject="X", errors=()):
    return Event(
        id_,
        "2026-10-05",
        "08:00",
        "09:30",
        subject,
        subject,
        "class",
        None,
        None,
        partition,
        group,
        None,
        "#ffffff",
        errors=list(errors),
    )


def test_student_filter():
    events = [
        ev("all", None, None),
        ev("g1of2", 2, 1),
        ev("g2of2", 2, 2),
        ev("g3of3", 3, 3),
        ev("broken", 4, None, errors=["x"]),
        ev("german", 1, 1, subject="Język niemiecki"),
    ]
    ids = [e.id for e in student_schedule(events, {"2": 1, "3": 3}, {"Język niemiecki"}, set())]
    assert ids == ["all", "g1of2", "g3of3"]
    ids = [e.id for e in student_schedule(events, {"2": 2}, {"Język niemiecki"}, {"Język niemiecki"})]
    assert ids == ["all", "g2of2", "german"]


def test_ics_basics():
    text = to_ics([ev("a", 2, 1, subject="Chemia, żywności")], "Plan")
    assert text.startswith("BEGIN:VCALENDAR\r\n") and text.endswith("END:VCALENDAR\r\n")
    assert "DTSTART;TZID=Europe/Warsaw:20261005T080000" in text
    assert "SUMMARY:Chemia\\, żywności (ćwiczenia)" in text
    assert all(len(line.encode()) <= 75 for line in text.split("\r\n"))


def test_config_loading(tmp_path):
    from ur_timetable.config import load_config

    (tmp_path / "x.json").write_text(
        '{"optional_subjects": ["Język niemiecki"], "group_overrides": '
        '[{"date": "2026-12-10", "subject": "Anatomia człowieka", "columns": [5, 5], "group": 4, "reason": "r"}]}',
        encoding="utf-8",
    )
    cfg = load_config("x", tmp_path)
    assert cfg.optional_subjects == ["Język niemiecki"]
    assert cfg.group_overrides[0].columns == (5, 5) and cfg.group_overrides[0].group == 4
    assert load_config("missing", tmp_path).group_overrides == []
