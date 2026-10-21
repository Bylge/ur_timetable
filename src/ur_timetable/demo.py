"""A self-contained HTML week calendar for trying out the parsed data (local demo, not the product UI)."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from .pipeline import Timetable


def demo_data(t: Timetable) -> dict:
    r = t.result
    return {
        "title": t.title or t.name,
        "events": [asdict(e) for e in r.events if not e.errors],
        "unresolved": [asdict(e) for e in r.events if e.errors],
        "dayNotes": [asdict(n) for n in r.day_notes],
        "partitions": sorted({str(s.partition) for s in t.subjects if s.partition and s.partition > 1}, key=int),
        "optional": [s for s in t.config.optional_subjects if any(sub.name == s for sub in t.subjects)],
    }


def write_demo(t: Timetable, path: Path) -> None:
    payload = json.dumps(demo_data(t), ensure_ascii=False).replace("</", "<\\/")
    path.write_text(TEMPLATE.replace("__DATA__", payload), encoding="utf-8")


TEMPLATE = r"""<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan zajęć – demo</title>
<style>
:root {
  --bg: #f6f7f9; --panel: #ffffff; --text: #1d2330; --muted: #667085; --line: #e3e6eb;
  --accent: #2f6fde; --warn: #b54708; --warn-bg: #fff4e5; --hour: 52px;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #14161a; --panel: #1d2026; --text: #e7e9ee; --muted: #9aa3b2; --line: #2e333b;
          --accent: #6b9cff; --warn: #f0a35e; --warn-bg: #3a2a1a; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { padding: 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
h1 { font-size: 16px; margin: 0 0 12px; font-weight: 600; }
.controls { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: end; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
input, select, button { font: inherit; color: var(--text); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; }
button { cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.check { flex-direction: row; align-items: center; color: var(--text); font-size: 14px; }
.msg { font-size: 12px; color: var(--muted); min-height: 1em; }
.nav { display: flex; align-items: center; gap: 8px; padding: 12px 16px; }
.nav .week { font-weight: 600; min-width: 260px; text-align: center; }
main { padding: 0 16px 24px; overflow-x: auto; }
.grid { display: grid; min-width: 760px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
.dayhead { padding: 8px; border-bottom: 1px solid var(--line); border-left: 1px solid var(--line); font-weight: 600; font-size: 13px; }
.dayhead small { display: block; font-weight: 400; color: var(--muted); }
.daynote { margin-top: 4px; font-size: 11px; font-weight: 500; color: var(--warn); background: var(--warn-bg); padding: 2px 6px; border-radius: 4px; }
.times { position: relative; }
.times div { position: absolute; right: 6px; font-size: 11px; color: var(--muted); transform: translateY(-50%); }
.col { position: relative; border-left: 1px solid var(--line); }
.col .hr { position: absolute; left: 0; right: 0; border-top: 1px dashed var(--line); }
.ev { position: absolute; border-radius: 5px; padding: 3px 5px; overflow: hidden; font-size: 11px; line-height: 1.25;
      color: #111; border: 1px solid rgba(0,0,0,.18); cursor: pointer; }
.ev b { display: block; font-size: 11.5px; }
.ev .meta { opacity: .8; }
.ev.cancelled { opacity: .45; text-decoration: line-through;
  background-image: repeating-linear-gradient(135deg, transparent 0 6px, rgba(0,0,0,.12) 6px 12px) !important; }
.ev .badge { display: inline-block; text-decoration: none; font-weight: 700; font-size: 10px; padding: 0 4px; border-radius: 3px;
  background: #b42318; color: #fff; margin-bottom: 2px; }
.cancel-box { margin: 10px 0; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
.cancel-box input[type=text] { flex: 1; min-width: 200px; }
.empty { padding: 24px; color: var(--muted); }
aside { margin: 16px; padding: 12px 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
aside h2 { font-size: 14px; margin: 0 0 8px; }
aside ul { margin: 4px 0; padding-left: 18px; }
aside .src { font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted); }
</style>
</head>
<body>
<header>
  <h1 id="title"></h1>
  <div class="controls">
    <span id="groups" class="controls"></span>
    <span id="optional"></span>
    <button id="ics" class="primary">Pobierz .ics</button>
  </div>
  <div class="msg" id="msg"></div>
</header>
<div class="nav">
  <button id="prev">‹</button><span class="week" id="week"></span><button id="next">›</button>
  <button id="first">Pierwszy tydzień</button>
</div>
<main><div class="grid" id="grid"></div></main>
<aside id="details"><h2>Szczegóły</h2><div class="msg">Kliknij zajęcia, żeby zobaczyć szczegóły.</div></aside>
<aside id="unresolved"></aside>
<script>
const DATA = __DATA__;
const DAY_NAMES = ["Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota","Niedziela"];
const START_H = 8, END_H = 20;
const state = { groups: {}, optional: new Set(), monday: null, marks: {} };
// Manual "cancelled" marks live only in this browser (demo convenience, keyed by event id).
const MARKS_KEY = "ur-timetable-marks:" + DATA.title;
function loadMarks() { try { return JSON.parse(localStorage.getItem(MARKS_KEY)) || {}; } catch { return {}; } }
function saveMarks() { try { localStorage.setItem(MARKS_KEY, JSON.stringify(state.marks)); } catch {} }
const isCancelled = e => !!state.marks[e.id]?.cancelled;

const $ = id => document.getElementById(id);
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const parseISO = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
const fmt = d => `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function textOn(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? "#fff" : "#111";
}

function attends(e) {
  if (DATA.optional.includes(e.subject) && !state.optional.has(e.subject)) return false;
  if (e.partition === null || e.partition === 1) return true;
  return state.groups[String(e.partition)] === e.group;
}
const myEvents = () => DATA.events.filter(attends).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

function buildControls() {
  $("title").textContent = DATA.title;
  const g = $("groups");
  for (const p of DATA.partitions) {
    const opts = ['<option value="">–</option>'].concat([...Array(Number(p))].map((_, i) => `<option>${i + 1}</option>`));
    g.insertAdjacentHTML("beforeend", `<label>Zajęcia w ${p} grupach<select data-p="${p}">${opts.join("")}</select></label>`);
  }
  g.querySelectorAll("select").forEach(s => s.addEventListener("change", () => {
    state.groups[s.dataset.p] = s.value ? Number(s.value) : undefined; saveSelection(); render();
  }));
  for (const name of DATA.optional) {
    $("optional").insertAdjacentHTML("beforeend", `<label class="check"><input type="checkbox" data-s="${esc(name)}"> ${esc(name)}</label>`);
  }
  $("optional").querySelectorAll("input").forEach(c => c.addEventListener("change", () => {
    c.checked ? state.optional.add(c.dataset.s) : state.optional.delete(c.dataset.s); saveSelection(); render();
  }));
  $("prev").addEventListener("click", () => { state.monday = addDays(state.monday, -7); render(); });
  $("next").addEventListener("click", () => { state.monday = addDays(state.monday, 7); render(); });
  $("first").addEventListener("click", () => { state.monday = firstMonday(); render(); });
  $("ics").addEventListener("click", downloadIcs);
}

// The chosen groups live in the link (?gr=2:1,3:2&opt=0) and in this browser, so a student sets them once.
const PREFS_KEY = "ur-timetable-prefs:" + DATA.title;
function saveSelection() {
  const gr = Object.entries(state.groups).filter(([, v]) => v).map(([p, v]) => `${p}:${v}`).join(",");
  const params = new URLSearchParams(location.search);
  gr ? params.set("gr", gr) : params.delete("gr");
  const opt = DATA.optional.map((name, i) => state.optional.has(name) ? i : null).filter(i => i !== null).join(",");
  opt ? params.set("opt", opt) : params.delete("opt");
  history.replaceState(null, "", "?" + params.toString());
  try { localStorage.setItem(PREFS_KEY, params.toString()); } catch {}
}
function loadSelection() {
  let params = new URLSearchParams(location.search);
  if (!params.get("gr")) { try { params = new URLSearchParams(localStorage.getItem(PREFS_KEY) || ""); } catch {} }
  for (const item of (params.get("gr") || "").split(",").filter(Boolean)) {
    const [p, v] = item.split(":");
    if (DATA.partitions.includes(p) && Number(v) >= 1 && Number(v) <= Number(p)) state.groups[p] = Number(v);
  }
  for (const i of (params.get("opt") || "").split(",").filter(Boolean)) if (DATA.optional[i]) state.optional.add(DATA.optional[i]);
  $("groups").querySelectorAll("select").forEach(s => { s.value = state.groups[s.dataset.p] ?? ""; });
  $("optional").querySelectorAll("input").forEach(c => { c.checked = state.optional.has(c.dataset.s); });
}

function firstMonday() {
  const dates = DATA.events.map(e => e.date).sort();
  return mondayOf(parseISO(dates[0]));
}

function layoutDay(events) {
  // Overlapping events share the column width.
  const sorted = [...events].sort((a, b) => toMin(a.start) - toMin(b.start));
  const clusters = []; let cur = [], end = -1;
  for (const e of sorted) {
    if (toMin(e.start) >= end && cur.length) { clusters.push(cur); cur = []; }
    cur.push(e); end = Math.max(end, toMin(e.end));
  }
  if (cur.length) clusters.push(cur);
  for (const c of clusters) {
    const lanes = [];
    for (const e of c) {
      let i = lanes.findIndex(l => toMin(l) <= toMin(e.start));
      if (i < 0) { i = lanes.length; lanes.push(e.end); } else lanes[i] = e.end;
      e._lane = i;
    }
    c.forEach(e => e._lanes = lanes.length);
  }
  return sorted;
}

function render() {
  const mon = state.monday, sun = addDays(mon, 6);
  $("week").textContent = `${fmt(mon)} – ${fmt(addDays(mon, 4))}`;
  const mine = myEvents();
  const inWeek = mine.filter(e => e.date >= iso(mon) && e.date <= iso(sun));
  const hasWeekend = DATA.events.some(e => parseISO(e.date).getDay() % 6 === 0);
  const days = [...Array(hasWeekend ? 7 : 5)].map((_, i) => addDays(mon, i));
  const H = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hour"));
  const height = (END_H - START_H) * H;
  const grid = $("grid");
  grid.style.gridTemplateColumns = `48px repeat(${days.length}, 1fr)`;
  let html = '<div class="dayhead"></div>';
  for (const d of days) {
    const notes = DATA.dayNotes.filter(n => n.date === iso(d));
    const uniq = [...new Set(notes.map(n => n.text))];
    html += `<div class="dayhead">${DAY_NAMES[(d.getDay() + 6) % 7]}<small>${fmt(d)}</small>${uniq.map(t => `<div class="daynote">${esc(t)}</div>`).join("")}</div>`;
  }
  html += `<div class="times" style="height:${height}px">` + [...Array(END_H - START_H + 1)].map((_, i) => `<div style="top:${i * H}px">${START_H + i}:00</div>`).join("") + "</div>";
  for (const d of days) {
    const evs = layoutDay(inWeek.filter(e => e.date === iso(d)));
    html += `<div class="col" style="height:${height}px">` + [...Array(END_H - START_H)].map((_, i) => `<div class="hr" style="top:${i * H}px"></div>`).join("");
    for (const e of evs) {
      const top = (toMin(e.start) - START_H * 60) / 60 * H, h = (toMin(e.end) - toMin(e.start)) / 60 * H;
      const w = 100 / e._lanes, left = e._lane * w;
      const grp = e.partition > 1 ? ` · gr. ${e.group}/${e.partition}` : "";
      const kind = e.kind === "lecture" ? "wykład" : e.kind === "class" ? "ćw." : "";
      const mark = state.marks[e.id];
      const badge = isCancelled(e) ? `<span class="badge">ODWOŁANE${mark.note ? ": " + esc(mark.note) : ""}</span>` : "";
      html += `<div class="ev${isCancelled(e) ? " cancelled" : ""}" data-id="${e.id}" style="top:${top}px;height:${h - 2}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px);background:${e.color};color:${textOn(e.color)}">`
        + `${badge}<b>${esc(e.title)}</b><span class="meta">${e.start}–${e.end} · ${esc(kind)}${grp}<br>${esc(e.room || "")}</span></div>`;
    }
    html += "</div>";
  }
  grid.innerHTML = html;
  grid.querySelectorAll(".ev").forEach(el => el.addEventListener("click", () => showDetails(DATA.events.find(e => e.id === el.dataset.id))));
  const chosen = Object.values(state.groups).filter(Boolean).length;
  $("msg").textContent = chosen < DATA.partitions.length
    ? "Wybierz swoje grupy. Bez wybranej grupy widać tylko zajęcia wspólne."
    : "Wybór grup jest zapisany w linku – możesz go dodać do zakładek.";
  renderUnresolved();
}

function showDetails(e) {
  const rows = [
    ["Termin", `${fmt(parseISO(e.date))}, ${e.start}–${e.end}`],
    ["Rodzaj", e.kind === "lecture" ? "wykład" : e.kind === "class" ? "ćwiczenia" : "inne"],
    ["Grupa", e.partition > 1 ? `${e.group} z ${e.partition}` : "wszyscy"],
    ["Sala", e.room || "–"], ["Prowadzący", e.lecturer || "–"],
  ];
  const mark = state.marks[e.id] || {};
  $("details").innerHTML = `<h2>${esc(e.title)}</h2><ul>${rows.map(([k, v]) => `<li><b>${k}:</b> ${esc(v)}</li>`).join("")}</ul>`
    + `<div class="cancel-box"><label class="check"><input type="checkbox" id="cancelled" ${mark.cancelled ? "checked" : ""}> Odwołane</label>`
    + `<input type="text" id="cancelNote" placeholder="Powód / uwaga (opcjonalnie)" value="${esc(mark.note || "")}"></div>`
    + (e.notes.length ? `<b>Uwagi:</b><ul>${e.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : "")
    + (e.warnings.length ? `<b>Ostrzeżenia parsera:</b><ul>${e.warnings.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : "")
    + `<div class="src">PDF: ${esc(e.source.text)} (str. ${e.source.page})</div>`;
  const update = () => {
    const cancelled = $("cancelled").checked, note = $("cancelNote").value.trim();
    if (cancelled || note) state.marks[e.id] = { cancelled, note }; else delete state.marks[e.id];
    saveMarks(); render();
  };
  $("cancelled").addEventListener("change", update);
  $("cancelNote").addEventListener("change", update);
}

function renderUnresolved() {
  const u = DATA.unresolved;
  $("unresolved").hidden = !u.length;
  $("unresolved").innerHTML = u.length
    ? `<h2>Nie pokazano (${u.length}) – parser nie był pewien</h2><ul>${u.map(e => `<li>${fmt(parseISO(e.date))} ${e.start}–${e.end} ${esc(e.title)}: ${esc(e.errors.join("; "))}</li>`).join("")}</ul>`
    : "";
}

function icsEscape(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
function downloadIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ur-timetable demo//PL", "X-WR-CALNAME:Plan zajęć (demo)", "X-WR-TIMEZONE:Europe/Warsaw",
    "BEGIN:VTIMEZONE", "TZID:Europe/Warsaw",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
    "END:VTIMEZONE"];
  const local = (d, t) => d.replace(/-/g, "") + "T" + t.replace(":", "") + "00";
  for (const e of myEvents()) {
    const kind = e.kind === "lecture" ? " (wykład)" : e.kind === "class" ? " (ćwiczenia)" : "";
    const mark = state.marks[e.id] || {};
    const cancelled = isCancelled(e);
    const desc = [cancelled ? "ODWOŁANE" + (mark.note ? ": " + mark.note : "") : (mark.note || ""),
      e.partition > 1 ? `Grupa ${e.group}/${e.partition}` : "", e.lecturer || "", ...e.notes].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", `UID:${e.id}@ur-timetable`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Warsaw:${local(e.date, e.start)}`, `DTEND;TZID=Europe/Warsaw:${local(e.date, e.end)}`,
      `SUMMARY:${icsEscape((cancelled ? "ODWOŁANE: " : "") + e.title + kind)}`, ...(e.room ? [`LOCATION:${icsEscape(e.room)}`] : []),
      ...(cancelled ? ["TRANSP:TRANSPARENT"] : []),
      `DESCRIPTION:${icsEscape(desc)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "plan-zajec.ics"; a.click();
  URL.revokeObjectURL(a.href);
}

state.marks = loadMarks();
buildControls();
state.monday = firstMonday();
loadSelection();
const params = new URLSearchParams(location.search);
if (params.get("week")) { state.monday = mondayOf(parseISO(params.get("week"))); }
render();
</script>
</body>
</html>
"""
