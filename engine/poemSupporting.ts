/** Supporting prose is deliberately kept out of verse/film lines. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml, poemMarkdownToHtmlBody } from './poemMarkdownHtml.js';
import type { PoemLanguage } from './types.js';

export interface PoemReference {
  id: string;
  citation: string;
  url?: string;
  quote?: string;
}
export function validateReferences(value: unknown): asserts value is PoemReference[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('References must be a list of at most 100 entries.');
  const ids = new Set<string>();
  for (const ref of value) {
    if (!ref || typeof ref !== 'object' || typeof ref.id !== 'string' || !/^[a-z0-9-]+$/.test(ref.id) || ids.has(ref.id)) throw new Error('Each reference needs a unique lowercase ID.');
    ids.add(ref.id);
    if (typeof ref.citation !== 'string' || !ref.citation.trim() || ref.citation.length > 10000) throw new Error('Each reference needs a citation.');
    if (ref.quote !== undefined && (typeof ref.quote !== 'string' || ref.quote.length > 20000)) throw new Error('Invalid reference quotation.');
    if (ref.url !== undefined && ref.url !== '') {
      if (typeof ref.url !== 'string' || !/^https?:\/\//i.test(ref.url)) throw new Error('Reference links must use http or https.');
      try { new URL(ref.url); } catch { throw new Error('Invalid reference URL.'); }
    }
  }
}
function commentaryHtml(text: string): string {
  return text.split(/(?=^#{1,6}\s)/m).filter(Boolean).map(part => poemMarkdownToHtmlBody(part, { titleTag: 'h3' })).join('\n');
}
export function supportingHtml(commentary: string, references: PoemReference[], lang: PoemLanguage): string {
  const heading = lang === 'af' ? 'Toeligting' : 'Commentary';
  const refsHeading = lang === 'af' ? 'Verwysings' : 'References';
  let html = commentary.trim() ? `<section class="poem-commentary"><h2>${heading}</h2>${commentaryHtml(commentary)}</section>` : '';
  if (references.length) html += `<section class="poem-references"><h2>${refsHeading}</h2><ol>${references.map(ref =>
    `<li id="ref-${escapeHtml(ref.id)}">${ref.url ? `<a href="${escapeHtml(ref.url)}" rel="noopener noreferrer">${escapeHtml(ref.citation)}</a>` : escapeHtml(ref.citation)}${ref.quote ? `<blockquote>${escapeHtml(ref.quote)}</blockquote>` : ''}</li>`
  ).join('')}</ol></section>`;
  return html;
}
export function readSupportingHtml(dir: string, lang: PoemLanguage): string {
  const commentaryPath = join(dir, `commentary.${lang}.md`);
  const refsPath = join(dir, 'references.json');
  const refs: unknown = existsSync(refsPath) ? JSON.parse(readFileSync(refsPath, 'utf8')) : [];
  validateReferences(refs);
  return supportingHtml(existsSync(commentaryPath) ? readFileSync(commentaryPath, 'utf8') : '', refs, lang);
}
