// Loading published data and remembering the student's choice (only on their device).

import type { ChangeSet, IndexFile, Mark, Selection, Timetable } from "./types";

const STORAGE_KEY = "planur:selection:v1";
const MARKS_KEY = "planur:marks:v1";
const SEEN_KEY = "planur:seen:v1";
// Read by the script in index.html before the first paint, so it's a plain string, not JSON.
const THEME_KEY = "planur:theme:v1";

export type Theme = "auto" | "light" | "dark";

// index.html starts the downloads (index, the remembered timetable) before this script has even arrived;
// each early request is used once, later loads fetch again.
const early = (window as { __early?: Record<string, Promise<Response>> }).__early ?? {};

async function getJson<T>(path: string): Promise<T> {
  const started = early[path];
  delete early[path];
  const fresh = () => fetch(path, { cache: "no-cache" });
  const response = await (started ? started.catch(fresh) : fresh());
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

export function loadIndex(): Promise<IndexFile> {
  return getJson<IndexFile>("data/index.json");
}

export function loadTimetable(id: string): Promise<Timetable> {
  return getJson<Timetable>(`data/${id}/timetable.json`);
}

/** What changed between published versions, newest first. A missing file means no history yet. */
export async function loadChanges(id: string): Promise<ChangeSet[]> {
  try {
    return await getJson<ChangeSet[]>(`data/${id}/changes.json`);
  } catch {
    return [];
  }
}

/** Timetables a student can pick: published at least once. */
export function available(index: IndexFile) {
  return Object.values(index.timetables)
    .filter((t) => t.published_sha256 && t.status !== "not_enabled")
    .sort((a, b) => a.id.localeCompare(b.id));
}

// The choice can come from the link (?t=...&gr=2:1,3:2&opt=...) so it can be bookmarked or shared,
// otherwise from this browser's storage.

function fromUrl(): Selection | null {
  const p = new URLSearchParams(location.search);
  const timetable = p.get("t");
  if (!timetable) return null;
  const groups: Record<string, number> = {};
  for (const item of (p.get("gr") ?? "").split(",").filter(Boolean)) {
    const [split, group] = item.split(":").map(Number);
    if (split > 1 && group >= 1 && group <= split) groups[String(split)] = group;
  }
  const optional = (p.get("opt") ?? "").split("|").filter(Boolean);
  return { timetable, groups, optional };
}

function fromStorage(): Selection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Selection) : null;
  } catch {
    return null;
  }
}

export function loadSelection(): Selection | null {
  return fromUrl() ?? fromStorage();
}

export function saveSelection(sel: Selection): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sel));
  } catch {
    // private mode or storage disabled: the link still carries the choice
  }
  const p = new URLSearchParams(location.search);
  p.set("t", sel.timetable);
  const gr = Object.entries(sel.groups)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([split, group]) => `${split}:${group}`)
    .join(",");
  if (gr) p.set("gr", gr);
  else p.delete("gr");
  if (sel.optional.length) p.set("opt", sel.optional.join("|"));
  else p.delete("opt");
  history.replaceState(history.state, "", `?${p.toString()}${location.hash}`);
}

export function clearSelection(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  history.replaceState(null, "", location.pathname);
}

// Small JSON records in this browser's storage. Reads never throw: private mode or blocked storage
// just means nothing is remembered.

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** Manual marks by stable event id. */
export function loadMarks(): Record<string, Mark> {
  return readStored<Record<string, Mark>>(MARKS_KEY, {});
}

export function saveMark(marks: Record<string, Mark>, id: string, mark: Mark): void {
  if (mark.cancelled || mark.note.trim()) marks[id] = { cancelled: mark.cancelled, note: mark.note.trim() };
  else delete marks[id];
  writeStored(MARKS_KEY, marks);
}

/** The version (PDF hash) of each timetable the student has last seen, to tell them what changed since. */
export function loadSeen(): Record<string, string> {
  return readStored<Record<string, string>>(SEEN_KEY, {});
}

export function saveSeen(seen: Record<string, string>): void {
  writeStored(SEEN_KEY, seen);
}

export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
}

export function saveTheme(theme: Theme): void {
  try {
    if (theme === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

/** Everything this site keeps in the browser (selection, view, marks, seen versions). */
export function clearAllStored(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("planur:")) localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
