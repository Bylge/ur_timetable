# Source document analysis

Observations from the Dietetyka timetables published for 2026/2027 (downloaded 2026-10-05).
Everything here was checked against the rendered PDFs and their extracted geometry. Items
marked **OPEN** are not confirmed and must not be hard-coded.

## Corpus

| Folder (`data/sources/dietetyka/`) | Timetable PDF | Groups DOCX | Days | Pages | Legend page |
|---|---|---|---|---|---|
| `I-st_ST_rok-1` (**priority**) | 02.10.2026 | yes, 76 students, partitions 2/3/4/5 | Mon–Fri | 5, landscape | p5 |
| `I-st_ST_rok-2` | 05.10.2026 | – | Mon–Fri | 5, landscape | p5 |
| `I-st_ST_rok-3` | 29.09.2026 | – | Mon–Fri | 4, portrait | p4 |
| `I-st_NST_rok-1` | 02.10.2026 | yes, 77 students, partitions 2/3/4/5 | Sat–Sun | 4, portrait | not verified |
| `I-st_NST_rok-2` | 01.10.2026 | – | Fri–Sun | 4, portrait | p4 |
| `I-st_NST_rok-3` | 29.09.2026 | – | Fri–Sun | 4, portrait | p4 |
| `II-st_ST_rok-1` | "05.10.2029" (filename typo) | yes, 32 students, partitions 2/3/ZP | Mon–Fri | 6, landscape | p6 |
| `II-st_ST_rok-2` | 01.10.2026 | – | Mon–Fri | 6, landscape | p6 |
| `II-st_NST_rok-1` | 02.10.2026 | yes, 36 students, partitions 2/3/ZP | Fri–Sun | 3, portrait | not verified |
| `II-st_NST_rok-2` | 05.10.2026 | – | Fri–Sun | 6 (p5–p6 blank) | p4 |

Source files aren't committed (they're public on the UR website; decided 2026-10-09).

Source URL pattern:
`https://www.ur.edu.pl/files/user_directory/300/Dietetyka/Rozkłady zajęć/Studia I stopnia/<file>.pdf`.
The filename contains a date, and a new version is a new URL (confirmed: the old URL then returns 404). The date in the filename isn't the update date, so versions are identified by the file's SHA-256, never by the name.

## PDF properties

- Vector PDFs exported from Excel (the artifact `1+C131:AA132` is an Excel range). No OCR needed.
- No line objects at all. Every border and fill is a rectangle, and text has exact positions.
- Fills carry RGB colours.

## Layout model

```
page
 └─ week band (3–6 per page)
     └─ day block (one per weekday)
         ├─ label column: "TYDZIEŃ n", "GRUPA", 16 time-slot labels
         ├─ header: weekday, date, optional red note (e.g. "godziny rektorskie 8:00-14:00")
         ├─ group header rows (1–3), each row = one partition
         └─ grid: 16 rows (8:00–20:00, 45 min) × N atomic columns
```

**Atomic columns plus partition rows.** Each day block has N narrow "atomic" columns. Every
group-header row is a partition, and each group number in that row covers a span of atomic
columns. An event cell's column span is matched against these spans.

| Timetable | Atomic cols | Header rows (partition: spans) |
|---|---|---|
| I st ST r1, Mon/Tue/Fri | 4 | 4: 1/2/3/4 · 2: 1-2 / 3-4 |
| I st ST r1, Wed/Thu | 5 (Thu of week 14: 4) | 5: 1/…/5 · 2: 1-2 / 3-5 |
| I st NST r1 | 5 | 5: 1/…/5 · 2: 1-2 / 3-5 |
| I st ST r2, I st ST r3, I st NST r3, II st ST r1, II st NST r1/r2 | 4 | 3: 1 / 2-3 / 4 · 2: 1-2 / 3-4 |
| II st ST r2 | 4 | 4: 1/2/3/4 · 3: 1 / 2-3 / 4 · 2: 1-2 / 3-4 |
| I st NST r2 | 2 | 2: 1 / 2 |

Consequences:
- The column count changes per day and occasionally per week. Detect it per day block, never from a template.
- A cell spanning all atomic columns means everyone (the group number is irrelevant).

### Which partition does a cell belong to?

Signals, in priority order:
1. **Subject → group count** from the legend page (columns `GR` / `GR ĆW` / `GR/ĆW`). A subject can have several legend rows, one per lecturer.
2. **Column span** matched against the header rows.
3. **Consistency check:** a subject must always land in valid columns for its partition.

**I st ST r1 has no 3-group header row.** The 3-group subjects (Mikrobiologia, Fizjologia ćw,
Podstawy opieki) use atomic columns 1–3, and column 4 stays empty. Confirmed as the working
rule. Podstawy opieki: the legend says GR 1 + GR 2 (two lecturers), 3 groups in total.

**4-group subjects** (Anatomia ćw, KPP) rotate one column per week. The working assumption is
column N = group N.

**SKIPPED (maintainer has no information) — 3-group placement when a 3-group header row exists.** In
II st ST r2, "Żyw. a mikrob." (legend GR 3) sits in atomic columns 1, 2 and 3. The 3-group header
maps column 3 to group 2, but the sequence suggests group 3. In II st NST r2, "Mikrobiota" follows
the header (1 / 2-3 / 4). Year 1 isn't affected. The parser must flag these cells and not guess.

**The legend's GR column isn't always filled in.** In I st ST r2, Język angielski has an empty GR,
but the grid shows it split into 2 groups (atomic 1 and 3, sometimes 1-2 and 3-4). An empty GR
can't be read as "everyone".

**Not resolved — I st ST r2, Żywienie kliniczne (GR 3, three lecturers):** on 21.10 there are
four narrow cells in atomic columns 1 and 2, in two colours (two lecturers). How they map to
3 groups is unclear. Not year 1.

### Colours

- The legend colour belongs to a (subject, lecturer) pair, not to a subject. The same lecturer can have different colours for different subjects.
- **Grey means several things:** day off / no classes, "ZAJĘCIA PRAKTYCZNE" blocks, holidays, and also some lecturer colours (KPP in I st NST r1, Przechowalnictwo, Podstawy przedsiębiorczości). Grey must never be read as "empty".
- Colour is used to cross-check the text and to resolve truncated names, never as the only source.

## Cell text

- Type markers: `(w)`/`(W)` lecture, `(ćw)` class, `(k)`/`(K)` konwersatorium, `(L)` laboratory. Often there's no marker at all.
- Names are often truncated: `Podstawy..`, `Zasady i organizacja…`, `Żyw. a mikrob. jel. czł.`. There is no alias table: `match_subject` tries the exact normalised name, then the abbreviation in parentheses, then a prefix match, with the cell colour as a tie-break. Forms like `Żyw. a mikrob. jel. czł.` stay unmatched (the event keeps the PDF text as its title).
- Room is usually on the second line, sometimes on the same line (`Dieta a płodność (w) A2.235`). Room values seen: `MS Teams`, `ul.Kasprowicza1`, `A1.MAŁA AULA`, `CSM.212a`, `E7.3` vs `E7.033`.
- Explicit times (**rule: cell text overrides the grid; a missing start or end comes from the grid**):
  `(8:30)`, `(13:00)Jakość…`, `(11:30)`, `16:15 spotkanie…`, `(14:15 do 17:45)`, `(do 10;45)`, `(do12:15)`, `(DO 16:00)`.
- One-row cells with only a truncated name and no room (I st ST r2, 14.01: `Technologia`).
- Some events have text but no fill: organizational meetings (red text), `Seminarium dyplomowe dr <name> MS Teams`, `SZKOLENIE - obowiązkowe`.
- One cell can contain two events (I st ST r1, 05.10: meeting at 16:15 + Anatomia at 17:00).
- Typos: `Żywienie kliniczne (w0`.

## Day-level notes

- Rector's hours on 1.10.2026 (`godziny rektorskie 8:00-14:00`, in the day header). **Rule: events inside the window are dropped.** In years 1 and 2 (I st ST) the dropped classes are English/German in rooms. **Working assumption (maintainer, 2026-10-09):** the rule applies to online classes too, so in I st ST r3 it drops a Fizjologia (k) class on MS Teams, 10:15–12:30.
- Holidays shown as grey blocks with red text: `ŚWIĘTO NIEPODLEGŁOŚCI` (11.11), `WSZYSTKICH ŚWIĘTYCH` (1.11, date in red), `PRZERWA ŚWIĄTECZNA 24.12.2026-3.01.2027`.
- Classes on an unmarked public holiday (06.01.2027 Epiphany) are kept with a note. The timetables disagree here: I st ST r2 marks 06.01 as `PRZERWA ŚWIĄTECZNA`, while I st ST r1 schedules Genetyka that day.
- "ZAJĘCIA PRAKTYCZNE" blocks: large grey blocks with no subject, room or group (all programmes except I st ST r1). **Decision: left out of the output for now** until there's more information. The parser still has to recognize them so they aren't reported as unknown cells.

## Date and label anomalies

| Where | What |
|---|---|
| I st ST r1, week 13 Tue | `22.12.2025` |
| I st ST r2, week 13 Tue | `22.12.2025` (same as r1) |
| I st ST r2, II st ST r1 and r2, week 1 Mon/Tue | `28.09.2025`, `29.09.2025` |
| II st NST r2, week 15 Fri | `22.01.2026` |
| II st NST r2 | Friday 15.01 labelled `TYDZIEŃ 14`, its Sat/Sun `TYDZIEŃ 15`, and the next band again `TYDZIEŃ 15` |
| I st NST r1, title | academic year `2025/2026` (all others say 2026/2027) |
| several | `TYDZIEN` without Ń; `GRUPA` label missing in some blocks; the GRUPA header row is missing for some days |

**Rule (confirmed):** the year typo appears in all timetables and is auto-corrected, with each
correction logged as a warning. Week numbers and the title year aren't reliable, so the date
(after correction) is the source of truth.

## Groups DOCX

- One table: `LP`, `Nr albumu`, then one column per partition.
- I st: `Zajęcia w 2/3/4/5 grupach`. II st: `Podział na 2 grupy`, `Podział na 3 grupy`, `Podział ZP` (values up to 4).
- Groups are contiguous blocks ordered by LP.
- There's no DOCX for years 2 and 3, so groups must be selectable manually there.
- Students can change groups through the dean's office (dziekanat), so manual group selection is a core feature. Album-number lookup only pre-fills it.

## Profile implications

A student profile is a set of choices, not just numbers:
- one group per partition present in the timetable (`2`, `3`, `4`, `5`, `ZP`, …)
- optional subjects: German in I st r1 (an optional subject; left out of the website for now via `skipped_subjects`, 2026-10-21); elective modules in I st r2 (`Moduł 3`) and II st r2 (`Moduł 2`), both "student wybiera 5 z 6 przedmiotów", with one subject marked `przedmiot nie wybrany` (not offered)

## Findings from the parser (stages 1–3, 2026-10-09)

Year 1 (I st ST r1), from `ur-timetable inspect`: 80 day blocks, all with 16 rows, 279 cells with text, no cell errors.

- **Header anomalies** (all flagged as warnings, nothing guessed):
  - 23.10 (Fri): the 2-group row has an extra border, so it reads `1 | (blank) | 2`.
  - 09.11 (Mon): first group cell contains `1+C131:AA132`.
  - 06.01 (Wed): the 2-group row reads `1 | 2 | (blank)` (cols 1-2 / 3-4 / 5), unlike the other Wednesdays (1-2 / 3-5).
  - 07.01 (Thu): the 5-column header reads `1 2 3 (blank) 4`.
- **Wychowanie fizyczne spans all 4 columns** (I said 3 of 4 earlier; that was a misreading).
- On Thursdays, German (`Język niemiecki`) covers columns 3–4, while English group 2 covers 3–5.
- Chemia / Biochemia: Wednesdays usually show 4 of the 5 groups; the remaining group has the class on Thursday in a single column.
- **18.11 (Wed): possible duplicate in the source.** Biochemia D3.242 appears in columns 4 *and* 5 at 08:45, and Chemia D3.137 in columns 4 *and* 5 at 11:00 (two groups, same room, same time). Answered (2026-10-12): the groups are combined; shown as printed, no rule.
- Explicit times found in cells: `(8:30)` (WF), `(12:00)`, `(12:15)`, `(13:00)`, `(13:45)`, `(17:00)`, `16:15`, `(14:15 do 17:45)`.
- Header notes found: `godziny rektorskie 8:00-14:00 -zajęcia odwołane` (1.10), `Spotkanie organizacyjne 16:15` (05.10; also repeated in the cell).

Other timetables (not priority):
- II st ST r2: three weeks have no 3-group header row (only 4 and 2).
- I st ST r3: one week has an extra 2-group row.
- I st NST r1, 01.11: holiday header has no top border found.
- I st NST r3, last page: the 19:15–20:00 row has no bottom border.

## Findings from stage 4 (events), 2026-10-09

Year 1: 274 events (34 lectures, 238 classes, 2 other), 3 dropped (1.10 rector's hours), 1 error.

- **Was an error (now resolved, see below): 10.12 (Thu), Anatomia człowieka ćw in column 5.** Anatomia has 4 groups,
  Thursday has 5 columns and no 4-group header row. Columns 1–4 map to groups 1–4 by the column rule,
  but column 5 can't. On 03.12 Anatomia is in columns 1 and 3, on 10.12 in columns 5 and 2. **Resolved (2026-10-12) by a manual override:** column 5 = group 4 (the maintainer's judgement, "probably"), in `data/config/dietetyka/I-st_ST_rok-1.json`, logged as a warning on the event.
- **Legend colours don't always match the grid:** Genetyka is `#00b050` in the legend and `#70ad47` in the grid;
  Biochemia classes are `#bdd7ee` in the legend and `#ccecff` in the grid. So colour is only a cross-check (warning).
- Chemia and Biochemia share one colour for all lecturers, so the colour can't identify the lecturer for those.
- Hours check (automated in stage 5, `validate.hours_report`: reported when a subject/group is off by more than 2 h and 10%): each Chemia/Biochemia group has 10 sessions × 3 h = 30 h = legend ĆW/LAB.
- 05.10: "16:15 spotkanie organizacyjne" has no end time; it ends at 17:00, where the next event in the same cell
  (Anatomia lecture) starts. **Working rule, logged as a warning; not confirmed by the maintainer.**
- Two non-class events (not matched to a subject): the organizational meeting (05.10) and the mandatory training (29.10, 13:45, A2.46).
