/**
 * Renders all poems (Afrikaans and English) to output/videos/
 */

import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { loadPoems } from "../engine/loadPoems.js";
import { renderPoem } from "../engine/renderPoem.js";
import type { PoemLanguage } from "../engine/types.js";

const OUT_VIDEOS = join(process.cwd(), "output", "videos");

async function main() {
  if (!existsSync(OUT_VIDEOS)) {
    mkdirSync(OUT_VIDEOS, { recursive: true });
  }

  const poems = loadPoems();
  if (poems.length === 0) {
    console.log("No poems found in poems/");
    return;
  }

  console.log(`Rendering ${poems.length} poems × 2 languages = ${poems.length * 2} videos\n`);

  for (const poem of poems) {
    for (const lang of ["af", "en"] as PoemLanguage[]) {
      const compId = `${poem.id}-${lang}`;
      process.stdout.write(`Rendering ${compId}... `);
      try {
        const path = await renderPoem({ poemId: poem.id, language: lang });
        console.log(`✓ ${path}`);
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log("\nDone.");
}

main();
