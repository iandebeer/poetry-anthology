/**
 * Sample average colour from an image (1×1 resize) via ImageMagick.
 * Falls back silently when magick/convert is missing or fails.
 */

import { execFileSync } from "child_process";
import { existsSync } from "fs";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const MAGICK_ARGS = (absPath: string) =>
  [absPath, "-scale", "1x1!", "-format", "%[fx:int(255*r)],%[fx:int(255*g)],%[fx:int(255*b)]", "info:"] as const;

function tryBin(bin: string, absPath: string): string | null {
  try {
    return execFileSync(bin, MAGICK_ARGS(absPath), {
      encoding: "utf8",
      maxBuffer: 256 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

/** Returns sRGB 0–255 from image file, or null if unavailable. */
export function dominantRgbFromImageFile(absPath: string): Rgb | null {
  if (!absPath || !existsSync(absPath)) return null;
  const out = tryBin("magick", absPath) ?? tryBin("convert", absPath);
  if (!out) return null;
  const parts = out.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [r, g, b] = parts;
  return { r, g, b };
}

/** Blend rgb toward white for a light panel background (whiteMix 0 = raw, 1 = white). */
export function lightTintFromRgb(rgb: Rgb, whiteMix = 0.86): Rgb {
  const t = Math.min(1, Math.max(0, whiteMix));
  return {
    r: Math.round(rgb.r * (1 - t) + 255 * t),
    g: Math.round(rgb.g * (1 - t) + 255 * t),
    b: Math.round(rgb.b * (1 - t) + 255 * t),
  };
}

export function rgbToCss(rgb: Rgb): string {
  return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
}
