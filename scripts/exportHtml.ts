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
 * Open export/index.html or export/1-index.html for the poem list (identical), or export/<id>/afrikaans.html directly.
 */

import { copyFileSync, existsSync, mkdirSync, cpSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { getPoemMediaConfig } from "../engine/loadPoems.js";
import { syncPoemMediaToPoemDir } from "../engine/syncPoemBundledMedia.js";
import { getPoemIdsFilterFromEnv } from "../engine/poemIdsFilter.js";

/** If set (e.g. www.iandebeer.co.za), writes export/CNAME for GitHub Pages custom domain. */
function writePagesCname() {
  const host = process.env.GITHUB_PAGES_CNAME?.trim();
  const cnamePath = join(EXPORT_DIR, "CNAME");
  if (!host) {
    if (existsSync(cnamePath)) rmSync(cnamePath, { force: true });
    return;
  }
  writeFileSync(cnamePath, `${host}\n`, "utf-8");
}

/** EXPORT_HTML_LANG=af|en: copy only that language’s HTML; unset or all → both when present. */
function getExportHtmlLang(): "all" | "af" | "en" {
  const raw = process.env.EXPORT_HTML_LANG?.trim().toLowerCase();
  if (raw === "af" || raw === "en") return raw;
  return "all";
}

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
  /** True when poems/<id>/en.md exists (not only en.generated.md). */
  hasEnMd: boolean;
}

function writeExportIndex(rows: ExportedPoemRow[], bundleLang: "all" | "af" | "en") {
  const sorted = [...rows].sort((a, b) => a.titleAf.localeCompare(b.titleAf, undefined, { sensitivity: "base" }));
  const pageHeading = bundleLang === "en" ? "Poems" : "Gedigte";
  const pageLang = bundleLang === "en" ? "en" : "af";

  const items = sorted
    .map((r) => {
      const seg = encSeg(r.id);
      // Plain relative URLs: Safari often blocks file→file navigation if href is rewritten to absolute file:// via script
      const href =
        r.hasAfrikaans ? `${seg}/afrikaans.html` : r.hasEnglish ? `${seg}/english.html` : "#";
      const hrefEn = `${seg}/english.html`;
      const title = escapeHtml(r.titleAf);
      const enLinked = r.hasEnMd && r.hasEnglish;
      let titleEn = "";
      if (r.titleEn !== r.titleAf) {
        const inner = enLinked
          ? `<a class="poem-lang-link" href="${hrefEn}">${escapeHtml(r.titleEn)}</a>`
          : escapeHtml(r.titleEn);
        titleEn = ` <span class="muted">(${inner})</span>`;
      } else if (enLinked && r.hasAfrikaans) {
        titleEn = ` <a class="poem-lang-link muted" href="${hrefEn}">English</a>`;
      }
      return `      <li><a class="poem-title" href="${href}">${title}</a>${titleEn}</li>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="${pageLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageHeading)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500&family=Yuji+Syuku&display=swap" rel="stylesheet">
  <style>
    :root {
      --cream: #f5efe3;
      --cream-deep: #e8dfd0;
      --text: #2a2118;
      --muted: #6e6254;
      --link: #4a3b32;
      --link-hover: #1f1710;
      --rule: rgba(74, 59, 50, 0.2);
    }
    html { min-height: 100%; }
    body {
      font-family: "Yuji Syuku", "Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", "Times New Roman", serif;
      color: var(--text);
      margin: 0;
      padding: 2.5rem 1.75rem 3rem;
      line-height: 1.65;
      font-size: 1.05rem;
      font-weight: 400;
      background-color: var(--cream);
      background-image:
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.12'/%3E%3C/svg%3E"),
        radial-gradient(ellipse 130% 70% at 50% 0%, rgba(255, 252, 246, 0.75) 0%, transparent 55%),
        linear-gradient(168deg, var(--cream) 0%, var(--cream-deep) 100%);
      background-attachment: fixed;
    }
    h1 {
      font-size: clamp(1.75rem, 4vw, 2.25rem);
      font-weight: 400;
      margin: 0 0 1.75rem;
      letter-spacing: 0.04em;
    }
    ul { list-style: none; padding: 0; margin: 0; max-width: 42rem; }
    li { padding: 1rem 0; border-bottom: 1px solid var(--rule); }
    li:last-child { border-bottom: none; }
    .poem-title { color: var(--link); text-decoration: none; }
    .poem-title:hover { color: var(--link-hover); text-decoration: underline; text-underline-offset: 0.22em; }
    .muted { color: var(--muted); font-size: 0.92em; }
    a.poem-lang-link { color: var(--link); text-decoration: none; }
    a.poem-lang-link:hover { color: var(--link-hover); text-decoration: underline; text-underline-offset: 0.22em; }
    a.poem-lang-link.muted { font-size: 0.92em; }
  </style>
</head>
<body>
  <h1>${escapeHtml(pageHeading)}</h1>
  <ul>
${items}
  </ul>
  <!-- Safari (file://): if poem links do nothing, use Develop → Disable Local File Restrictions, or: cd to this folder, python3 -m http.server, open http://127.0.0.1:8000/1-index.html -->
  <script>
  (function () {
    // Do not rewrite href on file:// — absolute file URLs break poem navigation in Safari; http(s) still needs fixing for some IDE previews
    if (location.protocol === "file:") return;
    var base = location.href.split("#")[0];
    document.querySelectorAll("a.poem-title[href], a.poem-lang-link[href]").forEach(function (a) {
      var h = a.getAttribute("href");
      if (!h || h === "#" || /^[a-z][a-z0-9+.-]*:/i.test(h)) return;
      try {
        a.href = new URL(h, base).href;
      } catch (e) {}
    });
  })();
  </script>
</body>
</html>
`;
  const indexPath = join(EXPORT_DIR, EXPORT_INDEX_HTML);
  writeFileSync(indexPath, html, "utf-8");
  // Same poem list at index.html so GitHub Pages (artifact root = export/) serves Gedigte at / not a redirect stub
  const rootIndexPath = join(EXPORT_DIR, "index.html");
  writeFileSync(rootIndexPath, html, "utf-8");
}

function main() {
  if (!existsSync(POEMS_DIR)) {
    console.error("Poems directory not found:", POEMS_DIR);
    process.exit(1);
  }

  mkdirSync(EXPORT_DIR, { recursive: true });

  const filterIds = getPoemIdsFilterFromEnv();
  const filterSet = filterIds ? new Set(filterIds) : null;
  const bundleLang = getExportHtmlLang();

  const entries = readdirSync(POEMS_DIR, { withFileTypes: true });
  let exported = 0;
  let skipped = 0;
  const exportedRows: ExportedPoemRow[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const id = entry.name;
    if (filterSet && !filterSet.has(id)) continue;
    const poemDir = join(POEMS_DIR, id);
    const afHtml = join(poemDir, "af.html");
    const enHtml = join(poemDir, "en.html");
    const enGenHtml = join(poemDir, "en.generated.html");
    const enSource = existsSync(enHtml) ? enHtml : existsSync(enGenHtml) ? enGenHtml : null;
    const outDir = join(EXPORT_DIR, id);
    const poemMedia = join(poemDir, "media");

    const config = getPoemMediaConfig(poemDir, id);
    syncPoemMediaToPoemDir(poemDir, config.image);

    const hasAf = existsSync(afHtml);
    const hasEn = Boolean(enSource);
    const hasEnMd = existsSync(join(poemDir, "en.md"));

    if (bundleLang === "af" && !hasAf) {
      console.warn(`[export-html] ${id}: skipped — no af.html (Afrikaans-only bundle)`);
      skipped++;
      continue;
    }
    if (bundleLang === "en" && !hasEn) {
      console.warn(`[export-html] ${id}: skipped — no en.html / en.generated.html (English-only bundle)`);
      skipped++;
      continue;
    }
    if (bundleLang === "all" && !hasAf && !hasEn) {
      console.warn(`[export-html] No af.html or en.html for ${id} — run npm run convert-poems`);
      skipped++;
      continue;
    }

    if (existsSync(outDir)) {
      rmSync(outDir, { recursive: true, force: true });
    }
    mkdirSync(outDir, { recursive: true });

    let copied = 0;
    if ((bundleLang === "all" || bundleLang === "af") && hasAf) {
      copyFileSync(afHtml, join(outDir, "afrikaans.html"));
      copied++;
    }
    if ((bundleLang === "all" || bundleLang === "en") && hasEn) {
      copyFileSync(enSource!, join(outDir, "english.html"));
      copied++;
    }

    if (copied === 0) {
      rmSync(outDir, { recursive: true, force: true });
      skipped++;
      continue;
    }

    exported++;

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
      hasEnMd,
    });
  }

  if (exportedRows.length > 0) {
    writeExportIndex(exportedRows, bundleLang);
  } else {
    const idx = join(EXPORT_DIR, EXPORT_INDEX_HTML);
    const legacy = join(EXPORT_DIR, "index.html");
    if (existsSync(idx)) rmSync(idx, { force: true });
    if (existsSync(legacy)) rmSync(legacy, { force: true });
  }

  writePagesCname();

  const scope = filterIds ? ` (${filterIds.length} poem(s) via POEM_IDS)` : "";
  const langNote = bundleLang !== "all" ? ` [${bundleLang} only]` : "";
  console.log(
    `Exported ${exported} portable folder(s)${scope}${langNote}: ${EXPORT_DIR}/${EXPORT_INDEX_HTML} + ${EXPORT_DIR}/<id>/afrikaans.html (+ english.html) + media/`,
  );
  if (skipped) console.log(`Skipped ${skipped} poem folder(s) with no HTML.`);
}

main();
