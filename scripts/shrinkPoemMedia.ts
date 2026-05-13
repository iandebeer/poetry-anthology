/**
 * Shrink raster images under public/media/poems/<id>/ until each file is strictly below 2 MiB.
 * May resize dimensions (lossy). Keeps PNG / JPEG / WebP / single-frame GIF as the same format.
 *
 * Env: POEM_IDS=id1,id2 — optional; when omitted, every subdirectory of public/media/poems/ is scanned.
 *
 * Run: npm run shrink-poem-media
 * Then: npm run convert-poems (with the same POEM_IDS if you only sync selected poems).
 */

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { extname, join, resolve } from "path";
import sharp from "sharp";
import { getPoemIdsFilterFromEnv } from "../engine/poemIdsFilter.js";
import { safePoemDir } from "../engine/safePoemPath.js";

const MEDIA_POEMS_ROOT = resolve(join(process.cwd(), "public", "media", "poems"));
/** Strictly smaller than 2 MiB (same ceiling as prior manual ImageMagick pass). */
const MAX_BYTES = 2 * 1024 * 1024 - 1;

const SCALES = [
  98, 95, 92, 90, 88, 85, 82, 80, 78, 75, 72, 70, 68, 65, 62, 60, 58, 55, 52, 50, 48, 45, 42, 40, 38, 35, 32,
  30, 28, 25, 22, 20, 18, 16, 14, 12, 10, 8, 6, 5,
];

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

function* poemMediaDirs(): Generator<string> {
  const filter = getPoemIdsFilterFromEnv();
  if (!existsSync(MEDIA_POEMS_ROOT)) {
    console.warn("[shrink-poem-media] missing:", MEDIA_POEMS_ROOT);
    return;
  }
  if (filter) {
    for (const id of filter) {
      const dir = safePoemDir(MEDIA_POEMS_ROOT, id);
      if (!dir || !existsSync(dir)) {
        console.warn(`[shrink-poem-media] skip missing or unsafe id: ${id}`);
        continue;
      }
      yield dir;
    }
    return;
  }
  for (const name of readdirSync(MEDIA_POEMS_ROOT)) {
    const p = join(MEDIA_POEMS_ROOT, name);
    if (statSync(p).isDirectory()) yield p;
  }
}

function* rasterFilesUnder(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isFile()) continue;
    if (!IMAGE_EXT.test(name)) continue;
    yield p;
  }
}

async function resizeEncode(buf: Buffer, ext: string, nw: number, nh: number): Promise<Buffer> {
  const base = sharp(buf, { limitInputPixels: false }).rotate().resize(nw, nh);
  if (ext === ".jpg" || ext === ".jpeg") {
    return base.jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: "4:2:0" }).toBuffer();
  }
  if (ext === ".png") {
    return base.png({ compressionLevel: 9, effort: 10 }).toBuffer();
  }
  if (ext === ".webp") {
    return base.webp({ quality: 82, effort: 6 }).toBuffer();
  }
  if (ext === ".gif") {
    return base.gif({ colours: 256, effort: 10 }).toBuffer();
  }
  throw new Error(`unsupported extension: ${ext}`);
}

async function shrinkOne(absPath: string): Promise<{ before: number; after: number; changed: boolean }> {
  const buf = readFileSync(absPath);
  const before = buf.length;
  if (before <= MAX_BYTES) return { before, after: before, changed: false };

  const ext = extname(absPath).toLowerCase();
  const meta = await sharp(buf, { limitInputPixels: false }).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) {
    console.warn(`[shrink-poem-media] skip (no dimensions): ${absPath}`);
    return { before, after: before, changed: false };
  }

  if (meta.format === "gif" && (meta.pages ?? 1) > 1) {
    console.warn(`[shrink-poem-media] skip animated GIF: ${absPath}`);
    return { before, after: before, changed: false };
  }

  try {
    const sameSize = await resizeEncode(buf, ext, w, h);
    if (sameSize.length <= MAX_BYTES) {
      writeFileSync(absPath, sameSize);
      return { before, after: sameSize.length, changed: true };
    }
  } catch (e) {
    console.warn(`[shrink-poem-media] recompress failed (${absPath}):`, e instanceof Error ? e.message : e);
  }

  for (const scale of SCALES) {
    const nw = Math.max(1, Math.round((w * scale) / 100));
    const nh = Math.max(1, Math.round((h * scale) / 100));
    try {
      const out = await resizeEncode(buf, ext, nw, nh);
      if (out.length <= MAX_BYTES) {
        writeFileSync(absPath, out);
        return { before, after: out.length, changed: true };
      }
    } catch (e) {
      console.warn(`[shrink-poem-media] scale ${scale}% (${absPath}):`, e instanceof Error ? e.message : e);
    }
  }

  console.warn(`[shrink-poem-media] could not get under 2 MiB: ${absPath}`);
  return { before, after: before, changed: false };
}

async function main() {
  const filter = getPoemIdsFilterFromEnv();
  const scope = filter ? `${filter.length} poem(s) (POEM_IDS)` : "all poem media folders";
  console.log(`[shrink-poem-media] ${scope} — max ${MAX_BYTES} bytes per image`);

  let nFiles = 0;
  let changed = 0;
  let saved = 0;

  for (const dir of poemMediaDirs()) {
    for (const file of rasterFilesUnder(dir)) {
      nFiles++;
      const r = await shrinkOne(file);
      if (r.changed) {
        changed++;
        saved += r.before - r.after;
        const rel = file.replace(process.cwd() + "/", "");
        console.log(`  ${((r.before - r.after) / 1024 / 1024).toFixed(2)} MiB saved → ${(r.after / 1024 / 1024).toFixed(2)} MiB: ${rel}`);
      }
    }
  }

  if (nFiles === 0) {
    console.log("[shrink-poem-media] no raster files found.");
    return;
  }

  console.log(
    `[shrink-poem-media] done — ${changed}/${nFiles} file(s) updated; ${(saved / 1024 / 1024).toFixed(2)} MiB saved`,
  );
  console.log("Run: npm run convert-poems  (refresh poems/<id>/media/ copies; use POEM_IDS when scope is partial)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
