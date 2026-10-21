"""What changed between two published versions of a timetable.

Events are compared by stable id (a hash of date, start, end, title, kind, partition and group; see
interpret.stable_id). Same id with a different room or notes = changed in place. A removed and an added
event with the same title, kind, partition and group on the same day = moved (new time). Everything
else is added or removed: a class moved to another day shows as removed + added.
"""

from __future__ import annotations

COMPARED_FIELDS = ("room", "notes")


def diff_events(old: list[dict], new: list[dict]) -> dict:
    old_by_id = {e["id"]: e for e in old}
    new_by_id = {e["id"]: e for e in new}
    removed = [e for i, e in old_by_id.items() if i not in new_by_id]
    added = [e for i, e in new_by_id.items() if i not in old_by_id]

    changed = []
    for i in old_by_id.keys() & new_by_id.keys():
        fields = [f for f in COMPARED_FIELDS if old_by_id[i].get(f) != new_by_id[i].get(f)]
        if fields:
            changed.append({"before": old_by_id[i], "after": new_by_id[i], "fields": fields})

    def slot(e: dict) -> tuple:
        return (e["date"], e["title"], e["kind"], e["partition"], e["group"])

    for r in list(removed):
        candidates = [a for a in added if slot(a) == slot(r)]
        if len(candidates) == 1:
            a = candidates[0]
            removed.remove(r)
            added.remove(a)
            fields = [f for f in ("start", "end", *COMPARED_FIELDS) if r.get(f) != a.get(f)]
            changed.append({"before": r, "after": a, "fields": fields})

    def order(e: dict) -> tuple:
        return (e["date"], e["start"], e["id"])

    return {
        "added": sorted(added, key=order),
        "removed": sorted(removed, key=order),
        "changed": sorted(changed, key=lambda c: order(c["after"])),
    }


def change_count(d: dict) -> int:
    return len(d["added"]) + len(d["removed"]) + len(d["changed"])
