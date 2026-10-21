import { defineConfig } from "@playwright/test";

// Screenshots for review: phone and desktop, using the locally installed Chrome (no browser download).
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173",
    channel: "chrome",
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
    serviceWorkers: "block", // the screens mock data with page.route, which a service worker would bypass
  },
  projects: [
    // Xiaomi Redmi Note 14 in Chrome (the user's phone): 1080 px / 2.75 = 393 CSS px wide; ~770 px visible with
    // the address bar shown (assumed from the screen size, not measured on the device).
    {
      name: "phone",
      use: {
        viewport: { width: 393, height: 770 },
        deviceScaleFactor: 2.75,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; 24117RN76G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
      },
    },
    { name: "desktop", use: { viewport: { width: 1366, height: 900 } } },
  ],
  webServer: {
    command: "npx vite build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
