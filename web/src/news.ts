// "Co nowego": shown once after an update, to students who used the site before (not on a first visit).
// In the students' words, only what they'd notice: the main changes with an icon (clock, changes, week, share,
// palette, groups, calendar...: names in ICON in views.ts), the rest as a short list. Add an entry per version.

export interface News {
  date: string; // shown under "Nowa wersja", e.g. "23 listopada"
  highlights: { icon: string; title: string; text: string }[];
  more: string[];
}

/** "0.6.1" -> [0, 6, 1], for comparing versions. */
function parts(version: string): number[] {
  return version.split(".").map((n) => Number(n) || 0);
}

function newer(a: string, b: string): boolean {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

/**
 * The newest notes up to the current version that the student hasn't seen (seen: the version stored at their last
 * visit, null if none). A fix release without notes still shows the last feature release's notes to a student who
 * skipped it. `any`: ignore what was seen (for `?nowosci`).
 */
export function newsFor(current: string, seen: string | null, any = false): { version: string; news: News } | null {
  const version = Object.keys(NEWS)
    .filter((v) => !newer(v, current) && (any || seen === null || newer(v, seen)))
    .sort((a, b) => (newer(a, b) ? -1 : 1))[0];
  return version ? { version, news: NEWS[version] } : null;
}

export const NEWS: Record<string, News> = {
  "0.6.0": {
    date: "23 listopada",
    highlights: [
      { icon: "week", title: "Czytelniejszy tydzień", text: "Krótkie nazwy, sale i zajęcia, które właśnie trwają." },
      { icon: "clock", title: "Teraz i za chwilę", text: "Pod dzisiejszą datą: zajęcia, które trwają, albo najbliższe." },
      { icon: "changes", title: "Zmiany widać w planie", text: "Znaczek „Nowa sala” albo „Nowa godz.” przy zmienionych zajęciach." },
      { icon: "share", title: "Udostępnij znajomym", text: "Kod QR albo link: menu → Udostępnij stronę." },
    ],
    more: [
      "Spokojniejsze kolory zajęć.",
      "Własna godzina WF: w „Twoje grupy” albo po dotknięciu zajęć WF.",
      "Widok dnia zaczyna się tuż przed pierwszymi zajęciami.",
      "Gest „wstecz” wraca z ekranu grup, zamiast zamykać aplikację.",
    ],
  },
};
