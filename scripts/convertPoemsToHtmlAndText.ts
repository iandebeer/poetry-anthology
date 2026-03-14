/**
 * Converts poem markdown files to HTML and plain text.
 * Run: npm run convert-poems
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const POEMS_DIR = join(process.cwd(), "poems");

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const parts: string[] = [];
  let i = 0;

  // Skip leading blank lines
  while (i < lines.length && lines[i].trim() === "") i++;

  // Optional title (# title)
  if (lines[i]?.trim().startsWith("# ")) {
    const title = lines[i].replace(/^#\s+/, "").trim();
    parts.push(`<h1>${escapeHtml(title)}</h1>`);
    i++;
  }

  // Stanzas (paragraphs separated by blank lines)
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Poem</title>
</head>
<body>
${parts.join("\n\n")}
</body>
</html>`;
}

function mdToText(md: string): string {
  return md
    .replace(/^#\s+/m, "")
    .replace(/\s+$/gm, "")
    .trim();
}

function convertPoemDir(dirPath: string, poemId: string): number {
  const mdFiles = ["af.md", "en.md"];
  let count = 0;

  for (const name of mdFiles) {
    const mdPath = join(dirPath, name);
    if (!existsSync(mdPath)) continue;

    const md = readFileSync(mdPath, "utf-8");
    const base = mdPath.replace(/\.md$/, "");

    const html = mdToHtml(md);
    const htmlPath = base + ".html";
    writeFileSync(htmlPath, html, "utf-8");
    count++;

    const text = mdToText(md);
    const txtPath = base + ".txt";
    writeFileSync(txtPath, text, "utf-8");
    count++;
  }

  return count;
}

function main() {
  if (!existsSync(POEMS_DIR)) {
    console.error("Poems directory not found:", POEMS_DIR);
    process.exit(1);
  }

  const entries = readdirSync(POEMS_DIR, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const count = convertPoemDir(join(POEMS_DIR, entry.name), entry.name);
    total += count;
  }

  console.log(`Converted ${total} files (HTML + text) from poems/`);
}

main();
