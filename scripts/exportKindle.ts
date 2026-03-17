/**
 * Export all poems to a single EPUB file for Amazon Kindle Direct Publishing.
 * Run: npm run export-kindle [-- --lang af|en|both --title "..." --author "Ian de Beer"]
 *
 * Output by language: --lang af or both → dist/Digbundel.epub, --lang en → dist/Anthology.epub
 */

import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { loadPoems } from "../engine/loadPoems.js";

const MEDIA_DIR = join(process.cwd(), "public", "media");

const POEMS_DIR = join(process.cwd(), "poems");
const DIST_DIR = join(process.cwd(), "dist");

function getOutputPath(lang: "both" | "af" | "en"): string {
  if (lang === "en") return join(DIST_DIR, "Anthology.epub");
  return join(DIST_DIR, "Digbundel.epub");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdToHtmlBody(md: string, skipTitle = false): string {
  let lines = md.split("\n");
  if (skipTitle) {
    const firstTitleIdx = lines.findIndex((l) => l.trim().startsWith("# "));
    if (firstTitleIdx >= 0) lines.splice(firstTitleIdx, 1);
  }
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length && lines[i].trim() === "") i++;

  if (lines[i]?.trim().startsWith("# ") && !skipTitle) {
    const title = lines[i].replace(/^#\s+/, "").trim();
    parts.push(`<h2>${escapeHtml(title)}</h2>`);
    i++;
  }

  const stanzas: string[][] = [];
  let current: string[] = [];

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      if (current.length > 0) {
        stanzas.push(current);
        current = [];
      }
    } else {
      current.push(line.trimEnd());
    }
  }
  if (current.length > 0) stanzas.push(current);

  for (const stanza of stanzas) {
    const inner = stanza.map((l) => escapeHtml(l)).join("<br>\n  ");
    parts.push(`<p>\n  ${inner}\n</p>`);
  }

  return parts.join("\n\n");
}

/** Split poem HTML into chunks of ~4 stanzas (paragraphs) per page */
function splitPoemIntoChunks(poemHtml: string, stanzasPerPage = 4): string[] {
  const stanzaRegex = /<p[^>]*>[\s\S]*?<\/p>/gi;
  const stanzas: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = stanzaRegex.exec(poemHtml)) !== null) stanzas.push(m[0]);
  if (stanzas.length === 0) return poemHtml ? [poemHtml] : [];
  const chunks: string[] = [];
  for (let i = 0; i < stanzas.length; i += stanzasPerPage) {
    chunks.push(stanzas.slice(i, i + stanzasPerPage).join("\n\n"));
  }
  return chunks;
}

/** Extract content before first <p> (titles, etc.) to prepend to first chunk */
function extractPoemPreamble(html: string): { preamble: string; body: string } {
  const firstP = html.search(/<p[\s>]/i);
  if (firstP <= 0) return { preamble: "", body: html };
  return { preamble: html.slice(0, firstP).trim(), body: html.slice(firstP) };
}

function parseArgs(): { title: string; author: string; output: string; lang: "both" | "af" | "en" } {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const lang = (getArg("--lang") as "both" | "af" | "en") ?? "both";
  return {
    title: getArg("--title") ?? (lang === "en" ? "Anthology" : "Digbundel"),
    author: getArg("--author") ?? "Ian de Beer",
    output: getArg("--output") ?? getOutputPath(lang),
    lang,
  };
}

async function main() {
  const { title, author, output, lang } = parseArgs();

  if (!existsSync(POEMS_DIR)) {
    console.error("Poems directory not found:", POEMS_DIR);
    process.exit(1);
  }

  const poems = loadPoems();
  if (poems.length === 0) {
    console.error("No poems found. Each poem needs af.md and en.md.");
    process.exit(1);
  }

  const bookAuthor = poems[0].config.author || author;

  const content: { title: string; data: string }[] = [];

  for (const poem of poems) {
    const poemDir = join(POEMS_DIR, poem.id);
    const afMd = readFileSync(join(poemDir, "af.md"), "utf-8");
    const enMd = readFileSync(join(poemDir, "en.md"), "utf-8");

    const chapterTitle = poem.config.titleAf || poem.config.titleEn || poem.id;
    let html = '<div class="poem-chapter">';

    const imagePath = poem.config.image;
    const hasImage = imagePath && existsSync(join(MEDIA_DIR, imagePath));

    let poemBody = "";
    if (lang === "both") {
      poemBody = `<div class="poem-section" lang="af">${mdToHtmlBody(afMd, true)}</div>`;
      poemBody += `<div class="poem-section" lang="en">${mdToHtmlBody(enMd, true)}</div>`;
    } else if (lang === "af") {
      poemBody = mdToHtmlBody(afMd);
    } else {
      poemBody = mdToHtmlBody(enMd);
    }

    if (hasImage) {
      const fileUrl = pathToFileURL(join(MEDIA_DIR, imagePath!)).href;
      const { preamble, body } = extractPoemPreamble(poemBody);
      const chunks = splitPoemIntoChunks(body, 4);
      for (let i = 0; i < chunks.length; i++) {
        const textContent = (i === 0 && preamble ? preamble : "") + chunks[i];
        html += `<div class="poem-spread"><div class="poem-spread-image"><img src="${fileUrl}" alt="" class="poem-bg-img" /></div><div class="poem-spread-text">${textContent}</div></div>`;
      }
    } else {
      html += '<div class="poem-text-page">';
      html += poemBody;
      html += "</div>";
    }
    html += "</div>";

    content.push({
      title: chapterTitle,
      data: html,
    });
  }

  const { default: Epub } = await import("epub-gen");
  const options = {
    title,
    author: bookAuthor,
    content,
    appendChapterTitles: true,
    lang: lang === "af" ? "af" : "en",
    css: `
      body { font-family: Georgia, serif; font-size: 0.9em; line-height: 1.6; margin: 1.5em; }
      h2, h3 { font-size: 1.05em; margin-top: 1.5em; margin-bottom: 0.5em; }
      .poem-chapter { page-break-before: always; }
      .poem-spread { display: flex; page-break-inside: avoid; }
      .poem-spread + .poem-spread { page-break-before: always; }
      .poem-spread-image { flex: 0 0 45%; min-width: 0; padding-right: 1em; display: flex; align-items: center; }
      .poem-spread-image img { max-width: 100%; height: auto; }
      .poem-spread-text { flex: 1; min-width: 0; }
      .poem-text-page { page-break-inside: avoid; }
      .poem-section { margin-bottom: 2em; }
      .poem-section[lang="en"] { margin-top: 1.5em; }
      p { margin: 0.5em 0; }
    `,
  };

  const outDir = join(output, "..");
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  await new Promise<void>((resolve, reject) => {
    new Epub(options, output).promise.then(resolve, reject);
  });

  console.log(`Exported ${poems.length} poems to ${output}`);
  console.log("Upload this EPUB to Amazon KDP (Kindle Direct Publishing).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
