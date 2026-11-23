// "Co nowego": shown once after an update, to students who used the site before (not on a first visit).
// In the students' words, only what they'd notice: the main changes with an icon (clock, changes, week, share,
// palette, groups, calendar...: names in ICON in views.ts), the rest as a short list. Add an entry per version.

export interface News {
  date: string; // shown under "Nowa wersja", e.g. "23 listopada"
  highlights: { icon: string; title: string; text: string }[];
  more: string[];
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
