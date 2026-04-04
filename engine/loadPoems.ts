/**
 * Loads poems from the poems/ folder.
 * Afrikaans: af.md, or af-translate.md (e.g. English-sourced poems translated to Afrikaans).
 * English: en.md or en.generated.md; if missing, English lines mirror Afrikaans.
 * Resolves per-poem media from public/media/poems/<id>/ when not in config.
 */

import { readFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { PoemConfig, PoemData } from "./types.js";

const POEMS_DIR = join(process.cwd(), "poems");
const MEDIA_POEMS_DIR = join(process.cwd(), "public", "media", "poems");

const VIDEO_EXTS = [".mp4", ".mov", ".webm"];
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];
const AUDIO_EXTS = [".mp3", ".wav", ".m4a"];

function findFile(basePath: string, names: string[], exts: string[]): string | null {
  for (const name of names) {
    for (const ext of exts) {
      const file = `${name}${ext}`;
      if (existsSync(join(basePath, file))) return file;
    }
  }
  return null;
}

/** True if logical path poems/<id>/file exists under public/media/poems. */
function logicalMediaFileExists(logicalPath: string): boolean {
  if (!logicalPath.startsWith("poems/")) return false;
  const rel = logicalPath.slice("poems/".length);
  return existsSync(join(MEDIA_POEMS_DIR, ...rel.split("/").filter(Boolean)));
}

function resolvePoemMedia(id: string, config: PoemConfig): PoemConfig {
  const poemMediaDir = join(MEDIA_POEMS_DIR, id);
  mkdirSync(poemMediaDir, { recursive: true });

  const out = { ...config };
  const prefix = `poems/${id}`;

  if (!out.background) {
    const video = findFile(poemMediaDir, ["video", "background"], VIDEO_EXTS);
    if (video) out.background = `${prefix}/${video}`;
  }
  if (out.image && !logicalMediaFileExists(out.image)) {
    delete out.image;
  }
  if (!out.image) {
    const image = findFile(poemMediaDir, ["o-image", "t-image", "b-image", "l-image", "r-image", "image", "background"], IMAGE_EXTS);
    if (image) out.image = `${prefix}/${image}`;
  }
  if (!out.music) {
    const audio = findFile(poemMediaDir, ["audio", "music", "sound"], AUDIO_EXTS);
    if (audio) out.music = `${prefix}/${audio}`;
  }
  return out;
}

function parseMarkdownLines(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Prefer af.md; else af-translate.md (machine translation from English source). */
export function resolveAfrikaansMarkdownPath(poemDir: string): string | null {
  const primary = join(poemDir, "af.md");
  if (existsSync(primary)) return primary;
  const translated = join(poemDir, "af-translate.md");
  if (existsSync(translated)) return translated;
  return null;
}

/** Prefer en.md; fall back to en.generated.md from translate script. */
export function resolveEnglishMarkdownPath(poemDir: string): string | null {
  const manual = join(poemDir, "en.md");
  if (existsSync(manual)) return manual;
  const generated = join(poemDir, "en.generated.md");
  if (existsSync(generated)) return generated;
  return null;
}

/** Config + auto-detected media paths (does not require en.md). */
export function getPoemMediaConfig(poemDir: string, id: string): PoemConfig {
  return loadConfig(poemDir, id);
}

function loadConfig(poemDir: string, id: string): PoemConfig {
  const configPath = join(poemDir, "config.json");
  let config: PoemConfig = { id };
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        config = { ...raw, id } as PoemConfig;
      }
    } catch (e) {
      console.warn(`[loadPoems] Skipping invalid config.json for ${id}:`, e instanceof Error ? e.message : e);
    }
  }
  return resolvePoemMedia(id, config);
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
    const afPath = resolveAfrikaansMarkdownPath(poemDir);
    if (!afPath) continue;

    const config = loadConfig(poemDir, entry.name);
    const af = parseMarkdownLines(readFileSync(afPath, "utf-8"));
    const enPath = resolveEnglishMarkdownPath(poemDir);
    const en = enPath
      ? parseMarkdownLines(readFileSync(enPath, "utf-8"))
      : [...af];

    poems.push({ id: entry.name, config, af, en });
  }

  return poems.sort((a, b) => a.id.localeCompare(b.id));
}
