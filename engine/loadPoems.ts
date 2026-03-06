/**
 * Loads poems from the poems/ folder.
 * Scans each subfolder for af.md, en.md, and config.json.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import type { PoemConfig, PoemData } from "./types.js";

const POEMS_DIR = join(process.cwd(), "poems");

function parseMarkdownLines(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function loadConfig(poemDir: string, id: string): PoemConfig {
  const configPath = join(poemDir, "config.json");
  if (!existsSync(configPath)) {
    return { id };
  }
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  return { id, ...raw };
}

export function loadPoems(): PoemData[] {
  if (!existsSync(POEMS_DIR)) {
    return [];
  }

  const entries = readdirSync(POEMS_DIR, { withFileTypes: true });
  const poems: PoemData[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const poemDir = join(POEMS_DIR, entry.name);
    const afPath = join(poemDir, "af.md");
    const enPath = join(poemDir, "en.md");

    if (!existsSync(afPath) || !existsSync(enPath)) continue;

    const config = loadConfig(poemDir, entry.name);
    const af = parseMarkdownLines(readFileSync(afPath, "utf-8"));
    const en = parseMarkdownLines(readFileSync(enPath, "utf-8"));

    poems.push({ id: entry.name, config, af, en });
  }

  return poems.sort((a, b) => a.id.localeCompare(b.id));
}
