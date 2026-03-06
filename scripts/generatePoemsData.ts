/**
 * Generates poemsData.json from the poems/ folder.
 * Run before dev or render to sync poem data.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { loadPoems } from "../engine/loadPoems.js";

const OUT_PATH = join(process.cwd(), "src", "poemsData.json");

const poems = loadPoems();
writeFileSync(OUT_PATH, JSON.stringify(poems, null, 2), "utf-8");
console.log(`Generated ${poems.length} poems → src/poemsData.json`);
