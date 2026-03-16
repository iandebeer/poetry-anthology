/**
 * Export all poems to a single EPUB file for Amazon Kindle Direct Publishing.
 * Run: npm run export-kindle [-- --title "My Anthology" --author "Ian de Beer"]
 *
 * Output: dist/poetry-anthology.epub (or custom path)
 */

import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { loadPoems } from "../engine/loadPoems.js";

const POEMS_DIR = join(process.cwd(), "poems");
const DEFAULT_OUTPUT = join(process.cwd(), "dist", "poetry-anthology.epub");

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdToHtmlBody(md: string): string {
  const lines = md.split("\n");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length && lines[i].trim() === "") i++;

  if (lines[i]?.trim().startsWith("# ")) {
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
  return {
    title: getArg("--title") ?? "Poetry Anthology",
    author: getArg("--author") ?? "Ian de Beer",
    output: getArg("--output") ?? DEFAULT_OUTPUT,
    lang: (getArg("--lang") as "both" | "af" | "en") ?? "both",
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
    let html = "";

    if (lang === "both") {
      html += `<div class="poem-section" lang="af"><h3>${escapeHtml(poem.config.titleAf ?? chapterTitle)}</h3>\n${mdToHtmlBody(afMd)}</div>`;
      html += `<div class="poem-section" lang="en"><h3>${escapeHtml(poem.config.titleEn ?? chapterTitle)}</h3>\n${mdToHtmlBody(enMd)}</div>`;
    } else if (lang === "af") {
      html += mdToHtmlBody(afMd);
    } else {
      html += mdToHtmlBody(enMd);
    }

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
    lang: lang === "af" ? "af" : "en",
    css: `
      body { font-family: Georgia, serif; line-height: 1.6; margin: 1.5em; }
      h2, h3 { font-size: 1.2em; margin-top: 1.5em; margin-bottom: 0.5em; }
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
