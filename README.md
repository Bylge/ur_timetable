# ur_timetable

Turns University of Rzeszów (UR) timetable PDFs into structured data, so a student can pick their
groups and see only their own classes, or export them to a calendar.

> **Unofficial project.** Not affiliated with or endorsed by the University of Rzeszów. The data
> is parsed automatically from timetables published on the university website; the official PDF
> is always the authoritative source.

## Status

Demo (version 0.x, see [CHANGELOG.md](CHANGELOG.md)). The parser handles the Dietetyka timetables
for 2026/2027; the website shows the ones that have been reviewed, so far Dietetyka, I stopień,
stacjonarne, rok 1. Website: **Plan zajęć UR · nieoficjalny**, https://bylge.github.io/ur_timetable/

## How it works

```
UR timetable PDF
  -> page geometry (text positions, cell borders, fill colours)
  -> day blocks, group columns, cells
  -> events: subject, type, room, time, which groups attend
  -> validation (structure, hours vs the PDF's subject table, large changes)
  -> published JSON (no lecturer names) -> static website
  -> a student's schedule = events filtered by their chosen groups, in their browser
```

Every correction the parser makes comes from an explicit rule and is logged on the event;
anything it can't decide is held back instead of guessed. Details: [docs/source-analysis.md](docs/source-analysis.md).

Updates run on GitHub Actions three times a day ([.github/workflows/update.yml](.github/workflows/update.yml)):
the job reads the programme page, downloads only PDFs that changed (conditional requests), parses and
validates them, commits `data/published/` and deploys the site
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). A version that fails validation isn't
published: the site keeps the last good one, shows a red status, and an issue is opened.

## Repository

| Path | What |
|---|---|
| `src/ur_timetable/` | the parser and the update job (Python; module docstrings describe each stage) |
| `tests/` | parser tests (PDF-based ones are skipped when the source PDF isn't present) |
| `data/config/` | per-timetable settings: publish switch, optional and skipped subjects, manual overrides |
| `data/published/` | what the website reads (`index.json`, `<id>/timetable.json`, `<id>/changes.json`) |
| `web/` | the website: plain TypeScript + Vite, no framework ([web/README.md](web/README.md)) |
| `docs/source-analysis.md` | the PDF layout model and the parsing rules |

## Usage

Requires Python 3.12+. Source PDFs aren't included in the repository; download them from the
university website into `data/sources/<programme>/<folder>/`.

```
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m ur_timetable parse data/sources/dietetyka/I-st_ST_rok-1
.venv/Scripts/python -m ur_timetable demo  data/sources/dietetyka/I-st_ST_rok-1   # local HTML calendar
.venv/Scripts/python -m ur_timetable update        # check ur.edu.pl, publish to data/published/
.venv/Scripts/python -m pytest -q
```

Website: see [web/README.md](web/README.md) (`npm install`, `npm run dev`, `npm test`, `npm run build`).

## Licence

MIT, see [LICENSE](LICENSE).
