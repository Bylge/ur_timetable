# Plan zajęć UR · nieoficjalny — website

Static site, plain TypeScript built with Vite, no UI framework and no runtime dependencies.
It reads the published data (`../data/published`, copied into `public/data` by `npm run sync-data`).

| File | What |
|---|---|
| `src/types.ts` | shapes of the published JSON |
| `src/time.ts` | dates/times in Polish time (Europe/Warsaw), Polish formatting |
| `src/schedule.ts` | filtering by groups, which day opens, week anchoring, overlap layout |
| `src/labels.ts` | names and the status line |
| `src/data.ts` | loading data; the student's choice in `localStorage` and in the link (`?t=…&gr=2:1,3:2&opt=…`) |
| `src/changes.ts` | which updates the student hasn't seen; each change as an item, own groups first |
| `src/ics.ts` | `.ics` export in the browser (same UIDs as the Python export; manual marks as "ODWOŁANE: …") |
| `src/views.ts` | rendering (HTML strings; every value escaped): plan, sheets, menu, Zmiany / O projekcie / Prywatność |
| `src/app.ts` | state, one click handler (`data-action`), swipes, keys |
| `src/styles.css` | tokens, light/dark, phone first |
| `public/sw.js`, `public/manifest.webmanifest`, `public/icons/` | PWA: offline (network first for pages and data, cache first for hashed assets), install |
| `e2e/screens.spec.ts` | Playwright: scenarios with a fixed clock, screenshots for review; `e2e/fixtures/changes.json` is the real 02.10 → 13.10 diff |

Stored in the browser (`localStorage`, keys `planur:*`): selection, view mode, manual marks by event id,
last seen version per timetable (for the "Plan się zmienił" banner). Pages have hashes (`#zmiany`, `#o-projekcie`,
`#prywatnosc`); sheets and pages push a history entry so the phone's back gesture closes them.

```
npm install
npm run dev        # local server
npm run dev:phone  # the same, reachable from a phone in the same Wi-Fi: http://<PC's IP>:5173 (not "localhost")
npm test           # logic tests
npm run screens    # screenshots -> ../docs/screenshots/m3/
node scripts/icons.mjs   # re-render PNG icons after editing public/icons/*.svg
npm run build      # -> dist/
```

Phone testing over Wi-Fi uses plain `http://`, which isn't a secure context: the service worker (offline, install)
doesn't run there. Everything else does. On Android, USB port forwarding makes it a secure context: phone in USB
debugging mode, Chrome on the PC → `chrome://inspect` → *Port forwarding* `5173` → `localhost:5173`, then open
`http://localhost:5173` on the phone. Otherwise test offline and install on the deployed HTTPS site.

The Playwright `phone` project imitates a Xiaomi Redmi Note 14 in Chrome (393×770 CSS px with the address bar).

## Versions

The site's version is `version` in `package.json`, shown in the info sheet and on "O projekcie" (with the build date).
`pyproject.toml` (the parser and the update job) carries the same number: one version for the project.
It follows [Semantic Versioning](https://semver.org/) — `MAJOR.MINOR.PATCH`:

- `0.y.z` while it's a demo (a "demo" label is shown); `1.0.0` = public launch, after the launch checklist.
- `MINOR` (0.4.0 → 0.5.0): new features or a visible change of behaviour (a milestone, a round of review changes).
- `PATCH` (0.4.0 → 0.4.1): fixes and wording only.
- Each release gets an entry in `../CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/) format) and a git tag `vX.Y.Z`.

The timetable data has its own versions and isn't part of this number: the PDF's "aktualizacja" date and hash
("Plan z 13.10"), and `schema` in the published JSON for its format (bumped only on incompatible changes).

