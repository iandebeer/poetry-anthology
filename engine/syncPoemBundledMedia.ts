/**
 * Copy resolved poem image and/or soundtrack from public/media into poems/<id>/media/
 * so HTML next to af.md can reference them as media/<filename> (relative to the .html file).
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { basename, join } from "path";

const MEDIA_PUBLIC = join(process.cwd(), "public", "media");

function resolveMusicSourcePath(musicLogical: string): string | null {
  if (musicLogical.startsWith("poems/")) {
    const rel = musicLogical.slice("poems/".length);
    const p = join(MEDIA_PUBLIC, "poems", ...rel.split("/").filter(Boolean));
    if (existsSync(p) && statSync(p).isFile()) return p;
    return null;
  }
  const p = join(MEDIA_PUBLIC, "music", musicLogical);
  if (existsSync(p) && statSync(p).isFile()) return p;
  return null;
}

export interface SyncPoemBundledAssetsResult {
  /** Relative URL from poems/<id>/*.html e.g. media/l-image.png */
  imageRelative: string | null;
  /** Relative URL for <audio src> e.g. media/audio.mp3 */
  audioRelative: string | null;
  imageAbsPath: string | null;
}

/**
 * Sync image and/or audio into poemDir/media/. Removes stale files not among the current assets.
 */
export function syncPoemBundledAssets(
  poemDir: string,
  logicalImagePath: string | undefined,
  musicLogical: string | undefined,
): SyncPoemBundledAssetsResult {
  const mediaOut = join(poemDir, "media");

  const clearMediaDir = () => {
    if (existsSync(mediaOut)) {
      rmSync(mediaOut, { recursive: true, force: true });
    }
  };

  let imageSrc: string | null = null;
  let imageBasename: string | null = null;
  if (logicalImagePath?.startsWith("poems/")) {
    const rel = logicalImagePath.slice("poems/".length);
    const segments = rel.split("/").filter(Boolean);
    if (segments.length >= 2) {
      const p = join(MEDIA_PUBLIC, "poems", ...segments);
      if (existsSync(p) && statSync(p).isFile()) {
        imageSrc = p;
        imageBasename = basename(p);
      }
    }
  }

  let musicSrc: string | null = null;
  let musicBasename: string | null = null;
  if (musicLogical) {
    const p = resolveMusicSourcePath(musicLogical);
    if (p) {
      musicSrc = p;
      musicBasename = basename(p);
    }
  }

  if (!imageSrc && !musicSrc) {
    clearMediaDir();
    return { imageRelative: null, audioRelative: null, imageAbsPath: null };
  }

  mkdirSync(mediaOut, { recursive: true });
  const keep = new Set<string>();
  if (imageSrc && imageBasename) {
    copyFileSync(imageSrc, join(mediaOut, imageBasename));
    keep.add(imageBasename);
  }
  if (musicSrc && musicBasename) {
    copyFileSync(musicSrc, join(mediaOut, musicBasename));
    keep.add(musicBasename);
  }

  for (const ent of readdirSync(mediaOut, { withFileTypes: true })) {
    if (!ent.isFile() || keep.has(ent.name)) continue;
    rmSync(join(mediaOut, ent.name), { force: true });
  }

  const imageRelative = imageBasename ? `media/${encodeURIComponent(imageBasename)}` : null;
  const audioRelative = musicBasename ? `media/${encodeURIComponent(musicBasename)}` : null;
  const imageAbsPath =
    imageBasename && existsSync(join(mediaOut, imageBasename)) ? join(mediaOut, imageBasename) : null;

  return { imageRelative, audioRelative, imageAbsPath };
}

/**
 * @returns CSS-safe relative URL for the image, or null (backward-compatible single-asset API).
 */
export function syncPoemMediaToPoemDir(
  poemDir: string,
  logicalImagePath: string | undefined,
  musicLogical?: string | undefined,
): string | null {
  return syncPoemBundledAssets(poemDir, logicalImagePath, musicLogical).imageRelative;
}

/** Absolute path to bundled image after sync, or null */
export function bundledPoemImagePath(poemDir: string, logicalImagePath: string | undefined): string | null {
  if (!logicalImagePath?.startsWith("poems/")) return null;
  const file = basename(logicalImagePath);
  const p = join(poemDir, "media", file);
  return existsSync(p) ? p : null;
}
