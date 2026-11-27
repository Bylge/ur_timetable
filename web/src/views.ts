// Rendering: functions that return HTML strings. Interactive elements carry data-action attributes,
// handled in app.ts. Every interpolated value goes through esc().

import type { ChangeSet, ClassEvent, IndexEntry, Mark, Selection, Timetable } from "./types";
import { changeItems, type ChangeItem, type RecentChange } from "./changes";
import { VERSION } from "./version";
import type { News } from "./news";
import { endAfter, eventsOn, isWf, placeDay, selectionComplete, wfPlanned, type Placed } from "./schedule";
import { addDays, dayDate, ago, longDate, numericDate, relativeDay, shortTime, toMinutes, type Now } from "./time";
import { shortTitle, kindLabel, kindShort, plural, programmeName, parseId, sourceStatus, timetableName, timetableShort } from "./labels";

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const ICON = {
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  changes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h11M4 12h7M4 17h9M17 10l3 3-3 3M20 13h-6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M12 13v4M10 15h4"/></svg>',
  groups: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15 14.6c2.6-.3 4.6 1 5.2 3.9"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/></svg>',
  theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="M8.7 10.7l6.6-3.9M8.7 13.3l6.6 3.9"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  week: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M9 10v10M14.5 10v10"/></svg>',
  palette: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.8-1.7h2.2a3.7 3.7 0 0 0 3.7-3.7C20.5 6.9 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.8" r="1"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.5h10a5 5 0 0 1 0 10H9M8.5 5.5l-4 4 4 4"/></svg>',
  install: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
};

/**
 * Softer block colours: the subject colour as a stripe, a light tint of it as the block (styles.css). A pale PDF
 * colour (#ccecff, #ffffcc) is darkened for this, to a lightness of at most 62%, so its stripe shows on white and
 * its tint matches the others instead of being nearly white.
 */
export function softColor(hex: string): string {
  return `--c:${stripeColor(hex)}`;
}

/** The subject colour as used everywhere in the app (stripes, dots): a pale PDF colour darkened to show on white. */
export function stripeColor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const hue = Math.round((h * 60 + 360) % 360);
  return `hsl(${hue} ${Math.round(sat * 100)}% ${Math.round(Math.min(l, 0.62) * 100)}%)`;
}

export function textColorOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5 ? "#ffffff" : "#16181d";
}

/** Polish plural of "zajęcia": 2 zajęcia, 5 zajęć, 22 zajęcia, 117 zajęć. */
export function zajecia(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  return `${n} ${last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "zajęcia" : "zajęć"}`;
}


function groupText(e: ClassEvent): string {
  return e.partition && e.partition > 1 ? `gr. ${e.group}/${e.partition}` : "";
}

// ---------- shared pieces ----------

/**
 * The name; the "demo" pill goes elsewhere where space is tight (the phone plan has it in the status line).
 * `short`: "Plan UR" for the phone's top bar, where the full name pushed "nieoficjalny" out ("nieoficja…" on iPhone).
 */
export function brand(demo = true, short = false): string {
  return `<div class="brand"><span class="brand-name">${short ? "Plan UR" : "Plan zajęć UR"}</span><span class="brand-tag">nieoficjalny</span>${demo ? demoPill() : ""}</div>`;
}

function demoPill(): string {
  return `<span class="demo-pill" title="Wersja demonstracyjna ${esc(VERSION)}">demo</span>`;
}



/**
 * Why the status is red. A new PDF that couldn't be published (pending_sha256 is set) or just a failed
 * check (e.g. ur.edu.pl didn't answer): in both cases the student sees the last good version.
 */
function problemText(entry: IndexEntry): string {
  return entry.pending_sha256
    ? "Uczelnia opublikowała nową wersję planu, której nie udało się jeszcze automatycznie przetworzyć. Do czasu poprawki widzisz poprzednią wersję."
    : "Ostatnie sprawdzenie planu na stronie UR się nie udało. Widzisz ostatnią sprawdzoną wersję.";
}

export function problemBanner(entry: IndexEntry, tt: Timetable): string {
  const parts: string[] = [];
  if (entry.status === "failed" || entry.status === "needs_review") {
    parts.push(
      `<div class="banner banner-problem" role="status">${esc(problemText(entry))} Sprawdź <a href="${esc(entry.url)}" target="_blank" rel="noopener">PDF na stronie UR</a>.</div>`,
    );
  }
  if (tt.unresolved.length) {
    const n = tt.unresolved.length;
    parts.push(
      `<button class="banner banner-warn" data-action="info">${n === 1 ? "1 zajęć nie udało się odczytać" : `${n} zajęć nie udało się odczytać`} — sprawdź PDF. Szczegóły ›</button>`,
    );
  }
  return parts.join("");
}

// ---------- picker ----------

export function pickerView(entries: IndexEntry[], current: string | null): string {
  const byProgramme = new Map<string, IndexEntry[]>();
  for (const e of entries) {
    const programme = parseId(e.id)?.programme ?? e.id.split("/")[0];
    byProgramme.set(programme, [...(byProgramme.get(programme) ?? []), e]);
  }
  const sections = [...byProgramme.entries()]
    .map(
      ([programme, list]) => `<section class="list-section">
        <h2>${esc(programmeName(programme))}</h2>
        <div class="list">${list
          .map(
            (e) => `<button class="row${e.id === current ? " row-current" : ""}" data-action="pick-timetable" data-id="${esc(e.id)}">
              <span class="row-main">${esc(timetableName(e.id))}</span>
              <span class="row-sub">${e.updated ? `aktualizacja planu ${esc(numericDate(e.updated))}` : ""}</span>
              <span class="row-chevron" aria-hidden="true">${ICON.right}</span></button>`,
          )
          .join("")}</div></section>`,
    )
    .join("");
  return `<div class="page">
    <header class="pagebar">${current ? `<button class="iconbtn" data-action="back" aria-label="Wróć">${ICON.back}</button>` : ""}${brand()}</header>
    <main class="page-body">
      <h1 class="page-title">Wybierz swój plan</h1>
      ${sections || `<p class="muted">Brak dostępnych planów.</p>`}
      <p class="fine">Na razie dostępne są tylko plany, które zostały sprawdzone. Kolejne lata i kierunki będą dodawane.</p>
    </main></div>`;
}

// ---------- groups ----------

export function groupsView(tt: Timetable, draft: Selection, count: number, canGoBack: boolean): string {
  const splits = tt.splits
    .map((p) => {
      const chosen = draft.groups[String(p)];
      const buttons = Array.from({ length: p }, (_, i) => i + 1)
        .map(
          (g) => `<button class="seg-btn${chosen === g ? " on" : ""}" data-action="set-group" data-split="${p}" data-group="${g}"
            aria-pressed="${chosen === g}">${g}</button>`,
        )
        .join("");
      return `<fieldset class="split"><legend>Zajęcia w ${p} grupach</legend><div class="seg seg-groups" role="group">${buttons}</div></fieldset>`;
    })
    .join("");
  const optional = tt.optional_subjects
    .map(
      (s) => `<label class="toggle"><input type="checkbox" data-action="toggle-optional" data-subject="${esc(s)}" ${
        draft.optional.includes(s) ? "checked" : ""
      }><span class="toggle-track" aria-hidden="true"></span><span>${esc(s)}</span></label>`,
    )
    .join("");
  const wf = wfPlanned(tt);
  const wfSection = wf
    ? `<fieldset class="split"><legend>Wychowanie fizyczne</legend>
        <p class="split-hint">W planie WF jest o ${esc(shortTime(wf.start))}–${esc(shortTime(endAfter(wf.start, wf.minutes)))}. Jeśli Twoja grupa WF ma inną godzinę, ustaw jej początek: przesuną się wszystkie zajęcia WF w Twoim planie, z tą samą długością.</p>
        ${wfControl("draft", wf.start, draft.wf, wf.minutes)}</fieldset>`
    : "";
  const complete = selectionComplete(tt, draft);
  const missing = tt.splits.filter((p) => !draft.groups[String(p)]);
  return `<div class="page">
    <header class="pagebar">${canGoBack ? `<button class="iconbtn" data-action="back" aria-label="Wróć">${ICON.back}</button>` : ""}${brand()}</header>
    <main class="page-body">
      <h1 class="page-title">Twoje grupy</h1>
      <button class="plan-chip" data-action="picker">${esc(timetableShort(tt.id))}<span class="link">zmień</span></button>
      <p class="hint">Wybierz numer swojej grupy w każdym podziale. Zajęcia wspólne dla całego roku pokażą się zawsze.</p>
      ${splits}
      ${optional ? `<fieldset class="split"><legend>Przedmioty do wyboru</legend>${optional}</fieldset>` : ""}
      ${wfSection}
      <div class="groups-footer">
        <p class="preview" aria-live="polite">${
          complete ? `${zajecia(count)} w semestrze` : `Wybierz grupę: ${missing.map((p) => `podział na ${p}`).join(", ")}`
        }</p>
        <button class="primary" data-action="save-groups" ${complete ? "" : "disabled"}>Pokaż plan</button>
        <p class="fine">Plan nieoficjalny, tworzony automatycznie z PDF na stronie Uniwersytetu Rzeszowskiego. W razie wątpliwości obowiązuje PDF. Twój wybór zostaje na tym urządzeniu (i w adresie strony, do zakładki).</p>
      </div>
    </main></div>`;
}

// ---------- time axis ----------

export interface AxisOptions {
  from: number; // hour
  to: number;
  hourPx: number;
  compact?: boolean; // narrow week columns on a phone
  now?: Now;
  marks?: Record<string, Mark>;
  changed?: Map<string, RecentChange>;
}

/** Short names of a recent change, on the class block and in its sheet. */
const RECENT_LABEL: Record<RecentChange["kind"], string> = {
  added: "Nowe",
  moved: "Nowa godz.",
  room: "Nowa sala",
  other: "Zmiana",
};

function block(p: Placed, o: AxisOptions, now?: Now): string {
  const e = p.event;
  const top = ((toMinutes(e.start) - o.from * 60) / 60) * o.hourPx;
  const height = Math.max(((toMinutes(e.end) - toMinutes(e.start)) / 60) * o.hourPx - 2, 14);
  const width = 100 / p.lanes;
  const past = now && e.date === now.date && toMinutes(e.end) <= now.minutes;
  // going on now: a ring, and the part that's over shaded (--p = share of the class that has passed)
  const isNow = now && e.date === now.date && toMinutes(e.start) <= now.minutes && now.minutes < toMinutes(e.end);
  const passed = isNow ? Math.round(((now.minutes - toMinutes(e.start)) / (toMinutes(e.end) - toMinutes(e.start))) * 100) : 0;
  const short = height < 46;
  const mark = o.marks?.[e.id];
  const cancelled = Boolean(mark?.cancelled);
  const meta = [kindShort(e.kind), groupText(e)].filter(Boolean).join(" · ");
  const change = o.changed?.get(e.id);
  const chg = change && !cancelled ? `<span class="b-chg">${RECENT_LABEL[change.kind]}</span>` : "";
  const label = `${cancelled ? "Odwołane: " : ""}${change ? `Zmiana w planie (${RECENT_LABEL[change.kind].toLowerCase()}): ` : ""}${e.title}, ${shortTime(e.start)}–${shortTime(e.end)}${meta ? `, ${meta}` : ""}${e.room ? `, sala ${e.room}` : ""}${mark?.note ? `, notatka: ${mark.note}` : ""}`;
  const badge = cancelled
    ? `<span class="b-cancel"><span class="b-badge">Odwołane</span>${mark?.note ? `<span class="b-note">${esc(mark.note)}</span>` : ""}</span>`
    : "";
  const inner = o.compact
    ? `<span class="b-title">${esc(shortTitle(e.title))}</span>${height >= 30 && e.room ? `<span class="b-room">${esc(e.room)}</span>` : ""}${
        height >= 58 ? `<span class="b-time">${esc(shortTime(e.start))}</span>` : ""
      }`
    : `<span class="b-title">${esc(e.title)}</span>
       ${short && cancelled ? badge : `<span class="b-meta">${chg}${esc(shortTime(e.start))}–${esc(shortTime(e.end))}${meta ? ` · ${esc(meta)}` : ""}</span>`}
       ${short ? "" : cancelled ? badge : `<span class="b-room">${esc(e.room ?? "")}</span>`}`;
  const cls = ["block", o.compact && "compact", short && "short", past && "past", isNow && "now", cancelled && "cancelled", mark?.note && !cancelled && "noted", change && !cancelled && "changed"];
  return `<button class="${cls.filter(Boolean).join(" ")}" data-action="event" data-id="${esc(e.id)}"
    style="top:${top}px;height:${height}px;left:calc(${p.lane * width}% + 2px);width:calc(${width}% - 4px);${softColor(e.color)}${isNow ? `;--p:${passed}%` : ""}"
    aria-label="${esc(isNow ? `Teraz: ${label}` : label)}">${inner}</button>`;
}

export function axis(o: AxisOptions): string {
  const hours = Array.from({ length: o.to - o.from + 1 }, (_, i) => o.from + i);
  return `<div class="axis" style="height:${(o.to - o.from) * o.hourPx}px">${hours
    .map((h) => `<span style="top:${(h - o.from) * o.hourPx}px">${h}:00</span>`)
    .join("")}</div>`;
}

export function dayColumn(date: string, events: ClassEvent[], o: AxisOptions): string {
  const lines = Array.from({ length: o.to - o.from }, (_, i) => `<div class="hline" style="top:${i * o.hourPx}px"></div>`).join("");
  const nowLine =
    o.now && o.now.date === date && o.now.minutes >= o.from * 60 && o.now.minutes <= o.to * 60
      ? `<div class="nowline" style="top:${((o.now.minutes - o.from * 60) / 60) * o.hourPx}px" aria-hidden="true"></div>`
      : "";
  const blocks = placeDay(eventsOn(events, date))
    .map((p) => block(p, o, o.now))
    .join("");
  return `<div class="col${o.now?.date === date ? " col-today" : ""}" data-date="${date}" style="height:${(o.to - o.from) * o.hourPx}px">${lines}${blocks}${nowLine}</div>`;
}















// ---------- sheets ----------

/**
 * The student's own WF start time: a time field, the resulting end, and a way back to the PDF's time.
 * `target` says what it changes: the draft on the groups screen or the saved choice (class sheet).
 */
function wfControl(target: "draft" | "selection", planned: string, own: string | undefined, minutes: number): string {
  const value = own ?? planned;
  return `<label class="field-label" for="wf-start">Początek zajęć</label>
    <div class="wf-row">
      <input class="field wf-time" id="wf-start" type="time" step="300" value="${esc(value)}" required
        data-action="wf-start" data-target="${target}" data-planned="${esc(planned)}" data-minutes="${minutes}">
      <span class="wf-end">do ${esc(shortTime(endAfter(value, minutes)))}</span>
      <button class="link-btn wf-reset" data-action="wf-reset" data-target="${target}" aria-label="Cofnij do godziny z planu (${esc(shortTime(planned))})" ${own ? "" : "hidden"}>${ICON.undo}Cofnij</button>
    </div>`;
}

/** "10:30–12:15 (Twoja godzina; w PDF 8:30–10:15)", or just the times when the class is where the PDF has it. */
export function hoursText(start: string, end: string, planned?: { start: string; end: string }): string {
  const time = `${shortTime(start)}–${shortTime(end)}`;
  return planned ? `${time} (Twoja godzina; w PDF ${shortTime(planned.start)}–${shortTime(planned.end)})` : time;
}

/** On a WF class: the student's own hour (changes every WF class in their plan). */
function wfSheetSection(e: ClassEvent, own: string | undefined, plannedStart: string): string {
  const pdf = e.planned ?? e;
  const minutes = toMinutes(pdf.end) - toMinutes(pdf.start);
  return `<section class="wf" aria-labelledby="wf-title">
      <h3 id="wf-title">Twoja godzina WF</h3>
      ${wfControl("selection", plannedStart, own, minutes)}
      <p class="fine">Godzina WF zależy od grupy, na którą się zapiszesz. Zmiana dotyczy wszystkich zajęć WF w Twoim planie (i pliku kalendarza). Widzisz ją tylko Ty.</p>
    </section>`;
}

export function eventSheet(
  e: ClassEvent,
  now: Now,
  mark: Mark | undefined,
  sourceUrl: string,
  wf: { own: string | undefined; planned: string } | null = null,
  change?: RecentChange,
): string {
  const rows: [string, string][] = [
    ["Kiedy", `${longDate(e.date)} (${relativeDay(e.date, now.date).toLowerCase()})`],
    ["Godziny", hoursText(e.start, e.end, e.planned)],
    ["Rodzaj", kindLabel(e.kind) || "inne"],
    ["Kto", e.partition && e.partition > 1 ? `grupa ${e.group} z ${e.partition}` : "cały rok"],
    ["Sala", e.room ?? "—"],
  ];
  const cancelled = Boolean(mark?.cancelled);
  return sheet(
    "event",
    e.title,
    `<div class="sheet-swatch" style="--c:${esc(stripeColor(e.color))}"></div>
     <dl class="facts">${rows
       .map(([k, v]) => `<dt>${esc(k)}</dt><dd${k === "Godziny" && isWf(e) ? " data-wf-hours" : ""}>${esc(v)}</dd>`)
       .join("")}</dl>
     ${e.notes.length ? `<ul class="notes">${e.notes.map((n) => `<li>${esc(noteText(n))}</li>`).join("")}</ul>` : ""}
     ${change ? changeNote(change) : ""}
     ${wf && isWf(e) ? wfSheetSection(e, wf.own, wf.planned) : ""}
     <section class="mark${cancelled ? " is-cancelled" : ""}" aria-label="Twoje oznaczenie">
       <label class="toggle"><input type="checkbox" data-action="toggle-cancelled" data-id="${esc(e.id)}" ${cancelled ? "checked" : ""}>
         <span class="toggle-track" aria-hidden="true"></span><span class="toggle-text"><strong>Odwołane</strong><span class="toggle-sub">np. prowadzący odwołał zajęcia</span></span></label>
       <label class="field-label" for="mark-note">Notatka</label>
       <input class="field" id="mark-note" type="text" maxlength="120" data-action="mark-note" data-id="${esc(e.id)}"
         value="${esc(mark?.note ?? "")}" placeholder="${cancelled ? "Powód, np. choroba prowadzącego" : "np. przynieść fartuch"}" autocomplete="off">
       <p class="fine">Oznaczenie i notatka są widoczne tylko dla Ciebie, na tym urządzeniu.</p>
     </section>
     <p class="fine">Coś się nie zgadza? Sprawdź <a href="${esc(sourceUrl)}" target="_blank" rel="noopener">PDF na stronie UR</a> — on obowiązuje.</p>`,
  );
}

/** In the class sheet: what a recent update changed in this class. */
function changeNote(ch: RecentChange): string {
  const b = ch.before;
  const what =
    ch.kind === "added"
      ? "Nowe zajęcia w planie."
      : ch.kind === "moved" && b
        ? `Nowa godzina, było: <s>${esc(dayDate(b.date))}, ${esc(shortTime(b.start))}–${esc(shortTime(b.end))}</s>.`
        : ch.kind === "room" && b
          ? `Nowa sala, było: <s>${esc(b.room ?? "—")}</s>.`
          : "Zajęcia zmienione.";
  return `<div class="info-block change"><strong>Zmiana w planie</strong> (aktualizacja z ${esc(numericDate(ch.updated).slice(0, 5))}). ${what}
    <button class="text-btn" data-action="changes">Wszystkie zmiany</button></div>`;
}

/** Parser notes are in English internally; show them in Polish. */
export function noteText(note: string): string {
  return note
    .replace(/^scheduled on a public holiday \((.+)\)$/, "Zajęcia zaplanowane w dzień ustawowo wolny ($1)")
    .replace(/^start (\S+) from cell text \(grid: (\S+)\)$/, "Początek $1 według opisu w PDF (w siatce: $2)")
    .replace(/^end (\S+) from cell text \(grid: (\S+)\)$/, "Koniec $1 według opisu w PDF (w siatce: $2)");
}

export function infoSheet(entry: IndexEntry, tt: Timetable, at: Date): string {
  const s = sourceStatus(entry, at);
  const unresolved = tt.unresolved.length
    ? `<div class="info-block warn"><strong>Nie udało się odczytać ${tt.unresolved.length} zajęć.</strong> Sprawdź je w PDF:<ul>${tt.unresolved
        .map((u) => `<li>${esc(numericDate(u.date))}, ${esc(shortTime(u.start))}–${esc(shortTime(u.end))}: „${esc(u.text)}”</li>`)
        .join("")}</ul></div>`
    : "";
  const problem =
    s.level === "problem"
      ? `<div class="info-block problem">${esc(problemText(entry))} W razie wątpliwości sprawdź PDF.</div>`
      : s.level === "stale"
        ? `<div class="info-block warn">Plan nie był sprawdzany od dłuższego czasu. Możliwe, że na stronie UR jest nowsza wersja.</div>`
        : "";
  return sheet(
    "info",
    "Skąd jest ten plan?",
    `${problem}${unresolved}
     <p>To <strong>nieoficjalny</strong> plan. Jest tworzony automatycznie z planu w PDF publikowanego na stronie Uniwersytetu Rzeszowskiego i może zawierać błędy. <strong>W razie wątpliwości obowiązuje PDF.</strong> Strona nie jest związana z uczelnią.</p>
     <dl class="facts">
       <dt>Źródło</dt><dd><a href="${esc(entry.url)}" target="_blank" rel="noopener">PDF na stronie UR</a></dd>
       <dt>Aktualizacja planu</dt><dd>${entry.updated ? esc(numericDate(entry.updated)) : "—"} (data podana przez uczelnię)</dd>
       <dt>Sprawdzono</dt><dd>${esc(ago(entry.checked_at, at))}</dd>
     </dl>
     <p class="fine">Plan jest sprawdzany trzy razy dziennie: rano, po południu i wieczorem. Twoje grupy, ustawienia, oznaczenia i notatki są zapisane na tym urządzeniu. Wybrany plan i grupy są też w adresie strony (do zakładki); oznaczenia i notatki nie są nigdzie wysyłane.</p>
     <div class="linkrow"><button class="link-btn" data-action="page" data-page="about">O projekcie</button>
       <button class="link-btn" data-action="page" data-page="privacy">Prywatność</button></div>
     <p class="fine version">${versionText()}</p>`,
  );
}

export function sheet(kind: string, title: string, body: string): string {
  return `<div class="sheet-layer" data-sheet="${kind}">
    <div class="backdrop" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1"><div class="sheet-scroll">
      <div class="grabber" aria-hidden="true"></div>
      <div class="sheet-head"><h2 id="sheet-title">${esc(title)}</h2>
        <button class="iconbtn" data-action="close-sheet" aria-label="Zamknij">${ICON.close}</button></div>
      <div class="sheet-body">${body}</div>
    </div></div></div>`;
}

// ---------- menu ----------






/** The public address: shared links always point here, also from localhost or an installed app. */
export const SITE_URL = "https://bylge.github.io/ur_timetable/";

export interface ShareOptions {
  withGroups: boolean;
  url: string; // what the QR code and the buttons share
  groups: string; // "1/2 · 1/3 · …" (+ WF hour), for the switch's explanation
  qr: string | null; // the QR code as SVG; null while the generator is loading
  canShare: boolean; // the system share menu (navigator.share) is available
}

/**
 * QR code and link, for telling classmates about the site (searching for it doesn't find it yet). A switch
 * picks the bare site (everyone picks their own groups) or the site with the student's groups already set.
 */
export function shareSheet(o: ShareOptions): string {
  const shown = o.withGroups ? "Link z Twoimi grupami" : SITE_URL.replace(/^https:\/\//, "").replace(/\/$/, "");
  const mode = (on: boolean, label: string) =>
    `<button class="seg-btn${o.withGroups === on ? " on" : ""}" data-action="share-mode" data-groups="${on}" aria-pressed="${o.withGroups === on}">${label}</button>`;
  return sheet(
    "share",
    "Udostępnij stronę",
    `<div class="seg seg-share" role="group" aria-label="Co udostępnić">${mode(false, "Sama strona")}${mode(true, "Z moimi grupami")}</div>
     <p class="share-hint">${
       o.withGroups
         ? `Otworzy się od razu Twój plan: grupy ${esc(o.groups)}. Dobre dla kogoś z tych samych grup.`
         : "Każdy wybierze u siebie swój plan i grupy."
     }</p>
     <figure class="qr"><div class="qr-code">${
       o.qr ?? `<span class="qr-wait">Tworzę kod…</span>`
     }</div><figcaption>${esc(shown)}</figcaption></figure>
     <div class="sheet-actions">
       ${o.canShare ? `<button class="primary" data-action="share-link">Wyślij link</button>` : ""}
       <button class="${o.canShare ? "secondary" : "primary"}" data-action="copy-link">Kopiuj link</button>
     </div>
     <p class="fine">Link nigdy nie zawiera Twoich oznaczeń ani notatek. <button class="text-btn" data-action="qr-download">Pobierz kod QR</button> (obrazek PNG, np. do wydruku).</p>`,
  );
}


export interface IcsSummary {
  count: number;
  first: string | null;
  last: string | null;
  groups: string;
  cancelled: number; // classes the student marked as cancelled
}

/** Before downloading the .ics: what will be in the file, and that it won't update itself. */
export function icsConfirmSheet(s: IcsSummary): string {
  const range = s.first && s.last ? `${numericDate(s.first).slice(0, 5)} – ${numericDate(s.last)}` : "—";
  return sheet(
    "ics-confirm",
    "Pobrać plik kalendarza?",
    `<p>Plik <strong>.ics</strong> z Twoimi zajęciami do dodania w kalendarzu (Google, Apple, Outlook).</p>
     <dl class="facts confirm-facts">
       <dt>Zajęcia</dt><dd>${esc(zajecia(s.count))}</dd>
       <dt>Okres</dt><dd>${esc(range)}</dd>
       <dt>Grupy</dt><dd>${esc(s.groups)}</dd>
       ${s.cancelled ? `<dt>Odwołane</dt><dd>${esc(s.cancelled)} (oznaczone w nazwie jako „ODWOŁANE”)</dd>` : ""}
     </dl>
     <div class="info-block warn">To jednorazowa kopia. Gdy uczelnia zmieni plan, kalendarz sam się nie zaktualizuje — trzeba pobrać plik ponownie.</div>
     <div class="sheet-actions">
       <button class="primary" data-action="ics-download">Pobierz plik</button>
       <button class="secondary" data-action="close-sheet">Anuluj</button>
     </div>`,
  );
}

/** After downloading the .ics: how to add it. */
export function icsSheet(count: number, fileName: string): string {
  return sheet(
    "ics",
    "Plik kalendarza pobrany",
    `<p><strong>${esc(fileName)}</strong>: ${esc(zajecia(count))} z Twoich grup.</p>
     <ul class="steps">
       <li><strong>Telefon:</strong> otwórz pobrany plik i wybierz kalendarz, do którego dodać zajęcia.</li>
       <li><strong>Kalendarz Google:</strong> na komputerze <em>Ustawienia → Importuj i eksportuj → Importuj</em>.</li>
       <li><strong>Outlook, Apple:</strong> otwórz plik albo przeciągnij go do kalendarza.</li>
     </ul>
     <p class="fine">Gdy plan się zmieni, pobierz plik ponownie. Uwaga: ponowny import doda zajęcia przeniesione na nową godzinę, ale nie usunie starych wpisów (przeniesionych albo usuniętych przez uczelnię). Najprościej importować plik do osobnego kalendarza i przed ponownym importem utworzyć ten kalendarz od nowa.</p>`,
  );
}

/** iOS can't install from the page: the steps in Safari's share menu. */
export function iosInstallSheet(): string {
  return sheet(
    "ios-install",
    "Zainstaluj jako aplikację",
    `<p>Na iPhonie aplikację dodaje się z menu Safari:</p>
     <ol class="steps">
       <li>Stuknij <strong>Udostępnij</strong> (kwadrat ze strzałką w górę). W nowszych iOS jest w menu <strong>⋯</strong>.</li>
       <li>Wybierz <em>Do ekranu początkowego</em>.</li>
       <li>Stuknij <em>Dodaj</em>.</li>
     </ol>
     <p class="fine">Ikona „Plan UR” pojawi się na ekranie. Aplikacja nie widzi grup wybranych w Safari, więc po pierwszym uruchomieniu wybierz je jeszcze raz.</p>`,
  );
}

/**
 * After an update: what's new, as a centred popup; a tap anywhere closes it. The version big on top, the main
 * changes with an icon each, the rest as a short list.
 */
export function newsPopup(version: string, news: News): string {
  const [major, minor] = version.split(".");
  const highlights = news.highlights
    .map(
      (h, i) => `<li class="nw-item" style="--i:${i}"><span class="nw-icon">${(ICON as Record<string, string>)[h.icon] ?? ""}</span>
        <span class="nw-text"><strong>${esc(h.title)}</strong><span>${esc(h.text)}</span></span></li>`,
    )
    .join("");
  const more = news.more.map((m) => `<li>${esc(m)}</li>`).join("");
  return `<div class="sheet-layer news-layer" data-sheet="news" data-action="close-sheet">
    <div class="backdrop"></div>
    <div class="news-card" role="dialog" aria-modal="true" aria-labelledby="news-title" tabindex="-1">
      <header class="nw-head">
        <span class="nw-kicker">Nowa wersja · ${esc(news.date)}</span>
        <h2 id="news-title"><span class="nw-ver">${esc(major)}.${esc(minor)}<span class="nw-demo">demo</span></span><span class="nw-word">Co nowego</span></h2>
      </header>
      <ul class="nw-list">${highlights}</ul>
      ${more ? `<h3 class="nw-more-title">Poza tym</h3><ul class="nw-more" style="--i:${news.highlights.length}">${more}</ul>` : ""}
      <p class="news-close">Dotknij, aby zamknąć</p>
    </div></div>`;
}

// ---------- pages ----------

function page(title: string, body: string): string {
  return `<div class="page page-text">
    <header class="pagebar"><button class="iconbtn" data-action="close-page" aria-label="Wróć">${ICON.back}</button>${brand()}</header>
    <main class="page-body anim-fade"><h1 class="page-title">${esc(title)}</h1>${body}</main></div>`;
}

const CHANGE_LABEL: Record<ChangeItem["kind"], string> = {
  added: "Nowe",
  removed: "Usunięte",
  moved: "Nowa godzina",
  room: "Nowa sala",
  other: "Zmiana",
};

function changeRow(i: ChangeItem): string {
  const e = i.event;
  const b = i.before;
  const time = (x: ClassEvent) => `${shortTime(x.start)}–${shortTime(x.end)}`;
  let what: string;
  if (i.kind === "moved" && b) what = `${esc(dayDate(e.date))}, <s>${esc(time(b))}</s> → <strong>${esc(time(e))}</strong>`;
  else if (i.kind === "room" && b)
    what = `${esc(dayDate(e.date))}, ${esc(time(e))} · sala <s>${esc(b.room ?? "—")}</s> → <strong>${esc(e.room ?? "—")}</strong>`;
  else what = `${esc(dayDate(e.date))}, ${esc(time(e))}${e.room ? ` · ${esc(e.room)}` : ""}`;
  const meta = [kindShort(e.kind), groupText(e)].filter(Boolean).join(" · ");
  const inner = `<span class="swatch" style="--c:${esc(e.color)}"></span>
    <span class="ch-tag ch-${i.kind}">${CHANGE_LABEL[i.kind]}</span>
    <span class="ch-title">${esc(e.title)}${meta ? ` <span class="muted">· ${esc(meta)}</span>` : ""}</span>
    <span class="ch-what">${what}</span>`;
  return i.kind === "removed"
    ? `<li><div class="ch-row ch-removed-row">${inner}</div></li>`
    : `<li><button class="ch-row" data-action="goto-day" data-date="${e.date}" aria-label="${esc(
        `${CHANGE_LABEL[i.kind]}: ${e.title}, ${longDate(e.date)}. Pokaż dzień`,
      )}">${inner}<span class="ch-go" aria-hidden="true">${ICON.right}</span></button></li>`;
}

export function changesView(changes: ChangeSet[], sel: Selection, tt: Timetable, newShas: string[]): string {
  if (!changes.length) {
    const since = tt.source.updated ? ` (wersja z ${numericDate(tt.source.updated)})` : "";
    return page(
      "Zmiany w planie",
      `<div class="empty-card"><strong>Brak zmian</strong><span>Od kiedy strona śledzi ten plan${esc(since)}, uczelnia go nie zmieniła.</span></div>
       <p class="fine">Gdy na stronie UR pojawi się nowa wersja, zobaczysz tu, co się zmieniło: nowe, usunięte i przeniesione zajęcia oraz zmiany sal — najpierw te z Twoich grup.</p>`,
    );
  }
  const sections = changes
    .map((set) => {
      const items = changeItems(set, sel, tt.optional_subjects);
      const mine = items.filter((i) => i.mine);
      const others = items.filter((i) => !i.mine);
      const isNew = newShas.includes(set.sha256);
      const date = numericDate(set.updated ?? set.published_at.slice(0, 10));
      const summary = mine.length
        ? `${plural(mine.length, "zmiana", "zmiany", "zmian")} w Twoich zajęciach`
        : "Żadna zmiana nie dotyczy Twoich zajęć";
      return `<section class="ch-set">
        <h2>Aktualizacja z ${esc(date)}${isNew ? ` <span class="badge">nowa</span>` : ""}</h2>
        <p class="ch-summary">${esc(summary)}</p>
        ${mine.length ? `<ul class="ch-list">${mine.map(changeRow).join("")}</ul>` : ""}
        ${
          others.length
            ? `<details class="ch-others"><summary>Inne grupy: ${esc(plural(others.length, "zmiana", "zmiany", "zmian"))}</summary><ul class="ch-list">${others
                .map(changeRow)
                .join("")}</ul></details>`
            : ""
        }
      </section>`;
    })
    .join("");
  return page(
    "Zmiany w planie",
    `<p class="hint">Co uczelnia zmieniła w kolejnych wersjach planu. Najnowsze na górze.</p>${sections}
     <p class="fine">Zmiany są wyliczane automatycznie przez porównanie wersji PDF. Zajęcia przeniesione na inny dzień są pokazane jako usunięte i nowe.</p>`,
  );
}

/** "Wersja 0.4.1 (demo)". The "demo" label (here, the pill and "O projekcie") goes at 1.0.0. */
export function versionText(): string {
  return `Wersja ${esc(VERSION)} (demo)`;
}

const REPO_URL = "https://github.com/Bylge/ur_timetable";
// The project's contact address (also in src/ur_timetable/fetch.py, for the User-Agent). When empty, the contact
// section and no "Zgłoś błąd" link yet.
export const CONTACT_EMAIL = "plan.zajec.nieoficialny@gmail.com";

export function aboutView(sourceUrl: string | null): string {
  const pdf = sourceUrl ? ` (<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">otwórz PDF</a>)` : "";
  return page(
    "O projekcie",
    `<p><strong>Plan zajęć UR · nieoficjalny</strong> pokazuje plan z PDF publikowanych przez Uniwersytet Rzeszowski w wygodniejszej formie: wybierasz swoje grupy i widzisz tylko swoje zajęcia — na dziś i na cały tydzień, z godzinami i salami.</p>
     <div class="info-block warn"><strong>To nie jest strona uczelni.</strong> Projekt jest niezależny i niezwiązany z Uniwersytetem Rzeszowskim. Plan jest odczytywany automatycznie i może zawierać błędy. W razie wątpliwości obowiązuje plan w PDF${pdf}.</div>
     <h2>Jak to działa</h2>
     <ol class="steps">
       <li>Trzy razy dziennie (rano, po południu i wieczorem) automat sprawdza stronę z planami na ur.edu.pl.</li>
       <li>Gdy pojawi się nowa wersja PDF, odczytuje z niej zajęcia: daty, godziny, sale i grupy.</li>
       <li>Sprawdza wynik. Gdy coś poważnie się nie zgadza, nowa wersja <strong>nie jest</strong> publikowana — strona pokazuje poprzednią z ostrzeżeniem i linkiem do PDF. Pojedyncze zajęcia, których nie da się pewnie odczytać, są pominięte i wypisane w ostrzeżeniu.</li>
       <li>Porównuje wersje i pokazuje, co się zmieniło.</li>
     </ol>
     <h2>Jak powstała ta strona</h2>
     <p>Kod strony i programu odczytującego plan został napisany z pomocą AI. Sam plan nie jest odczytywany przez AI: robi to zwykły program według stałych reguł, a wynik jest automatycznie sprawdzany przed publikacją.</p>
     <h2>Czego tu nie ma</h2>
     <ul class="steps">
       <li>Nazwisk prowadzących.</li>
       <li>Zajęć praktycznych (bloków „ZAJĘCIA PRAKTYCZNE”).</li>
       <li>Języka niemieckiego (przedmiot do wyboru) — na razie pominięty.</li>
       <li>Odwołań ogłaszanych poza planem w PDF. Takie zajęcia możesz oznaczyć jako odwołane — kliknij zajęcia i włącz „Odwołane”.</li>
       <li>Planów, które nie zostały jeszcze sprawdzone. Kolejne kierunki i lata będą dodawane.</li>
     </ul>
     <h2>Instalacja na telefonie</h2>
     <p>Stronę możesz dodać do ekranu telefonu. Otwiera się wtedy jak zwykła aplikacja i działa także bez internetu (pokazuje ostatnio pobrany plan).</p>
     <ul class="steps">
       <li><strong>Android (Chrome):</strong> w menu strony wybierz <em>Zainstaluj jako aplikację</em> albo w menu przeglądarki ⋮ → <em>Zainstaluj aplikację</em>.</li>
       <li><strong>iPhone (Safari):</strong> <em>Udostępnij</em> (w nowszych iOS w menu ⋯) → <em>Do ekranu początkowego</em> → <em>Dodaj</em>. Zainstalowana aplikacja nie widzi grup wybranych w Safari, więc trzeba je wybrać jeszcze raz.</li>
     </ul>
     <h2>Kontakt</h2>
     <p>${CONTACT_EMAIL ? `Błąd w planie albo pomysł? Napisz: <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.` : "Adres kontaktowy pojawi się wkrótce."}</p>
     <h2>Wersja</h2>
     <p>${versionText()}. To wersja demonstracyjna: wygląd i funkcje mogą się jeszcze zmieniać, a plan może zawierać błędy.</p>
     <p class="fine">Kod źródłowy: <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>, licencja MIT.</p>`,
  );
}

export function privacyView(): string {
  return page(
    "Prywatność",
    `<p>Ta strona nie ma kont, nie używa plików cookie i nie zbiera Twoich danych osobowych.</p>
     <h2>Co jest zapisane na Twoim urządzeniu</h2>
     <p>W pamięci przeglądarki (<em>localStorage</em>), tylko po to, żeby strona działała tak, jak ją ustawisz:</p>
     <ul class="steps">
       <li>wybrany plan, numery grup i Twoja godzina WF (jeśli ją ustawisz),</li>
       <li>widok (dzień albo tydzień) i motyw, jeśli go wybierzesz,</li>
       <li>Twoje oznaczenia „Odwołane” i notatki,</li>
       <li>Twoje terminy (egzaminy, kolokwia, zaliczenia, zadania),</li>
       <li>ostatnio widziana wersja planu (żeby pokazać, co się zmieniło) i wersja strony (żeby nowości pokazać tylko raz).</li>
     </ul>
     <p>Te dane nie są nigdzie wysyłane. Żeby strona działała bez internetu, przeglądarka przechowuje też kopię strony i planu.</p>
     <p>Wybrany plan, grupy i godzina WF są również w adresie strony (<code>?t=…&amp;gr=…</code>), żeby można było zapisać zakładkę. Kto dostanie od Ciebie ten link (albo kod QR „Z moimi grupami”), zobaczy plan dla tych samych grup (bez Twoich oznaczeń i notatek).</p>
     <button class="secondary danger" data-action="clear-data">Usuń moje dane z tego urządzenia</button>
     <h2>Hosting</h2>
     <p>Strona jest hostowana na GitHub Pages. Jak każdy serwer, GitHub może zapisywać w logach dane techniczne połączeń (np. adres IP) w celach bezpieczeństwa — zobacz <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">politykę prywatności GitHub</a>.</p>
     <h2>Uczelnia</h2>
     <p>Plany pobiera ze strony ur.edu.pl automat, nie Twoja przeglądarka, więc uczelnia nie dostaje informacji o tym, że korzystasz z tej strony (chyba że otworzysz link do PDF).</p>
     ${CONTACT_EMAIL ? `<h2>Kontakt</h2><p>Pytania, poprawki albo prośby o usunięcie danych: <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.</p>` : ""}`,
  );
}

export function errorView(message: string): string {
  return `<div class="page"><header class="pagebar">${brand()}</header><main class="page-body">
    <h1 class="page-title">Nie udało się wczytać planu</h1><p class="muted">${esc(message)}</p>
    <button class="primary" data-action="reload">Spróbuj ponownie</button></main></div>`;
}

export { addDays };
