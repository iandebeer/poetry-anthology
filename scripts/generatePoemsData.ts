/**
 * Generates poemsData.json from the poems/ folder.
 * Run before dev or render to sync poem data.
 */

import { existsSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { loadPoems } from "../engine/loadPoems.js";

const OUT_PATH = join(process.cwd(), "src", "poemsData.json");
const POEMS_DIR = join(process.cwd(), "poems");

const poems = loadPoems();
writeFileSync(OUT_PATH, JSON.stringify(poems, null, 2), "utf-8");
console.log(`Generated ${poems.length} poems → src/poemsData.json`);

if (existsSync(POEMS_DIR)) {
  const loaded = new Set(poems.map((p) => p.id));
  for (const e of readdirSync(POEMS_DIR, { withFileTypes: true })) {
    if (!e.isDirectory() || loaded.has(e.name)) continue;
    const dir = join(POEMS_DIR, e.name);
    const hasAf = existsSync(join(dir, "af.md")) || existsSync(join(dir, "af-translate.md"));
    if (!hasAf && (existsSync(join(dir, "en.md")) || existsSync(join(dir, "en.generated.md")))) {
      console.warn(`[generate-poems] Skipping "${e.name}": missing af.md / af-translate.md`);
    }
  }
}
