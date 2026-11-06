import sharp from 'sharp';
import { MAX_BYTES, shrinkOne } from '../../scripts/shrinkPoemMedia.js';
import { writeFileSync, readFileSync, statSync } from 'node:fs';

export async function saveDraftImage(bytes: Buffer, path: string): Promise<void> {
  if (bytes.length > 20 * 1024 * 1024) throw new Error('Upload an image smaller than 20 MiB.');
  const meta = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
  if (!['png', 'jpeg', 'webp'].includes(meta.format || '') || (meta.pages ?? 1) > 1) throw new Error('Use a still PNG, JPEG or WebP image.');
  // A common repository-compatible PNG filename also chooses the existing split layout.
  const normalized = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().png().toBuffer();
  writeFileSync(path, normalized);
  await shrinkOne(path);
  if (statSync(path).size > MAX_BYTES) throw new Error('The image could not be optimized below 2 MiB.');
  // Decode the final bytes too, rather than trusting a file extension.
  await sharp(readFileSync(path)).metadata();
}
