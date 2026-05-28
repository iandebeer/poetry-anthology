/**
 * Shared markdown → HTML for poem files (headings, stanzas, inline emphasis).
 */

import {
  DEFAULT_ANTHOLOGY_INDEX_HREF,
  injectPoemAnthologyNav,
} from "./poemHtmlDocument.js";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Apply **bold**, __bold__, *italic*, and _italic_ after HTML escaping. */
export function formatPoemInlineMarkdown(raw: string): string {
  let s = escapeHtml(raw);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/_([^_]+)_/g, "<em>$1</em>");
  return s;
}

export interface PoemMarkdownToHtmlOptions {
  /** Omit the leading `# title` line from output. */
  skipTitle?: boolean;
  /** Heading level for the poem title (default `h1`). */
  titleTag?: "h1" | "h2";
}

/** Headings and blank-line stanzas; line breaks within a stanza become `<br>`. */
export function poemMarkdownToHtmlBody(md: string, options: PoemMarkdownToHtmlOptions = {}): string {
  const { skipTitle = false, titleTag = "h1" } = options;
  const lines = md.split("\n");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length && lines[i].trim() === "") i++;

  if (!skipTitle && lines[i]?.trim().startsWith("# ")) {
    const title = lines[i].replace(/^#\s+/, "").trim();
    parts.push(`<${titleTag}>${formatPoemInlineMarkdown(title)}</${titleTag}>`);
    i++;
  } else if (skipTitle) {
    while (i < lines.length && lines[i].trim().startsWith("# ")) i++;
  }

  const stanzas: string[][] = [];
  let current: string[] = [];

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      if (current.length > 0) {
        stanzas.push(current);
        current = [];
      }
    } else {
      current.push(line.trimEnd());
    }
  }
  if (current.length > 0) stanzas.push(current);

  for (const stanza of stanzas) {
    const inner = stanza.map((l) => formatPoemInlineMarkdown(l)).join("<br>\n  ");
    parts.push(`<p>\n  ${inner}\n</p>`);
  }

  return parts.join("\n\n");
}

/** Full HTML document wrapper used by convert-poems (poems without bundled media). */
export function poemMarkdownToHtmlDocument(md: string, anthologyIndexHref = DEFAULT_ANTHOLOGY_INDEX_HREF): string {
  const body = injectPoemAnthologyNav(poemMarkdownToHtmlBody(md), anthologyIndexHref);
  const plainStyles =
    "body{font-family:serif;line-height:1.6;color:#1a1a20;max-width:36em;margin:2rem auto;padding:0 1.5rem}" +
    ".poem-header{display:flex;flex-direction:column;align-items:center;gap:0.5rem;margin-bottom:1.25rem;text-align:center}" +
    ".poem-header h1,.poem-header h2{margin:0;font-size:1.25rem;font-weight:inherit;text-align:center}" +
    ".poem-back{font-size:0.85rem}" +
    ".poem-back a{color:#444;text-decoration:none;opacity:0.72}" +
    ".poem-back a:hover{opacity:1;text-decoration:underline}" +
    "p{margin:0.5rem 0}";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Poem</title>
  <style>${plainStyles}</style>
</head>
<body>
${body}
</body>
</html>`;
}
