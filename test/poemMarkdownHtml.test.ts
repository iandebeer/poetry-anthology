import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { poemMarkdownToHtmlBody } from "../engine/poemMarkdownHtml.js";

test("Goed preserves its title, nine verse lines, and linked footnotes", () => {
  const md = readFileSync(new URL("../poems/goed/af.md", import.meta.url), "utf8");
  const html = poemMarkdownToHtmlBody(md);
  assert.match(html, /<h1 class="poem-title"><em>Goed<\/em><\/h1>/);
  assert.equal((html.match(/<br>/g) ?? []).length, 8);
  assert.doesNotMatch(html, /\[\^|\\/);
  assert.match(html, /href="#fn-1" role="doc-noteref">1<\/a>/);
  assert.match(html, /href="#fn-2" role="doc-noteref">2<\/a>/);
  assert.match(html, /<li id="fn-1">Prediker 7:14 \(1933-vertaling\)\./);
  assert.match(html, /<li id="fn-2">Epicurus, <em>Brief aan Menoeceus<\/em>, 125\./);
});

test("footnotes escape HTML and link back to each occurrence", () => {
  const html = poemMarkdownToHtmlBody("Verse[^note] again[^note] unknown[^missing]\n\n[^note]: <script>alert(1)</script>");
  assert.match(html, /id="fnref-1-1"/);
  assert.match(html, /id="fnref-1-2"/);
  assert.match(html, /href="#fnref-1-1"/);
  assert.match(html, /href="#fnref-1-2"/);
  assert.match(html, /unknown\[\^missing\]/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("poems without footnotes retain stanza and quotation formatting", () => {
  assert.equal(poemMarkdownToHtmlBody("# Title\n\nFirst\\\nSecond\n\n> *Quote*", { skipTitle: true }),
    "<p>\n  First<br>\n  Second\n</p>\n\n<blockquote>\n<p>\n  <em>Quote</em>\n</p>\n</blockquote>");
});
