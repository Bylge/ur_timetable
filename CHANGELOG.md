# Changelog

Versions follow [Semantic Versioning](https://semver.org/) (see web/README.md, "Versions");
the format follows [Keep a Changelog](https://keepachangelog.com/). 0.x = demo: anything may still change.

## [0.6.1] - 2026-11-27

### Changed
- Phone week view fits the screen without scrolling: the week bar and the day headers take less room, and if the
  week still sticks out a little, the hours get a bit shorter (not below 32 px per hour; beyond that it scrolls).

### Fixed
- "Co nowego" shows the newest notes the student hasn't seen, also when the current version (a fix) has none of its
  own: a student who skipped 0.6.0 still gets its notes once.

## [0.6.0] - 2026-11-23

### Added
- "Co nowego": after an update, a popup with what's new (the version big on top, the main changes with icons,
  the rest as a short list), once, only for students who used the site before (tap anywhere to close; `?nowosci`
  in the link shows it anyway).
- The class going on now has a red ring and the part that's over filled in (day and week view).
- Today, under the date: one line with the class going on now ("Teraz: … · do 11:00") or the next one today
  ("Za 25 min: …", "O 15:30: …"); tapping it opens the class.
- Classes added or changed in an update from the last 14 days are marked in the plan ("Nowe", "Nowa godz.",
  "Nowa sala"; a dot in the narrow week view), and their sheet says what changed, with a link to all changes.

### Changed
- The day view starts about an hour before the day's first class (not before the usual start), and a short day's
  timeline is extended with empty hours to the bottom of the screen, never further (no scrolling for nothing).
  The week view keeps one range for all days.
- Week grid on the phone: short subject names ("Biochemia", "WF", "KPP"), the room, and the start time when the
  block is tall enough, instead of the name broken into words; today's date in a pill.
- Softer colours: each class is a light tint of its subject colour with the colour itself as a stripe, and text in
  the theme's colour (the PDF's pure cyan and yellow were loud). Pale PDF colours are darkened first, so every
  subject gets a similar tint.
- Swiping to the next or previous day (or week) works anywhere in the plan, not only on the timeline.
- Week view: no "Zajęcia na dziś zakończone" strip (clutter).
- Phone top bar: "Plan UR · nieoficjalny" (the full name cut "nieoficjalny" short on iPhone).
- Today's now/next line: with a long title, the room and end time give way first.
- Groups in the bottom bar: "Gr. 1 · 3 · 2 · 4" instead of "1/2 · 3/3 · …", which read like "1 of 2". Spelled out
  ("1 z 2 · 3 z 3 · …") where there's room; the desktop sidebar names the splits.
- "Pokaż dzień" on the next-classes card points to the side (it opens the day; up looked like "fold").

### Fixed
- Back gesture on "Twoje grupy" and the plan picker: it closed the installed app (or, opened from the menu, did
  nothing the first time). It now goes back to the plan or the previous screen.
- Pill buttons (the links at the bottom of the menu, "Cofnij", the links in "Skąd jest ten plan?"): the text sat
  too high on Android. 0.5.0 lifted it with uneven padding measured on Windows, but every system font (Roboto on
  Android, Segoe UI on Windows, San Francisco on iPhone) places its letters differently in the line, so a fix for one
  font is off for another. The text is now centred on the letters themselves (CSS `text-box: trim-both cap
  alphabetic`), the same on every font; browsers without it get plain even padding.

## [0.5.0] - 2026-11-04

### Added
- Own hour for Wychowanie fizyczne: students sign up for a WF slot, so the start time can be set on "Twoje grupy"
  or by tapping a WF class. Every WF class moves there and keeps its length from the PDF (also in the `.ics`); saved on
  the device and in the link (`wf=1030`).
- "Udostępnij stronę": a QR code and the link, either the bare site or with the student's groups set ("Sama strona" /
  "Z moimi grupami"); "Wyślij link" (the phone's share menu), "Kopiuj link", QR code as PNG. The QR generator
  (`qrcode`, MIT) loads only when the sheet opens.
- iPhone/iPad: "Zainstaluj jako aplikację" in the menu (iOS has no install prompt, so it shows the
  "Do ekranu początkowego" steps; hidden once installed).

### Changed
- Phone menu: the most used items at the top (Zmiany, Udostępnij, Zmień plan lub grupy, install); calendar file,
  error report and theme as smaller rows; "Skąd jest ten plan?", "O projekcie" and "Prywatność" as links at the bottom.
- "O projekcie": the install section is now "Instalacja na telefonie", with clearer steps.
- "Prywatność": mentions the WF hour (stored on the device and in the link).
- "O projekcie": new section "Jak powstała ta strona" (the code was written with the help of AI; the plan itself is
  read by a fixed-rule program, not by AI).

### Fixed
- "Zgłoś błąd lub uwagę" in the menu was styled as an underlined link.

## [0.4.2] - 2026-10-22

### Fixed
- `ur-timetable parse` crashed (a local variable shadowed the report function).
- A failed or held timetable is downloaded and processed again on the next check even if its PDF didn't change
  (so a parser fix or `--approve` takes effect), and so is a timetable whose config was switched to `publish: true`.
- Titles of cells that matched no subject are PDF text: names are removed from them too; skipped subjects are
  also left out of `unresolved`.
- Coming back to the app: if the new plan couldn't be downloaded, the old one stays on screen (it was dropped).
- The red status says "the last check failed" unless there really is a new PDF that couldn't be published.
- Texts: the `.ics` re-import note (moved classes keep their old entry), what's stored where (the plan and groups
  are also in the address), the version line without a build date (it was the date of the last check).
- Service worker cache renamed so installed apps fetch the new icons.
- User-Agent carries the real version.

## [0.4.1] - 2026-10-21

### Added
- Contact address: "O projekcie", "Prywatność", the "Zgłoś błąd lub uwagę" menu item, and the update job's User-Agent.

### Fixed
- App icon: the drawing filled only ~40% of the icon in Android's round and squircle masks; now larger
  (still inside the safe zone).

## [0.4.0] - 2026-10-21

### Added
- Automatic updates three times a day on GitHub Actions and deployment to GitHub Pages; a failed
  publication opens an issue (and closes it when a later check passes).
- Polite fetching: PDFs are requested "if changed" (ETag / Last-Modified), so unchanged files aren't downloaded.
- "Zgłoś błąd lub uwagę" in the menu (an e-mail with the plan, groups and version), once a contact address is set.
- Theme switch (Auto / Jasny / Ciemny), remembered on the device and applied before the first paint.
- Confirmation before downloading the `.ics` file (what's in it, that it won't update itself).
- "Demo" label and version number (info sheet, "O projekcie").
- Skeleton while the plan loads instead of a blank screen or "Wczytywanie…".
- An installed app that comes back from the background checks for a new plan and follows the date.

### Changed
- German (an optional subject) is left out entirely for now (`skipped_subjects` in the timetable's config).
- Names are removed from text copied from the PDF into the published data (e.g. the year supervisor in the title).
- Stylesheet inlined into the page and data downloads started early: one request to the first paint.
- Service worker serves the app shell from the cache at once and refreshes it in the background.
- Day tabs slightly shorter; the day header stays on one line ("Pon., 26 października" when needed).
- Sheets animate out as well as in.

### Fixed
- White screen until the scripts arrived: theme colours and the skeleton are styled inside the page itself.
- Sideways scrolling and jitter while switching days (the slide animation widened the page).
- Bottom bar and top bar running off the screen with wider fonts.
- Free days' tabs sat lower than the others.
- The page behind an open sheet scrolled, so on a phone the sheet could "detach" from the bottom.

## [0.3.0] - 2026-10-19

### Added
- Manual "Odwołane" marks with a note, Zmiany page and "Plan się zmienił" banner, `.ics` download,
  menu, "O projekcie" and "Prywatność" pages, PWA (install, offline).

## [0.2.0] - 2026-10-14

### Added
- Phone-first website: timetable and group choice, day and week views, today card, status line.

## [0.1.0] - 2026-10-14

### Added
- Parser (PDF → events), validation, published JSON, update job.
