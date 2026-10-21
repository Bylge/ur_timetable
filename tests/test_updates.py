"""Page listing, stable ids, version diffs, name removal, the update job without a PDF (no network)."""

from ur_timetable.changes import change_count, diff_events
from ur_timetable.fetch import parse_listing
from ur_timetable.interpret import Event, assign_stable_ids
from ur_timetable.publish import without_names

PAGE = """
<div class="content-text">
<p><strong>DIETETYKA STUDIA STACJONARNE I&nbsp;STOPNIA</strong></p>
<p>1 rok Dietetyka</p><p>studia 1-go stopnia stacjonarne</p>
<p><a href="/files/x/Dietetyka%201%20rok%20I%20st%20ST%20%2813.10.2026%29.pdf">Rozkład zajęć</a></p>
<p>aktualizacja (13.10.2026)</p><p>Podział na grupy zgodnie z WU</p>
<p>2 rok Dietetyka</p><p>studia 2-go stopnia niestacjonarne</p>
<p><a href="/files/x/Dietetyka%202%20rok%20II%20st%20NST%2009.10.2026%29.pdf">Rozkład</a> <span>zajęć</span></p>
<p>aktualizacja (09.10.2026)</p>
<p><a href="/files/x/Rozklad%20inny.pdf">Rozkład dodatkowy</a></p>
</div>
"""


def test_parse_listing():
    listing = parse_listing(PAGE, "https://www.ur.edu.pl/pl/a/b", "dietetyka")
    assert [(e.id, e.updated) for e in listing.entries] == [
        ("dietetyka/I-st_ST_rok-1", "2026-10-13"),
        ("dietetyka/II-st_NST_rok-2", "2026-10-09"),
    ]
    assert (
        listing.entries[0].url
        == "https://www.ur.edu.pl/files/x/Dietetyka%201%20rok%20I%20st%20ST%20%2813.10.2026%29.pdf"
    )
    assert listing.entries[1].label == "Dietetyka, studia II stopnia niestacjonarne, rok 2"
    assert listing.unmatched_links == ["/files/x/Rozklad%20inny.pdf"]  # unexpected format is reported


def ev(id_, date="2026-11-19", start="08:45", end="10:15", title="Język angielski", group=1, room="A2.208"):
    return Event(id_, date, start, end, title, title, "class", None, room, 2, group, None, "#ffff00")


def test_stable_ids():
    a, b = ev("p1-b00-c00-e0"), ev("p9-b99-c99-e0")  # same class, different cell positions
    assign_stable_ids([a])
    assign_stable_ids([b])
    assert a.id == b.id and len(a.id) == 12
    moved = ev("x", start="10:15", end="11:45")
    assign_stable_ids([moved])
    assert moved.id != a.id
    dup1, dup2 = ev("c1"), ev("c2")  # exact duplicates stay distinct
    assign_stable_ids([dup1, dup2])
    assert dup1.id != dup2.id


def pub(**kw):
    base = {
        "id": "a",
        "date": "2026-11-19",
        "start": "08:45",
        "end": "10:15",
        "title": "Język angielski",
        "kind": "class",
        "room": "A2.208",
        "partition": 2,
        "group": 1,
        "color": "#ffff00",
        "notes": [],
    }
    return {**base, **kw}


def test_diff_events():
    old = [
        pub(id="same"),
        pub(id="room", date="2026-10-19", room="G4.-101"),
        pub(id="moved1"),
        pub(id="gone", date="2026-11-05"),
    ]
    new = [
        pub(id="same"),
        pub(id="room", date="2026-10-19", room="G4.-104"),  # same slot, new room
        pub(id="moved2", start="10:15", end="11:45"),  # same day, subject, group: moved
        pub(id="new", date="2026-11-25", title="Fizjologia człowieka", group=None, partition=None),
    ]
    d = diff_events(old, new)
    assert [c["fields"] for c in d["changed"]] in ([["room"], ["start", "end"]], [["start", "end"], ["room"]])
    assert [e["id"] for e in d["added"]] == ["new"]
    assert [e["id"] for e in d["removed"]] == ["gone"]
    assert change_count(d) == 4


def test_without_names():
    title = "ROZKŁAD ZAJĘĆ - DIETETYKA - ROK 1 - 2026/2027, opiekun: mgr Jan Kowalski"
    assert without_names(title) == "ROZKŁAD ZAJĘĆ - DIETETYKA - ROK 1 - 2026/2027"
    assert without_names("Seminarium dyplomowe dr Jan Kowalski MS Teams") == "Seminarium dyplomowe MS Teams"
    assert without_names("Wykład dr hab. Anna Nowak, prof. UR D3.137") == "Wykład D3.137"
    assert without_names("Spotkanie organizacyjne 16:15") == "Spotkanie organizacyjne 16:15"
    assert without_names("Drugi termin") == "Drugi termin"
    assert without_names(None) is None


def test_not_modified_pdf_only_records_the_check(tmp_path, monkeypatch):
    from ur_timetable import update
    from ur_timetable.fetch import Download, PageListing, SourceEntry

    entry = SourceEntry(
        "dietetyka/I-st_ST_rok-1", "dietetyka", 1, "ST", 1, "https://x/a.pdf", "2026-10-13", "Dietetyka, rok 1"
    )
    known = {"url": entry.url, "sha256": "abc", "etag": '"e1"', "last_modified": None}
    index = {
        "schema": 1,
        "timetables": {
            entry.id: {"id": entry.id, "status": "ok", "published_sha256": "abc", "download": known},
            "dietetyka/I-st_ST_rok-2": {"id": "dietetyka/I-st_ST_rok-2", "status": "failed", "download": known},
        },
    }
    (tmp_path / "index.json").write_text(__import__("json").dumps(index), encoding="utf-8")
    entry2 = SourceEntry("dietetyka/I-st_ST_rok-2", "dietetyka", 1, "ST", 2, "https://x/a.pdf", None, "rok 2")
    monkeypatch.setattr(update, "fetch_listing", lambda programme: PageListing([entry, entry2]))
    asked = []

    def fake_download(e, dest, known_):
        asked.append(known_)
        return Download(None, "abc", '"e1"', None, not_modified=True)

    monkeypatch.setattr(update, "download", fake_download)
    result = update.run_update(["dietetyka"], published_dir=tmp_path, downloads_dir=tmp_path / "dl")
    saved = __import__("json").loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    assert asked[0] == known  # the previous download is passed on, so the request is conditional
    assert asked[1] is None  # a failed timetable is downloaded again (a parser fix or --approve may publish it)
    assert saved["timetables"][entry.id]["status"] == "ok"
    assert saved["timetables"][entry.id]["checked_at"] == saved["checked_at"]
    assert result.published == [] and result.failed == ["dietetyka/I-st_ST_rok-2"]  # a known problem is still reported


def test_unmatched_title_loses_names():
    from ur_timetable.publish import public_event

    raw = "Seminarium dyplomowe dr Jan Kowalski MS Teams"
    unmatched = Event("x", "2026-10-01", "08:00", "09:30", raw, None, "class", None, None, None, None, None, "#ffffff")
    assert public_event(unmatched)["title"] == "Seminarium dyplomowe MS Teams"
    matched = Event(
        "y", "2026-10-01", "08:00", "09:30", "Chemia", "Chemia", "class", None, None, None, None, None, "#ffffff"
    )
    assert public_event(matched)["title"] == "Chemia"


def test_needs_pdf():
    from ur_timetable.update import needs_pdf

    assert not needs_pdf("x/y", {"status": "ok"}, approve=False, republish=False)
    assert needs_pdf("x/y", {"status": "ok"}, approve=True, republish=False)
    assert needs_pdf("x/y", {"status": "needs_review"}, approve=False, republish=False)
    assert not needs_pdf("dietetyka/none", {"status": "not_enabled"}, approve=False, republish=False)  # no config
    assert needs_pdf(
        "dietetyka/I-st_ST_rok-1", {"status": "not_enabled"}, approve=False, republish=False
    )  # publish: true
