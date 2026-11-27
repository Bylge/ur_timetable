// Screens for review at phone (Redmi Note 14) and desktop size, with the clock fixed to chosen moments,
// plus layout and behaviour checks (no sideways scrolling, one-line titles, themes, sheets, Terminy, first paint,
// skeleton, offline, other phone sizes). Screenshots go to docs/screenshots/m3/<project>-<name>.png.

import { expect, test, type Page } from "@playwright/test";

const TT = "dietetyka/I-st_ST_rok-1";
const GROUPS = "2:1,3:1,4:1,5:1";
const OUT = "../docs/screenshots/m3";
// The real changes between the 02.10 and 13.10 versions of the PDF (the published history starts at 13.10).
const CHANGES = "e2e/fixtures/changes.json"; // relative to web/

/**
 * Fix the clock, and make the published index look like it was checked shortly before (so the status
 * shows what a student would normally see). `status` simulates a problem state.
 */
async function at(page: Page, warsawTime: string, opts: { checkedHoursAgo?: number; status?: string } = {}) {
  const time = new Date(warsawTime);
  await page.clock.setFixedTime(time);
  const checked = new Date(time.getTime() - (opts.checkedHoursAgo ?? 0.7) * 3_600_000).toISOString();
  await page.route("**/data/index.json", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    for (const t of Object.values<Record<string, unknown>>(json.timetables)) {
      t.checked_at = checked;
      if (opts.status && t.published_sha256) t.status = opts.status;
    }
    await route.fulfill({ response, json });
  });
}

async function shot(page: Page, name: string) {
  const project = test.info().project.name;
  await page.waitForTimeout(350); // let entry animations finish
  // Phone: exactly one screen, as a student sees it. Desktop: the whole page.
  await page.screenshot({ path: `${OUT}/${project}-${name}.png`, fullPage: project === "desktop" });
}

function plan(groups = GROUPS) {
  return `/?t=${encodeURIComponent(TT)}&gr=${groups}`;
}

const phone = () => test.info().project.name === "phone";

/** Dzień, Tydzień or Terminy: the pill on a phone, the switch in the header on a computer. */
async function tab(page: Page, name: "day" | "week" | "terms") {
  await page.locator(`[data-action="tab"][data-tab="${name}"]`).first().click();
}

/** "Twoje grupy" through the menu (the plan card's "Zmień"). */
async function openGroups(page: Page) {
  await page.getByRole("button", { name: /^Menu/ }).click();
  await page.locator(".pc-main").click();
}

/** Entries in Terminy, as if the student had added them. */
async function withTerms(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("terms-seeded")) return;
    sessionStorage.setItem("terms-seeded", "1");
    localStorage.setItem(
      "planur:terms:v1",
      JSON.stringify([
        { id: "a", type: "kolokwium", subject: "Chemia żywności", date: "2026-12-03", time: "08:45", room: "D3.136", note: "Rozdziały 1–4" },
        { id: "b", type: "zadanie", subject: "Język angielski", date: "2026-11-27", time: "", room: "", note: "Esej, 250 słów" },
        { id: "c", type: "egzamin", subject: "Anatomia człowieka", date: "2027-01-28", time: "09:00", room: "Aula A1", note: "" },
        { id: "d", type: "kolokwium", subject: "Anatomia człowieka", date: "2026-11-18", time: "13:15", room: "E7.033", note: "" },
      ]),
    );
  });
}

test("first visit: pick a timetable", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Wybierz swój plan" })).toBeVisible();
  await shot(page, "01-picker");
  await page.getByRole("button", { name: /Studia I stopnia · stacjonarne · rok 1/ }).click();
  await expect(page.getByRole("heading", { name: "Twoje grupy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pokaż plan" })).toBeDisabled();
  await page.locator('[data-split="2"][data-group="1"]').click();
  await page.locator('[data-split="3"][data-group="2"]').click();
  await shot(page, "02-groups-partial");
  await page.locator('[data-split="4"][data-group="2"]').click();
  await page.locator('[data-split="5"][data-group="3"]').click();
  await expect(page.getByText(/zajęć w semestrze/)).toBeVisible();
  await shot(page, "03-groups-complete");
  await page.getByRole("button", { name: "Pokaż plan" }).click();
  await expect(page).toHaveURL(/gr=2%3A1%2C3%3A2%2C4%3A2%2C5%3A3|gr=2:1,3:2,4:2,5:3/);
  // a phone opens on the day, a computer on the week
  await expect(page.locator(phone() ? ".app.tab-day" : ".app.tab-week")).toBeVisible();
});

test("weekday with classes (Wed 14.10, 10:00)", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan());
  if (phone()) await expect(page.getByRole("heading", { name: "Środa, 14 października" })).toBeVisible();
  else await expect(page.getByRole("heading", { name: "Październik 2026" })).toBeVisible();
  await expect(page.locator(".nowline")).toHaveCount(1);
  await shot(page, "10-weekday-morning");
  if (!phone()) {
    await tab(page, "day");
    await expect(page.getByRole("heading", { name: "Środa, 14 października" })).toBeVisible();
    await shot(page, "10b-day");
  }
});

test("evening after classes: the next class day under the picker (Wed 14.10, 19:30)", async ({ page }) => {
  await at(page, "2026-10-14T19:30:00+02:00");
  await page.goto(plan());
  await tab(page, "day");
  const next = page.locator(".next-card");
  await expect(next).toContainText("Następne zajęcia · czw. 15.10");
  await shot(page, "11-evening-card");
  await next.click();
  await expect(page.getByRole("heading", { name: "Czwartek, 15 października" })).toBeVisible();
  await expect(page.locator(".next-card")).toHaveCount(0); // only on today
  await shot(page, "12-evening-next-day");
});

test("weekend (Sat 17.10, 11:00)", async ({ page }) => {
  await at(page, "2026-10-17T11:00:00+02:00");
  await page.goto(plan());
  await tab(page, "day");
  await expect(page.locator(".empty-day")).toContainText("Brak zajęć");
  await expect(page.locator(".next-card")).toContainText("pon. 19.10");
  await shot(page, "13-weekend");
});

test("holiday (Wed 11.11, 10:00)", async ({ page }) => {
  await at(page, "2026-11-11T10:00:00+01:00");
  await page.goto(plan());
  await tab(page, "day");
  await expect(page.locator(".empty-day")).toContainText("Niepodległości");
  await shot(page, "14-holiday");
});

test("status: not checked for a long time", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00", { checkedHoursAgo: 20 });
  await page.goto(plan());
  await expect(page.locator(".kicker.status-stale")).toBeVisible();
  await shot(page, "30-status-stale");
});

test("status: the last check failed", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00", { status: "failed" });
  await page.goto(plan());
  await expect(page.locator(".banner-problem")).toBeVisible();
  await expect(page.locator(".kicker.status-problem")).toBeVisible();
  await shot(page, "31-status-problem");
});

test("week view and details (Wed 14.10, 10:00)", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan());
  await tab(page, "week");
  if (phone()) await expect(page.locator(".week-compact")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Październik 2026" })).toBeVisible();
  await shot(page, "20-week");
  await page.locator(".block").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "21-details");
  await page.keyboard.press("Escape");
  await page.locator(".kicker").click();
  await expect(page.getByRole("dialog", { name: "Skąd jest ten plan?" })).toBeVisible();
  await shot(page, "22-info");
});

test("week: other weeks, back to this one, a day from the week (Wed 14.10, 10:00)", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan());
  await tab(page, "week");
  await expect(page.locator(".today-btn")).toHaveCount(0);
  await page.locator(".wk-arrow-r").click();
  await expect(page.locator(".wk-head").first()).toContainText("19");
  await expect(page.getByRole("button", { name: "Wróć do tego tygodnia" })).toBeVisible();
  await shot(page, "23-week-next");
  await page.getByRole("button", { name: "Wróć do tego tygodnia" }).click();
  await expect(page.locator(".wk-head.today")).toHaveCount(1);
  // a day's name opens that day
  await page.locator(".wk-head").nth(3).click();
  await expect(page.getByRole("heading", { name: "Czwartek, 15 października" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wróć do dziś" })).toBeVisible();
  await page.getByRole("button", { name: "Wróć do dziś" }).click();
  await expect(page.getByRole("heading", { name: "Środa, 14 października" })).toBeVisible();
});

test("day arrows go a day at a time, past Friday to Monday (Thu 15.10)", async ({ page }) => {
  await at(page, "2026-10-15T10:00:00+02:00");
  await page.goto(plan());
  await tab(page, "day");
  await page.getByRole("button", { name: "Następny dzień" }).click();
  await expect(page.getByRole("heading", { name: "Piątek, 16 października" })).toBeVisible();
  await page.getByRole("button", { name: "Następny dzień" }).click();
  await expect(page.getByRole("heading", { name: "Poniedziałek, 19 października" })).toBeVisible();
  await page.getByRole("button", { name: "Poprzedni dzień" }).click();
  await expect(page.getByRole("heading", { name: "Piątek, 16 października" })).toBeVisible();
});

test("the pill's highlight sits under the chosen view", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan());
  const bar = phone() ? ".pill" : ".navseg";
  for (const t of ["week", "terms", "day"] as const) {
    await tab(page, t);
    await page.waitForTimeout(450); // the slide
    const [ind, on] = await Promise.all([page.locator(`${bar} .ind`).boundingBox(), page.locator(`${bar} button.on`).boundingBox()]);
    expect(Math.abs(ind!.x - on!.x), t).toBeLessThan(1.5);
    expect(Math.abs(ind!.width - on!.width), t).toBeLessThan(1.5);
  }
  // redraws that don't change the view (a new week, the menu) must not slide it in from "Dzień": it's there at once
  await tab(page, "week");
  await page.waitForTimeout(450);
  const atOnce = async (what: string) => {
    const [ind, on] = await Promise.all([page.locator(`${bar} .ind`).boundingBox(), page.locator(`${bar} button.on`).boundingBox()]);
    expect(Math.abs(ind!.x - on!.x), what).toBeLessThan(1.5);
  };
  await page.locator(".wk-arrow-r").click();
  await atOnce("after the next week");
  await page.getByRole("button", { name: /^Menu/ }).click();
  await atOnce("with the menu open");
});

test("the phone's pill is made once: not rebuilt on a new day or with the menu (no flicker)", async ({ page }) => {
  test.skip(!phone(), "phone only");
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan());
  await tab(page, "day");
  await page.evaluate(() => ((window as unknown as { pill: Element }).pill = document.querySelector(".pill")!));
  const same = () => page.evaluate(() => document.querySelector(".pill") === (window as unknown as { pill: Element }).pill);
  await page.getByRole("button", { name: "Następny dzień" }).click();
  expect(await same()).toBe(true);
  await page.getByRole("button", { name: /^Menu/ }).click();
  expect(await same()).toBe(true);
  await page.locator(".pc-main").click(); // Twoje grupy: no pill there
  await expect(page.locator(".pill")).toHaveCount(0);
});

test("desktop: the header stays in place when switching views", async ({ page }) => {
  test.skip(phone(), "computer only");
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan());
  const where = async () => {
    const [menu, title] = await Promise.all([page.locator(".menubtn").boundingBox(), page.locator(".top .title").boundingBox()]);
    return { menu: Math.round(menu!.x), title: Math.round(title!.x) };
  };
  await tab(page, "week");
  const week = await where();
  await tab(page, "day");
  expect(await where()).toEqual(week);
  await tab(page, "terms");
  expect(await where()).toEqual(week);
});

test("the Odwołane switch sits beside its text (Thu 15.10, 9:00)", async ({ page }) => {
  await at(page, "2026-10-15T09:00:00+02:00");
  await page.goto(plan());
  await tab(page, "day");
  await page.locator(".block").first().click();
  const [track, text] = await Promise.all([page.locator(".mark .toggle-track").boundingBox(), page.locator(".mark .toggle-text").boundingBox()]);
  expect(track!.x + track!.width).toBeLessThanOrEqual(text!.x);
});

/** Pretend the student last saw the 02.10 version, and the 13.10 update brought the real changes. */
async function withChanges(page: Page) {
  await page.route("**/changes.json", (route) => route.fulfill({ path: CHANGES }));
  await page.addInitScript((tt) => {
    // once per test, not on every navigation
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("planur:seen:v1", JSON.stringify({ [tt]: "old" }));
  }, TT);
}

test("changes since the last visit (Wed 14.10, 10:00)", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await withChanges(page);
  await page.goto(plan());
  await expect(page.locator(".banner-changes")).toContainText("8 zmian w Twoich zajęciach");
  await expect(page.locator(".menubtn.has-badge")).toBeVisible();
  await shot(page, "40-changes-banner");
  await page.locator(".banner-main").click();
  await expect(page.getByRole("heading", { name: "Zmiany w planie" })).toBeVisible();
  await shot(page, "41-changes");
  await page.locator(".ch-others summary").click();
  await page.locator(".ch-others").scrollIntoViewIfNeeded();
  await shot(page, "42-changes-others");
  // back to the plan: the banner is gone (seen)
  await page.goBack();
  await expect(page.locator(".banner-changes")).toHaveCount(0);
  // a changed class opens its day
  await page.goto(plan() + "#zmiany");
  await page.locator("button.ch-row").first().click();
  await expect(page.locator(".app.tab-day")).toBeVisible();
  await expect(page.locator(".banner-changes")).toHaveCount(0);
});

test("no changes yet", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  // the published history has real updates since 18.11: an empty one for this screen
  await page.route("**/changes.json", (route) => route.fulfill({ json: [] }));
  await page.goto(plan() + "#zmiany");
  await expect(page.getByText("Brak zmian")).toBeVisible();
  await shot(page, "43-changes-empty");
});

test("recent changes marked in the plan (Wed 25.11)", async ({ page }) => {
  // 25.11: Fizjologia moved to MS Teams in the 23.11 update (a recent change, within 14 days)
  await at(page, "2026-11-25T17:00:00+01:00");
  await page.goto(plan());
  await tab(page, "day");
  const changed = page.locator(".block.changed").first();
  await expect(changed).toContainText("Nowa sala");
  await shot(page, "16-changed");
  await changed.click();
  await expect(page.getByText(/Nowa sala, było:/)).toBeVisible();
  await shot(page, "17-changed-sheet");
});

test("mark a class as cancelled (Thu 15.10, 9:00)", async ({ page }) => {
  await at(page, "2026-10-15T09:00:00+02:00");
  await page.goto(plan());
  await tab(page, "day");
  await page.locator(".block").nth(1).click();
  await page.locator(".mark .toggle").click();
  await page.locator("#mark-note").fill("choroba prowadzącego");
  await shot(page, "50-mark-sheet");
  await page.keyboard.press("Escape");
  await expect(page.locator(".block.cancelled")).toHaveCount(1);
  await shot(page, "51-mark-plan");
  // survives a reload (localStorage)
  await page.reload();
  await expect(page.locator(".block.cancelled")).toHaveCount(1);
  await tab(page, "week");
  await expect(page.locator(".block.cancelled")).toHaveCount(1);
  await shot(page, "52-mark-week");
});

test("menu, calendar file, info pages", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan());
  await page.getByRole("button", { name: /^Menu/ }).click();
  const report = page.getByRole("link", { name: /Zgłoś błąd lub uwagę/ });
  await expect(report).toHaveAttribute("href", /^mailto:plan\.zajec\.nieoficialny@gmail\.com\?subject=.*Grupy%3A%201%20z%202/);
  await expect(page.locator(".m-version")).toContainText(/wersja \d+\.\d+\.\d+ \(demo\)/);
  await shot(page, "60-menu");
  await page.getByRole("button", { name: /Dodaj do kalendarza/ }).click();
  await expect(page.getByRole("dialog", { name: "Pobrać plik kalendarza?" })).toBeVisible();
  await shot(page, "60b-ics-confirm");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz plik" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("plan-dietetyka-I-st_ST_rok-1.ics");
  await expect(page.getByRole("dialog", { name: "Plik kalendarza pobrany" })).toBeVisible();
  await shot(page, "61-ics");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Menu/ }).click();
  await page.getByRole("button", { name: "O projekcie" }).click();
  await expect(page.getByRole("heading", { name: "O projekcie" })).toBeVisible();
  await expect(page).toHaveURL(/#o-projekcie/);
  await shot(page, "62-about");
  await page.goBack();
  await expect(page.locator(".app")).toBeVisible();
  await page.goto(plan() + "#prywatnosc");
  await expect(page.getByRole("heading", { name: "Prywatność" })).toBeVisible();
  await shot(page, "63-privacy");
});

test("share: QR code, with and without groups", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan());
  await page.getByRole("button", { name: /^Menu/ }).click();
  await page.getByRole("button", { name: /Udostępnij stronę/ }).click();
  const dialog = page.getByRole("dialog", { name: "Udostępnij stronę" });
  await expect(dialog.locator(".qr-code svg")).toBeVisible();
  await expect(dialog.getByText("bylge.github.io/ur_timetable")).toBeVisible();
  await shot(page, "66-share");
  await dialog.getByRole("button", { name: "Z moimi grupami" }).click();
  await expect(dialog.getByText(/grupy 1 z 2 · 1 z 3 · 1 z 4 · 1 z 5/)).toBeVisible();
  await expect(dialog.locator(".qr-code svg")).toBeVisible();
  await shot(page, "67-share-groups");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Pobierz kod QR" }).click();
  expect((await download).suggestedFilename()).toBe("plan-zajec-ur-moje-grupy-qr.png");
});

test("WF at the student's own hour (Tue 13.10, 7:00)", async ({ page }) => {
  await at(page, "2026-10-13T07:00:00+02:00");
  await page.goto(plan());
  await tab(page, "day");
  const wf = page.locator(".block", { hasText: "Wychow" }).first();
  await expect(wf).toHaveAttribute("aria-label", /8:30–10:15/);
  await wf.click();
  await page.locator("#wf-start").fill("11:45");
  await expect(page.locator(".wf-end")).toHaveText("do 13:30");
  await expect(page.getByRole("button", { name: /Cofnij/ })).toBeVisible();
  await shot(page, "68-wf-sheet");
  await page.keyboard.press("Escape");
  await expect(wf).toHaveAttribute("aria-label", /11:45–13:30/);
  await expect(page).toHaveURL(/wf=1145/); // kept after the sheet closed, so a reload or bookmark keeps it
  await shot(page, "69-wf-moved");
  await page.reload();
  await expect(page.locator(".block", { hasText: "Wychow" }).first()).toHaveAttribute("aria-label", /11:45–13:30/);
  // back to the PDF's hour from the groups screen
  await openGroups(page);
  await expect(page.getByText(/W planie WF jest o 8:30–10:15/)).toBeVisible();
  await page.getByRole("button", { name: /Cofnij/ }).click();
  await expect(page.locator("#wf-start")).toHaveValue("08:30");
  await page.getByRole("button", { name: "Pokaż plan" }).click();
  await expect(page.locator(".block", { hasText: "Wychow" }).first()).toHaveAttribute("aria-label", /8:30–10:15/);
  await expect(page).not.toHaveURL(/wf=/);
});

test("back gesture returns from Twoje grupy and the plan picker", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto("about:blank");
  await page.goto(plan());
  const groups = page.getByRole("heading", { name: "Twoje grupy" });
  const onPlan = page.locator(".app");
  // menu -> groups -> back: the menu's entry became the groups screen's, so one back is the plan
  await openGroups(page);
  await expect(groups).toBeVisible();
  await page.goBack();
  await expect(onPlan).toBeVisible();
  // groups -> picker -> back -> back
  await openGroups(page);
  await page.getByRole("button", { name: /zmień/ }).click();
  await expect(page.getByRole("heading", { name: "Wybierz swój plan" })).toBeVisible();
  await page.goBack();
  await expect(groups).toBeVisible();
  await page.goBack();
  await expect(onPlan).toBeVisible();
  // saving uses the entry up: the next back leaves the site, it doesn't reopen the groups screen
  await openGroups(page);
  await page.getByRole("button", { name: "Pokaż plan" }).click();
  await expect(onPlan).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL("about:blank");
});

test("day view: an hour before the first class, filled to the pill, swipe anywhere (Mon 23.11)", async ({ page }) => {
  test.skip(!phone(), "phone only");
  // Mon 23.11, groups 1: classes 13:15–19:15 -> the day starts at 12:00, the timeline ends just above the pill
  await at(page, "2026-11-23T08:00:00+01:00");
  await page.goto(plan());
  await tab(page, "day");
  await expect(page.locator(".day .axis span").first()).toHaveText("12:00");
  const fit = await page.evaluate(() => {
    const timeline = document.querySelector(".day .timeline")!.getBoundingClientRect();
    const pill = document.querySelector(".pill")!.getBoundingClientRect();
    return { gap: pill.top - timeline.bottom };
  });
  expect(fit.gap).toBeGreaterThanOrEqual(0);
  expect(fit.gap).toBeLessThan(54 + 14 + 12);
  await shot(page, "18-day-fill");
  const area = page.locator(".content .wrap");
  const box = (await area.boundingBox())!;
  await area.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: box.x + 300, clientY: box.y + 40 }] });
  await area.dispatchEvent("touchend", { changedTouches: [{ identifier: 0, clientX: box.x + 100, clientY: box.y + 42 }] });
  await expect(page.getByRole("heading", { name: "Wtorek, 24 listopada" })).toBeVisible();
});

test("swipe works on an empty day too, in the blank space (Fri 27.11)", async ({ page }) => {
  test.skip(!phone(), "phone only");
  await at(page, "2026-11-27T10:00:00+01:00");
  await page.goto(plan());
  await tab(page, "day");
  await expect(page.locator(".empty-day")).toBeVisible();
  // well below the "Brak zajęć" box: plain background
  const app = page.locator(".app");
  const y = 640;
  await app.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 320, clientY: y }] });
  await app.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: 200, clientY: y + 2 }] });
  await app.dispatchEvent("touchend", { changedTouches: [{ identifier: 0, clientX: 90, clientY: y + 3 }] });
  await expect(page.getByRole("heading", { name: "Poniedziałek, 30 listopada" })).toBeVisible();
  // a short swipe bounces back: same day
  await app.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 300, clientY: y }] });
  await app.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: 270, clientY: y }] });
  await app.dispatchEvent("touchend", { changedTouches: [{ identifier: 0, clientX: 265, clientY: y }] });
  await expect(page.getByRole("heading", { name: "Poniedziałek, 30 listopada" })).toBeVisible();
});

test("week: short names, rooms, the class in progress, fits the screen (Wed 25.11, 12:00)", async ({ page }) => {
  test.skip(!phone(), "phone only");
  await at(page, "2026-11-25T12:00:00+01:00");
  await page.goto(plan());
  await tab(page, "week");
  const now = page.locator(".block.now");
  await expect(now).toHaveCount(1);
  await expect(now).toContainText("Biochemia");
  await expect(now).toContainText("D3.241");
  await expect(now).toHaveAttribute("aria-label", /^Teraz: Biochemia ogólna i żywności/);
  // the whole week fits the Redmi's screen above the pill (hours shrink a little if needed, not below 32 px)
  const fit = await page.evaluate(() => ({
    gap: document.querySelector(".pill")!.getBoundingClientRect().top - document.querySelector(".wk-body")!.getBoundingClientRect().bottom,
    hour: document.querySelector<HTMLElement>(".week-compact .axis span:nth-child(2)")!.offsetTop,
  }));
  expect(fit.gap).toBeGreaterThanOrEqual(0);
  expect(fit.hour).toBeGreaterThanOrEqual(32);
  await shot(page, "21-week-now");
});

test("Terminy: empty, add, see it in the plan, edit, delete (Wed 25.11)", async ({ page }) => {
  await at(page, "2026-11-25T12:00:00+01:00");
  await page.goto(plan());
  await tab(page, "terms");
  await expect(page.getByRole("heading", { name: "Brak terminów" })).toBeVisible();
  await shot(page, "24-terms-empty");
  // add a test on Friday
  await page.getByRole("button", { name: "Dodaj pierwszy termin" }).click();
  const form = page.getByRole("dialog", { name: "Dodaj termin" });
  await expect(form.getByRole("button", { name: "Zapisz" })).toBeDisabled();
  await form.getByRole("button", { name: "Kolokwium" }).click();
  await form.locator('[data-subject="Chemia żywności"]').click();
  await form.locator('[data-field="date"]').fill("2026-11-27");
  await form.locator('[data-field="time"]').fill("10:00");
  await form.locator('[data-field="room"]').fill("D3.136");
  await shot(page, "25-term-form");
  await form.getByRole("button", { name: "Zapisz" }).click();
  await expect(page.locator(".t-hero")).toContainText("pojutrze");
  await expect(page.locator(".t-hero")).toContainText("Chemia żywności");
  await expect(page.locator('[data-action="tab"][data-tab="terms"] .badge').first()).toHaveText("1");
  // in the plan: a dot on Friday, a row on the day, a line in the week
  await tab(page, "day");
  await expect(page.locator('.daytab[data-date="2026-11-27"] .term-dot')).toHaveCount(1);
  await page.locator('.daytab[data-date="2026-11-27"]').click();
  await expect(page.locator(".day-term")).toContainText("Chemia żywności");
  await tab(page, "week");
  await expect(page.locator(".wk-term.t-kolokwium")).toHaveText("Kolokwium");
  // survives a reload; edit; delete takes two taps
  await page.reload();
  await tab(page, "terms");
  await page.locator(".t-hero").click();
  await page.getByRole("button", { name: "Edytuj" }).click();
  await page.getByRole("dialog", { name: "Edytuj termin" }).getByRole("button", { name: "Egzamin" }).click();
  await page.getByRole("dialog", { name: "Edytuj termin" }).getByRole("button", { name: "Zapisz" }).click();
  await expect(page.locator(".t-hero .tchip")).toHaveText("Egzamin");
  await page.locator(".t-hero").click();
  await page.getByRole("button", { name: "Usuń" }).click();
  await expect(page.getByRole("button", { name: "Na pewno usunąć?" })).toBeVisible();
  await page.getByRole("button", { name: "Na pewno usunąć?" }).click();
  await expect(page.getByRole("heading", { name: "Brak terminów" })).toBeVisible();
});

test("Terminy: the list, past entries folded, details (Wed 25.11)", async ({ page }) => {
  await at(page, "2026-11-25T12:00:00+01:00");
  await withTerms(page);
  await page.goto(plan());
  await tab(page, "terms");
  await expect(page.locator(".t-hero")).toContainText("Język angielski");
  await expect(page.locator(".t-row:not(.past)")).toHaveCount(2);
  await expect(page.locator(".t-row.past")).toHaveCount(0);
  await shot(page, "26-terms");
  await page.getByRole("button", { name: /Minione \(1\)/ }).click();
  await expect(page.locator(".t-row.past")).toHaveCount(1);
  await page.locator(".t-row").first().click();
  await expect(page.getByRole("dialog", { name: "Chemia żywności" })).toBeVisible();
  await shot(page, "27-term-details");
  await page.getByRole("button", { name: "Pokaż ten dzień w planie" }).click();
  await expect(page.getByRole("heading", { name: "Czwartek, 3 grudnia" })).toBeVisible();
  await expect(page.locator(".day-term")).toContainText("Chemia żywności");
});

test("Co nowego: once after an update, only for returning students", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  const popup = page.getByRole("dialog", { name: /Co nowego/ });
  // first visit: nothing
  await page.goto(plan());
  await expect(page.locator(".app")).toBeVisible();
  await expect(popup).toHaveCount(0);
  // a returning student who last saw an older version: once
  await page.evaluate(() => localStorage.setItem("planur:version:v1", "0.5.0"));
  await page.reload();
  await expect(popup).toBeVisible();
  await shot(page, "19-news");
  await page.locator(".news-card").click(); // a tap anywhere closes it, also on the text
  await expect(popup).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".app")).toBeVisible();
  await expect(popup).toHaveCount(0);
});

test.describe("iPhone", () => {
  // iOS never offers an install prompt: the menu item shows the "Do ekranu początkowego" steps instead.
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  });

  test("install steps", async ({ page }) => {
    test.skip(!phone(), "phone only");
    await at(page, "2026-10-14T10:00:00+02:00");
    await page.goto(plan());
    await page.getByRole("button", { name: /^Menu/ }).click();
    await page.getByRole("button", { name: /Zainstaluj jako aplikację/ }).click();
    await expect(page.getByRole("dialog", { name: "Zainstaluj jako aplikację" })).toBeVisible();
    await expect(page.getByText("Do ekranu początkowego")).toBeVisible();
    await shot(page, "65-ios-install");
  });
});

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });
  test("weekday and details (Wed 14.10, 10:00)", async ({ page }) => {
    await at(page, "2026-10-14T10:00:00+02:00");
    await withChanges(page);
    await page.goto(plan());
    await shot(page, "70-dark");
    await page.locator(".block").first().click();
    await shot(page, "71-dark-details");
  });
});

test.describe("themes", () => {
  for (const [id, name, bg] of [
    ["roz", "Róż", "rgb(253, 228, 238)"],
    ["slonce", "Słońce", "rgb(255, 248, 236)"],
    ["polnoc", "Północ", "rgb(10, 15, 31)"],
  ] as const) {
    test(`${name}: day, week, Terminy (Wed 25.11, 12:00)`, async ({ page }) => {
      await at(page, "2026-11-25T12:00:00+01:00");
      await withTerms(page);
      await page.goto(plan());
      await page.getByRole("button", { name: /^Menu/ }).click();
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", id);
      await shot(page, `72-theme-${id}-menu`);
      await page.keyboard.press("Escape");
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(bg);
      await tab(page, "day");
      await shot(page, `73-theme-${id}-day`);
      await tab(page, "week");
      await shot(page, `74-theme-${id}-week`);
      await tab(page, "terms");
      await shot(page, `75-theme-${id}-terms`);
    });
  }
});

test.describe("offline (service worker)", () => {
  test.use({ serviceWorkers: "allow" });
  test("the plan opens without network after one visit", async ({ page, context }) => {
    test.skip(!phone(), "one device is enough");
    await page.goto(plan());
    await expect(page.locator(".pill")).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload(); // now controlled by the service worker, which caches what it serves
    await expect(page.locator(".pill")).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".pill")).toBeVisible();
    await expect(page.locator(".kicker.status-offline")).toBeVisible();
    await shot(page, "80-offline");
  });
});

test.describe("layout checks (phone)", () => {
  test.skip(({ isMobile }) => !isMobile, "phone only");

  /** The page must never get wider than the screen (sideways scrolling, jitter). */
  async function noSidewaysScroll(page: Page, when: string) {
    const width = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(width, `page wider than the screen ${when}`).toBeLessThanOrEqual(0);
  }

  test("no sideways scrolling, also while switching days and with a wide font", async ({ page }) => {
    await at(page, "2026-10-14T10:00:00+02:00");
    await page.goto(plan());
    await tab(page, "day");
    await noSidewaysScroll(page, "at rest");
    await page.locator('[data-action="pick-day"]').nth(3).click();
    await page.waitForTimeout(40);
    await noSidewaysScroll(page, "during the day animation");
    await tab(page, "week");
    await page.locator('[data-action="next-week"]').first().click();
    await page.waitForTimeout(40);
    await noSidewaysScroll(page, "during the week animation");
    // iPhone's font is wider than Windows'; Verdana is wider still. Nothing may stick out of the screen.
    await page.addStyleTag({ content: "* { font-family: Verdana, sans-serif !important; }" });
    await tab(page, "day");
    const outside = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".top *, .pill *")]
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5)
        .map((el) => el.className),
    );
    expect(outside).toEqual([]);
  });

  test("the date stays on one line (Mon 26.10, the longest weekday)", async ({ page }) => {
    await at(page, "2026-10-21T10:00:00+02:00");
    await page.goto(plan());
    await tab(page, "day");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Następny dzień" }).click(); // Thu, Fri, Mon
    const title = page.locator(".top .title");
    await expect(title).toContainText("26 października");
    const fits = await title.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits).toBe(true);
    await shot(page, "15-title-long-day");
  });

  test("theme switch is remembered", async ({ page }) => {
    await at(page, "2026-10-14T10:00:00+02:00");
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(plan());
    await page.getByRole("button", { name: /^Menu/ }).click();
    await page.getByRole("button", { name: "Ciemny", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await shot(page, "64-theme-menu-dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(15, 17, 21)");
    await page.getByRole("button", { name: /^Menu/ }).click();
    await page.getByRole("button", { name: "Auto", exact: true }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
  });

  test("sheets animate out before closing", async ({ page }) => {
    await at(page, "2026-10-14T10:00:00+02:00");
    await page.goto(plan());
    await page.getByRole("button", { name: /^Menu/ }).click();
    await expect(page.locator(".sheet-layer.enter")).toHaveCount(1);
    // the page behind an open sheet doesn't scroll (on a phone that would slide the address bar and the sheet)
    await page.mouse.move(200, 100);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.getByRole("button", { name: "Zamknij" }).click();
    await expect(page.locator(".sheet-layer.leaving")).toHaveCount(1);
    await expect(page.locator(".sheet-layer")).toHaveCount(0);
  });

  test("first paint comes before the app's script (no white screen on a slow connection)", async ({ page }) => {
    await at(page, "2026-10-14T10:00:00+02:00");
    await page.emulateMedia({ colorScheme: "dark" });
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route("**/assets/*.js", async (route) => {
      await held; // the script hasn't arrived yet
      await route.continue();
    });
    await page.goto(plan(), { waitUntil: "commit" });
    await expect(page.locator(".skel i").first()).toBeVisible();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(15, 17, 21)"); // dark theme already, not white
    await shot(page, "06-before-script");
    release();
    await expect(page.locator(".pill")).toBeVisible();
  });

  test("skeleton while the data is on its way", async ({ page }) => {
    await at(page, "2026-10-14T10:00:00+02:00");
    await page.route("**/timetable.json", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto(plan(), { waitUntil: "commit" });
    await expect(page.locator(".skel")).toBeVisible();
    await shot(page, "05-skeleton");
    await expect(page.locator(".pill")).toBeVisible({ timeout: 10_000 });
  });
});

/** Other screens than the Redmi: a 6.1" and a 6.7" iPhone, a big desktop. Nothing cut off, no sideways scrolling. */
for (const [label, width, height] of [
  ["iphone-6.1", 390, 844],
  ["iphone-6.7", 430, 932],
  ["desktop-1920", 1920, 1080],
] as const) {
  test.describe(`size ${label}`, () => {
    test.use({ viewport: { width, height } });
    test("day, week, Terminy fit (Wed 25.11, 12:00)", async ({ page }) => {
      test.skip(phone() === width >= 900, "phones on the phone project, the desktop on the desktop project");
      await at(page, "2026-11-25T12:00:00+01:00");
      await withTerms(page);
      await page.goto(plan());
      for (const t of ["day", "week", "terms"] as const) {
        await tab(page, t);
        await page.waitForTimeout(300);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${t}: wider than the screen`).toBeLessThanOrEqual(0);
        const clipped = await page.evaluate(() => {
          const t = document.querySelector<HTMLElement>(".top .title");
          return t ? t.scrollWidth > t.clientWidth + 1 : false;
        });
        expect(clipped, `${t}: title cut off`).toBe(false);
        await page.screenshot({ path: `${OUT}/${label}-${t}.png`, fullPage: width >= 900 });
      }
    });
  });
}
