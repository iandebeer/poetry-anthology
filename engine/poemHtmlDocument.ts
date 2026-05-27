/**
 * Full HTML shell for poem pages (admin preview, convert-poems output).
 * Uses a fixed full-viewport layer for the image so backgrounds show reliably with flex layout.
 * o-image.* uses a split layout: image column left, text right, with a light tint from the image colour.
 */

import { dominantRgbFromImageFile, lightTintFromRgb, rgbToCss, type Rgb } from "./dominantColor.js";

/** Placement from filename: t-image.jpg=top, b=bottom, l=left, r=right, o-=split (image left, text right) */
export type PoemImagePlacement = "top" | "bottom" | "left" | "right" | "split-left" | null;

export function getPlacementFromImagePath(imagePath: string): PoemImagePlacement {
  const fileName = imagePath.split("/").pop() ?? "";
  const base = fileName.replace(/\.[^.]+$/i, "");
  if (base.startsWith("o-")) return "split-left";
  if (base.startsWith("t-")) return "top";
  if (base.startsWith("b-")) return "bottom";
  if (base.startsWith("l-")) return "left";
  if (base.startsWith("r-")) return "right";
  return null;
}

function cssUrlQuoted(urlPath: string): string {
  const safe = urlPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `url("${safe}")`;
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** URL path for &lt;audio src&gt; when serving from admin (public/media). */
export function adminMediaAudioSrc(music: string | undefined): string | null {
  if (!music) return null;
  const path = music.startsWith("poems/") ? music : `music/${music}`;
  return "/media/" + path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/** Remove player markup so admin can re-wrap without duplicate &lt;audio&gt; (e.g. from saved af.html). */
export function stripPoemAudioElementsFromInnerHtml(html: string): string {
  return html.replace(/<div class="poem-audio-wrap"[^>]*>\s*[\s\S]*?<\/div>/gi, "").trim();
}

function splitLayoutTintRgb(imageAbsPath: string | null | undefined): Rgb {
  const sampled = imageAbsPath ? dominantRgbFromImageFile(imageAbsPath) : null;
  const base = sampled ?? { r: 118, g: 118, b: 128 };
  return lightTintFromRgb(base, 0.86);
}

function poemAudioMarkup(audioSrc: string | null): string {
  if (!audioSrc) return "";
  return `<div class="poem-audio-wrap"><audio class="poem-audio" controls preload="metadata" src="${escapeHtmlAttr(audioSrc)}"></audio></div>`;
}

/**
 * @param imagePath - logical path under public/media, e.g. poems/<id>/r-image.png (used for placement + admin URL)
 * @param mediaUrlPrefix - HTTP base for admin, e.g. "/media/"
 * @param relativeToHtmlUrl - if set (e.g. media/l-image.png), CSS background uses this path relative to the .html file
 * @param imageAbsPath - optional filesystem path to the image (for o-image dominant colour sampling)
 * @param audioSrc - optional &lt;audio src&gt;: relative e.g. media/track.mp3 (beside .html), or absolute path for admin e.g. /media/poems/id/track.mp3
 */
export function wrapHtmlWithPoemBackground(
  html: string,
  imagePath: string | undefined,
  mediaUrlPrefix = "/media/",
  relativeToHtmlUrl: string | null = null,
  imageAbsPath: string | null = null,
  audioSrc: string | null = null,
): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch?.[1] ?? html;
  const imgSrc = imagePath
    ? relativeToHtmlUrl
      ? relativeToHtmlUrl
      : `${mediaUrlPrefix.replace(/\/?$/, "/")}${encodeURI(imagePath)}`
    : null;
  const placement = imagePath ? getPlacementFromImagePath(imagePath) : null;

  if (placement === "split-left" && imgSrc) {
    const tint = splitLayoutTintRgb(imageAbsPath);
    const tintCss = rgbToCss(tint);
    const splitStyles =
      "html,body{min-height:100%;margin:0}" +
      "body{font-family:serif;line-height:1.6;color:#1a1a20;background-color:#e8e8ec;display:flex;position:relative}" +
      ".poem-split-wrap{display:flex;flex-direction:row;flex:1;width:100%;min-height:100vh;align-items:center}" +
      ".poem-split-img{display:block;width:42vw;max-width:520px;min-width:180px;height:auto;flex-shrink:0;object-fit:contain;object-position:center center}" +
      ".poem-content{position:relative;z-index:1;flex:1;align-self:stretch;max-width:none;padding:2rem 2.5rem;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;min-height:100vh}" +
      ".lang-block{margin-bottom:2rem}h1{font-size:1.25rem}h3{font-size:0.9rem;color:#555}p{margin:0.5rem 0}" +
      ".poem-audio-wrap{margin-top:1.5rem;width:100%;max-width:28rem}" +
      ".poem-audio{display:block;width:100%;height:2.5rem}" +
      "@media (max-width:640px){.poem-split-wrap{flex-direction:column;align-items:center}.poem-split-img{width:100%;max-width:none;height:auto}.poem-content{align-self:stretch;width:100%}}";
    const contentBg = `.poem-content{background-color:${tintCss};border-radius:0}`;

    const audioHtml = poemAudioMarkup(audioSrc);
    const splitMarkup = `<div class="poem-split-wrap"><img class="poem-split-img" src="${escapeHtmlAttr(imgSrc)}" alt="" /><div class="poem-content">${bodyContent.trim()}${audioHtml}</div></div>`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Poem</title><style>${splitStyles}${contentBg}</style></head><body>${splitMarkup}</body></html>`;
  }

  const bgUrl = imgSrc;
  const baseStyles =
    "html,body{min-height:100%;margin:0}" +
    "body{font-family:serif;line-height:1.6;color:#e8e8ed;background-color:#0f0f14;display:flex;position:relative}" +
    ".poem-bg-layer{position:fixed;inset:0;z-index:0;pointer-events:none;background-repeat:no-repeat;background-size:100% auto}" +
    ".poem-content{position:relative;z-index:1;max-width:36em;padding:2rem}" +
    ".lang-block{margin-bottom:2rem}h1{font-size:1.25rem}h3{font-size:0.9rem;color:#999}p{margin:0.5rem 0}" +
    ".poem-audio-wrap{margin-top:1.75rem;width:100%;max-width:28rem}" +
    ".poem-audio{display:block;width:100%;height:2.5rem;filter:brightness(0.95)}";

  const placementStyles =
    placement === "top"
      ? "body{flex-direction:column;align-items:center;justify-content:flex-start;padding-top:2rem}.poem-content{margin:0 auto}.poem-bg-layer{background-position:top center}"
      : placement === "bottom"
        ? "body{flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:2rem}.poem-content{margin:0 auto}.poem-bg-layer{background-position:bottom center}"
        : placement === "left"
          ? "body{align-items:center;justify-content:flex-start;padding-left:2rem}.poem-content{margin:0}.poem-bg-layer{background-position:left center}"
          : placement === "right"
            ? "body{align-items:center;justify-content:flex-end;padding-right:2rem}.poem-content{margin:0 2rem 0 0;text-align:right}.poem-bg-layer{background-position:right center}"
            : "body{align-items:center;justify-content:center}.poem-content{margin:2rem auto}.poem-bg-layer{background-position:center top}";

  const bgLayerStyles = bgUrl ? `.poem-bg-layer{background-image:${cssUrlQuoted(bgUrl)}}` : "";
  const contentOverlay = bgUrl ? ".poem-content{background:rgba(0,0,0,0.65);border-radius:8px}" : "";

  const bgMarkup = bgUrl ? '<div class="poem-bg-layer" aria-hidden="true"></div>' : "";
  const audioHtml = poemAudioMarkup(audioSrc);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Poem</title><style>${baseStyles}${placementStyles}${bgLayerStyles}${contentOverlay}</style></head><body>${bgMarkup}<div class="poem-content">${bodyContent.trim()}${audioHtml}</div></body></html>`;
}

/** Inner markup for combining af+en (strips bg layer / uses .poem-content only). */
export function extractPoemBodyInnerForCombine(html: string): string {
  const startRx = /<div class="poem-content"[^>]*>/i;
  const startMatch = startRx.exec(html);
  if (startMatch) {
    let i = startMatch.index + startMatch[0].length;
    let depth = 1;
    const tagRe = /<\/?div\b[^>]*>/gi;
    tagRe.lastIndex = i;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(html)) !== null) {
      if (m[0].startsWith("</")) depth--;
      else depth++;
      if (depth === 0) return html.slice(i, m.index).trim();
    }
  }
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let inner = body?.[1] ?? html;
  inner = inner.replace(/<div class="poem-bg-layer"[^>]*>\s*<\/div>\s*/gi, "");
  return inner.trim();
}
