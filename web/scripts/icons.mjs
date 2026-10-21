// Render the app icons (public/icons/*.svg) to the PNG sizes phones need. Run once after changing an icon:
//   node scripts/icons.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(dirname(fileURLToPath(import.meta.url))), "public", "icons");
const jobs = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["maskable.svg", "maskable-512.png", 512],
  ["maskable.svg", "apple-touch-icon.png", 180], // iOS rounds the corners itself
];
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
for (const [svg, png, size] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const src = readFileSync(join(dir, svg), "utf8");
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${src}`);
  await page.screenshot({ path: join(dir, png), omitBackground: true });
  console.log(png);
}
await browser.close();
