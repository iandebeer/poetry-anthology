/**
 * Copies each poem's HTML + a media/ subfolder into export/<poem-id>/ (portable to any machine).
 * Run: npm run convert-poems && npm run export-html (admin "Export HTML bundle" runs both).
 *
 * Before copying, syncs images from public/media into poems/<id>/media/ so export always
 * includes files even if convert was skipped earlier.
 *
 * Layout (copy the whole export/<id>/ folder):
 *   export/<poem-id>/index.html   — from af.html (primary)
 *   export/<poem-id>/media/       — background image(s), relative url media/<file> in CSS
 *   export/<poem-id>/en.html      — when English exists (optional)
 *
 * Open export/<id>/index.html; backgrounds use paths relative to that file.
 */

import { copyFileSync, existsSync, mkdirSync, cpSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { getPoemMediaConfig } from "../engine/loadPoems.js";
import { syncPoemMediaToPoemDir } from "../engine/syncPoemBundledMedia.js";

const POEMS_DIR = join(process.cwd(), "poems");
const EXPORT_DIR = join(process.cwd(), "export");

function main() {
  if (!existsSync(POEMS_DIR)) {
    console.error("Poems directory not found:", POEMS_DIR);
    process.exit(1);
  }

  mkdirSync(EXPORT_DIR, { recursive: true });

  const entries = readdirSync(POEMS_DIR, { withFileTypes: true });
  let exported = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const id = entry.name;
    const poemDir = join(POEMS_DIR, id);
    const afHtml = join(poemDir, "af.html");
    const enHtml = join(poemDir, "en.html");
    const enGenHtml = join(poemDir, "en.generated.html");
    const enSource = existsSync(enHtml) ? enHtml : existsSync(enGenHtml) ? enGenHtml : null;
    const outDir = join(EXPORT_DIR, id);
    const poemMedia = join(poemDir, "media");

    const config = getPoemMediaConfig(poemDir, id);
    syncPoemMediaToPoemDir(poemDir, config.image);

    if (!existsSync(afHtml) && !enSource) {
      console.warn(`[export-html] No af.html or en.html for ${id} — run npm run convert-poems`);
      skipped++;
      continue;
    }

    if (existsSync(outDir)) {
      rmSync(outDir, { recursive: true, force: true });
    }
    mkdirSync(outDir, { recursive: true });

    if (existsSync(afHtml)) {
      copyFileSync(afHtml, join(outDir, "index.html"));
      exported++;
    } else if (enSource) {
      copyFileSync(enSource, join(outDir, "index.html"));
      exported++;
    }

    if (enSource && existsSync(afHtml)) {
      copyFileSync(enSource, join(outDir, "en.html"));
    }

    if (existsSync(poemMedia)) {
      cpSync(poemMedia, join(outDir, "media"), { recursive: true });
    } else if (config.image) {
      console.warn(
        `[export-html] ${id}: config/public media references an image but poems/${id}/media/ is empty — add files under public/media/poems/${id}/`,
      );
    }
  }

  console.log(
    `Exported ${exported} portable folder(s): ${EXPORT_DIR}/<id>/index.html + media/ (copy each <id> folder to another computer)`,
  );
  if (skipped) console.log(`Skipped ${skipped} poem folder(s) with no HTML.`);
}

main();
