/**
 * Copies converted poem HTML into export/, one file per poem named by folder id (slug).
 * Run: npm run convert-poems && npm run export-html
 *
 * Naming:
 *   export/<poem-id>.html      — from af.html (primary)
 *   export/<poem-id>-en.html   — from en.html when both af and en exist
 *   export/<poem-id>.html      — from en.html when no af.html
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

const POEMS_DIR = join(process.cwd(), "poems");
const EXPORT_DIR = join(process.cwd(), "export");

function main() {
  if (!existsSync(POEMS_DIR)) {
    console.error("Poems directory not found:", POEMS_DIR);
    process.exit(1);
  }

  mkdirSync(EXPORT_DIR, { recursive: true });

  const entries = readdirSync(POEMS_DIR, { withFileTypes: true });
  let copied = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const id = entry.name;
    const poemDir = join(POEMS_DIR, id);
    const afHtml = join(poemDir, "af.html");
    const enHtml = join(poemDir, "en.html");
    const enGenHtml = join(poemDir, "en.generated.html");

    const enSource = existsSync(enHtml) ? enHtml : existsSync(enGenHtml) ? enGenHtml : null;

    if (existsSync(afHtml)) {
      copyFileSync(afHtml, join(EXPORT_DIR, `${id}.html`));
      copied++;
      if (enSource) {
        copyFileSync(enSource, join(EXPORT_DIR, `${id}-en.html`));
        copied++;
      }
    } else if (enSource) {
      copyFileSync(enSource, join(EXPORT_DIR, `${id}.html`));
      copied++;
    } else {
      console.warn(`[export-html] No af.html or en.html for ${id} — run npm run convert-poems`);
      skipped++;
    }
  }

  console.log(`Exported ${copied} HTML file(s) to ${EXPORT_DIR}/`);
  if (skipped) console.log(`Skipped ${skipped} poem folder(s) with no HTML.`);
}

main();
