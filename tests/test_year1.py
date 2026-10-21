"""Layout detection on the real I st ST year-1 timetable (02.10.2026).

The PDF isn't committed (source files are git-ignored); these tests are skipped when it's missing.
Expected values were checked by eye against the rendered PDF.
"""

from collections import Counter
from pathlib import Path

import pytest

from ur_timetable.cells import detect_cells
from ur_timetable.extract import extract_pdf
from ur_timetable.index import PageIndex
from ur_timetable.layout import detect_blocks

PDF = Path(__file__).parents[1] / "data/sources/dietetyka/I-st_ST_rok-1/Dietetyka 1 rok I st ST (02.10.2026).pdf"

pytestmark = pytest.mark.skipif(not PDF.exists(), reason="source PDF not present")


@pytest.fixture(scope="module")
def parsed():
    blocks, cells = [], []
    for prims in extract_pdf(PDF):
        index = PageIndex(prims)
        page_blocks = detect_blocks(prims, index)
        blocks += page_blocks
        cells += [c for b in page_blocks for c in detect_cells(b, index)]
    return blocks, cells


def by_date(blocks, date):
    [b] = [b for b in blocks if b.date_text == date]
    return b


def test_all_day_blocks_found(parsed):
    blocks, _ = parsed
    assert len(blocks) == 80  # 16 weeks x Mon-Fri, page 5 is the legend
    assert Counter(b.page for b in blocks) == {1: 20, 2: 20, 3: 20, 4: 20}
    assert all(len(b.rows) == 16 for b in blocks)
    assert all(b.rows[0].start == "08:00" and b.rows[-1].end == "20:00" for b in blocks)
    assert sorted({b.week_number for b in blocks}) == list(range(1, 17))


def test_columns_per_weekday(parsed):
    blocks, _ = parsed
    for b in blocks:
        expected = 5 if b.weekday in ("ŚRODA", "CZWARTEK") else 4
        assert b.n_columns == expected, (b.id, b.date_text)


def test_two_group_split_on_five_columns(parsed):
    blocks, _ = parsed
    b = by_date(blocks, "07.10.2026")
    [row5, row2] = b.header_rows
    assert [(s.group, s.col_start, s.col_end) for s in row5.spans] == [(i + 1, i, i) for i in range(5)]
    assert [(s.group, s.col_start, s.col_end) for s in row2.spans] == [(1, 0, 1), (2, 2, 4)]


def test_known_header_anomalies_are_warned(parsed):
    blocks, _ = parsed
    warned = {b.date_text: b.warnings for b in blocks if b.warnings}
    assert set(warned) == {"23.10.2026", "09.11.2026", "06.01.2027", "07.01.2027"}
    assert "1+C131:AA132" in warned["09.11.2026"][0]


def test_header_notes(parsed):
    blocks, _ = parsed
    assert by_date(blocks, "1.10.2026").header_notes == ["godziny rektorskie 8:00-14:00 -zajęcia odwołane"]
    assert by_date(blocks, "05.10.2026").header_notes == ["Spotkanie organizacyjne 16:15"]
    assert any(b.date_text == "22.12.2025" for b in blocks)  # typo kept as printed


def cells_on(blocks, cells, date):
    ids = {b.id for b in blocks if b.date_text == date}
    return [(c.time_start, c.time_end, c.col_start, c.col_end, c.text) for c in cells if c.block_id in ids]


def test_wednesday_lab_cells_with_underlined_rooms(parsed):
    blocks, cells = parsed
    got = cells_on(blocks, cells, "07.10.2026")
    assert ("08:00", "10:15", 1, 1, "Chemia / D3.137") in got
    assert ("10:15", "12:30", 4, 4, "Biochemia / D3.241") in got
    assert ("14:00", "17:45", 0, 4, "(14:15 do 17:45) Anatomia człowieka (w) / G4.-104") in got
    assert len(got) == 9


def test_monday_three_groups_use_columns_0_to_2(parsed):
    blocks, cells = parsed
    got = cells_on(blocks, cells, "12.10.2026")
    small = [(s, e, c0) for s, e, c0, c1, t in got if c0 == c1]
    assert sorted(c0 for _, _, c0 in small) == [0, 0, 1, 1, 2, 2]


def test_no_cell_flags_and_text_cells_count(parsed):
    _, cells = parsed
    assert [c.id for c in cells if c.flags] == []
    assert sum(1 for c in cells if c.lines) == 279


@pytest.fixture(scope="module")
def timetable():
    from ur_timetable.pipeline import parse_timetable

    return parse_timetable(PDF.parent)


def find(t, date_iso, start, title_prefix):
    found = [e for e in t.result.events if e.date == date_iso and e.start == start and e.title.startswith(title_prefix)]
    assert len(found) == 1, found
    return found[0]


def test_legend(timetable):
    parts = {s.name: s.partition for s in timetable.subjects}
    assert parts["Podstawy opieki nad chorym"] == 3  # GR 1 + GR 2
    assert parts["Chemia żywności"] == 5
    assert parts["Wychowanie fizyczne"] is None
    assert len(timetable.profiles) == 76


def test_events_overview(timetable):
    r = timetable.result
    assert len(r.events) == 274
    assert [(d.event.date, d.event.title) for d in r.dropped] == [
        ("2026-10-01", "Język niemiecki"),
        ("2026-10-01", "Język angielski"),
        ("2026-10-01", "Język angielski"),
    ]
    assert [e for e in r.events if e.errors] == []
    # 10.12 Anatomia in column 5 is resolved by the manual override in data/config/I-st_ST_rok-1.json
    [anatomy] = [e for e in r.events if e.date == "2026-12-10" and e.source["columns"] == [4, 4]]
    assert (anatomy.title, anatomy.partition, anatomy.group) == ("Anatomia człowieka", 4, 4)
    assert any("manual override" in w for w in anatomy.warnings)


def test_explicit_times_and_rules(timetable):
    wf = find(timetable, "2026-10-06", "08:30", "Wychowanie")
    assert (wf.end, wf.partition, wf.room) == ("10:15", None, "ul.Kasprowicza1")
    meeting = find(timetable, "2026-10-05", "16:15", "spotkanie")
    assert (meeting.kind, meeting.end) == ("other", "17:00")
    anatomy = find(timetable, "2026-10-05", "17:00", "Anatomia")
    assert (anatomy.kind, anatomy.end, anatomy.room) == ("lecture", "20:00", "G4.-101")
    typo_day = find(timetable, "2026-12-22", "08:30", "Wychowanie")
    assert any("22.12.2025" in w for w in typo_day.warnings)


def test_groups(timetable):
    chem = [e for e in timetable.result.events if e.date == "2026-10-07" and e.title == "Chemia żywności"]
    assert sorted((e.start, e.room, e.partition, e.group) for e in chem if e.kind == "class") == [
        ("08:00", "D3.136", 5, 5),
        ("08:00", "D3.137", 5, 2),
        ("10:15", "D3.136", 5, 3),
        ("10:15", "D3.137", 5, 4),
    ]
    micro = [e for e in timetable.result.events if e.date == "2026-10-12" and e.title.startswith("Mikrobiologia")]
    assert sorted((e.start, e.group) for e in micro) == [("09:30", 2), ("11:45", 1), ("14:00", 3)]
    genetics = [e for e in timetable.result.events if e.date == "2027-01-06" and e.kind == "class"]
    assert sorted(e.group for e in genetics) == [1, 2]  # usual Wednesday layout used
    assert all(any("usual layout" in w for w in e.warnings) for e in genetics)
    assert all(any("public holiday" in n for n in e.notes) for e in genetics)


def test_student_schedule(timetable):
    from ur_timetable.schedule import student_schedule

    # a student in group 1 of every split (album numbers stay out of the repo)
    groups = next(g for g in timetable.profiles.values() if set(g.values()) == {1})
    events = student_schedule(timetable.result.events, groups, {"Język niemiecki"}, set())
    assert len(events) == 117
    assert all(e.partition in (None, 1) or e.group == 1 for e in events)


def test_skipped_subject_is_parsed_but_not_published(timetable):
    from ur_timetable.publish import SourceInfo, published_timetable

    german = "Język niemiecki"
    assert german in timetable.config.skipped_subjects
    assert any(e.subject == german for e in timetable.result.events)  # still read from the PDF
    published = published_timetable(
        timetable, SourceInfo(url=None, updated=None, sha256="x"), "2026-10-21T00:00:00+00:00"
    )
    assert not any(e["title"] == german for e in published["events"])
    assert german not in [s["name"] for s in published["subjects"]]
    assert published["optional_subjects"] == []
