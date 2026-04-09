/**
 * Recompress PNGs under public/media/poems/ for smaller files at the same pixel dimensions
 * (no resize). Default: palette + quality (web). Use --lossless for zlib-only recompression.
 *
 * Run: npm run optimize-pngs
 * Then: npm run convert-poems   (refresh poems/<id>/media/ copies)
 */

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import sharp from "sharp";

const ROOT = join(process.cwd(), "public", "media", "poems");

function* walkPngs(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walkPngs(p);
    else if (name.toLowerCase().endsWith(".png")) yield p;
  }
}

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    lossless: argv.includes("--lossless"),
    quality: (() => {
      const q = argv.find((a) => a.startsWith("--quality="));
      if (!q) return 86;
      const n = parseInt(q.slice("--quality=".length), 10);
      return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 86;
    })(),
  };
}

async function optimizeFile(
  absPath: string,
  lossless: boolean,
  quality: number,
): Promise<{ before: number; after: number; wrote: boolean }> {
  const beforeBuf = readFileSync(absPath);
  const beforeSize = beforeBuf.length;
  const meta = await sharp(beforeBuf).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) {
    console.warn(`[optimize-pngs] skip (no dimensions): ${absPath}`);
    return { before: beforeSize, after: beforeSize, wrote: false };
  }

  let outBuf: Buffer;

  if (lossless) {
    outBuf = await sharp(beforeBuf)
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        effort: 10,
      })
      .toBuffer();
  } else {
    outBuf = await sharp(beforeBuf)
      .png({
        compressionLevel: 9,
        palette: true,
        quality,
        effort: 10,
      })
      .toBuffer();
  }

  const afterMeta = await sharp(outBuf).metadata();
  if (afterMeta.width !== w || afterMeta.height !== h) {
    console.warn(`[optimize-pngs] skip (dimension mismatch): ${absPath}`);
    return { before: beforeSize, after: beforeSize, wrote: false };
  }

  const afterSize = outBuf.length;
  if (afterSize >= beforeSize) {
    if (!lossless) {
      const losslessBuf = await sharp(beforeBuf)
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
          effort: 10,
        })
        .toBuffer();
      const lm = await sharp(losslessBuf).metadata();
      if (lm.width === w && lm.height === h && losslessBuf.length < beforeSize) {
        writeFileSync(absPath, losslessBuf);
        return { before: beforeSize, after: losslessBuf.length, wrote: true };
      }
    }
    return { before: beforeSize, after: beforeSize, wrote: false };
  }

  writeFileSync(absPath, outBuf);
  return { before: beforeSize, after: afterSize, wrote: true };
}

async function main() {
  const { lossless, quality } = parseArgs();
  if (!existsSync(ROOT)) {
    console.error("Not found:", ROOT);
    process.exit(1);
  }

  const files = [...walkPngs(ROOT)];
  if (files.length === 0) {
    console.log("No PNG files under", ROOT);
    return;
  }

  console.log(
    `[optimize-pngs] ${files.length} PNG(s) — mode: ${lossless ? "lossless (zlib)" : `palette quality=${quality}`}`,
  );

  let totalBefore = 0;
  let totalAfter = 0;
  let changed = 0;

  for (const f of files.sort()) {
    const r = await optimizeFile(f, lossless, quality);
    totalBefore += r.before;
    totalAfter += r.after;
    if (r.wrote) {
      changed++;
      const pct = (((r.before - r.after) / r.before) * 100).toFixed(1);
      console.log(
        `  ${((r.before - r.after) / 1024 / 1024).toFixed(2)} MB smaller (${pct}%): ${f.replace(process.cwd() + "/", "")}`,
      );
    } else if (r.before !== r.after) {
      console.log(`  unchanged: ${f.replace(process.cwd() + "/", "")}`);
    }
  }

  const saved = totalBefore - totalAfter;
  console.log(
    `[optimize-pngs] done — ${changed} file(s) updated, ${(saved / 1024 / 1024).toFixed(2)} MB saved of ${(totalBefore / 1024 / 1024).toFixed(2)} MB total`,
  );
  if (!lossless) {
    console.log("Run: npm run convert-poems  (sync into poems/<id>/media/)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
