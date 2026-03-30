/**
 * Generates .cspell/afrikaans.txt from all af.md poem files.
 * Run: npm run generate-af-dict
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { resolveAfrikaansMarkdownPath } from "../engine/loadPoems.js";

const POEMS_DIR = join(process.cwd(), "poems");
const OUT_DIR = join(process.cwd(), ".cspell");
const OUT_FILE = join(OUT_DIR, "afrikaans.txt");

const COMMON_AFRIKAANS = [
  "al", "altyd", "baie", "dat", "deur", "die", "dit", "ek", "en", "gaan", "geen",
  "het", "hier", "hoe", "hy", "in", "is", "jy", "kan", "maar", "met", "my", "na",
  "nie", "nog", "om", "ons", "op", "sal", "se", "so", "sy", "te", "tot", "van",
  "vir", "voel", "waar", "wat", "wees", "wel", "wil", "word",
];

function extractWords(text: string): Set<string> {
  const words = new Set<string>();
  const normalized = text.replace(/[^\p{L}\p{M}'-]/gu, "\n");
  for (const w of normalized.split("\n")) {
    const trimmed = w.trim().toLowerCase();
    if (trimmed.length > 1 || trimmed === "'n") {
      words.add(trimmed);
    }
  }
  return words;
}

function main() {
  if (!existsSync(POEMS_DIR)) {
    console.error("Poems directory not found");
    process.exit(1);
  }

  const entries = readdirSync(POEMS_DIR, { withFileTypes: true });
  const allWords = new Set<string>(COMMON_AFRIKAANS);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const afPath = resolveAfrikaansMarkdownPath(join(POEMS_DIR, entry.name));
    if (!afPath) continue;
    const content = readFileSync(afPath, "utf-8");
    for (const w of extractWords(content)) {
      allWords.add(w);
    }
  }

  const sorted = [...allWords].sort((a, b) => a.localeCompare(b));
  const header = `# Afrikaans dictionary (generated from poems/af.md and af-translate.md)
# Run: npm run generate-af-dict
# Words: ${sorted.length}

`;
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, header + sorted.join("\n") + "\n", "utf-8");
  console.log(`Generated ${sorted.length} words → .cspell/afrikaans.txt`);
}

main();
