# Changelog

Versions follow [Semantic Versioning](https://semver.org/) (see web/README.md, "Versions");
the format follows [Keep a Changelog](https://keepachangelog.com/). 0.x = demo: anything may still change.

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
