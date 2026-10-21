// Copy the published timetable data (../data/published) into public/data for the dev server and build.
import { cpSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const from = join(root, "..", "data", "published");
const to = join(root, "public", "data");
if (!existsSync(from)) throw new Error(`no published data at ${from}; run 'ur-timetable update' first`);
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`synced ${from} -> ${to}`);
