"""Read a programme's timetable page on ur.edu.pl and download the linked PDFs.

The page lists one entry per timetable:

    1 rok Dietetyka | studia 1-go stopnia stacjonarne | [link: Rozkład zajęć] | aktualizacja (13.10.2026)

An update replaces the PDF under a new filename (the old URL then returns 404) and the date in the
filename isn't the update date, so versions are identified by the file's SHA-256, never by name.
If the page has a PDF link that doesn't fit the expected pattern, that's reported: the page format
may have changed and the result must not be trusted silently.
"""

from __future__ import annotations

import hashlib
import html
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

# Identifies the job to the university's server, with the project's contact address.
CONTACT_EMAIL = "plan.zajec.nieoficialny@gmail.com"
USER_AGENT = "ur-timetable/0.4 (unofficial student timetable; https://bylge.github.io/ur_timetable/" + (
    f"; {CONTACT_EMAIL})" if CONTACT_EMAIL else ")"
)
TIMEOUT = 60

PROGRAMME_PAGES = {
    "dietetyka": "https://www.ur.edu.pl/pl/collegium-medicum/wydzial-nauk-o-zdrowiu-i-psychologii/student/"
    "kierunki-studiow-programy-rozklady-sylabusy/dietetyka/rozklady-zajec",
}

_ENTRY_RE = re.compile(
    r"(?P<year>\d)\s*rok\s+(?P<name>[^|]+?)\s*\|\s*studia\s+(?P<cycle>\d)-go\s+stopnia\s+(?P<mode>niestacjonarne|stacjonarne)"
    r"\s*\|\s*\[LINK (?P<href>[^\]]+)\]\s*(?:\|\s*)?Rozkład\s*(?:\|\s*)?zajęć"
    r"\s*\|\s*aktualizacja\s*\((?P<updated>[\d.]+)\)",
    re.IGNORECASE,
)


@dataclass
class SourceEntry:
    id: str  # e.g. "dietetyka/I-st_ST_rok-1", same as the local folder data/sources/dietetyka/I-st_ST_rok-1
    programme: str
    cycle: int  # 1 = studia I stopnia, 2 = II stopnia
    mode: str  # "ST" (stacjonarne) or "NST" (niestacjonarne)
    year: int
    url: str
    updated: str | None  # ISO date from "aktualizacja (DD.MM.YYYY)"
    label: str  # e.g. "Dietetyka, studia I stopnia stacjonarne, rok 1"


@dataclass
class PageListing:
    entries: list[SourceEntry] = field(default_factory=list)
    unmatched_links: list[str] = field(default_factory=list)  # PDF links that didn't fit the pattern


def _segments(page_html: str) -> str:
    """Page text as ' | '-separated segments, with links marked as [LINK href]."""
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", page_html, flags=re.S | re.I)
    text = re.sub(r'<a\s[^>]*href="([^"]+)"[^>]*>', lambda m: f" [LINK {html.unescape(m[1])}] ", text, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " | ", text))
    text = text.replace("\xa0", " ")
    return re.sub(r"(\s*\|\s*)+", " | ", text)


def _iso(dmy: str) -> str | None:
    try:
        d, m, y = (int(x) for x in dmy.strip(".").split("."))
        return date(y, m, d).isoformat()
    except ValueError:
        return None


def parse_listing(page_html: str, page_url: str, programme: str) -> PageListing:
    text = _segments(page_html)
    listing = PageListing()
    matched_hrefs = set()
    for m in _ENTRY_RE.finditer(text):
        cycle, year = int(m["cycle"]), int(m["year"])
        mode = "NST" if m["mode"].lower().startswith("nie") else "ST"
        roman = "I" * cycle
        href = m["href"].strip()
        matched_hrefs.add(href)
        listing.entries.append(
            SourceEntry(
                id=f"{programme}/{roman}-st_{mode}_rok-{year}",
                programme=programme,
                cycle=cycle,
                mode=mode,
                year=year,
                url=urllib.parse.urljoin(page_url, href),
                updated=_iso(m["updated"]),
                label=f"{m['name'].strip()}, studia {roman} stopnia {m['mode'].lower()}, rok {year}",
            )
        )
    for href in re.findall(r"\[LINK ([^\]]+\.pdf)\]", text, flags=re.I):
        if href.strip() not in matched_hrefs and "rozk" in urllib.parse.unquote(href).lower():
            listing.unmatched_links.append(href)
    return listing


def http_get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return response.read()


def fetch_listing(programme: str) -> PageListing:
    url = PROGRAMME_PAGES[programme]
    return parse_listing(http_get(url).decode("utf-8", errors="replace"), url, programme)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@dataclass
class Download:
    path: Path | None  # None: the server said "not modified" and there's no local copy (nothing to parse)
    sha256: str
    etag: str | None = None
    last_modified: str | None = None
    not_modified: bool = False

    def record(self, url: str) -> dict:
        """What the next check needs to ask "changed since?" (stored in index.json)."""
        return {"url": url, "sha256": self.sha256, "etag": self.etag, "last_modified": self.last_modified}


def download(entry: SourceEntry, dest_root: Path, known: dict | None = None) -> Download:
    """Save the PDF as <dest_root>/<id>/<sha256[:16]>.pdf (content-addressed).

    `known` is the previous download of this timetable (`Download.record`). For the same URL the request
    is conditional (If-None-Match / If-Modified-Since): an unchanged file isn't sent again (HTTP 304).
    """
    headers = {"User-Agent": USER_AGENT}
    same = bool(known and known.get("url") == entry.url and known.get("sha256"))
    if same and known.get("etag"):
        headers["If-None-Match"] = known["etag"]
    if same and known.get("last_modified"):
        headers["If-Modified-Since"] = known["last_modified"]
    try:
        request = urllib.request.Request(entry.url, headers=headers)
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            data = response.read()
            etag, last_modified = response.headers.get("ETag"), response.headers.get("Last-Modified")
    except urllib.error.HTTPError as exc:
        if exc.code != 304 or not same:
            raise
        digest = known["sha256"]
        local = dest_root / entry.id / f"{digest[:16]}.pdf"
        return Download(local if local.exists() else None, digest, known.get("etag"), known.get("last_modified"), True)
    if not data.startswith(b"%PDF"):
        raise ValueError(f"{entry.url} did not return a PDF")
    digest = sha256(data)
    path = dest_root / entry.id / f"{digest[:16]}.pdf"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(data)
    return Download(path, digest, etag, last_modified)
