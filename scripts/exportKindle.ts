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

    html += '<div class="poem-blank-page" aria-hidden="true"></div>';
    if (hasImage) {
      const fileUrl = pathToFileURL(join(MEDIA_DIR, imagePath!)).href;
      html += `<div class="poem-image-page"><img src="${fileUrl}" alt="" class="poem-bg-img" /></div>`;
    }

    html += '<div class="poem-text-page">';
    if (lang === "both") {
      html += `<div class="poem-section" lang="af">${mdToHtmlBody(afMd, true)}</div>`;
      html += `<div class="poem-section" lang="en">${mdToHtmlBody(enMd, true)}</div>`;
    } else if (lang === "af") {
      html += mdToHtmlBody(afMd);
    } else {
      html += mdToHtmlBody(enMd);
    }
    html += "</div></div>";

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
      .poem-blank-page { page-break-after: always; min-height: 1px; }
      .poem-image-page { page-break-after: always; min-height: 50vh; display: flex; align-items: center; justify-content: center; }
      .poem-image-page img { max-width: 100%; height: auto; }
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
