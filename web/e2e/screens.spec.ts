// Screens for review at phone (Redmi Note 14) and desktop size, with the clock fixed to chosen moments,
// plus layout and behaviour checks (no sideways scrolling, one-line day header, theme, sheets, first paint,
// skeleton, offline). Screenshots go to docs/screenshots/m3/<project>-<name>.png.

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
});

test("weekday with classes (Wed 14.10, 10:00)", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan());
  if (test.info().project.name === "phone") {
    await expect(page.getByRole("heading", { name: "Środa, 14 października" })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "12–16 paź 2026" })).toBeVisible();
  }
  await expect(page.locator(".nowline")).toHaveCount(1);
  await shot(page, "10-weekday-morning");
});

test("evening after classes (Wed 14.10, 19:30)", async ({ page }) => {
  await at(page, "2026-10-14T19:30:00+02:00");
  await page.goto(plan());
  if (test.info().project.name === "phone") {
    await expect(page.getByText("Zajęcia na dziś zakończone")).toBeVisible();
    await shot(page, "11-evening-card");
    await page.locator(".nextcard").click();
    await expect(page.getByRole("heading", { name: "Czwartek, 15 października" })).toBeVisible();
    await shot(page, "12-evening-next-day");
  } else {
    await expect(page.locator(".strip")).toContainText("Zajęcia na dziś zakończone");
    await shot(page, "11-evening");
  }
});

test("weekend (Sat 17.10, 11:00)", async ({ page }) => {
  await at(page, "2026-10-17T11:00:00+02:00");
  await page.goto(plan());
  if (test.info().project.name === "phone") {
    await expect(page.getByText(/Dziś brak zajęć/)).toBeVisible();
    await expect(page.locator(".nextcard")).toContainText("poniedziałek, 19 października");
  }
  await shot(page, "13-weekend");
});

test("holiday (Wed 11.11, 10:00)", async ({ page }) => {
  await at(page, "2026-11-11T10:00:00+01:00");
  await page.goto(plan());
  if (test.info().project.name === "phone") await expect(page.locator(".nextcard")).toContainText("Niepodległości");
  await shot(page, "14-holiday");
});

test("status: not checked for a long time", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00", { checkedHoursAgo: 20 });
  await page.goto(plan());
  await expect(page.locator(".status-stale")).toBeVisible();
  await shot(page, "30-status-stale");
});

test("status: the last check failed", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00", { status: "failed" });
  await page.goto(plan());
  await expect(page.locator(".banner-problem")).toBeVisible();
  await shot(page, "31-status-problem");
});

test("week view and details (Wed 14.10, 10:00)", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan());
  if (test.info().project.name === "phone") {
    await page.getByRole("button", { name: "Tydzień", exact: true }).click();
    await expect(page.locator(".week-compact")).toBeVisible();
    await shot(page, "20-week");
  }
  await page.locator(".block").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "21-details");
  await page.keyboard.press("Escape");
  await page.locator(".status").click();
  await expect(page.getByRole("dialog", { name: "Skąd jest ten plan?" })).toBeVisible();
  await shot(page, "22-info");
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
  await expect(page.locator(".banner-changes")).toHaveCount(0);
});

test("no changes yet", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan() + "#zmiany");
  await expect(page.getByText("Brak zmian")).toBeVisible();
  await shot(page, "43-changes-empty");
});

test("mark a class as cancelled (Thu 15.10, 9:00)", async ({ page }) => {
  await at(page, "2026-10-15T09:00:00+02:00");
  await page.goto(plan());
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
  if (test.info().project.name === "phone") {
    await page.getByRole("button", { name: "Tydzień", exact: true }).click();
    await shot(page, "52-mark-week");
  }
});

test("menu, calendar file, info pages", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan());
  const phone = test.info().project.name === "phone";
  if (phone) {
    await page.getByRole("button", { name: "Menu" }).click();
    const report = page.getByRole("link", { name: /Zgłoś błąd lub uwagę/ });
    await expect(report).toHaveAttribute("href", /^mailto:plan\.zajec\.nieoficialny@gmail\.com\?subject=.*Grupy%3A%201%2F2/);
    await shot(page, "60-menu");
  }
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
  if (phone) await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "O projekcie" }).click();
  await expect(page.getByRole("heading", { name: "O projekcie" })).toBeVisible();
  await expect(page).toHaveURL(/#o-projekcie/);
  await shot(page, "62-about");
  await page.goBack();
  await expect(page.locator(".block").first()).toBeVisible();
  await page.goto(plan() + "#prywatnosc");
  await expect(page.getByRole("heading", { name: "Prywatność" })).toBeVisible();
  await shot(page, "63-privacy");
});

test("share: QR code, with and without groups", async ({ page }) => {
  await at(page, "2026-10-14T10:00:00+02:00");
  await page.goto(plan());
  if (test.info().project.name === "phone") await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Udostępnij stronę/ }).click();
  const dialog = page.getByRole("dialog", { name: "Udostępnij stronę" });
  await expect(dialog.locator(".qr-code svg")).toBeVisible();
  await expect(dialog.getByText("bylge.github.io/ur_timetable")).toBeVisible();
  await shot(page, "66-share");
  await dialog.getByRole("button", { name: "Z moimi grupami" }).click();
  await expect(dialog.getByText(/grupy 1\/2 · 1\/3 · 1\/4 · 1\/5/)).toBeVisible();
  await expect(dialog.locator(".qr-code svg")).toBeVisible();
  await shot(page, "67-share-groups");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Pobierz kod QR" }).click();
  expect((await download).suggestedFilename()).toBe("plan-zajec-ur-moje-grupy-qr.png");
});

test("WF at the student's own hour (Tue 13.10, 7:00)", async ({ page }) => {
  await at(page, "2026-10-13T07:00:00+02:00");
  await page.goto(plan());
  const wf = page.locator(".block", { hasText: "Wychow" }).first();
  await expect(wf).toHaveAttribute("aria-label", /8:30–10:15/);
  await wf.click();
  const time = page.locator("#wf-start");
  await time.fill("11:45");
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
  await page.locator(".selection, .sel-card .secondary").first().click();
  await expect(page.getByText(/W planie WF jest o 8:30–10:15/)).toBeVisible();
  await page.getByRole("button", { name: /Cofnij/ }).click();
  await expect(page.locator("#wf-start")).toHaveValue("08:30");
  await page.getByRole("button", { name: "Pokaż plan" }).click();
  await expect(page.locator(".block", { hasText: "Wychow" }).first()).toHaveAttribute("aria-label", /8:30–10:15/);
  await expect(page).not.toHaveURL(/wf=/);
});

test.describe("iPhone", () => {
  // iOS never offers an install prompt: the menu item shows the "Do ekranu początkowego" steps instead.
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  });

  test("install steps", async ({ page }) => {
    test.skip(test.info().project.name !== "phone", "phone only");
    await at(page, "2026-10-14T10:00:00+02:00");
    await page.goto(plan());
    await page.getByRole("button", { name: "Menu" }).click();
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

test.describe("offline (service worker)", () => {
  test.use({ serviceWorkers: "allow" });
  test("the plan opens without network after one visit", async ({ page, context }) => {
    test.skip(test.info().project.name !== "phone", "one device is enough");
    await page.goto(plan());
    await expect(page.locator(".bottombar")).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload(); // now controlled by the service worker, which caches what it serves
    await expect(page.locator(".bottombar")).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".bottombar")).toBeVisible();
    await expect(page.locator(".status-offline")).toBeVisible();
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
    await noSidewaysScroll(page, "at rest");
    await page.locator('[data-action="pick-day"]').nth(3).click();
    await page.waitForTimeout(40);
    await noSidewaysScroll(page, "during the day animation");
    await page.getByRole("button", { name: "Tydzień", exact: true }).click();
    await page.locator('[data-action="next-week"]').click();
    await page.waitForTimeout(40);
    await noSidewaysScroll(page, "during the week animation");
    // iPhone's font is wider than Windows'; Verdana is wider still. Nothing may stick out of the screen.
    await page.addStyleTag({ content: "* { font-family: Verdana, sans-serif !important; }" });
    await page.getByRole("button", { name: "Dzień", exact: true }).click();
    const outside = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".topbar *, .weekbar *, .bottombar *, .dayhead *")]
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5)
        .map((el) => el.className),
    );
    expect(outside).toEqual([]);
  });

  test("day header in one line (Mon 26.10 seen from Wed 21.10)", async ({ page }) => {
    await at(page, "2026-10-21T10:00:00+02:00");
    await page.goto(plan());
    await page.locator('[data-action="next-week"]').click();
    await page.locator('[data-action="pick-day"]').first().click();
    const head = page.locator(".dayhead");
    await expect(head.locator("h1")).toContainText("26 października");
    const [h1, chip] = await Promise.all([head.locator("h1").boundingBox(), head.locator(".chip").boundingBox()]);
    expect(Math.abs(h1!.y + h1!.height / 2 - (chip!.y + chip!.height / 2))).toBeLessThan(8);
    await shot(page, "15-dayhead-other-week");
  });

  test("theme switch is remembered", async ({ page }) => {
    await at(page, "2026-10-14T10:00:00+02:00");
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(plan());
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Ciemny" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await shot(page, "64-theme-menu-dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(15, 17, 21)");
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Auto" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
  });

  test("sheets animate out before closing", async ({ page }) => {
    await at(page, "2026-10-14T10:00:00+02:00");
    await page.goto(plan());
    await page.getByRole("button", { name: "Menu" }).click();
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
    await expect(page.locator(".bottombar")).toBeVisible();
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
    await expect(page.locator(".bottombar")).toBeVisible({ timeout: 10_000 });
  });
});
