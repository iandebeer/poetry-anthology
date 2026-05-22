/**
 * Shared markdown → HTML for poem files (headings, stanzas, inline emphasis).
 */

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

/** Full HTML document wrapper used by convert-poems. */
export function poemMarkdownToHtmlDocument(md: string): string {
  const body = poemMarkdownToHtmlBody(md);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Poem</title>
</head>
<body>
${body}
</body>
</html>`;
}
