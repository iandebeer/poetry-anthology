/**
 * Converts poem markdown files to HTML and plain text.
 * Run: npm run convert-poems
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import {
  getPoemMediaConfig,
  resolveAfrikaansMarkdownPath,
  resolveEnglishMarkdownPath,
} from "../engine/loadPoems.js";
import { syncPoemBundledAssets } from "../engine/syncPoemBundledMedia.js";
import { wrapHtmlWithPoemBackground, injectPoemAnthologyNav } from "../engine/poemHtmlDocument.js";
import { getPoemIdsFilterFromEnv } from "../engine/poemIdsFilter.js";
import { poemMarkdownToHtmlDocument } from "../engine/poemMarkdownHtml.js";

const POEMS_DIR = join(process.cwd(), "poems");

function mdToText(md: string): string {
  return md
    .replace(/^#\s+/m, "")
    .replace(/\s+$/gm, "")
    .trim();
}

function convertOneSource(
  mdPath: string,
  outBasename: string,
  dirPath: string,
  config: ReturnType<typeof getPoemMediaConfig>,
  bundledMediaUrl: string | null,
  imageAbsPath: string | null,
  bundledAudioUrl: string | null,
): number {
  const md = readFileSync(mdPath, "utf-8");
  const base = join(dirPath, outBasename);

  const html = poemMarkdownToHtmlDocument(md);
  const htmlPath = base + ".html";
  const needsWrap = Boolean(bundledMediaUrl || bundledAudioUrl);
  let outHtml = html;
  if (needsWrap) {
    outHtml = wrapHtmlWithPoemBackground(html, config.image, "/media/", bundledMediaUrl, imageAbsPath, bundledAudioUrl);
  } else {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const body = injectPoemAnthologyNav(bodyMatch?.[1]?.trim() ?? "");
    outHtml = html.replace(/<body[^>]*>[\s\S]*<\/body>/i, `<body>\n${body}\n</body>`);
  }
  writeFileSync(htmlPath, outHtml, "utf-8");

  const text = mdToText(md);
  const txtPath = base + ".txt";
  writeFileSync(txtPath, text, "utf-8");
  return 2;
}

function convertPoemDir(dirPath: string, poemId: string): number {
  let count = 0;
  const config = getPoemMediaConfig(dirPath, poemId);
  const { imageRelative, audioRelative, imageAbsPath } = syncPoemBundledAssets(
    dirPath,
    config.image,
    config.music,
  );

  const afSrc = resolveAfrikaansMarkdownPath(dirPath);
  if (afSrc) count += convertOneSource(afSrc, "af", dirPath, config, imageRelative, imageAbsPath, audioRelative);

  const enSrc = resolveEnglishMarkdownPath(dirPath);
  if (enSrc) count += convertOneSource(enSrc, "en", dirPath, config, imageRelative, imageAbsPath, audioRelative);

  return count;
}

function main() {
  if (!existsSync(POEMS_DIR)) {
    console.error("Poems directory not found:", POEMS_DIR);
    process.exit(1);
  }

  const filterIds = getPoemIdsFilterFromEnv();
  const filterSet = filterIds ? new Set(filterIds) : null;

  const entries = readdirSync(POEMS_DIR, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (filterSet && !filterSet.has(entry.name)) continue;
    const count = convertPoemDir(join(POEMS_DIR, entry.name), entry.name);
    total += count;
  }

  const scope = filterIds ? ` (${filterIds.length} poem folder(s) via POEM_IDS)` : "";
  console.log(`Converted ${total} files (HTML + text) from poems/${scope}`);
}

main();
