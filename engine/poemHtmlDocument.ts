/**
 * Full HTML shell for poem pages (admin preview, convert-poems output).
 * Uses a fixed full-viewport layer for the image so backgrounds show reliably with flex layout.
 */

/** Placement from filename: t-image.jpg=top, b=bottom, l=left, r=right */
export function getPlacementFromImagePath(imagePath: string): "top" | "bottom" | "left" | "right" | null {
  const name = imagePath.split("/").pop() ?? "";
  if (name.startsWith("t-")) return "top";
  if (name.startsWith("b-")) return "bottom";
  if (name.startsWith("l-")) return "left";
  if (name.startsWith("r-")) return "right";
  return null;
}

function cssUrlQuoted(urlPath: string): string {
  const safe = urlPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `url("${safe}")`;
}

/**
 * @param imagePath - e.g. poems/<id>/r-image.png (logical path under public/media)
 * @param mediaUrlPrefix - default "/media/" for admin server; use "" or "./" only if you rewrite paths yourself
 */
export function wrapHtmlWithPoemBackground(
  html: string,
  imagePath: string | undefined,
  mediaUrlPrefix = "/media/",
): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch?.[1] ?? html;
  const bgUrl = imagePath ? `${mediaUrlPrefix.replace(/\/?$/, "/")}${encodeURI(imagePath)}` : null;
  const placement = imagePath ? getPlacementFromImagePath(imagePath) : null;

  const baseStyles =
    "html,body{min-height:100%;margin:0}" +
    "body{font-family:serif;line-height:1.6;color:#e8e8ed;background-color:#0f0f14;display:flex;position:relative}" +
    ".poem-bg-layer{position:fixed;inset:0;z-index:0;pointer-events:none;background-position:center center;background-size:cover;background-repeat:no-repeat}" +
    ".poem-content{position:relative;z-index:1;max-width:36em;padding:2rem}" +
    ".lang-block{margin-bottom:2rem}h1{font-size:1.25rem}h3{font-size:0.9rem;color:#999}p{margin:0.5rem 0}";

  const placementStyles =
    placement === "top"
      ? "body{flex-direction:column;align-items:center;justify-content:flex-start;padding-top:2rem}.poem-content{margin:0 auto}"
      : placement === "bottom"
        ? "body{flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:2rem}.poem-content{margin:0 auto}"
        : placement === "left"
          ? "body{align-items:center;justify-content:flex-start;padding-left:2rem}.poem-content{margin:0}"
          : placement === "right"
            ? "body{align-items:center;justify-content:flex-end;padding-right:2rem}.poem-content{margin:0 2rem 0 0;text-align:right}"
            : "body{align-items:center;justify-content:center}.poem-content{margin:2rem auto}";

  const bgLayerStyles = bgUrl ? `.poem-bg-layer{background-image:${cssUrlQuoted(bgUrl)}}` : "";
  const contentOverlay = bgUrl ? ".poem-content{background:rgba(0,0,0,0.65);border-radius:8px}" : "";

  const bgMarkup = bgUrl ? '<div class="poem-bg-layer" aria-hidden="true"></div>' : "";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Poem</title><style>${baseStyles}${placementStyles}${bgLayerStyles}${contentOverlay}</style></head><body>${bgMarkup}<div class="poem-content">${bodyContent.trim()}</div></body></html>`;
}

/** Poem HTML saved under poems/<id>/ uses ../../public/media/ — rewrite for admin server /media mount. */
export function rewritePoemHtmlToServerMediaUrls(html: string): string {
  return html.replace(/\.\.\/\.\.\/public\/media\//g, "/media/");
}

/** Poem HTML copied to export/ needs one less .. segment. */
export function rewritePoemHtmlForExportFolder(html: string): string {
  return html.replace(/\.\.\/\.\.\/public\/media\//g, "../public/media/");
}

/** Inner markup for combining af+en (strips bg layer / uses .poem-content only). */
export function extractPoemBodyInnerForCombine(html: string): string {
  const content = html.match(/<div class="poem-content"[^>]*>([\s\S]*?)<\/div>\s*<\/body>/i);
  if (content) return content[1].trim();
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let inner = body?.[1] ?? html;
  inner = inner.replace(/<div class="poem-bg-layer"[^>]*>\s*<\/div>\s*/gi, "");
  return inner.trim();
}
