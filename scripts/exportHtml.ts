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
 * Bio: bio.md → export/bio.html; if o-photo.png exists at repo root it is copied to export/o-photo.png and shown on the bio page.
 */

import { copyFileSync, existsSync, mkdirSync, cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
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
const BIO_MD = join(process.cwd(), "bio.md");
/** Copied next to bio.html when present (project root). */
const BIO_PHOTO_SRC = join(process.cwd(), "o-photo.png");
const BIO_PHOTO_EXPORT_NAME = "o-photo.png";
/** Sorts first in alphabetical folder listings (before poem subdirs). */
const EXPORT_INDEX_HTML = "1-index.html";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Inline: [label](url), **bold** (bio.md only; keep subset small). */
function formatBioInline(raw: string): string {
  const parts: string[] = [];
  let last = 0;
  const re = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    parts.push(escapeHtml(raw.slice(last, m.index)));
    const href = escapeHtmlAttr(m[2].trim());
    parts.push(`<a href="${href}">${escapeHtml(m[1])}</a>`);
    last = re.lastIndex;
  }
  parts.push(escapeHtml(raw.slice(last)));
  let s = parts.join("");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s;
}

/** Headings (# … ## …) and blank-line paragraphs; soft line breaks → &lt;br&gt;. */
function bioMdToHtmlBody(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  while (i < lines.length) {
    const lineTrim = lines[i].trim();
    const hm = /^(#{1,6})\s+(.+)$/.exec(lineTrim);
    if (hm && lines[i].trimEnd() === lineTrim) {
      const level = Math.min(hm[1].length, 6);
      parts.push(`<h${level}>${formatBioInline(hm[2].trim())}</h${level}>`);
      i++;
      while (i < lines.length && lines[i].trim() === "") i++;
      continue;
    }
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      paraLines.push(lines[i].trimEnd());
      i++;
    }
    if (paraLines.length > 0) {
      const rawPara = paraLines.join("\n");
      const inner = formatBioInline(rawPara).replace(/\n/g, "<br>\n");
      parts.push(`<p>${inner}</p>`);
    }
    while (i < lines.length && lines[i].trim() === "") i++;
  }
  return parts.join("\n");
}

const EXPORT_PUBLIC_STYLES = `
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
    * { box-sizing: border-box; }
    body {
      font-family: "Yuji Syuku", "Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", "Times New Roman", serif;
      color: var(--text);
      margin: 0;
      padding: 2.5rem 1.75rem 3rem;
      line-height: 1.65;
      font-size: 1.05rem;
      font-weight: 400;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
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
      text-align: center;
      width: 100%;
      max-width: 42rem;
    }
    h1.index-heading {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: baseline;
      gap: 0.35rem 0.75rem;
    }
    h1.index-heading .main-title { letter-spacing: 0.04em; }
    h1.index-heading .heading-sep { color: var(--muted); font-weight: 300; font-size: 0.85em; }
    a.bio-link {
      color: var(--link);
      text-decoration: none;
      font-size: 0.5em;
      font-weight: 400;
      letter-spacing: 0.08em;
      white-space: nowrap;
    }
    a.bio-link:hover { color: var(--link-hover); text-decoration: underline; text-underline-offset: 0.2em; }
    ul { list-style: none; padding: 0; margin: 0; max-width: 42rem; width: 100%; text-align: center; }
    li { padding: 1rem 0; border-bottom: 1px solid var(--rule); text-align: center; }
    li:last-child { border-bottom: none; }
    .poem-title { color: var(--link); text-decoration: none; }
    .poem-title:hover { color: var(--link-hover); text-decoration: underline; text-underline-offset: 0.22em; }
    .muted { color: var(--muted); font-size: 0.92em; }
    a.poem-lang-link { color: var(--link); text-decoration: none; }
    a.poem-lang-link:hover { color: var(--link-hover); text-decoration: underline; text-underline-offset: 0.22em; }
    a.poem-lang-link.muted { font-size: 0.92em; }
    nav.bio-back { margin-bottom: 1.5rem; max-width: 42rem; width: 100%; }
    nav.bio-back a { color: var(--muted); text-decoration: none; font-size: 0.92rem; }
    nav.bio-back a:hover { color: var(--link-hover); text-decoration: underline; }
    main.bio-body { max-width: 42rem; width: 100%; text-align: left; }
    main.bio-body h1 { font-size: 1.55rem; margin: 0 0 1rem; text-align: left; }
    main.bio-body h2 { font-size: 1.25rem; margin: 1.25rem 0 0.75rem; font-weight: 500; }
    main.bio-body h3 { font-size: 1.1rem; margin: 1rem 0 0.5rem; font-weight: 500; }
    main.bio-body p { margin: 0 0 1rem; }
    main.bio-body a { color: var(--link); text-decoration: underline; text-underline-offset: 0.18em; }
    main.bio-body a:hover { color: var(--link-hover); }
    main.bio-body code { font-size: 0.88em; background: rgba(74, 59, 50, 0.08); padding: 0.12em 0.35em; border-radius: 4px; }
    figure.bio-photo { margin: 0 0 1.5rem; text-align: center; }
    figure.bio-photo img {
      max-width: min(100%, 20rem);
      width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 6px 28px rgba(42, 33, 24, 0.14);
    }
`;

function writeBioPage(bundleLang: "all" | "af" | "en") {
  const pageLang = bundleLang === "en" ? "en" : "af";
  const pageTitle = "Ian de Beer";
  const backLabel = bundleLang === "en" ? "← Poems" : "← Gedigte";
  let body: string;
  if (!existsSync(BIO_MD)) {
    body =
      pageLang === "en"
        ? "<p>No biography yet. Add <code>bio.md</code> at the project root and run <code>npm run export-html</code>.</p>"
        : "<p>Nog geen biografie nie. Voeg <code>bio.md</code> by die projekwortel en voer <code>npm run export-html</code> uit.</p>";
  } else {
    body = bioMdToHtmlBody(readFileSync(BIO_MD, "utf-8"));
  }

  let photoBlock = "";
  if (existsSync(BIO_PHOTO_SRC)) {
    copyFileSync(BIO_PHOTO_SRC, join(EXPORT_DIR, BIO_PHOTO_EXPORT_NAME));
    photoBlock = `<figure class="bio-photo"><img src="${escapeHtml(BIO_PHOTO_EXPORT_NAME)}" alt="${escapeHtml(pageTitle)}" loading="lazy" decoding="async" /></figure>\n`;
  }

  const html = `<!DOCTYPE html>
<html lang="${pageLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500&family=Yuji+Syuku&display=swap" rel="stylesheet">
  <style>${EXPORT_PUBLIC_STYLES}
  </style>
</head>
<body>
  <nav class="bio-back"><a href="index.html">${escapeHtml(backLabel)}</a></nav>
  <main class="bio-body">
${photoBlock}${body}
  </main>
  <script>
  (function () {
    if (location.protocol === "file:") return;
    var base = location.href.split("#")[0];
    document.querySelectorAll("main.bio-body a[href]").forEach(function (a) {
      var h = a.getAttribute("href");
      if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h)) return;
      try { a.href = new URL(h, base).href; } catch (e) {}
    });
    document.querySelectorAll("main.bio-body img[src]").forEach(function (img) {
      var h = img.getAttribute("src");
      if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h)) return;
      try { img.src = new URL(h, base).href; } catch (e) {}
    });
  })();
  </script>
</body>
</html>
`;
  writeFileSync(join(EXPORT_DIR, "bio.html"), html, "utf-8");
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

  const indexHeadingHtml = `<h1 class="index-heading"><span class="main-title">${escapeHtml(pageHeading)}</span><span class="heading-sep" aria-hidden="true">·</span><a class="bio-link" href="bio.html">Ian de Beer</a></h1>`;

  const html = `<!DOCTYPE html>
<html lang="${pageLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageHeading)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500&family=Yuji+Syuku&display=swap" rel="stylesheet">
  <style>${EXPORT_PUBLIC_STYLES}
  </style>
</head>
<body>
  ${indexHeadingHtml}
  <ul>
${items}
  </ul>
  <!-- Safari (file://): if poem links do nothing, use Develop → Disable Local File Restrictions, or: cd to this folder, python3 -m http.server, open http://127.0.0.1:8000/1-index.html -->
  <script>
  (function () {
    // Do not rewrite href on file:// — absolute file URLs break poem navigation in Safari; http(s) still needs fixing for some IDE previews
    if (location.protocol === "file:") return;
    var base = location.href.split("#")[0];
    document.querySelectorAll("a.poem-title[href], a.poem-lang-link[href], a.bio-link[href]").forEach(function (a) {
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

  writeBioPage(bundleLang);

  const scope = filterIds ? ` (${filterIds.length} poem(s) via POEM_IDS)` : "";
  const langNote = bundleLang !== "all" ? ` [${bundleLang} only]` : "";
  console.log(
    `Exported ${exported} portable folder(s)${scope}${langNote}: ${EXPORT_DIR}/${EXPORT_INDEX_HTML} + ${EXPORT_DIR}/<id>/afrikaans.html (+ english.html) + media/`,
  );
  if (skipped) console.log(`Skipped ${skipped} poem folder(s) with no HTML.`);
}

main();
