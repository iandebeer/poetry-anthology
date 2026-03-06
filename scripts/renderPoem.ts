/**
 * Renders a single poem by ID.
 * Usage: npx tsx scripts/renderPoem.ts [poemId] [language]
 * Example: npx tsx scripts/renderPoem.ts waar-rus-is af
 */

import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { renderPoem } from "../engine/renderPoem.js";
import type { PoemLanguage } from "../engine/types.js";

const OUT_VIDEOS = join(process.cwd(), "output", "videos");

async function main() {
  const [poemId, langArg] = process.argv.slice(2);
  const language = (langArg === "en" ? "en" : "af") as PoemLanguage;

  if (!poemId) {
    console.error("Usage: npx tsx scripts/renderPoem.ts <poemId> [af|en]");
    process.exit(1);
  }

  if (!existsSync(OUT_VIDEOS)) {
    mkdirSync(OUT_VIDEOS, { recursive: true });
  }

  const path = await renderPoem({ poemId, language });
  console.log(`Rendered: ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
