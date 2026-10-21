"""The update job: check the university pages, and publish new timetable versions that pass validation.

For each timetable on a programme page:
    ask for the PDF "if changed since the last check" (ETag / Last-Modified); not modified and no local copy ->
        only record the check (a failed, held or newly enabled timetable is always downloaded, see needs_pdf)
    same SHA-256 as the published version? -> only record the check
    new version -> parse -> validate -> publish (timetable.json + changes.json) or keep the old one

`index.json` records every check (also when nothing changed), so the site can show "sprawdzono …"
and the scheduled job always has something to commit.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from .changes import change_count, diff_events
from .config import load_config
from .fetch import SourceEntry, download, fetch_listing
from .pipeline import parse_pdf
from .publish import PUBLISHED_DIR, SourceInfo, published_timetable, read_json, write_json
from .validate import validate

DOWNLOADS_DIR = Path(__file__).parents[2] / "data" / "downloads"
MAX_CHANGE_HISTORY = 30


@dataclass
class UpdateResult:
    lines: list[str] = field(default_factory=list)
    published: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def process_entry(
    entry: SourceEntry,
    pdf: Path,
    digest: str,
    index: dict,
    published_dir: Path,
    approve: bool,
    now: str,
    result: UpdateResult,
    republish: bool = False,
) -> None:
    record = index["timetables"].setdefault(entry.id, {"id": entry.id})
    record.update({"label": entry.label, "url": entry.url, "updated": entry.updated, "checked_at": now})

    if record.get("published_sha256") == digest and not republish:
        record.update(status="ok", message=None, pending_sha256=None)
        result.lines.append(f"{entry.id}: unchanged")
        return

    t = parse_pdf(pdf, entry.id)
    folder = published_dir / entry.id
    previous = read_json(folder / "timetable.json", None)
    source = SourceInfo(url=entry.url, updated=entry.updated, sha256=digest, label=entry.label)
    new = published_timetable(t, source, published_at=now)
    report = validate(t, previous, new["events"])

    if not t.config.publish:
        record.update(status="not_enabled", pending_sha256=digest, message="not reviewed yet (publish: false)")
        result.lines.append(f"{entry.id}: parsed, not enabled for publishing\n{report.text()}")
        return

    if report.blocking or (report.needs_review and not approve):
        record.update(
            status="failed" if report.blocking else "needs_review",
            pending_sha256=digest,
            message=(report.blocking + report.needs_review)[0],
        )
        result.failed.append(entry.id)
        result.lines.append(f"{entry.id}: NOT published ({record['status']})\n{report.text()}")
        return

    changes = read_json(folder / "changes.json", [])
    d = diff_events(previous["events"], new["events"]) if previous else None
    if d is not None and change_count(d) == 0:
        summary = "republished, no changes to events"
    elif d is not None:
        changes.insert(
            0,
            {
                "published_at": now,
                "updated": entry.updated,
                "sha256": digest,
                "previous_sha256": previous["source"]["sha256"],
                **d,
            },
        )
        summary = f"{change_count(d)} changes"
    else:
        summary = "first version"
    write_json(folder / "timetable.json", new)
    write_json(folder / "changes.json", changes[:MAX_CHANGE_HISTORY])
    record.update(
        status="ok",
        message=None,
        pending_sha256=None,
        published_sha256=digest,
        published_at=now,
        events=len(new["events"]),
    )
    result.published.append(entry.id)
    result.lines.append(f"{entry.id}: published ({summary})\n{report.text()}")


def needs_pdf(timetable_id: str, record: dict, approve: bool, republish: bool) -> bool:
    """Download the PDF even if it didn't change: the last outcome can change without a new file.

    A failed or held version is retried (a parser fix or --approve can publish it), and a timetable whose
    config was switched to `publish: true` is processed for the first time. Otherwise "not modified" is enough.
    """
    status = record.get("status")
    if republish or approve or status in ("failed", "needs_review"):
        return True
    return status == "not_enabled" and load_config(timetable_id).publish


def run_update(
    programmes: list[str],
    only: set[str] | None = None,
    approve: bool = False,
    republish: bool = False,
    published_dir: Path = PUBLISHED_DIR,
    downloads_dir: Path = DOWNLOADS_DIR,
) -> UpdateResult:
    now = _now()
    index = read_json(published_dir / "index.json", {"schema": 1, "timetables": {}})
    result = UpdateResult()
    for programme in programmes:
        listing = fetch_listing(programme)
        index.setdefault("pages", {})[programme] = {
            "checked_at": now,
            "entries": len(listing.entries),
            "unmatched_links": listing.unmatched_links,
        }
        if listing.unmatched_links:
            result.lines.append(f"{programme}: page has links in an unexpected format: {listing.unmatched_links}")
        if not listing.entries:
            result.failed.append(programme)
            result.lines.append(f"{programme}: no timetables found on the page (format changed?)")
        for entry in listing.entries:
            if only and entry.id not in only:
                continue
            try:
                record = index["timetables"].setdefault(entry.id, {"id": entry.id})
                dl = download(
                    entry,
                    downloads_dir,
                    None if needs_pdf(entry.id, record, approve, republish) else record.get("download"),
                )
                record["download"] = dl.record(entry.url)
                if dl.path is None:
                    # not modified since the last check, and nothing local to parse: the last outcome still holds
                    record.update(label=entry.label, url=entry.url, updated=entry.updated, checked_at=now)
                    result.lines.append(f"{entry.id}: not modified ({record.get('status')})")
                    if record.get("status") in ("failed", "needs_review"):
                        result.failed.append(entry.id)
                    continue
                process_entry(entry, dl.path, dl.sha256, index, published_dir, approve, now, result, republish)
            except Exception as exc:  # one broken timetable must not stop the others
                record = index["timetables"].setdefault(entry.id, {"id": entry.id})
                record.update(checked_at=now, status="failed", message=f"{type(exc).__name__}: {exc}")
                result.failed.append(entry.id)
                result.lines.append(f"{entry.id}: ERROR {type(exc).__name__}: {exc}")
    index["checked_at"] = now
    write_json(published_dir / "index.json", index)
    return result
