/**
 * Renders a single poem video using Remotion.
 * Uses @remotion/bundler and @remotion/renderer.
 */

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { join } from "path";
import { loadPoems } from "./loadPoems.js";
import type { PoemLanguage } from "./types.js";

const OUT_VIDEOS = join(process.cwd(), "output", "videos");

export interface RenderOptions {
  poemId: string;
  language?: PoemLanguage;
  codec?: "h264" | "h265" | "vp8" | "vp9";
}

export async function renderPoem(options: RenderOptions): Promise<string> {
  const { poemId, language = "af", codec = "h264" } = options;

  const poems = loadPoems();
  const poem = poems.find((p) => p.id === poemId);
  if (!poem) {
    throw new Error(`Poem not found: ${poemId}`);
  }

  const compositionId = `${poemId}-${language}`;

  const bundleLocation = await bundle({
    entryPoint: join(process.cwd(), "src", "index.ts"),
  });

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps: { poem, language },
  });

  const outputPath = join(OUT_VIDEOS, `${compositionId}.mp4`);

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec,
    outputLocation: outputPath,
    inputProps: { poem, language },
  });

  return outputPath;
}
