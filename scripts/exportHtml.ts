/**
 * Copies each poem's HTML + a media/ subfolder into export/<poem-id>/ (portable to any machine).
 * Run: npm run convert-poems && npm run export-html (admin "Export HTML bundle" runs both).
 *
 * Before copying, syncs images from public/media into poems/<id>/media/ so export always
 * includes files even if convert was skipped earlier.
 *
 * Layout (copy the whole export/<id>/ folder):
 *   export/<poem-id>/afrikaans.html — from af.html (primary)
 *   export/<poem-id>/english.html   — from en.html when both langs exist
 *   export/<poem-id>/media/         — background image(s), relative url media/<file> in CSS
 *
 * Open export/1-index.html for a list of all poems, or export/<id>/afrikaans.html directly.
 */

import { copyFileSync, existsSync, mkdirSync, cpSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { getPoemMediaConfig } from "../engine/loadPoems.js";
import { syncPoemMediaToPoemDir } from "../engine/syncPoemBundledMedia.js";

const POEMS_DIR = join(process.cwd(), "poems");
const EXPORT_DIR = join(process.cwd(), "export");
/** Sorts first in alphabetical folder listings (before poem subdirs). */
const EXPORT_INDEX_HTML = "1-index.html";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Encode a single path segment (poem folder id may contain spaces). */
function encSeg(segment: string): string {
  return encodeURIComponent(segment);
}

interface ExportedPoemRow {
  id: string;
  titleAf: string;
  titleEn: string;
  hasAfrikaans: boolean;
  hasEnglish: boolean;
}

function writeExportIndex(rows: ExportedPoemRow[]) {
  const sorted = [...rows].sort((a, b) => a.titleAf.localeCompare(b.titleAf, undefined, { sensitivity: "base" }));
  const items = sorted
    .map((r) => {
      const seg = encSeg(r.id);
      // ./ + explicit resolution in <script> fixes IDE preview and quirky file:// bases
      const af = r.hasAfrikaans ? `<a href="./${seg}/afrikaans.html">Afrikaans</a>` : "";
      const en = r.hasEnglish ? `<a href="./${seg}/english.html">English</a>` : "";
      const links = [af, en].filter(Boolean).join(" · ");
      const sub = escapeHtml(r.id);
      const title = escapeHtml(r.titleAf);
      const titleEn = r.titleEn !== r.titleAf ? ` <span class="muted">(${escapeHtml(r.titleEn)})</span>` : "";
      return `      <li><span class="title">${title}</span>${titleEn}<br><span class="links">${links}</span><span class="id">${sub}</span></li>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="./">
  <title>Poetry export</title>
  <style>
    :root { --bg: #0f0f14; --text: #e8e8ed; --muted: #8888a0; --link: #6b8cce; }
    body { font-family: Georgia, "Times New Roman", serif; background: var(--bg); color: var(--text); margin: 0; padding: 2rem; line-height: 1.5; }
    h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.5rem; }
    p.lead { color: var(--muted); margin: 0 0 2rem; font-size: 0.95rem; }
    ul { list-style: none; padding: 0; margin: 0; max-width: 40rem; }
    li { padding: 1rem 0; border-bottom: 1px solid #2a2a36; }
    li:last-child { border-bottom: none; }
    .title { font-weight: 600; }
    .muted { color: var(--muted); font-weight: normal; font-size: 0.9em; }
    .links { display: block; margin-top: 0.35rem; }
    .links a { color: var(--link); text-decoration: none; }
    .links a:hover { text-decoration: underline; }
    .id { display: block; font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; }
  </style>
</head>
<body>
  <h1>Poems</h1>
  <p class="lead">${sorted.length} poem folder(s). Copy this <code>export</code> directory to use offline. If links fail in a browser preview, open <code>1-index.html</code> from disk or run <code style="white-space:nowrap">cd export &amp;&amp; python3 -m http.server</code> then open <code>/1-index.html</code> on that server.</p>
  <ul>
${items}
  </ul>
  <script>
  (function () {
    try {
      var root = new URL("./", location.href);
      document.querySelectorAll(".links a[href]").forEach(function (a) {
        var h = a.getAttribute("href");
        if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h)) return;
        var rel = h.startsWith("./") ? h.slice(2) : h;
        a.href = new URL(rel, root).href;
      });
    } catch (e) { /* keep static href */ }
  })();
  </script>
</body>
</html>
`;
  const indexPath = join(EXPORT_DIR, EXPORT_INDEX_HTML);
  writeFileSync(indexPath, html, "utf-8");
  const legacyIndex = join(EXPORT_DIR, "index.html");
  if (existsSync(legacyIndex)) rmSync(legacyIndex, { force: true });
}

function main() {
  if (!existsSync(POEMS_DIR)) {
    console.error("Poems directory not found:", POEMS_DIR);
    process.exit(1);
  }

  mkdirSync(EXPORT_DIR, { recursive: true });

  const entries = readdirSync(POEMS_DIR, { withFileTypes: true });
  let exported = 0;
  let skipped = 0;
  const exportedRows: ExportedPoemRow[] = [];

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
      copyFileSync(afHtml, join(outDir, "afrikaans.html"));
      exported++;
    } else if (enSource) {
      copyFileSync(enSource, join(outDir, "english.html"));
      exported++;
    }

    if (enSource && existsSync(afHtml)) {
      copyFileSync(enSource, join(outDir, "english.html"));
    }

    if (existsSync(poemMedia)) {
      cpSync(poemMedia, join(outDir, "media"), { recursive: true });
    } else if (config.image) {
      console.warn(
        `[export-html] ${id}: config/public media references an image but poems/${id}/media/ is empty — add files under public/media/poems/${id}/`,
      );
    }

    exportedRows.push({
      id,
      titleAf: config.titleAf || config.titleEn || id,
      titleEn: config.titleEn || config.titleAf || id,
      hasAfrikaans: existsSync(join(outDir, "afrikaans.html")),
      hasEnglish: existsSync(join(outDir, "english.html")),
    });
  }

  if (exportedRows.length > 0) {
    writeExportIndex(exportedRows);
  } else {
    const idx = join(EXPORT_DIR, EXPORT_INDEX_HTML);
    const legacy = join(EXPORT_DIR, "index.html");
    if (existsSync(idx)) rmSync(idx, { force: true });
    if (existsSync(legacy)) rmSync(legacy, { force: true });
  }

  console.log(
    `Exported ${exported} portable folder(s): ${EXPORT_DIR}/${EXPORT_INDEX_HTML} + ${EXPORT_DIR}/<id>/afrikaans.html (+ english.html) + media/`,
  );
  if (skipped) console.log(`Skipped ${skipped} poem folder(s) with no HTML.`);
}

main();
