// Shapes of the published data (see src/ur_timetable/publish.py and update.py in the parser).

export type Status = "ok" | "failed" | "needs_review" | "not_enabled";

export interface IndexEntry {
  id: string;
  label: string;
  url: string;
  updated: string | null; // "aktualizacja" date from the university page, ISO
  checked_at: string; // ISO datetime (UTC) of the last check
  status: Status;
  message?: string | null;
  published_at?: string;
  published_sha256?: string;
  pending_sha256?: string | null;
  events?: number;
}

export interface IndexFile {
  schema: number;
  checked_at: string;
  timetables: Record<string, IndexEntry>;
}

export type Kind = "lecture" | "class" | "other";

export interface ClassEvent {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string;
  title: string;
  kind: Kind;
  room: string | null;
  partition: number | null; // null = everyone
  group: number | null;
  color: string;
  notes: string[];
}

export interface DayNote {
  date: string;
  kind: "holiday" | "cancellation" | "info";
  text: string;
}

export interface Unresolved {
  date: string;
  start: string;
  end: string;
  text: string;
}

export interface Timetable {
  schema: number;
  id: string;
  label: string | null;
  title: string | null;
  source: { url: string | null; updated: string | null; sha256: string; label: string | null; published_at: string };
  splits: number[];
  optional_subjects: string[];
  subjects: { name: string; partition: number | null }[];
  day_notes: DayNote[];
  events: ClassEvent[];
  unresolved: Unresolved[];
}

/** What the student chose; stored only on their device. */
export interface Selection {
  timetable: string;
  groups: Record<string, number>; // split ("2", "3", ...) -> group number
  optional: string[]; // optional subjects the student takes
}

/** One published update: events added, removed and changed (see src/ur_timetable/changes.py). */
export interface ChangeSet {
  published_at: string;
  updated: string | null;
  sha256: string;
  previous_sha256: string;
  added: ClassEvent[];
  removed: ClassEvent[];
  changed: { before: ClassEvent; after: ClassEvent; fields: string[] }[];
}

/** The student's own mark on a class ("Odwołane" + a note); stored only on their device. */
export interface Mark {
  cancelled: boolean;
  note: string;
}
