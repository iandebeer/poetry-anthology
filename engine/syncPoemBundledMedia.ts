/**
 * Copy the resolved poem image from public/media/poems/<id>/… into poems/<id>/media/
 * so HTML next to af.md can reference it as media/<filename> (relative to the .html file).
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { basename, join } from "path";

const MEDIA_PUBLIC = join(process.cwd(), "public", "media");

/**
 * Sync one image file into poemDir/media/. Removes poemDir/media when no valid image.
 * @returns CSS-safe relative URL from poems/<id>/*.html e.g. media/l-image.png
 */
export function syncPoemMediaToPoemDir(poemDir: string, logicalImagePath: string | undefined): string | null {
  const mediaOut = join(poemDir, "media");

  const clearMediaDir = () => {
    if (existsSync(mediaOut)) {
      rmSync(mediaOut, { recursive: true, force: true });
    }
  };

  if (!logicalImagePath?.startsWith("poems/")) {
    clearMediaDir();
    return null;
  }

  const rel = logicalImagePath.slice("poems/".length);
  const segments = rel.split("/").filter(Boolean);
  if (segments.length < 2) {
    clearMediaDir();
    return null;
  }

  const src = join(MEDIA_PUBLIC, "poems", ...segments);
  if (!existsSync(src) || !statSync(src).isFile()) {
    clearMediaDir();
    return null;
  }

  mkdirSync(mediaOut, { recursive: true });
  const file = basename(src);
  const dest = join(mediaOut, file);
  copyFileSync(src, dest);

  // Other stale files in media/ (old name after rename)
  for (const ent of readdirSync(mediaOut, { withFileTypes: true })) {
    if (!ent.isFile() || ent.name === file) continue;
    rmSync(join(mediaOut, ent.name), { force: true });
  }

  return `media/${encodeURIComponent(file)}`;
}

/** Absolute path to bundled image after sync, or null */
export function bundledPoemImagePath(poemDir: string, logicalImagePath: string | undefined): string | null {
  if (!logicalImagePath?.startsWith("poems/")) return null;
  const file = basename(logicalImagePath);
  const p = join(poemDir, "media", file);
  return existsSync(p) ? p : null;
}
