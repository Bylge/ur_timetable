# Plan zajęć UR · nieoficjalny — website

Static site, plain TypeScript built with Vite, no UI framework and no runtime dependencies.
It reads the published data (`../data/published`, copied into `public/data` by `npm run sync-data`).
Live at https://bylge.github.io/ur_timetable/ (deployed by `../.github/workflows/deploy.yml`).

| File | What |
|---|---|
| `index.html` | the page: theme tokens (light, dark, the student's choice) and the loading skeleton in an inline `<style>`; a script that applies the saved theme and starts the data downloads before the app's script arrives (`window.__early`) |
| `src/main.ts` | entry point; registers `public/sw.js` (only in the built site) |
| `src/types.ts` | shapes of the published JSON |
| `src/time.ts` | dates/times in Polish time (Europe/Warsaw), Polish formatting |
| `src/schedule.ts` | filtering by groups, which day opens, week anchoring, overlap layout |
| `src/labels.ts` | names, the status line, Polish plurals |
| `src/data.ts` | loading data (picks up the early downloads); the student's choice in `localStorage` and in the link (`?t=…&gr=2:1,3:2&opt=…`); marks, seen versions, theme |
| `src/changes.ts` | which updates the student hasn't seen; each change as an item, own groups first |
| `src/ics.ts` | `.ics` export in the browser (same UIDs as the Python export; manual marks as "ODWOŁANE: …") |
| `src/views.ts` | rendering (HTML strings; every value escaped): plan, sheets, menu, Zmiany / O projekcie / Prywatność; `CONTACT_EMAIL` |
| `src/app.ts` | state, one click handler (`data-action`), swipes, keys; history (the back gesture closes sheets and pages), the page lock behind sheets (`html.sheet-open`), theme, refresh when an installed app comes back |
| `src/version.ts` | `VERSION` from `package.json` (set by `vite.config.ts`) |
| `src/styles.css` | everything except the theme tokens and the skeleton (those are in `index.html`); phone first |
| `src/logic.test.ts`, `src/m3.test.ts` | Vitest: dates, filtering, layout, changes, `.ics`, plurals |
| `public/sw.js` | service worker: the page from the cache at once, refreshed in the background with its scripts (a new deploy shows on the next start); data network first, the cached copy offline or after 2.5 s; other files cache first (bump `SHELL` when an icon or the manifest changes) |
| `public/manifest.webmanifest`, `public/icons/` | install: name, short name ("Plan UR"), icons (`*.svg` → PNG with `scripts/icons.mjs`) |
| `scripts/sync-data.mjs` | copies `../data/published` into `public/data` (before `dev`, `build`, `screens`) |
| `vite.config.ts` | relative base, the version define, and a small plugin that inlines the CSS into `index.html` |
| `playwright.config.ts`, `e2e/screens.spec.ts` | Playwright on the local Chrome: phone (Redmi Note 14 in Chrome, 393×770) and desktop (1366×900), against a fresh build on :4173; review screenshots plus layout and behaviour checks. `e2e/fixtures/changes.json` is the real 02.10 → 13.10 diff |

Stored in the browser (`localStorage`, keys `planur:*`): the selection (`selection:v1`), view mode (`mode:v1`),
theme (`theme:v1`, a plain string because `index.html` reads it before the first paint), manual marks by event id
(`marks:v1`), last seen version per timetable (`seen:v1`, for the "Plan się zmienił" banner). The service worker
also keeps `shell-v3` (page, scripts, icons) and `data-v1` (the JSON). Pages have hashes (`#zmiany`, `#o-projekcie`,
`#prywatnosc`); sheets and pages push a history entry so the phone's back gesture closes them.

```
npm install              # Node 22.12+
npm run dev              # local server, http://localhost:5173
npm run dev:phone        # the same, reachable from a phone in the same Wi-Fi: http://<PC's IP>:5173 (not "localhost")
npm test                 # logic tests (Vitest)
npm run screens          # Playwright: screenshots -> ../docs/screenshots/m3/ and the layout/behaviour checks
npm run build            # -> dist/
npm run preview          # serve dist/ (after a build)
node scripts/icons.mjs   # re-render the PNG icons after editing public/icons/*.svg
```

Phone testing over Wi-Fi uses plain `http://`, which isn't a secure context, and the dev server doesn't register the
service worker anyway: offline and install don't work there, everything else does. To test them on an Android phone:
`npm run build && npx vite preview --port 4173`, phone in USB debugging mode, Chrome on the PC → `chrome://inspect` →
*Port forwarding* `4173` → `localhost:4173`, then open `http://localhost:4173` on the phone (localhost counts as secure).
Or test on the deployed HTTPS site.

`npm run screens` reuses a preview already running on :4173; stop it first if it serves an old build.

## Versions

The site's version is `version` in `package.json`, shown in the info sheet and on "O projekcie".
`pyproject.toml` (the parser and the update job, also in the User-Agent sent to ur.edu.pl) carries the same number:
one version for the project. It follows [Semantic Versioning](https://semver.org/) — `MAJOR.MINOR.PATCH`:

- `0.y.z` while it's a demo; `1.0.0` = the public launch. The "demo" label is written in `src/views.ts` (the pill,
  `versionText`, "O projekcie"): remove it there for 1.0.0.
- `MINOR` (0.4.0 → 0.5.0): new features or a visible change of behaviour (a milestone, a round of review changes).
- `PATCH` (0.4.0 → 0.4.1): fixes and wording only.
- Each release gets an entry in `../CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/) format) and,
  from 0.4.0 on, a git tag `vX.Y.Z`.

The timetable data has its own versions and isn't part of this number: the PDF's "aktualizacja" date and hash
("Plan z 13.10"), and `schema` in the published JSON for its format (bumped only on incompatible changes).
